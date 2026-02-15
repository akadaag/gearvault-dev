# GearVault AI Assistant - Complete Technical Guide

## Overview

GearVault uses a **dual-model AI architecture** powered by Groq's free API to generate intelligent packing lists for photographers and videographers. The system eliminates rate limiting issues by strategically distributing tasks across multiple models, each with separate token budgets.

### Design Philosophy

**Enriched metadata makes smaller models safe** - By adding semantic metadata (eventFit, strengths) to gear items during classification, we enable a mid-sized model (Scout-17B) to perform **simple matching** instead of **complex reasoning**. This allows us to use faster, more efficient models without sacrificing quality.

---

## Architecture

### Dual-Model System

| Task | Model | TPM Limit | TPD Limit | Why? |
|------|-------|-----------|-----------|------|
| **Gear Classification** | `llama-3.1-8b-instant` | 6K | 500K | Simple structured extraction (JSON), fast response |
| **Packing List Generation** | `llama-4-scout-17b` | 30K | 500K | Large context for 80-item catalogs (~11K tokens), does matching not reasoning |
| **Future Complex Tasks** | `llama-3.3-70b-versatile` | 12K | 100K | Reserved for Q&A, shooting advice, complex reasoning |

### Why This Works

1. **Separate Token Budgets**: Each model has independent TPM/TPD limits - classification never blocks packing list generation
2. **Task-Optimized Models**: Fast model for simple tasks, balanced model for catalog matching, smart model reserved for complex reasoning
3. **Token Efficiency**: Enriched metadata reduces AI reasoning load by ~40% compared to raw catalog data

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ USER FLOW                                                           │
└─────────────────────────────────────────────────────────────────────┘

1. User adds gear item
   ↓
2. Classification queue runs (background)
   ↓
3. llama-3.1-8b-instant extracts:
   - inferredProfile (video_first | photo_first | hybrid | audio | lighting | support)
   - capabilities (technical specs: "4K 120fps", "f/2.8 aperture")
   - eventFit (4-7 tags: wedding, corporate, portrait, travel, etc.)
   - strengths (3-5 tags: low-light, autofocus, portability, etc.)
   ↓
4. Enriched data saved to IndexedDB (Dexie)

┌─────────────────────────────────────────────────────────────────────┐
│ PACKING LIST GENERATION                                             │
└─────────────────────────────────────────────────────────────────────┘

1. User describes event: "Corporate interview, 2 speakers, indoor office"
   ↓
2. Background classification ensures all items have metadata
   ↓
3. Optimized catalog sent to llama-4-scout-17b:
   - Removes: essential flag, tags, notes, quantity (when default)
   - Keeps: id, name, brand, model, category, inferredProfile, capabilities, eventFit, strengths
   - Result: ~140 tokens/item instead of ~170 (saves ~2,400 tokens for 80 items)
   ↓
4. AI does event-suitability matching:
   - Event requires: ["corporate", "interview", "indoor"]
   - Sony FX30 has eventFit: ["corporate", "interview", "documentary"]
   - Match! Assign role: "primary"
   ↓
5. Client-side safety guard:
   - If event is video → ensure video_first camera is PRIMARY
   - If event is photo → ensure photo_first camera is PRIMARY
   ↓
6. Client-side catalog matcher (fuzzy matching):
   - HIGH confidence (≥0.80) → auto-link to catalog item
   - MEDIUM confidence (0.60-0.79) → user review sheet
   - LOW confidence (<0.60) → move to "missing items" list
   ↓
