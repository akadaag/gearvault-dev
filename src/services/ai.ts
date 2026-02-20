import { db } from '../db';
import { callGroqForPackingPlan, callGroqForChat } from '../lib/groqClient';
import { makeId } from '../lib/ids';
import { gearRecognitionSchema, type GearRecognition } from '../lib/aiSchemas';
import { callEdgeFunction, AuthExpiredError, type MessageContentPart, type MessageContent } from '../lib/edgeFunctionClient';
import type {
  AIFeedback,
  AppSettings,
  ChatMessage,
  ChatSession,
  Category,
  EventItem,
  GearItem,
  MissingItemSuggestion,
  PackingChecklistItem,
  Priority,
} from '../types/models';

export interface AIContext {
  eventDescription: string;
  catalog: GearItem[];
  patterns: { eventType: string; topItems: string[] }[];
}

export interface AIPlan {
  eventTitle: string;
  eventType: string;
  checklist: Array<{
    name: string;
    gearItemId: string | null;
    quantity: number;
    notes?: string;
    priority: Priority;
    section?: string; // populated by Groq provider
    role?: 'primary' | 'backup' | 'alternative' | 'standard';
  }>;
  missingItems: Array<{
    name: string;
    reason: string;
    priority: Priority;
    action: 'buy' | 'borrow' | 'rent';
    notes?: string;        // used for estimated_cost
    category?: string;
  }>;
  tips?: string[];
}

interface AIProvider {
  generatePlan(ctx: AIContext): Promise<AIPlan>;
}

// ---------------------------------------------------------------------------
// Groq provider — uses centralized config from groqConfig.ts
// ---------------------------------------------------------------------------

class GroqProvider implements AIProvider {
  async generatePlan(ctx: AIContext): Promise<AIPlan> {
    const events = await db.events.toArray();
    const result = await callGroqForPackingPlan(
      ctx.eventDescription,
      ctx.catalog,
      events,
    );

    return {
      eventTitle: result.event_title,
      eventType: result.event_type,
      checklist: result.recommended_items.map((item) => ({
        name: item.name,
        gearItemId: item.gear_item_id,
        quantity: item.quantity ?? 1,
        notes: item.reason,
        priority: mapPriority(item.priority),
        section: item.section,
        role: item.role,
      })),
      missingItems: result.missing_items.map((item) => ({
        name: item.name,
        reason: item.reason,
        priority: mapPriority(item.priority),
        action: item.action,
        notes: item.estimated_cost,
        category: item.category,
      })),
      tips: result.tips ?? [],
    };
  }
}

// ---------------------------------------------------------------------------
// Utility — map Groq priority strings to internal Priority type
// ---------------------------------------------------------------------------

function mapPriority(p: string): Priority {
  if (p === 'Must-have') return 'must-have';
  if (p === 'Nice-to-have') return 'nice-to-have';
  return 'optional';
}

// ---------------------------------------------------------------------------
// Pattern learning from aiFeedback table
// ---------------------------------------------------------------------------

export async function buildPatterns(): Promise<{ eventType: string; topItems: string[] }[]> {
  const usefulFeedback = (await db.aiFeedback.toArray()).filter((f) => f.useful);
  const grouped = new Map<string, Map<string, number>>();

  for (const row of usefulFeedback) {
    if (!grouped.has(row.eventType)) {
      grouped.set(row.eventType, new Map());
    }
    const map = grouped.get(row.eventType)!;
    map.set(row.itemName, (map.get(row.itemName) ?? 0) + 1);
  }

  return Array.from(grouped.entries()).map(([eventType, counts]) => ({
    eventType,
    topItems: Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([item]) => item),
  }));
}

// ---------------------------------------------------------------------------
// Provider factory — always returns GroqProvider
// ---------------------------------------------------------------------------

export async function getProvider(_settings: AppSettings): Promise<AIProvider> {
  return new GroqProvider();
}

