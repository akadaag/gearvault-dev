/**
 * Gear Classification System
 * Automatically classifies gear items using Groq AI to infer:
 * - inferredProfile: video_first | photo_first | hybrid | cinema | audio | lighting | support | power | media | accessory
 * - capabilities: array of technical specs
 * - eventFit: array of event types this item is suited for
 * - strengths: array of practical strengths
 */

import { db } from '../db';
import { GROQ_MODELS, AI_TASKS } from './groqConfig';
import type { GearItem } from '../types/models';
import { z } from 'zod';
import { callEdgeFunction } from './edgeFunctionClient';

// ---------------------------------------------------------------------------
// Zod schema for classification response
// ---------------------------------------------------------------------------

const classificationItemSchema = z.object({
  id: z.string(),
  inferredProfile: z.enum(['video_first', 'photo_first', 'hybrid', 'cinema', 'audio', 'lighting', 'support', 'power', 'media', 'accessory']),
  capabilities: z.array(z.string()),
  eventFit: z.array(z.string()),
  strengths: z.array(z.string()),
});

const classificationResponseSchema = z.object({
  items: z.array(classificationItemSchema),
});

type ClassificationResponse = z.infer<typeof classificationResponseSchema>;

// ---------------------------------------------------------------------------
// Classification Queue — batches items, debounces, calls Groq
// ---------------------------------------------------------------------------

