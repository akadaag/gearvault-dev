import { z } from 'zod';

// ---------------------------------------------------------------------------
// Case-insensitive normalizers (models return inconsistent casing)
// ---------------------------------------------------------------------------

function normalizePriority(val: unknown): string {
  if (typeof val !== 'string') return 'Optional';
  const lower = val.toLowerCase().trim();
  // Must-have synonyms
  if (['must-have', 'essential', 'critical', 'required', 'high', 'important'].includes(lower)) return 'Must-have';
  // Nice-to-have synonyms
  if (['nice-to-have', 'recommended', 'suggested', 'medium', 'moderate'].includes(lower)) return 'Nice-to-have';
  // Optional synonyms
  if (['optional', 'low', 'extra', 'bonus'].includes(lower)) return 'Optional';
  // Catch-all: any unrecognized value defaults to Optional
  return 'Optional';
}

function normalizeRole(val: unknown): string {
  if (typeof val !== 'string') return 'standard';
  const lower = val.toLowerCase().trim();
  if (['primary', 'main', 'essential', 'key'].includes(lower)) return 'primary';
  if (['backup', 'secondary', 'spare', 'redundant'].includes(lower)) return 'backup';
  if (['alternative', 'alternate', 'alt'].includes(lower)) return 'alternative';
  if (['standard', 'normal', 'default', 'regular', 'support'].includes(lower)) return 'standard';
  return 'standard'; // catch-all for any unrecognized value
}

function normalizeAction(val: unknown): string {
  if (typeof val !== 'string') return 'buy';
  const lower = val.toLowerCase().trim();
  if (['buy', 'purchase'].includes(lower)) return 'buy';
  if (['borrow', 'loan'].includes(lower)) return 'borrow';
  if (['rent', 'hire', 'lease'].includes(lower)) return 'rent';
  return 'buy'; // catch-all for any unrecognized value
}

// ---------------------------------------------------------------------------
// Packing plan schema (Zod — used for runtime validation)
// ---------------------------------------------------------------------------

const priorityEnum = z.preprocess(normalizePriority, z.enum(['Must-have', 'Nice-to-have', 'Optional']));
const actionEnum = z.preprocess(normalizeAction, z.enum(['buy', 'borrow', 'rent']));
const roleEnum = z.preprocess(normalizeRole, z.enum(['primary', 'backup', 'alternative', 'standard']));

export const packingPlanSchema = z.object({
  event_title: z.string().default('Untitled Event'),
  event_type: z.string().default('general'),

  recommended_items: z.array(
    z.object({
      section: z.string(),
      gear_item_id: z.string().nullable(),
      name: z.string(),
      reason: z.string(),
      priority: priorityEnum,
      quantity: z.number().min(1).default(1),
      role: roleEnum.optional().default('standard'),
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
// Gear Recognition schema (AI photo identification)
// ---------------------------------------------------------------------------

function normalizeConfidence(val: unknown): string {
  if (typeof val !== 'string') return 'low';
  const lower = val.toLowerCase().trim();
  if (['high', 'certain', 'definite', 'confident'].includes(lower)) return 'high';
  if (['medium', 'moderate', 'likely', 'probable'].includes(lower)) return 'medium';
  if (['low', 'uncertain', 'unsure', 'guess'].includes(lower)) return 'low';
  if (['none', 'unknown', 'unrecognized', 'not_gear', 'not gear'].includes(lower)) return 'none';
  return 'low';
}

export const gearRecognitionSchema = z.object({
  item_name: z.string().default('Unknown Item'),
  brand: z.string().optional().default(''),
  model: z.string().optional().default(''),
  category: z.string().default(''),
  confidence: z.preprocess(normalizeConfidence, z.enum(['high', 'medium', 'low', 'none'])),
  tags: z.array(z.string()).optional().default([]),
  notes: z.string().optional().default(''),
});

export type GearRecognition = z.infer<typeof gearRecognitionSchema>;

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
          role: { type: 'string', enum: ['primary', 'backup', 'alternative', 'standard'] },
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
