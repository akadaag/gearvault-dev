import { db } from '../db';
import { callGroqForFollowUpQuestions, callGroqForPackingPlan } from '../lib/groqClient';
import { makeId } from '../lib/ids';
import type {
  AIFeedback,
  AppSettings,
  EventItem,
  GearItem,
  MissingItemSuggestion,
  PackingChecklistItem,
  Priority,
} from '../types/models';

export interface AIContext {
  eventDescription: string;
  followUpAnswers: Record<string, string>;
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
  getFollowUpQuestions(ctx: AIContext): Promise<string[]>;
  generatePlan(ctx: AIContext): Promise<AIPlan>;
}

// ---------------------------------------------------------------------------
// Groq provider — uses centralized config from groqConfig.ts
// ---------------------------------------------------------------------------

class GroqProvider implements AIProvider {
  async getFollowUpQuestions(ctx: AIContext): Promise<string[]> {
    const questions = await callGroqForFollowUpQuestions(ctx.eventDescription);
    return questions.map((q) => q.question);
  }

  async generatePlan(ctx: AIContext): Promise<AIPlan> {
    const events = await db.events.toArray();
    const result = await callGroqForPackingPlan(
      ctx.eventDescription,
      ctx.followUpAnswers,
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
// Internal helpers
// ---------------------------------------------------------------------------
