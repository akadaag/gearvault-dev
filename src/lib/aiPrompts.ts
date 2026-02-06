import { z } from 'zod';

export const systemPrompt = `You are GearVault AI Pack Assistant.\nUse ONLY provided catalog JSON, event input, and optional historical patterns.\nReturn strict JSON following schema. Prioritize essential items, include accessories/redundancy, and identify missing items with reason/priority/action.`;

export const followUpPromptTemplate = `Given the event description below and current known context, ask 1-3 concise follow-up questions if needed.\nEvent: {{eventDescription}}\nKnown context: {{knownContextJson}}\nOutput JSON: {"questions": string[] }`;

export const userPromptTemplate = `Generate a packing plan.\nEvent input: {{eventInputJson}}\nCatalog JSON: {{catalogJson}}\nPrior patterns JSON: {{patternsJson}}\nReturn JSON only matching schema.`;

export const aiOutputSchema = z.object({
  eventTitle: z.string(),
  eventType: z.string(),
  checklist: z.array(
    z.object({
      name: z.string(),
      gearItemId: z.string().nullable(),
      quantity: z.number(),
      notes: z.string().optional(),
      priority: z.enum(['must-have', 'nice-to-have', 'optional']),
    }),
  ),
  missingItems: z.array(
    z.object({
      name: z.string(),
      reason: z.string(),
      priority: z.enum(['must-have', 'nice-to-have', 'optional']),
      action: z.enum(['buy', 'borrow', 'rent']),
      notes: z.string().optional(),
    }),
  ),
});

export const aiOutputJsonSchema = {
  type: 'object',
  properties: {
    eventTitle: { type: 'string' },
    eventType: { type: 'string' },
    checklist: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          gearItemId: { type: ['string', 'null'] },
          quantity: { type: 'number' },
          notes: { type: 'string' },
          priority: { enum: ['must-have', 'nice-to-have', 'optional'] },
        },
        required: ['name', 'gearItemId', 'quantity', 'priority'],
      },
    },
    missingItems: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          reason: { type: 'string' },
          priority: { enum: ['must-have', 'nice-to-have', 'optional'] },
          action: { enum: ['buy', 'borrow', 'rent'] },
          notes: { type: 'string' },
        },
        required: ['name', 'reason', 'priority', 'action'],
      },
    },
  },
  required: ['eventTitle', 'eventType', 'checklist', 'missingItems'],
};

export const exampleCatalogJson = {
  gearItems: [
    { id: 'cam1', name: 'Sony A7 IV', category: 'Camera bodies', essential: true, quantity: 1, tags: ['wedding', 'low light'] },
    { id: 'lens1', name: '24-70mm f/2.8', category: 'Lenses', essential: true, quantity: 1, tags: ['wedding'] },
    { id: 'aud1', name: 'Shotgun Mic', category: 'Audio', essential: false, quantity: 1, tags: ['interview'] },
  ],
};

export const exampleOutputJson = {
  eventTitle: 'Wedding in Dark Church',
  eventType: 'wedding',
  checklist: [
    { name: 'Sony A7 IV', gearItemId: 'cam1', quantity: 1, priority: 'must-have', notes: 'Primary body' },
    { name: '24-70mm f/2.8', gearItemId: 'lens1', quantity: 1, priority: 'must-have', notes: 'Versatile focal range' },
    { name: 'Extra batteries', gearItemId: null, quantity: 4, priority: 'must-have', notes: 'Low light + long day' },
  ],
  missingItems: [
    { name: 'On-camera flash', reason: 'Dark church lighting needs fill options', priority: 'nice-to-have', action: 'rent' },
  ],
};
