import {
  packingPlanSchema,
  type PackingPlan,
} from './aiSchemas';
import type { GearItem, EventItem, Category } from '../types/models';
import { GROQ_MODELS, AI_TASKS } from './groqConfig';
import { db } from '../db';
import { callLLMGatewayForPackingPlan } from './llmGatewayClient';
import { callEdgeFunction, AuthExpiredError, type MessageContent } from './edgeFunctionClient';

// ---------------------------------------------------------------------------
// Packing plan generation (Gemini primary → Scout fallback via Edge Function)
// ---------------------------------------------------------------------------

export async function callGroqForPackingPlan(
  eventDescription: string,
  catalog: GearItem[],
  pastEvents: EventItem[],
): Promise<PackingPlan> {
  const categories = await db.categories.toArray();
  
  // Tier 1: Gemini 2.0 Flash via LLM Gateway (Supabase Edge Function)
  console.log('🟢 Attempt 1: Gemini 2.0 Flash (via LLM Gateway)');
  const geminiResult = await callLLMGatewayForPackingPlan({
    eventDescription,
    catalog,
    pastEvents,
    categories,
  });
  
  if (geminiResult.success && geminiResult.data) {
    console.log('✅ Gemini succeeded!');
    return geminiResult.data;
  }
  
  console.warn('⚠️ Gemini failed, checking error type...', geminiResult.error);
  
  // If Gemini failed due to auth, don't try Scout (auth errors aren't model-specific)
  if (geminiResult.error?.includes('Authentication') || 
      geminiResult.error?.includes('expired') || 
      geminiResult.error?.includes('sign in')) {
    throw new AuthExpiredError(geminiResult.error);
  }
  
  // Tier 2: Scout 17b via Edge Function (fallback for non-auth errors)
  console.log('🔵 Attempt 2: Scout 17b (Groq via Edge Function)');
  const scoutMessages = buildMessages(eventDescription, catalog, pastEvents, categories);
  const result = await attemptPlanWithEdgeFunction(scoutMessages, GROQ_MODELS.SCOUT);
  
  if (result.success) {
    return result.data;
  }

  throw new Error(
    `All AI models exhausted. Gemini error: ${geminiResult.error}. Scout error: ${result.error}. Try again later.`
  );
}

// ---------------------------------------------------------------------------
// Internal — attempt one plan call via Edge Function
// ---------------------------------------------------------------------------

type AttemptResult =
  | { success: true; data: PackingPlan; rawContent: string }
  | { success: false; error: string; rawContent: string };

async function attemptPlanWithEdgeFunction(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  model: string,
): Promise<AttemptResult> {
  const taskConfig = AI_TASKS.PACKING_LIST;
  let rawContent = '{}';

  try {
    const response = await callEdgeFunction({
      provider: 'groq',
      model,
      messages,
      temperature: taskConfig.temperature,
      max_tokens: taskConfig.maxTokens,
      response_format: { type: 'json_object' },
    });

    rawContent = response.choices[0]?.message?.content || '{}';
    
    // Sanitize the response
    const cleaned = sanitizeJsonResponse(rawContent);
    
    // DEBUG: Log raw response (first 500 chars) to diagnose issues
    if (cleaned !== rawContent) {
      console.log('🧹 Sanitized response (first 500 chars of original):', rawContent.substring(0, 500));
    }
    
    const json = JSON.parse(cleaned);
    
    // DEBUG: Log the actual response
    console.log('🔍 Scout raw response:', json);
    
    const parsed = packingPlanSchema.safeParse(json);

    if (parsed.success) {
      return { success: true, data: parsed.data, rawContent };
    }

    // DEBUG: Log validation errors
    console.error('❌ Zod validation failed:', parsed.error.format());
    return { success: false, error: JSON.stringify(parsed.error.format()), rawContent };
    
  } catch (e) {
    // DEBUG: Log parse errors with context
    if (e instanceof SyntaxError) {
      console.error('❌ JSON parse error:', e.message, '\nFirst 500 chars:', rawContent.substring(0, 500));
    }
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Unknown error',
      rawContent,
    };
  }
}

