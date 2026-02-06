import { z } from 'zod';

export const gearItemSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  categoryId: z.string().min(1, 'Category is required'),
  quantity: z.number().min(1),
  condition: z.enum(['new', 'good', 'worn']),
});

export const eventSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  type: z.string().min(1, 'Type is required'),
});
