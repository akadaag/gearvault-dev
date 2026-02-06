import { db } from '../db';
import {
  aiOutputJsonSchema,
  aiOutputSchema,
  followUpPromptTemplate,
  systemPrompt,
  userPromptTemplate,
} from '../lib/aiPrompts';
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
  }>;
  missingItems: Array<{
    name: string;
    reason: string;
    priority: Priority;
    action: 'buy' | 'borrow' | 'rent';
    notes?: string;
  }>;
}

interface AIProvider {
  getFollowUpQuestions(ctx: AIContext): Promise<string[]>;
  generatePlan(ctx: AIContext): Promise<AIPlan>;
}

class MockAIProvider implements AIProvider {
  async getFollowUpQuestions(ctx: AIContext): Promise<string[]> {
    const d = ctx.eventDescription.toLowerCase();
    const questions: string[] = [];
    if (!d.includes('indoor') && !d.includes('outdoor')) {
      questions.push('Indoor, outdoor, or mixed environment?');
    }
    if (!d.includes('photo') && !d.includes('video')) {
      questions.push('Photo, video, or hybrid coverage?');
    }
    if (!d.includes('hour') && !d.includes('day')) {
      questions.push('Estimated duration of the shoot?');
    }
    return questions.slice(0, 3);
  }

  async generatePlan(ctx: AIContext): Promise<AIPlan> {
    const d = `${ctx.eventDescription} ${Object.values(ctx.followUpAnswers).join(' ')}`.toLowerCase();
    const eventType = inferEventType(d);
    const essentials = ctx.catalog.filter((g) => g.essential);
    const accessories = ctx.catalog.filter((g) => /battery|charger|card|ssd|cable|adapter|power/i.test(g.name));

    const base = [...essentials, ...accessories];
    const deduped = Array.from(new Map(base.map((g) => [g.id, g])).values());

    const checklist: AIPlan['checklist'] = deduped.map((g) => ({
      name: g.name,
      gearItemId: g.id,
      quantity: recommendQuantity(g, d),
      priority: g.essential ? 'must-have' : 'nice-to-have',
      notes: g.essential ? 'Marked essential in your catalog.' : undefined,
    }));

    const missingItems: AIPlan['missingItems'] = [];
    const hasItem = (regex: RegExp) =>
      ctx.catalog.some((g) => regex.test(`${g.name} ${g.tags.join(' ')} ${g.notes ?? ''}`.toLowerCase()));

    if (d.includes('interview') && !hasItem(/lav|lavalier/)) {
      missingItems.push({
        name: 'Lavalier microphone',
        reason: 'Interviews benefit from close voice capture and cleaner dialogue.',
        priority: 'must-have',
        action: 'rent',
      });
    }

    if ((d.includes('dark') || d.includes('church') || d.includes('night')) && !hasItem(/flash|led|light/)) {
      missingItems.push({
        name: 'On-camera flash or compact LED',
        reason: 'Low-light conditions require reliable fill lighting.',
        priority: 'nice-to-have',
        action: 'rent',
      });
    }

    if ((d.includes('rain') || d.includes('weather')) && !hasItem(/rain|cover|weather seal/)) {
      missingItems.push({
        name: 'Rain cover kit',
        reason: 'Protect body/lens from moisture in outdoor weather.',
        priority: 'must-have',
        action: 'buy',
      });
    }

    for (const pattern of ctx.patterns) {
      if (pattern.eventType === eventType) {
        for (const itemName of pattern.topItems.slice(0, 3)) {
          if (!checklist.some((c) => c.name === itemName)) {
            checklist.push({
              name: itemName,
              gearItemId: null,
              quantity: 1,
              priority: 'nice-to-have',
              notes: 'Suggested from your local history.',
            });
          }
        }
      }
    }

    return {
      eventTitle: `${capitalize(eventType)} Event`,
      eventType,
      checklist: checklist.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority)),
      missingItems,
    };
  }
}

class OpenAIProvider implements AIProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async getFollowUpQuestions(ctx: AIContext): Promise<string[]> {
    const prompt = followUpPromptTemplate
      .replace('{{eventDescription}}', ctx.eventDescription)
      .replace('{{knownContextJson}}', JSON.stringify({ answers: ctx.followUpAnswers }));

    const data = await this.callModel(prompt, true);
    const questions = data.questions;
    if (!Array.isArray(questions)) return [];
    return questions.filter((q): q is string => typeof q === 'string').slice(0, 3);
  }

  async generatePlan(ctx: AIContext): Promise<AIPlan> {
    const prompt = userPromptTemplate
      .replace(
        '{{eventInputJson}}',
        JSON.stringify({ description: ctx.eventDescription, answers: ctx.followUpAnswers }),
      )
      .replace('{{catalogJson}}', JSON.stringify(ctx.catalog))
      .replace('{{patternsJson}}', JSON.stringify(ctx.patterns));

    const data = await this.callModel(prompt, false);
    const parsed = aiOutputSchema.safeParse(data);
    if (!parsed.success) {
      throw new Error('AI response did not match schema.');
    }
    return parsed.data;
  }

  private async callModel(prompt: string, isFollowUp: boolean): Promise<Record<string, unknown>> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `${systemPrompt}\nJSON schema: ${JSON.stringify(aiOutputJsonSchema)}`,
          },
          { role: 'user', content: prompt },
          ...(isFollowUp
            ? [{ role: 'system', content: 'Return only {"questions": string[]} with at most 3 items.' }]
            : []),
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI error: ${response.status}`);
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = json.choices?.[0]?.message?.content ?? '{}';
    return JSON.parse(content) as Record<string, unknown>;
  }
}

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

export async function getProvider(settings: AppSettings): Promise<AIProvider> {
  if (settings.aiProvider === 'openai' && settings.apiKey) {
    return new OpenAIProvider(settings.apiKey);
  }
  return new MockAIProvider();
}

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
    categoryName: item.gearItemId
      ? ctx.catalog.find((g) => g.id === item.gearItemId)?.categoryId
      : undefined,
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

export async function storeSuggestionFeedback(eventType: string, itemName: string, useful: boolean) {
  const feedback: AIFeedback = {
    id: makeId(),
    eventType,
    itemName,
    useful,
    createdAt: new Date().toISOString(),
  };
  await db.aiFeedback.add(feedback);
}

function inferEventType(description: string) {
  if (description.includes('wedding')) return 'wedding';
  if (description.includes('interview')) return 'corporate interview';
  if (description.includes('travel')) return 'travel';
  if (description.includes('music')) return 'music video';
  if (description.includes('portrait')) return 'studio portrait';
  return 'custom shoot';
}

function recommendQuantity(item: GearItem, description: string) {
  const lower = item.name.toLowerCase();
  if (/battery|card|ssd|media|power/.test(lower)) {
    if (description.includes('long') || description.includes('day')) return Math.max(2, Math.ceil(item.quantity / 2));
    return Math.max(2, Math.min(item.quantity, 4));
  }
  return 1;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function priorityRank(priority: Priority) {
  if (priority === 'must-have') return 0;
  if (priority === 'nice-to-have') return 1;
  return 2;
}