// ---------------------------------------------------------------------------
// Convert AIPlan → EventItem for persistence (TASK 3.4)
// categoryName uses section from Groq; falls back to catalog lookup
// ---------------------------------------------------------------------------

export function toEventFromPlan(plan: AIPlan, ctx: AIContext): EventItem {
  const eventId = makeId();
  const now = new Date().toISOString();

  const packingChecklist: PackingChecklistItem[] = plan.checklist.map((item) => ({
    id: makeId(),
    eventId,
    gearItemId: item.gearItemId,
    name: item.name,
    quantity: Math.max(1, item.quantity || 1),
    packed: false,
    notes: item.notes,
    // Prefer AI-assigned section; fall back to catalog category lookup
    categoryName:
      item.section ??
      (item.gearItemId
        ? ctx.catalog.find((g) => g.id === item.gearItemId)?.categoryId
        : undefined),
    priority: item.priority,
  }));

  const missingItems: MissingItemSuggestion[] = plan.missingItems.map((item) => ({
    id: makeId(),
    eventId,
    name: item.name,
    reason: item.reason,
    priority: item.priority,
    action: item.action,
    notes: item.notes,
    resolvedStatus: 'unresolved',
  }));

  return {
    id: eventId,
    title: plan.eventTitle,
    type: plan.eventType,
    notes: ctx.eventDescription,
    createdBy: 'ai',
    createdAt: now,
    updatedAt: now,
    packingChecklist,
    missingItems,
  };
}

// ---------------------------------------------------------------------------
// Feedback storage
// ---------------------------------------------------------------------------

export async function storeSuggestionFeedback(
  eventType: string,
  itemName: string,
  useful: boolean,
) {
  const feedback: AIFeedback = {
    id: makeId(),
    eventType,
    itemName,
    useful,
    createdAt: new Date().toISOString(),
  };
  await db.aiFeedback.add(feedback);
}

// ---------------------------------------------------------------------------
// Chat Q&A Service
// ---------------------------------------------------------------------------

/**
 * Send a message to the AI chat and get a response.
 * Includes the user's gear catalog for personalized advice.
 * Limits conversation history to last 20 messages.
 * 
 * @param pendingImageDataUrl - Full-res compressed image data URL to attach
 *   to the LAST user message (for vision). Not persisted, in-memory only.
 */
export async function sendChatMessage(
  messages: ChatMessage[],
  catalog: GearItem[],
  pendingImageDataUrl?: string,
): Promise<string> {
  // Limit to last 20 messages (excluding system prompt)
  const recentMessages = messages.slice(-20);
  
  // Convert ChatMessage[] (content: string) → multimodal format when image present
  const groqMessages = recentMessages.map((m, idx) => {
    const isLastUserMessage = idx === recentMessages.length - 1 && m.role === 'user';

    // Attach the pending image to the last user message
    if (isLastUserMessage && pendingImageDataUrl) {
      const parts: MessageContentPart[] = [
        { type: 'text', text: m.content },
        { type: 'image_url', image_url: { url: pendingImageDataUrl, detail: 'low' } },
      ];
      return { role: m.role, content: parts as MessageContent };
    }

    return { role: m.role, content: m.content as MessageContent };
  });
  
  const response = await callGroqForChat(groqMessages, catalog);
  return response;
}

/**
 * Generate a chat session title from the first user message.
 * Takes the first 50 characters and capitalizes appropriately.
 */
export function generateChatTitle(firstUserMessage: string): string {
  const cleaned = firstUserMessage.trim();
  if (cleaned.length <= 50) {
    return cleaned;
  }
  // Truncate at word boundary
  const truncated = cleaned.slice(0, 50);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > 30) {
    return truncated.slice(0, lastSpace) + '...';
  }
  return truncated + '...';
}

/**
 * Save a chat session to the database.
 */
export async function saveChatSession(session: ChatSession): Promise<void> {
  await db.chatSessions.put(session);
}

/**
 * Load a chat session by ID.
 */
