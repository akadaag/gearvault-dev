import { z } from 'zod';

// ---------------------------------------------------------------------------
// Follow-up questions schema
// ---------------------------------------------------------------------------

export const followUpQuestionsSchema = z.object({
  questions: z.array(
    z.object({
      id: z.string(),
      question: z.string(),
      type: z.enum(['text', 'select']),
      options: z.array(z.string()).optional(),
    }),
  ),
});

export type FollowUpQuestion = z.infer<typeof followUpQuestionsSchema>['questions'][number];

// ---------------------------------------------------------------------------
// Packing plan schema (Zod — used for runtime validation)
// ---------------------------------------------------------------------------

const priorityEnum = z.enum(['Must-have', 'Nice-to-have', 'Optional']);
const actionEnum = z.enum(['buy', 'borrow', 'rent']);

export const packingPlanSchema = z.object({
  event_title: z.string(),
  event_type: z.string(),

  recommended_items: z.array(
    z.object({
      section: z.string(),
      gear_item_id: z.string().nullable(),
      name: z.string(),
      reason: z.string(),
      priority: priorityEnum,
      quantity: z.number().min(1).default(1),
    }),
  ),

  missing_items: z.array(
    z.object({
      name: z.string(),
      category: z.string().optional().default('Misc'),
      reason: z.string(),
      priority: priorityEnum,
      action: actionEnum,
      estimated_cost: z.string().optional(),
    }),
  ),

  tips: z.array(z.string()).optional().default([]),
});

export type PackingPlan = z.infer<typeof packingPlanSchema>;
export type RecommendedItem = PackingPlan['recommended_items'][number];
export type MissingItem = PackingPlan['missing_items'][number];

// ---------------------------------------------------------------------------
// JSON Schema sent to Groq as response_format (structural enforcement)
// ---------------------------------------------------------------------------

export const packingPlanJsonSchema = {
  type: 'object',
  properties: {
    event_title: { type: 'string' },
    event_type: { type: 'string' },
    recommended_items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          section: {
            type: 'string',
            enum: [
              'Essentials',
              'Camera Bodies',
              'Lenses',
              'Lighting',
              'Audio',
              'Support',
              'Power',
              'Media',
              'Cables',
              'Misc',
            ],
          },
          gear_item_id: { type: ['string', 'null'] },
          name: { type: 'string' },
          reason: { type: 'string' },
          priority: { type: 'string', enum: ['Must-have', 'Nice-to-have', 'Optional'] },
          quantity: { type: 'number', minimum: 1 },
        },
        required: ['section', 'gear_item_id', 'name', 'reason', 'priority'],
      },
    },
    missing_items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          category: { type: 'string' },
          reason: { type: 'string' },
          priority: { type: 'string', enum: ['Must-have', 'Nice-to-have', 'Optional'] },
          action: { type: 'string', enum: ['buy', 'borrow', 'rent'] },
          estimated_cost: { type: 'string' },
        },
        required: ['name', 'reason', 'priority', 'action'],
      },
    },
    tips: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['event_title', 'event_type', 'recommended_items', 'missing_items'],
};