class ClassificationQueue {
  private queue: GearItem[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private processing = false;

  enqueue(item: GearItem) {
    // Only enqueue if not already classified
    if (item.classificationStatus === 'done') return;

    // Check if already in queue
    const exists = this.queue.find(q => q.id === item.id);
    if (exists) return;

    this.queue.push(item);
    this.scheduleProcess();
  }

  private scheduleProcess() {
    // Clear existing timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Debounce 2 seconds
    this.debounceTimer = setTimeout(() => {
      this.processQueue();
    }, 2000);
  }

  private async processQueue() {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;

    try {
      // Take up to 10 items from queue
      const batch = this.queue.splice(0, 10);
      
      // Mark as pending
      for (const item of batch) {
        await db.gearItems.update(item.id, { classificationStatus: 'pending' });
      }

      // Call Groq for classification
      const result = await classifyBatch(batch);

      // Update items with results
      if (result.success) {
        for (const classification of result.data.items) {
          await db.gearItems.update(classification.id, {
            inferredProfile: classification.inferredProfile,
            capabilities: classification.capabilities,
            eventFit: classification.eventFit,
            strengths: classification.strengths,
            classificationStatus: 'done',
          });
        }
      } else {
        // Mark as failed
        for (const item of batch) {
          await db.gearItems.update(item.id, { classificationStatus: 'failed' });
        }
        console.error('Gear classification failed:', result.error);
      }
    } catch (error) {
      console.error('Error processing classification queue:', error);
    } finally {
      this.processing = false;

      // If there are more items, process them
      if (this.queue.length > 0) {
        this.scheduleProcess();
      }
    }
  }
}

// Singleton instance
export const classificationQueue = new ClassificationQueue();

// ---------------------------------------------------------------------------
// Mount Assignment — Deterministic first-party, suffix-based third-party
// ---------------------------------------------------------------------------

const BRAND_MOUNT_MAP: Record<string, string> = {
  'sony': 'mount-sony-e',
  'canon': 'mount-canon-rf',
  'fujifilm': 'mount-fuji-x',
  'fuji': 'mount-fuji-x',
  'nikon': 'mount-nikon-z',
  'panasonic': 'mount-l',
  'leica': 'mount-l',
  'olympus': 'mount-mft',
  'om system': 'mount-mft',
  'blackmagic': 'mount-l',
  'hasselblad': 'mount-hasselblad-x',
};

const THIRD_PARTY_SUFFIX_MAP: Record<string, Record<string, string>> = {
  'sigma': {
    'dg dn': 'mount-sony-e', // Could also be L-mount, resolved by catalog fallback
    'dc dn': 'mount-sony-e',
    'dg os hsm': 'mount-canon-ef',
    'dg hsm': 'mount-canon-ef',
  },
  'tamron': {
    'di iii-a': 'mount-sony-e',
    'di iii': 'mount-sony-e',
    'di ii': 'mount-canon-ef',
    'di': 'mount-canon-ef',
  },
};

/**
 * Get the most common mount type in the user's catalog
 * Used as fallback for ambiguous third-party lenses
 */
function getMajorityMount(catalog: GearItem[]): string | null {
  const mountCounts: Record<string, number> = {};
  
  for (const item of catalog) {
    if (!item.strengths) continue;
    
    const mountStrength = item.strengths.find(s => s.startsWith('mount-'));
    if (mountStrength) {
      mountCounts[mountStrength] = (mountCounts[mountStrength] || 0) + 1;
    }
  }
  
  if (Object.keys(mountCounts).length === 0) return null;
  
  // Return the mount with highest count
  return Object.entries(mountCounts).sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * Post-process classification to assign deterministic mounts
 * Called after AI classification returns
 */
async function assignMountsToClassification(
  classifications: ClassificationResponse
): Promise<ClassificationResponse> {
  const catalog = await db.gearItems.toArray();
  const majorityMount = getMajorityMount(catalog);
  
  for (const item of classifications.items) {
    const gearItem = catalog.find(g => g.id === item.id);
    if (!gearItem) continue;
    
    const brand = gearItem.brand?.toLowerCase() || '';
    const model = gearItem.model?.toLowerCase() || '';
    const category = gearItem.categoryId;
    
    // Skip if not a camera body or lens
    if (category !== 'default-1' && category !== 'default-2') continue;
    
    // Remove any existing mount strengths
    item.strengths = item.strengths.filter(s => !s.startsWith('mount-'));
    
    // First-party brand → deterministic mount
    if (BRAND_MOUNT_MAP[brand]) {
      item.strengths.push(BRAND_MOUNT_MAP[brand]);
      continue;
    }
    
    // Third-party brand → suffix-based hints
    if (THIRD_PARTY_SUFFIX_MAP[brand]) {
      const suffixMap = THIRD_PARTY_SUFFIX_MAP[brand];
      let matched = false;
      
      for (const [suffix, mount] of Object.entries(suffixMap)) {
        if (model.includes(suffix)) {
          // If ambiguous (e.g., Sigma DG DN could be E or L), use majority mount
          if (suffix === 'dg dn' && majorityMount && majorityMount !== 'mount-sony-e') {
            item.strengths.push(majorityMount);
          } else {
            item.strengths.push(mount);
          }
          matched = true;
          break;
        }
      }
      
      if (!matched && majorityMount) {
        // Unknown third-party lens, use catalog majority
        item.strengths.push(majorityMount);
      }
    }
  }
  
  return classifications;
}

// ---------------------------------------------------------------------------
// Batch classification via Groq
// ---------------------------------------------------------------------------

type ClassificationResult =
  | { success: true; data: ClassificationResponse }
  | { success: false; error: string };

async function classifyBatch(items: GearItem[]): Promise<ClassificationResult> {
  try {
    // Fetch categories to resolve human-readable names
    const categories = await db.categories.toArray();
    
    const itemsForPrompt = items.map(item => ({
      id: item.id,
      name: item.name,
      brand: item.brand,
      model: item.model,
      category: categories.find(c => c.id === item.categoryId)?.name ?? item.categoryId,
      tags: item.tags,
    }));

    const prompt = `You are a gear classification expert for photographers and videographers.

For each item, provide:
1. "inferredProfile": Choose ONE:
   - "video_first": Video-optimized (FX30, A7S III, cinema rigs)
   - "photo_first": Photo-optimized (A7R V, high-res bodies, portrait lenses)
   - "hybrid": Balanced (A7 IV, 24-70mm zooms)
   - "cinema": Cinema cameras (RED, ARRI, Blackmagic)
   - "audio": Audio gear (mics, recorders, wireless)
   - "lighting": Lights, flashes, modifiers
   - "support": Tripods, gimbals, sliders
   - "power": Batteries, chargers, power banks
   - "media": Memory cards, SSDs, readers
   - "accessory": Bags, straps, filters, cleaning

2. "capabilities": 3-5 specific technical specs:
   Examples: "4K 120fps", "33MP", "f/2.8 constant", "10-bit 4:2:2",
   "USB-C PD", "dual-channel wireless", "TTL flash", "bi-color LED"

3. "eventFit": 4-7 event types this item is suited for:
   Choose from: wedding, corporate, interview, portrait, event, concert,
   documentary, music-video, product-shoot, real-estate, sports,
   outdoor, indoor, low-light, travel, studio, run-and-gun

4. "strengths": 3-5 practical strengths:
   Choose from: low-light, autofocus, portability, weather-sealed,
   high-resolution, cinematic-look, wireless, compact, rugged,
   silent-operation, high-speed, wide-angle, telephoto, macro,
   shallow-dof, fast-charging, long-battery-life, close-mic,
   directional-audio, multi-track, powered-light, natural-light-modifier,
   continuous-light, flash-strobe, smooth-motion, static-support,
   mount-sony-e, mount-canon-rf, mount-fuji-x, mount-nikon-z, mount-l,
   mount-mft, mount-canon-ef, dual-card-slots, mid-range, fast-aperture
   
   **MOUNT ASSIGNMENT RULES (for Camera Bodies and Lenses ONLY)**:
   You MUST include exactly ONE mount strength for all camera bodies and lenses.
   Common brand → mount mappings:
   - Sony bodies/lenses → mount-sony-e
   - Canon RF bodies/lenses → mount-canon-rf
   - Canon EF/EF-S bodies/lenses → mount-canon-ef
   - Fujifilm X bodies/lenses → mount-fuji-x
   - Nikon Z bodies/lenses → mount-nikon-z
   - Panasonic S / Leica SL → mount-l
   - Olympus / OM System → mount-mft
   - Sigma DG DN / Tamron Di III → usually mount-sony-e (will be refined by post-processing)
   
   If the brand/model doesn't clearly indicate a mount, omit the mount strength and the system will assign it.

Items to classify:
${JSON.stringify(itemsForPrompt, null, 2)}

Examples:
{
  "items": [
    {
      "id": "...",
      "inferredProfile": "video_first",
      "capabilities": ["4K 120fps", "S-Cinetone", "10-bit 4:2:2", "Super 35"],
      "eventFit": ["corporate", "interview", "documentary", "music-video", "indoor", "low-light"],
      "strengths": ["cinematic-look", "low-light", "autofocus", "stabilization"]
    },
    {
      "id": "...",
      "inferredProfile": "audio",
      "capabilities": ["dual-channel wireless", "internal recording", "USB-C charging"],
      "eventFit": ["interview", "corporate", "documentary", "wedding", "run-and-gun"],
      "strengths": ["wireless", "compact", "backup-recording", "versatile"]
    },
    {
      "id": "...",
      "inferredProfile": "lighting",
      "capabilities": ["TTL flash", "HSS", "magnetic modifiers", "round head"],
      "eventFit": ["wedding", "portrait", "event", "indoor", "studio"],
      "strengths": ["versatile", "portability", "wireless", "fast-charging"]
    }
  ]
}

Return ONLY valid JSON with all four fields for each item.`;

    const taskConfig = AI_TASKS.CLASSIFICATION;
    const model = GROQ_MODELS[taskConfig.model];

    const json = await callEdgeFunction({
      provider: 'groq',
      model,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: taskConfig.temperature,
      max_tokens: taskConfig.maxTokens,
    });

    const rawContent = json.choices?.[0]?.message?.content ?? '{}';
    const parsed = classificationResponseSchema.safeParse(JSON.parse(rawContent));

    if (parsed.success) {
      // Post-process: assign deterministic mounts
      const withMounts = await assignMountsToClassification(parsed.data);
      return { success: true, data: withMounts };
    } else {
      return { success: false, error: JSON.stringify(parsed.error.format()) };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ---------------------------------------------------------------------------
// Fallback: Classify all pending items immediately (for AI Assistant)
// ---------------------------------------------------------------------------

export async function classifyPendingItems(): Promise<void> {
  const pending = await db.gearItems
    .filter(item => !item.classificationStatus || item.classificationStatus === 'pending' || item.classificationStatus === 'failed')
    .toArray();

  if (pending.length === 0) return;

  console.log(`🔄 Classifying ${pending.length} pending items...`);

  // Process in batches of 10
  for (let i = 0; i < pending.length; i += 10) {
    const batch = pending.slice(i, i + 10);
    
    // Mark as pending
    for (const item of batch) {
      await db.gearItems.update(item.id, { classificationStatus: 'pending' });
    }

    const result = await classifyBatch(batch);

    if (result.success) {
      for (const classification of result.data.items) {
        await db.gearItems.update(classification.id, {
          inferredProfile: classification.inferredProfile,
          capabilities: classification.capabilities,
          eventFit: classification.eventFit,
          strengths: classification.strengths,
          classificationStatus: 'done',
        });
      }
      console.log(`✅ Classified batch ${i / 10 + 1}`);
    } else {
      // Mark as failed
      for (const item of batch) {
        await db.gearItems.update(item.id, { classificationStatus: 'failed' });
      }
      console.error(`❌ Batch ${i / 10 + 1} failed:`, result.error);
    }
  }

  console.log('✅ Classification complete');
}