export async function loadChatSession(sessionId: string): Promise<ChatSession | undefined> {
  return await db.chatSessions.get(sessionId);
}

/**
 * Load all chat sessions, sorted by most recent first.
 */
export async function loadAllChatSessions(): Promise<ChatSession[]> {
  const sessions = await db.chatSessions.toArray();
  return sessions.sort((a, b) => 
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

/**
 * Delete a chat session by ID.
 */
export async function deleteChatSession(sessionId: string): Promise<void> {
  await db.chatSessions.delete(sessionId);
}

/**
 * Create a new chat message object.
 */
export function createChatMessage(
  role: 'user' | 'assistant' | 'system',
  content: string,
): ChatMessage {
  return {
    id: makeId(),
    role,
    content,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a new chat session object.
 */
export function createChatSession(title: string, initialMessages: ChatMessage[] = []): ChatSession {
  const now = new Date().toISOString();
  return {
    id: makeId(),
    title,
    messages: initialMessages,
    createdAt: now,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Gear Photo Recognition
// ---------------------------------------------------------------------------

/** Default category names for the recognition prompt */
const CATEGORY_NAMES = [
  'Camera bodies',
  'Lenses',
  'Tripods / supports',
  'Lighting',
  'Modifiers',
  'Audio',
  'Monitoring',
  'Power',
  'Media',
  'Bags & cases',
  'Cables & adapters',
  'Drones',
  'Gimbals / stabilizers',
  'Filters',
  'Cleaning / maintenance',
  'Computer / ingest accessories',
];

/**
 * Match an AI-returned category name to an actual category ID.
 * Uses case-insensitive substring matching with fallback.
 */
export function matchCategoryByName(
  aiCategory: string,
  categories: Category[],
): string {
  if (!aiCategory) return '';
  const lower = aiCategory.toLowerCase().trim();

  // Exact match (case-insensitive)
  const exact = categories.find(
    (c) => c.name.toLowerCase() === lower,
  );
  if (exact) return exact.id;

  // Substring match (AI might say "cables" instead of "Cables & adapters")
  const partial = categories.find(
    (c) =>
      c.name.toLowerCase().includes(lower) ||
      lower.includes(c.name.toLowerCase()),
  );
  if (partial) return partial.id;

  // Word overlap: split both into words, find best overlap
  const aiWords = lower.split(/[\s/&,]+/).filter(Boolean);
  let bestScore = 0;
  let bestId = '';
  for (const cat of categories) {
    const catWords = cat.name.toLowerCase().split(/[\s/&,]+/).filter(Boolean);
    const overlap = aiWords.filter((w) =>
      catWords.some((cw) => cw.includes(w) || w.includes(cw)),
    ).length;
    if (overlap > bestScore) {
      bestScore = overlap;
      bestId = cat.id;
    }
  }

  return bestScore > 0 ? bestId : '';
}

/**
 * Recognize gear from one or more photos using AI vision.
 * Returns structured identification data for form auto-fill.
 *
 * @param photoDataUrls - 1 to 3 base64 data URLs (compressed for AI)
 * @param categories - The user's category list for matching
 */
export async function recognizeGearFromPhotos(
  photoDataUrls: string[],
  categories: Category[],
): Promise<GearRecognition & { categoryId: string }> {
  if (photoDataUrls.length === 0) {
    throw new Error('At least one photo is required for recognition.');
  }

  const categoryList = categories.length > 0
    ? categories.map((c) => c.name)
    : CATEGORY_NAMES;

  const prompt = `You are a photography and videography equipment identifier.

Analyze the photo(s) and identify this piece of gear or accessory.

YOUR #1 PRIORITY is to identify the CATEGORY (type of item). Even if you cannot identify the exact product, you MUST determine what type of item this is.

CATEGORY — You MUST classify it into ONE of these exact categories:
${categoryList.map((n) => `- ${n}`).join('\n')}

IDENTIFICATION RULES:
1. CATEGORY is REQUIRED — always pick the closest match from the list above.
2. NAME — The product/model identifier the owner would use to refer to this item.
   - If you can identify the specific product: use the product name or model number (e.g. "FX30", "A7 IV", "VideoMic Pro+", "Ninja V", "MixPre-3 II").
   - If you can read text printed on the item: READ IT and use that as the name.
   - If you cannot identify the exact product but know the type: use a brief descriptive name (e.g. "Camera Cage", "LED Panel", "Shotgun Mic", "HDMI Cable", "V-Mount Battery").
   - Do NOT use full sentences. Do NOT repeat the category (e.g. do NOT write "Mirrorless Camera Body" if the category is already "Camera bodies").
   - LENSES: Always start with the focal length, then aperture, then any suffix/series. E.g. "16-55mm f/2.8 G", "50mm f/1.2 L", "24-70mm f/2.8 GM II", "35mm f/1.8". Never start with "Lens" or the mount type.
   - CABLES: If both ends have DIFFERENT connectors, name it as "X to Y Cable" (e.g. "HDMI to USB-C Cable", "XLR to 3.5mm Cable"). If both ends are the SAME connector, just say "X Cable" (e.g. "HDMI Cable", "USB-C Cable", "XLR Cable").
3. BRAND — Only the brand name (e.g. "Sony", "Rode", "Atomos"). Leave empty string if you are not confident.
4. If the item is NOT photography/videography equipment (e.g. food, furniture, pets, personal items), set confidence to "none".

Return ONLY valid JSON with this exact structure:
{
  "item_name": "string — product name or model (e.g. 'FX30', 'VideoMic Pro+', 'Camera Cage')",
  "brand": "string — brand name only, or empty string",
  "category": "string — one of the categories listed above",
  "confidence": "high | medium | low | none",
  "tags": ["optional", "descriptive", "tags"]
}`;

  // Build multimodal content: text prompt + all photos
  const content: MessageContentPart[] = [
    { type: 'text', text: prompt },
    ...photoDataUrls.map(
      (url): MessageContentPart => ({
        type: 'image_url',
        image_url: { url, detail: 'low' },
      }),
    ),
  ];

  try {
    // Try Gemini first (primary)
    const response = await callEdgeFunction({
      provider: 'llm-gateway',
      model: 'google-ai-studio/gemini-2.5-flash-lite',
      messages: [{ role: 'user', content }],
      temperature: 0.2,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    });

    const rawContent = response.choices[0]?.message?.content || '{}';
    const cleaned = sanitizeJsonResponse(rawContent);
    const json = JSON.parse(cleaned);
    const parsed = gearRecognitionSchema.parse(json);

    // Map category name to ID
    const categoryId = matchCategoryByName(parsed.category, categories);

    return { ...parsed, categoryId };
  } catch (primaryError) {
    // If auth error, don't try fallback
    if (primaryError instanceof AuthExpiredError) throw primaryError;

    console.warn('[Recognition] Gemini failed, trying Groq fallback:', primaryError);

    // Fallback to Groq Llama 4 Scout
    try {
      const response = await callEdgeFunction({
        provider: 'groq',
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [{ role: 'user', content }],
        temperature: 0.2,
        max_tokens: 1000,
        response_format: { type: 'json_object' },
      });

      const rawContent = response.choices[0]?.message?.content || '{}';
      const cleaned = sanitizeJsonResponse(rawContent);
      const json = JSON.parse(cleaned);
      const parsed = gearRecognitionSchema.parse(json);
      const categoryId = matchCategoryByName(parsed.category, categories);

      return { ...parsed, categoryId };
    } catch (fallbackError) {
      if (fallbackError instanceof AuthExpiredError) throw fallbackError;
      throw new Error(
        `Could not identify this item. ${fallbackError instanceof Error ? fallbackError.message : 'Please try again.'}`,
      );
    }
  }
}

/** Strip markdown fences and extract JSON from messy AI responses */
function sanitizeJsonResponse(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return s;
  return s.slice(start, end + 1);
}