// ---------------------------------------------------------------------------
// JSON sanitizer — extract valid JSON from messy LLM responses
// ---------------------------------------------------------------------------

function sanitizeJsonResponse(raw: string): string {
  let s = raw.trim();
  
  // Strip markdown code fences
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  
  // Find JSON boundaries (first { to last })
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  
  if (start === -1 || end === -1 || end <= start) {
    // No valid JSON boundaries found, return as-is and let parse fail with clear error
    return s;
  }
  
  // Extract the JSON portion
  return s.slice(start, end + 1);
}

// ---------------------------------------------------------------------------
// Prompt builder — FULL QUALITY for Scout fallback
// ---------------------------------------------------------------------------

function buildMessages(
  eventDescription: string,
  catalog: GearItem[],
  pastEvents: EventItem[],
  categories: Category[],
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  // Optimized catalog: drop capabilities (never referenced in rules, adds noise)
  const catalogSummary = catalog.map((item) => {
    const category = categories.find(c => c.id === item.categoryId);
    const summary: Record<string, unknown> = {
      id: item.id,
      name: item.name,
      category: category?.name ?? null,
      inferredProfile: item.inferredProfile ?? null,
    };

    // Optional fields - only include if present
    if (item.brand) summary.brand = item.brand;
    if (item.model) summary.model = item.model;
    if (item.eventFit && item.eventFit.length > 0) summary.eventFit = item.eventFit;
    if (item.strengths && item.strengths.length > 0) summary.strengths = item.strengths;
    if (item.quantity > 1) summary.quantity = item.quantity;

    return summary;
  });

  const pastSummary = pastEvents
    .slice(0, 5)
    .map((e) => ({
      type: e.type,
      items_packed: e.packingChecklist.filter((i) => i.packed).map((i) => i.name),
    }))
    .filter((e) => e.items_packed.length > 0);

  const prompt = `You are an expert photography/videography equipment packing assistant.

EVENT DESCRIPTION:
${eventDescription}

USER'S GEAR CATALOG — use these exact IDs for gear_item_id when you find a match:
${JSON.stringify(catalogSummary)}

PAST EVENTS (learn patterns):
${pastSummary.length > 0 ? JSON.stringify(pastSummary) : 'No history yet'}

CRITICAL RULES FOR CONTEXT-AWARE SELECTION:

0. **USER EXPLICIT EXCLUSIONS — HIGHEST PRIORITY**:
   If the user explicitly excludes any item, category, or gear type (e.g., "no tripod", "no flash", "without gimbal", "don't bring lights"), EXCLUDE those items from recommended_items.
   User-stated exclusions OVERRIDE ALL other rules, including priority escalation (Rule 10) and completeness (Rule 11).
   This rule cannot be overridden by any other rule. A "no tripod" instruction means zero tripods, even for indoor events.

0b. **DISCREET / INVISIBLE SHOOTING STYLE**:
   When the user mentions "invisible", "discreet", "unobtrusive", "low-profile", "blend in", "as invisible as possible", or "don't draw attention":
   - EXCLUDE flash/strobe — using a flash is the opposite of discreet and draws everyone's attention to the photographer
   - EXCLUDE large support equipment (tripods, large light stands) that makes the photographer conspicuous
   - PREFER fast lenses (fast-aperture strength), high-ISO capable bodies, and compact/portability-focused gear
   - This overrides Rule 10's flash escalation for indoor events — if the user wants to be invisible, NO flash regardless of venue

1. **HARD EXCLUSIONS — CHECK THESE FIRST**:
   BEFORE generating your response, verify these critical exclusions:
   - Music video → EXCLUDE ALL audio recording gear (mics, recorders, audio cables) — music is pre-recorded
   - "Natural light" specified → EXCLUDE ALL items with "powered-light" strength. ONLY include items with "natural-light-modifier" strength (reflectors, diffusers)
   - Photo-only session → EXCLUDE gimbals unless specifically requested
   - Photo-only session → (a) NEVER assign role "primary" to any camera with inferredProfile "video_first" or "cinema" — this is absolute, no exceptions. (b) ALWAYS select a "photo_first" or "hybrid" camera as primary; if the catalog contains a full-frame hybrid body (sensor-fullframe), it is the preferred primary for corporate/portrait photo work. (c) A "video_first" camera may appear ONLY as role "backup" if the user explicitly requested a second body. (d) A "video_first" camera as "primary" in a photo-only plan is ALWAYS wrong and will be rejected.
   - Video-primary events → cameras with inferredProfile "video_first" or "cinema" MUST be primary over "hybrid"
   - Bags, backpacks, and cases → EXCLUDE from recommended_items unless the user specifically asks about transport or gear carrying

2. **LENS-MOUNT COMPATIBILITY (NON-NEGOTIABLE)**:
   Only recommend lenses whose mount strength (mount-sony-e, mount-canon-rf, mount-fuji-x, mount-nikon-z, mount-l, mount-mft, mount-canon-ef) matches at least one selected camera body.
   - If you select a Canon R5 (mount-canon-rf), ONLY include lenses with mount-canon-rf
   - If you select Sony cameras (mount-sony-e), ONLY include lenses with mount-sony-e
   - Never mix incompatible mounts unless the user has an adapter in their catalog
   
   THIS RULE IS NON-NEGOTIABLE. If the only suitable lens for the task has an incompatible mount, you MUST either:
   (a) Switch the camera body to one that matches the needed lens mount, OR
   (b) List the lens in missing_items with a note about mount incompatibility
   
   NEVER include a lens and camera body with different mounts in recommended_items.

   **SENSOR FORMAT COMPATIBILITY (within same mount)**:
   In addition to mount compatibility, prefer lenses that match the camera's sensor format:
   - APS-C lenses (sensor-apsc) on full-frame bodies (sensor-fullframe) cause image circle vignetting/cropping — if a full-frame lens alternative (sensor-fullframe) exists in the catalog with the same mount, use it instead
   - Full-frame lenses on APS-C bodies are fine (just apply crop factor — no optical penalty)
   - Only recommend an APS-C lens on a full-frame body when NO full-frame alternative exists in the catalog for that mount, and in that case note the APS-C crop mode penalty in the reason field

3. **AUDIO TYPE AWARENESS**:
   - For events with speech capture (wedding vows/speeches, interview, corporate presentation, documentary): include at least one item with "close-mic" strength as Must-have for primary audio
   - Items with "directional-audio" are suitable as backup/alternative or for ambient/atmospheric audio capture
   - Items with "multi-track" are for backup recording or complex audio setups
   - For events that explicitly exclude audio (music video) or photo-only sessions: exclude ALL audio items regardless of type
   - Wedding events ALWAYS require audio capture for vows and speeches — include at least one "close-mic" item as Must-have even if not explicitly mentioned

4. **MOVEMENT & STABILIZATION**:
   - When the event description mentions "smooth movement", "walkthrough", "run-and-gun", "tracking shots", "cinematic motion", or "stabilization": ALWAYS include items with "smooth-motion" strength (gimbals, sliders) as Must-have
   - Items with only "static-support" strength (tripods, monopods) are NOT sufficient for movement-heavy events
   - For events needing BOTH static shots AND movement (real estate, documentary): include both "smooth-motion" and "static-support" items

5. **LIGHTING TYPE MATCHING**:
   - For video-primary events: prefer items with "continuous-light" strength (LED panels, constant lights)
   - For photo-primary events: prefer items with "flash-strobe" strength
   - When "natural light" is specified: EXCLUDE all items with "powered-light" strength, ONLY include items with "natural-light-modifier" strength

6. **BAG & ACCESSORY ORDERING**:
   - Bags and cases should NOT be included in packing lists unless specifically requested
   - Camera bodies should always be the first Must-have items in the response
   - Order recommended_items array: Camera Bodies first, then Lenses, then other sections

7. **SELECTION ALGORITHM**:
   Step 1 - FILTER: Only consider items whose eventFit array overlaps with the event type
   Step 2 - RANK: Among filtered items, use strengths to rank (e.g., "low-light" for dark venues, "portability" for travel)
   Step 3 - INCLUDE: Items with 2+ eventFit matches are strong candidates
   Step 4 - EXCLUDE: Items with 0 eventFit matches should NOT be recommended unless explicitly needed
   
   **How to use the metadata**:
   - "eventFit" is your PRIMARY selection criteria - if it doesn't match the event, don't include it
   - "strengths" help you rank items within the same category and enforce compatibility rules (mount-sony-e, close-mic, smooth-motion, etc.)
   - "inferredProfile" helps with role assignment (video_first/cinema for video, photo_first for photo, hybrid for both)

8. **ROLE ASSIGNMENT** (ONLY for Camera Bodies and Audio sections):
   - "primary": The main/best item for this event (can assign to multiple cameras if equally suited)
   - "backup": Secondary item of the same type (clearly less suited but still useful)
   - "alternative": Different approach for same purpose (e.g., different audio solution)
   - "standard": Default for all other sections (Lenses, Lighting, Support, etc.)
   
   If TWO OR MORE cameras are equally suited, assign BOTH as "primary" and explain what makes each unique in the "reason" field.

   **MULTI-CAMERA SETUP**:
   When the user says "dual camera", "double camera", "two camera setup", "multi-camera", or similar:
   - Select 2 (or more) DIFFERENT camera bodies from the catalog — each one is a unique physical item
   - NEVER use quantity > 1 for camera bodies — there is only ever one physical unit of each camera
   - The quantity field should only exceed 1 for consumables/accessories the user owns multiples of (e.g., batteries, memory cards where catalog quantity > 1)

9. **SECTION ASSIGNMENT** (STRICT):
   - Tripods, monopods, gimbals, sliders → ALWAYS "Support" (NEVER "Misc")
   - Bags, straps, cases → "Essentials" or "Misc" (but should be excluded per rule 1)
   - Batteries, chargers, power banks → "Power"
   - Memory cards, SSDs, card readers → "Media"
   - LED panels, strobes, flashes, reflectors → "Lighting"
   - Microphones, recorders, cables → "Audio"
   
   Group in this order: Camera Bodies → Lenses → Lighting → Audio → Support → Power → Media → Cables → Misc

10. **PRIORITY ESCALATION**:
   NOTE: All escalation rules below are SUBJECT TO Rule 0 (user exclusions) and Rule 0b (discreet shooting). If the user excluded an item type or requested invisible/discreet shooting, do NOT escalate that item type regardless of event conditions.
   - Batteries and memory cards are ALWAYS "Must-have" for full-day events (wedding, corporate full-day)
   - The primary camera is ALWAYS "Must-have"
   - Flash/strobe is "Must-have" for indoor/low-light events (dark church, reception) — UNLESS the user requested discreet/invisible shooting (Rule 0b) or explicitly excluded flash (Rule 0)
   - Gimbal (smooth-motion) is "Must-have" when user explicitly requests smooth movement or stabilization
   - Backup camera body is "Must-have" for high-stakes events (wedding, corporate)
   - Close-mic audio is "Must-have" for weddings and interview-heavy events

11. **COMPLETENESS REQUIREMENTS**:
   - For full-day events, include ALL relevant gear (aim for 12-18 items from catalog)
   - ALWAYS check every section: Do they need lighting? A gimbal? A flash? A reflector?
   - For lighting: consider BOTH continuous LED (video) AND flash (photo) when relevant
   - For support: consider BOTH tripod (static-support) AND gimbal (smooth-motion) when event involves movement + static shots
   - Don't artificially limit the list - better to suggest more items than leave out critical gear

12. **OUTPUT FORMAT**:
   The JSON response MUST have these top-level fields:
   - event_title (string) - A short descriptive title for this event (e.g., "Indoor Wedding Ceremony")
   - event_type (string) - The type of event (e.g., "wedding", "corporate", "music-video", "portrait")
   - recommended_items (array) - Items from the user's catalog to bring
   - missing_items (array) - Items they should acquire
   - tips (array of strings, optional) - Additional advice
   
   Every item in recommended_items MUST have ALL these fields:
   - section (string) - use strict assignment rules above
   - gear_item_id (string or null) - exact ID from catalog
   - name (string) - REQUIRED even if gear_item_id is provided
   - reason (string) - REQUIRED, explain why THIS item suits THIS event (reference eventFit/strengths)
   - priority (string: "Must-have" / "Nice-to-have" / "Optional")
   - quantity (number, default 1)
   - role (string: "primary" / "backup" / "alternative" / "standard")
   
   Every item in missing_items MUST have ALL these fields:
   - name (string) - REQUIRED
   - category (string, optional)
   - reason (string) - REQUIRED, explain why needed for this specific event
   - priority (string: "Must-have" / "Nice-to-have" / "Optional")
   - action (string: "buy" / "borrow" / "rent")
   - estimated_cost (string, optional)

EXAMPLE OF CORRECT BEHAVIOR:

Music video shoot in warehouse, 6 hours:
- Cameras: FX30 (primary, inferredProfile "video_first", eventFit matches "music-video"), A7S III (primary, inferredProfile "hybrid", eventFit matches "music-video")
- Include: gimbal (tracking shots), LED lighting (video = continuous light), batteries, cards
- EXCLUDE: ALL audio gear (mics, recorders, audio cables) — music is pre-recorded, audio is added in post-production
- EXCLUDE: flash — video events use continuous lighting only

BEFORE RETURNING YOUR RESPONSE, VERIFY:
[ ] User said "no [item]" or excluded specific gear? → I excluded ALL matching items (overrides all other rules)
[ ] User said "invisible", "discreet", or "unobtrusive"? → I excluded flash/strobe and large support gear
[ ] Music video? → I removed ALL audio items (mics, recorders, audio cables)
[ ] Natural light specified? → I removed ALL items with "powered-light" strength
[ ] Photo-only session? → I removed gimbals AND no "video_first"/"cinema" camera is assigned role "primary"
[ ] Video event? → At least one camera with inferredProfile "video_first" or "cinema" is included as primary
[ ] Full-day event (wedding, corporate full-day)? → I have at least 12 items total
[ ] Wedding event? → I included at least one "close-mic" audio item as Must-have
[ ] Smooth movement mentioned? → I included at least one "smooth-motion" item as Must-have
[ ] Every lens has a mount strength that matches at least one selected camera body
[ ] No APS-C lens (sensor-apsc) on a full-frame body (sensor-fullframe) when a full-frame alternative exists
[ ] Multi-camera setup? → I selected DIFFERENT camera bodies, NOT quantity > 1 of the same one
[ ] Every item has a gear_item_id that matches an actual ID from the catalog above
[ ] Every section assignment follows strict rules? (tripods/gimbals → Support, never Misc)
[ ] Camera bodies are listed first, bags are Nice-to-have not Must-have

Return ONLY valid JSON matching this exact structure. No markdown, no code blocks, no explanation outside the JSON.`;

  return [{ role: 'user', content: prompt }];
}

