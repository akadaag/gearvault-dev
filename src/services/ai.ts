import { db } from '../db';
import { callGroqForPackingPlan, callGroqForChat } from '../lib/groqClient';
import { makeId } from '../lib/ids';
import type {
  AIFeedback,
  AppSettings,
  ChatMessage,
  ChatSession,
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
 */
export async function sendChatMessage(
  messages: ChatMessage[],
  catalog: GearItem[],
): Promise<string> {
  // Limit to last 20 messages (excluding system prompt)
  const recentMessages = messages.slice(-20);
  
  const response = await callGroqForChat(recentMessages, catalog);
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
