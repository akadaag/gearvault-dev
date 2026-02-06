import type { Category } from '../types/models';

const names = [
  'Camera bodies',
  'Lenses',
  'Tripods / supports',
  'Lighting (strobes, LEDs)',
  'Modifiers (softbox, umbrellas)',
  'Audio (microphones, recorders)',
  'Monitoring (monitors, viewfinders)',
  'Power (batteries, chargers, power banks)',
  'Media (SD cards, CFexpress, SSDs)',
  'Bags & cases',
  'Cables & adapters',
  'Drones',
  'Gimbals / stabilizers',
  'Filters',
  'Cleaning / maintenance',
  'Computer / ingest accessories',
];

export const defaultCategories: Category[] = names.map((name, idx) => ({
  id: `default-${idx + 1}`,
  name,
  isDefault: true,
  sortOrder: idx,
  collapsed: false,
}));
