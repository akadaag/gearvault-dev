/**
 * Gear Classification System
 * Automatically classifies gear items using Groq AI to infer:
 * - inferredProfile: video_first | photo_first | hybrid | cinema | audio | lighting | support | power | media | accessory
 * - capabilities: array of capability strings
 */

import { db } from '../db';
import { GROQ_API_KEY, GROQ_BASE_URL, GROQ_MODEL } from './groqConfig';
import type { GearItem } from '../types/models';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Zod schema for classification response
// ---------------------------------------------------------------------------

const classificationItemSchema = z.object({
  id: z.string(),
  inferredProfile: z.enum(['video_first', 'photo_first', 'hybrid', 'cinema', 'audio', 'lighting', 'support', 'power', 'media', 'accessory']),
  capabilities: z.array(z.string()),
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
// Batch classification via Groq
// ---------------------------------------------------------------------------

type ClassificationResult =
  | { success: true; data: ClassificationResponse }
  | { success: false; error: string };

async function classifyBatch(items: GearItem[]): Promise<ClassificationResult> {
  try {
    const itemsForPrompt = items.map(item => ({
      id: item.id,
      name: item.name,
      brand: item.brand,
      model: item.model,
      category: item.categoryId, // This is just the ID, but gives a hint
      tags: item.tags,
    }));

    const prompt = `You are a gear classification expert for photographers and videographers.

Classify each item below by inferring:
1. "inferredProfile": Choose ONE that best fits:
   - "video_first": Optimized for video (e.g., Sony A7S III, cinema cameras, video-centric bodies)
   - "photo_first": Optimized for stills (e.g., high-res bodies, portrait lenses)
   - "hybrid": Balanced photo/video (e.g., Sony A7 IV, versatile zoom lenses)
   - "cinema": Cinema cameras (e.g., RED, ARRI, Blackmagic)
   - "audio": Audio gear (microphones, recorders, wireless systems)
   - "lighting": Lights, flashes, modifiers
   - "support": Tripods, gimbals, sliders, rigs
   - "power": Batteries, chargers, power banks
   - "media": Memory cards, SSDs, card readers
   - "accessory": Bags, straps, cleaning kits, filters, etc.

2. "capabilities": Array of 2-5 short capability strings that describe what makes this item useful (e.g., "4K 120fps video", "excellent low-light", "fast autofocus")

Items to classify:
${JSON.stringify(itemsForPrompt, null, 2)}

Return ONLY valid JSON in this format:
{
  "items": [
    {
      "id": "item-id-here",
      "inferredProfile": "video_first",
      "capabilities": ["4K 120fps", "10-bit internal", "low-light beast"]
    }
  ]
}`;

    const response = await fetch(GROQ_BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.3, // Lower temp for consistent classification
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Groq API error ${response.status}: ${body}`);
    }

    const json = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const rawContent = json.choices?.[0]?.message?.content ?? '{}';
    const parsed = classificationResponseSchema.safeParse(JSON.parse(rawContent));

    if (parsed.success) {
      return { success: true, data: parsed.data };
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
