import {
  followUpQuestionsSchema,
  packingPlanSchema,
  type FollowUpQuestion,
  type PackingPlan,
} from './aiSchemas';
import type { GearItem, EventItem } from '../types/models';

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile'; // 12K tokens/min, smarter 70B model

// ---------------------------------------------------------------------------
// Shared fetch helper — plain browser fetch, no SDK needed
// ---------------------------------------------------------------------------

interface GroqMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

async function callGroq(apiKey: string, messages: GroqMessage[], maxTokens = 2000): Promise<string> {
  const response = await fetch(GROQ_BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Groq API error ${response.status}: ${body}`);
  }

  const json = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  return json.choices?.[0]?.message?.content ?? '{}';
}

// ---------------------------------------------------------------------------
// STEP 1: Follow-up questions
// ---------------------------------------------------------------------------

export async function callGroqForFollowUpQuestions(
  apiKey: string,
  eventDescription: string,
): Promise<FollowUpQuestion[]> {
  const messages: GroqMessage[] = [
    {
      role: 'user',
      content: `You are a photography/videography packing assistant.

Event description: "${eventDescription}"

Ask 0–3 concise follow-up questions ONLY if critical information is missing and would significantly change the packing list.
Examples of critical missing info: indoor vs outdoor, photo only / video only / both, estimated duration, clean audio needed, travel restrictions.

If the description already has enough detail, return an empty questions array.

Return ONLY valid JSON:
{"questions": [{"id": "q1", "question": "...", "type": "text"}]}

For yes/no questions use type "select" with options ["Yes","No"].
For multi-choice use type "select" with relevant options.
Maximum 3 questions.`,
    },
  ];

  const content = await callGroq(apiKey, messages, 400);

  try {
    const parsed = followUpQuestionsSchema.safeParse(JSON.parse(content));
    if (parsed.success) return parsed.data.questions.slice(0, 3);
  } catch {
    // Parsing failed — skip questions, proceed to plan
  }

  return [];
}

// ---------------------------------------------------------------------------
// STEP 2: Full packing plan (with one retry on JSON failure)
// ---------------------------------------------------------------------------

export async function callGroqForPackingPlan(
  apiKey: string,
  eventDescription: string,
  answers: Record<string, string>,
  catalog: GearItem[],
  pastEvents: EventItem[],
): Promise<PackingPlan> {
  const messages = buildMessages(eventDescription, answers, catalog, pastEvents);

  // Attempt 1
  let result = await attemptPlan(apiKey, messages);
  if (result.success) return result.data;

  // Attempt 2 — push a strict correction message
  console.warn('Groq: first attempt failed Zod validation, retrying…', result.error);
  const retryMessages: GroqMessage[] = [
    ...messages,
    { role: 'assistant', content: result.rawContent },
    {
      role: 'user',
      content:
        'CRITICAL: Your previous response did not match the required JSON schema. Return ONLY valid JSON with all required fields: event_title (string), event_type (string), recommended_items (array), missing_items (array). No markdown, no explanation.',
    },
  ];

  result = await attemptPlan(apiKey, retryMessages);
  if (result.success) return result.data;

  throw new Error(
    `Groq failed to return a valid packing plan after 2 attempts. Last error: ${result.error}`,
  );
}

// ---------------------------------------------------------------------------
// Internal — attempt one plan call + Zod validation
// ---------------------------------------------------------------------------

type AttemptResult =
  | { success: true; data: PackingPlan; rawContent: string }
  | { success: false; error: string; rawContent: string };

async function attemptPlan(
  apiKey: string,
  messages: GroqMessage[],
): Promise<AttemptResult> {
  let rawContent = '{}';
  try {
    rawContent = await callGroq(apiKey, messages, 3000);
    const json = JSON.parse(rawContent);
    
    // DEBUG: Log the actual Groq response
    console.log('🔍 Groq raw response:', json);
    
    const parsed = packingPlanSchema.safeParse(json);

    if (parsed.success) {
      return { success: true, data: parsed.data, rawContent };
    }

    // DEBUG: Log validation errors
    console.error('❌ Zod validation failed:', parsed.error.format());
    return { success: false, error: JSON.stringify(parsed.error.format()), rawContent };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Unknown error',
      rawContent,
    };
  }
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildMessages(
  eventDescription: string,
  answers: Record<string, string>,
  catalog: GearItem[],
  pastEvents: EventItem[],
): GroqMessage[] {
  const catalogSummary = catalog.map((item) => ({
    id: item.id,
    name: item.name,
    brand: item.brand ?? null,
    model: item.model ?? null,
    essential: item.essential,
    quantity: item.quantity,
    tags: item.tags,
  }));

  const pastSummary = pastEvents
    .slice(0, 5)
    .map((e) => ({
      type: e.type,
      items_packed: e.packingChecklist.filter((i) => i.packed).map((i) => i.name),
    }))
    .filter((e) => e.items_packed.length > 0);

  const answersBlock =
    Object.keys(answers).length > 0
      ? `FOLLOW-UP ANSWERS:\n${Object.entries(answers)
          .map(([q, a]) => `- ${q}: ${a}`)
          .join('\n')}\n\n`
      : '';

  const prompt = `You are an expert photography/videography equipment packing assistant.

EVENT DESCRIPTION:
${eventDescription}

${answersBlock}USER'S GEAR CATALOG — use these exact IDs for gear_item_id when you find a match:
${JSON.stringify(catalogSummary, null, 2)}

PAST EVENTS (learn patterns):
${pastSummary.length > 0 ? JSON.stringify(pastSummary, null, 2) : 'No history yet'}

RULES:
1. Group recommended_items by section in this order:
   Essentials → Camera Bodies → Lenses → Lighting → Audio → Support → Power → Media → Cables → Misc

2. For recommended_items:
   - CRITICAL: DO NOT include any item unless you can find an exact or very close match in the USER'S GEAR CATALOG above
   - ONLY include items where you can confidently set a gear_item_id from the catalog
   - If you're unsure whether the user owns an item, put it in missing_items instead
   - Set gear_item_id to the exact catalog ID when you find a match, otherwise DO NOT include it in recommended_items
   - ALWAYS include BOTH "name" (the item name from catalog) AND "reason" (why it's needed for this event)
   - Always include accessories: batteries (2-3×), memory cards (2× expected capacity), chargers, cables

3. For missing_items (gear NOT in the catalog):
   - Include ANY gear you think is needed but cannot find in the catalog
   - Include gear from different brands (e.g., if user has Sony cameras but you think they need a Canon R5, put it here)
   - ALWAYS include BOTH "name" (item name) AND "reason" (why specifically needed for THIS event)
   - Set action: "buy" for accessories under €50, "rent" for expensive specialty gear, "borrow" otherwise
   - Include estimated_cost when relevant (e.g. "€30/day rental", "~€40 to buy")

4. Priority:
   - "Must-have": shoot cannot succeed without it
   - "Nice-to-have": significantly improves quality
   - "Optional": useful but not critical

5. Event-specific rules:
   - Weddings / corporate → always recommend backup camera body if available
   - Interviews → lavalier mic is Must-have if not in catalog
   - Night / low-light → extra batteries +50%, fast lenses prioritised
   - Travel → note compact alternatives and check battery airline rules

6. Learn from past events: if similar event types had items packed, prioritise them.

CRITICAL: Every item in recommended_items MUST have ALL these fields:
- section (string)
- gear_item_id (string or null)
- name (string) - REQUIRED even if gear_item_id is provided
- reason (string) - REQUIRED, explain why needed for this specific event
- priority (string: "Must-have" / "Nice-to-have" / "Optional")
- quantity (number, default 1)

Every item in missing_items MUST have ALL these fields:
- name (string) - REQUIRED
- category (string, optional)
- reason (string) - REQUIRED, explain why needed for this specific event
- priority (string: "Must-have" / "Nice-to-have" / "Optional")
- action (string: "buy" / "borrow" / "rent")
- estimated_cost (string, optional)

Return ONLY valid JSON matching this exact structure. No markdown, no code blocks, no explanation outside the JSON.`;

  return [{ role: 'user', content: prompt }];
}