// ---------------------------------------------------------------------------
// Chat Q&A generation via Edge Function
// ---------------------------------------------------------------------------

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: MessageContent;
}

export async function callGroqForChat(
  messages: ChatMessage[],
  catalog: GearItem[],
): Promise<string> {
  const categories = await db.categories.toArray();
  
  // Cap conversation history at 20 messages
  let cappedMessages = [...messages];
  if (cappedMessages.length > 20) {
    const systemMessages = cappedMessages.filter(m => m.role === 'system');
    const conversationMessages = cappedMessages.filter(m => m.role !== 'system');
    cappedMessages = [...systemMessages, ...conversationMessages.slice(-15)];
  }
  
  // Lighter catalog for chat: only essential fields (saves ~3K tokens)
  const catalogSummary = catalog.map((item) => {
    const category = categories.find(c => c.id === item.categoryId);
    const summary: Record<string, unknown> = {
      id: item.id,
      name: item.name,
      category: category?.name ?? null,
    };
    
    if (item.brand) summary.brand = item.brand;
    if (item.model) summary.model = item.model;
    if (item.inferredProfile) summary.inferredProfile = item.inferredProfile;
    
    return summary;
  });
  
  const systemPrompt = `You are PackShot AI, an expert photography and videography gear advisor.

You ONLY answer questions about:
- Camera gear (bodies, lenses, accessories)
- Lighting equipment
- Audio equipment
- Support gear (tripods, gimbals, sliders)
- Shooting techniques and event preparation
- Gear purchasing advice and recommendations

The user's gear catalog:
${JSON.stringify(catalogSummary)}

Important:
- Use the catalog above to give personalized advice
- Reference specific items from their catalog when relevant (e.g., "your Sony FX30 is great for...")
- Be concise and practical
- If asked about something unrelated to photography/videography, politely redirect
- If you don't know something, say so - don't make up information
- If the user sends a photo, analyze the gear shown and provide relevant advice, identification, or comparison with their catalog

Respond in a helpful, conversational tone.`;

  // Check if any user message contains multimodal content (images)
  const hasVisionContent = cappedMessages.some(
    m => Array.isArray(m.content) && m.content.some(p => p.type === 'image_url')
  );

  const allMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: MessageContent }> = [
    { role: 'system', content: systemPrompt },
    ...cappedMessages.map(m => ({ role: m.role, content: m.content })),
  ];
  
  const taskConfig = AI_TASKS.CHAT;
  // Use Gemini for vision (better multimodal support), Groq for text-only
  const model = hasVisionContent ? 'gemini-2.0-flash' : GROQ_MODELS[taskConfig.model];
  const provider = hasVisionContent ? 'llm-gateway' as const : 'groq' as const;
  
  try {
    const response = await callEdgeFunction({
      provider,
      model,
      messages: allMessages,
      temperature: taskConfig.temperature,
      max_tokens: taskConfig.maxTokens,
      // No response_format for chat (returns prose, not JSON)
    });

    return response.choices[0]?.message?.content || 'Sorry, I could not generate a response.';
  } catch (error) {
    console.error('[Chat] Error:', error);
    
    // If vision failed with Gemini, try Groq as fallback (Groq supports vision too via Llama)
    if (hasVisionContent && !(error instanceof AuthExpiredError)) {
      console.warn('[Chat] Gemini vision failed, trying Groq fallback...');
      try {
        const response = await callEdgeFunction({
          provider: 'groq',
          model: GROQ_MODELS[taskConfig.model],
          messages: allMessages,
          temperature: taskConfig.temperature,
          max_tokens: taskConfig.maxTokens,
        });
        return response.choices[0]?.message?.content || 'Sorry, I could not generate a response.';
      } catch (fallbackError) {
        if (fallbackError instanceof AuthExpiredError) throw fallbackError;
        throw error; // throw original error
      }
    }
    
    // Re-throw AuthExpiredError to be handled by the UI
    if (error instanceof AuthExpiredError) {
      throw error;
    }
    throw error;
  }
}