7. Results displayed with sections, roles, priorities
```

---

## Gear Classification System

### Classification Process

**File**: `src/lib/gearClassifier.ts`

The classifier uses **llama-3.1-8b-instant** (FAST model) to extract structured metadata from gear items.

#### Input
```typescript
{
  id: string;
  name: string;
  brand?: string;
  model?: string;
  category: string; // "Camera Body", "Lens", etc.
}
```

#### Output (Added to GearItem)
```typescript
{
  inferredProfile: 'video_first' | 'photo_first' | 'hybrid' | 'audio' | 'lighting' | 'support';
  capabilities: string[];  // Technical specs: ["4K 120fps", "10-bit 4:2:2"]
  eventFit: string[];      // Event types: ["wedding", "corporate", "portrait"]
  strengths: string[];     // Practical strengths: ["low-light", "autofocus", "portability"]
}
```

### Standard Tag Lists

**eventFit** (4-7 tags from this list):
```
wedding, corporate, interview, portrait, event, travel, outdoor, indoor,
low-light, documentary, music-video, run-and-gun, studio, product,
real-estate, sports, wildlife
```

**strengths** (3-5 tags from this list):
```
versatile, high-resolution, autofocus, low-light, cinematic-look,
stabilization, portability, weather-sealed, fast-aperture, reach,
wide-angle, macro, bokeh, battery-life, dual-card-slots, silent-shutter,
fast-readout, color-accuracy, easy-setup, wireless, monitoring
```

### Why This Matters

**Before enrichment** (AI must reason):
```
"Sony FX30 with Tamron 17-28mm f/2.8" - Is this good for a corporate interview?
→ AI must infer: "FX30 is video-focused, 17-28mm is wide, f/2.8 is good for low light, yes it works"
→ ~200 tokens of reasoning per item
```

**After enrichment** (AI just matches):
```
Event needs: ["corporate", "interview", "indoor"]
FX30 has eventFit: ["corporate", "interview", "documentary", "indoor"]
→ MATCH! Assign role: "primary"
→ ~10 tokens of matching per item
```

**Token savings**: ~95% reduction in AI reasoning load

---

## Packing List Generation

### Prompt Strategy

**File**: `src/lib/groqClient.ts`

The prompt is optimized for **event-suitability matching**, not reasoning.

#### Key Instructions to AI

1. **Match eventFit first**: If event requires "wedding" and camera has eventFit: ["wedding", "portrait"], prioritize it
2. **Use strengths for differentiation**: If multiple items match, use strengths to pick best (e.g., "low-light" for dark church)
3. **Assign roles based on inferredProfile**:
   - Video event → video_first camera is PRIMARY
   - Photo event → photo_first camera is PRIMARY
   - Hybrid event → hybrid camera is PRIMARY, others as backup/alternative
4. **Don't overthink**: If eventFit matches, it's suitable - no need for complex reasoning

#### Catalog Optimization

Items sent to AI are stripped of redundant fields:

**Before optimization** (~170 tokens/item):
```json
{
  "id": "abc123",
  "name": "Sony FX30",
  "brand": "Sony",
  "model": "FX30",
  "category": "Camera Body",
  "inferredProfile": "video_first",
  "capabilities": ["4K 120fps", "10-bit 4:2:2"],
  "eventFit": ["corporate", "interview", "documentary"],
  "strengths": ["cinematic-look", "low-light", "autofocus"],
  "essential": true,  // ← REMOVED (AI uses inferredProfile instead)
  "tags": ["video", "cinema"],  // ← REMOVED (redundant with eventFit)
  "notes": null,  // ← REMOVED (usually null)
  "quantity": 1  // ← REMOVED (defaults to 1)
}
```

**After optimization** (~140 tokens/item):
```json
{
  "id": "abc123",
  "name": "Sony FX30",
  "brand": "Sony",
  "model": "FX30",
  "category": "Camera Body",
  "inferredProfile": "video_first",
  "capabilities": ["4K 120fps", "10-bit 4:2:2"],
  "eventFit": ["corporate", "interview", "documentary"],
  "strengths": ["cinematic-look", "low-light", "autofocus"]
}
```

**Result**: For 80 items, saves ~2,400 tokens (~20% of catalog size)

---

## Response Format

### Sections (Canonical Order)

```
1. Essentials (memory cards, batteries, lens cloths)
2. Camera Bodies
3. Lenses
4. Lighting
5. Audio
6. Support (tripods, gimbals)
7. Power (chargers, batteries)
8. Media (memory cards, card readers)
9. Cables
10. Misc
```

### Roles (Camera Bodies & Audio ONLY)

| Role | Meaning | Badge Color | Example |
|------|---------|-------------|---------|
| **primary** | Best for THIS event (based on eventFit + inferredProfile) | Teal | Sony FX30 for corporate interview |
| **backup** | Secondary of same type | Blue | Sony A7 IV as backup for FX30 |
| **alternative** | Different approach for same purpose | Gray | Sony A7S III as cinematic alternative |
| **standard** | Everything else (no badge) | — | Sony A6400 not recommended but available |

### Priority Levels

- **Must-have**: Shoot cannot succeed without it (primary camera, key lenses)
- **Nice-to-have**: Significantly improves quality (backup camera, extra lighting)
- **Optional**: Useful but not critical (lens filters, extra batteries)

### Example AI Response

```json
{
  "event_title": "Corporate Interview - 2 Speakers",
  "event_type": "corporate interview",
  "recommended_items": [
    {
      "section": "Camera Bodies",
      "gear_item_id": "fx30-id",
      "name": "Sony FX30",
      "reason": "Video-first camera optimized for corporate work with excellent autofocus",
      "priority": "Must-have",
      "quantity": 1,
      "role": "primary"
    },
    {
      "section": "Camera Bodies",
      "gear_item_id": "a7iv-id",
      "name": "Sony A7 IV",
      "reason": "Versatile backup with matching lens mount",
      "priority": "Nice-to-have",
      "quantity": 1,
      "role": "backup"
    },
    {
      "section": "Lenses",
      "gear_item_id": "tamron-17-28-id",
      "name": "Tamron 17-28mm f/2.8",
      "reason": "Wide angle for interview setup shots",
      "priority": "Must-have",
      "quantity": 1
    }
  ],
  "missing_items": [
    {
      "name": "Wireless Lavalier Mic System",
      "category": "Audio",
      "reason": "Essential for capturing clear speaker audio",
      "priority": "Must-have",
      "action": "rent",
      "estimated_cost": "$50/day"
    }
  ],
  "tips": [
    "Test audio levels before interview starts",
    "Bring extra batteries - interviews often run long",
    "Set up 2-camera angles for dynamic editing"
  ]
}
```

---

## Client-Side Safety Guards

### 1. Video Event → Video-First Camera as Primary

**File**: `src/pages/AIAssistantPage.tsx` (lines 139-155)

```typescript
const isVideoEvent = /video|interview|corporate/i.test(rawPlan.eventType);
if (isVideoEvent) {
  const cameraBodies = rawPlan.checklist.filter(item => item.section === 'Camera Bodies');
  const videoFirstBody = cameraBodies.find(item => {
    const matchedItem = catalog.find(c => c.id === item.gearItemId);
    return matchedItem?.inferredProfile === 'video_first';
  });
  
  if (videoFirstBody && videoFirstBody.role !== 'primary') {
    // Find current primary and swap roles
    const currentPrimary = cameraBodies.find(item => item.role === 'primary');
    if (currentPrimary) {
      currentPrimary.role = videoFirstBody.role || 'standard';
    }
    videoFirstBody.role = 'primary';
  }
}
```

**Why**: Ensures video events always prioritize video-optimized cameras, even if AI makes a mistake.

### 2. Catalog Matcher (Fuzzy Matching)

**File**: `src/lib/catalogMatcher.ts`

Handles cases where AI recommends items not exactly matching catalog names:

```typescript
const match = matchCatalogItem(aiItemName, gearItemId, catalog);

