// Canonical section order for the packing list display
export const PACKING_SECTIONS = [
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
] as const;

export type PackingSection = (typeof PACKING_SECTIONS)[number];

export interface ChecklistItemWithSection {
  name: string;
  gearItemId: string | null;
  quantity: number;
  notes?: string;
  priority: 'must-have' | 'nice-to-have' | 'optional';
  section: string;
}

/**
 * Groups checklist items by their section, preserving the canonical order
 * defined in PACKING_SECTIONS. Items with unknown sections fall into "Misc".
 */
export function groupBySection(
  items: ChecklistItemWithSection[],
): Record<string, ChecklistItemWithSection[]> {
  const grouped: Record<string, ChecklistItemWithSection[]> = {};

  for (const item of items) {
    const section = PACKING_SECTIONS.includes(item.section as PackingSection)
      ? item.section
      : 'Misc';

    if (!grouped[section]) grouped[section] = [];
    grouped[section].push(item);
  }

  // Sort each section by priority
  for (const section of Object.keys(grouped)) {
    grouped[section].sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
  }

  // Return in canonical section order (only sections that have items)
  const ordered: Record<string, ChecklistItemWithSection[]> = {};
  for (const section of PACKING_SECTIONS) {
    if (grouped[section]?.length) {
      ordered[section] = grouped[section];
    }
  }

  return ordered;
}

export function priorityRank(p: string): number {
  if (p === 'must-have') return 0;
  if (p === 'nice-to-have') return 1;
  return 2;
}

export function priorityLabel(p: string): string {
  if (p === 'must-have') return 'Must-have';
  if (p === 'nice-to-have') return 'Nice-to-have';
  return 'Optional';
}