if (match.confidence === 'high') {
  // Auto-link (similarity ≥0.80)
  resolvedChecklist.push({ ...item, gearItemId: match.bestMatch.id });
} else if (match.confidence === 'medium') {
  // User review (similarity 0.60-0.79)
  itemsNeedingReview.push({ ...item, candidates: match.candidates });
} else {
  // Move to missing items (similarity <0.60)
  missingItems.push({ name: item.name, reason: 'Not found in catalog' });
}
```

**Example**: AI says "Sony FX3" but catalog has "Sony FX30" → Medium confidence → User reviews candidates

---

## Rate Limiting & Retry Logic

### Rate Limits (Groq Free Tier)

| Model | TPM (Tokens Per Minute) | RPM (Requests Per Minute) | TPD (Tokens Per Day) |
|-------|--------------------------|---------------------------|----------------------|
| llama-3.1-8b-instant | 6,000 | 30 | 500,000 |
| llama-4-scout-17b | 30,000 | 30 | 500,000 |
| llama-3.3-70b-versatile | 12,000 | 30 | 100,000 |

### Retry Logic

**File**: `src/lib/groqClient.ts`

```typescript
async function callGroqWithRetry<T>(
  fetchFn: () => Promise<T>,
  maxRetries = 2,
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fetchFn();
    } catch (error) {
      lastError = error as Error;
      
      // Check if it's a rate limit error
      if (lastError.message.includes('429') && attempt < maxRetries) {
        const backoffMs = 2000 * (attempt + 1); // 2s, 4s
        console.warn(`Rate limit hit, retrying in ${backoffMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }
      
      throw lastError;
    }
  }
  
  throw lastError!;
}
```

**Strategy**: Exponential backoff (2s, 4s) with max 2 retries for rate limit errors (HTTP 429)

---

## Token Budget Analysis

### Classification (per item)

```
Prompt (system + instructions):     ~800 tokens
Item data (name, brand, model):     ~50 tokens
AI response (JSON):                 ~150 tokens
────────────────────────────────────────────
Total per item:                     ~1,000 tokens
```

**Daily capacity**: 500,000 TPD ÷ 1,000 = **500 items/day** (more than enough for typical use)

### Packing List Generation

```
System prompt:                      ~1,200 tokens
Event description:                  ~100 tokens
Catalog (80 items × 140 tokens):    ~11,200 tokens
Pattern learning data:              ~500 tokens
AI response (30 items):             ~3,000 tokens
────────────────────────────────────────────
Total per request:                  ~16,000 tokens
```

**Hourly capacity**: 30,000 TPM ÷ 16,000 = **1-2 requests/minute** (sufficient for single-user app)

**Daily capacity**: 500,000 TPD ÷ 16,000 = **31 packing lists/day** (more than enough)

---

## Future Extensibility

### Reserved: llama-3.3-70b-versatile (SMART Model)

Currently unused, reserved for future complex AI features:

1. **Q&A System**: "What settings should I use for low-light wedding reception?"
2. **Shooting Advice**: "How do I set up a 3-point lighting for corporate headshots?"
3. **Gear Recommendations**: "Should I buy the Sony 24-70 f/2.8 GM II or Tamron 28-75 f/2.8 G2?"
4. **Education**: "Explain the difference between S-Log3 and HLG for video"

### Adding New AI Tasks

**Step 1**: Add task to `AI_TASKS` in `src/lib/groqConfig.ts`

```typescript
export const AI_TASKS = {
  CLASSIFY_GEAR: { model: GROQ_MODELS.FAST, description: 'Extract gear metadata' },
  GENERATE_PACKING_LIST: { model: GROQ_MODELS.BALANCED, description: 'Match gear to event' },
  ANSWER_QUESTION: { model: GROQ_MODELS.SMART, description: 'Complex reasoning' }, // NEW
} as const;
```

**Step 2**: Create new function in `src/lib/groqClient.ts`

```typescript
export async function callGroqForQuestion(
  question: string,
  catalog: GearItem[],
): Promise<AnswerResponse> {
  const config = AI_TASKS.ANSWER_QUESTION;
  
  return callGroqWithRetry(async () => {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: QUESTION_ANSWERING_PROMPT },
          { role: 'user', content: question },
        ],
      }),
    });
    
    // ... parse response
  });
}
```

**Step 3**: Add UI in new page (e.g., `src/pages/AIAdvisorPage.tsx`)

---

## Troubleshooting

### Common Issues

#### 1. Rate Limit Errors (429)

**Symptoms**: "Rate limit reached. Wait a moment and try again."

**Causes**:
- Too many classification requests in short time (>30 items/minute)
- Too many packing list generations (>2/minute for large catalogs)

**Solutions**:
- Retry logic handles this automatically (2s, 4s backoff)
- Reduce catalog size if hitting limits frequently
- Consider batching classification requests

#### 2. AI Recommends Wrong Camera Role

**Symptoms**: Photo event gets video_first camera as primary

**Causes**:
- Scout-17B occasionally mismatches eventFit to inferredProfile
- Classification didn't run (item missing eventFit/strengths)

**Solutions**:
- Client-side safety guard auto-corrects video events (lines 139-155 in AIAssistantPage.tsx)
- Add similar guard for photo events if needed
- Re-classify items with incomplete metadata

#### 3. Catalog Matcher Shows Too Many Medium Confidence Matches

**Symptoms**: User has to review many items manually

**Causes**:
- AI uses different naming convention than catalog
- Catalog has similar item names (e.g., "Sony A7 IV" vs "Sony A7R IV")

**Solutions**:
- Adjust confidence thresholds in `catalogMatcher.ts` (currently 0.80/0.60)
- Improve AI prompt to match exact catalog names
- Add catalog name aliases (e.g., "FX3" → "Sony FX30")

#### 4. Classification Queue Runs Slowly

**Symptoms**: New items take time to get metadata

**Causes**:
- Classification runs at 1 item every 3 seconds to avoid rate limits
- Large backlog of unclassified items

**Solutions**:
- Classification is background process - doesn't block UI
- For bulk imports, user must wait or manually trigger re-classification
- Consider increasing rate if Groq increases limits

---

## Configuration Reference

### Model Configuration

**File**: `src/lib/groqConfig.ts`

```typescript
export const GROQ_MODELS = {
  FAST: 'llama-3.1-8b-instant',      // 6K TPM, 500K TPD
  BALANCED: 'llama-4-scout-17b-16e-instruct', // 30K TPM, 500K TPD
  SMART: 'llama-3.3-70b-versatile',  // 12K TPM, 100K TPD (reserved)
} as const;

export const AI_TASKS = {
  CLASSIFY_GEAR: {
    model: GROQ_MODELS.FAST,
    description: 'Extract structured metadata from gear items',
  },
  GENERATE_PACKING_LIST: {
    model: GROQ_MODELS.BALANCED,
    description: 'Match gear to event requirements',
  },
} as const;

export const RATE_LIMITS = {
  'llama-3.1-8b-instant': { tpm: 6000, rpm: 30, tpd: 500000 },
  'llama-4-scout-17b-16e-instruct': { tpm: 30000, rpm: 30, tpd: 500000 },
  'llama-3.3-70b-versatile': { tpm: 12000, rpm: 30, tpd: 100000 },
} as const;
```

### Database Schema

**File**: `src/db.ts`

```typescript
// Version 3: Added eventFit and strengths
gearItems: '++id, name, categoryId, essential, *tags, inferredProfile, *eventFit, *strengths'
```

**Migration**: Fields are optional - no migration logic needed, just upgrade schema version.

---

## Testing Checklist

### Classification Testing

- [ ] Add new camera → verify inferredProfile is video_first/photo_first/hybrid
- [ ] Add new lens → verify eventFit includes relevant events (portrait, wedding, etc.)
- [ ] Add new audio gear → verify inferredProfile is 'audio'
- [ ] Check strengths include 3-5 relevant tags
- [ ] Verify capabilities extract technical specs correctly

### Packing List Testing

- [ ] Corporate interview → FX30 (video_first) is PRIMARY
- [ ] Wedding → A7 IV (hybrid) or photo_first camera is PRIMARY
- [ ] Outdoor portrait → Appropriate lenses with "portrait" in eventFit
- [ ] Music video → Cinematic gear with "music-video" in eventFit
- [ ] Travel vlog → Portable gear with "travel" in eventFit

### Edge Cases

- [ ] Empty catalog → Shows "Add gear first" message
- [ ] Catalog with no video cameras → Corporate event still generates valid list
- [ ] Item with no eventFit (old data) → Doesn't break matcher
- [ ] Very long event description (>500 words) → Doesn't exceed token limit
- [ ] Rate limit hit → Retry logic works, shows friendly error if fails

---

## Performance Metrics

### Target Performance

- Classification: **<5 seconds** per item
- Packing list generation: **<10 seconds** for 80-item catalog
- UI responsiveness: **Instant** (all AI calls are async with loading states)

### Actual Performance (Observed)

- Classification: **2-4 seconds** per item (llama-3.1-8b-instant)
- Packing list: **6-8 seconds** for 80 items (llama-4-scout-17b)
- Catalog matcher: **<500ms** for 30 items (client-side JavaScript)

---

## Summary

The dual-model architecture achieves three critical goals:

1. **Eliminates rate limiting** - Separate token budgets for classification vs packing
2. **Optimizes costs/performance** - Fast model for simple tasks, balanced model for matching, smart model reserved
3. **Maintains quality** - Enriched metadata enables smaller models to make accurate recommendations

**Key insight**: Smart data structure beats brute-force AI power. By investing in rich metadata during classification, we enable efficient matching during packing list generation.
