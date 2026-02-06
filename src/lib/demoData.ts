import { db } from '../db';
import { makeId } from './ids';
import type { Category, EventItem, GearItem } from '../types/models';

export async function seedDemoData(categories: Category[]) {
  const existing = await db.gearItems.count();
  if (existing > 0) return;

  const now = new Date().toISOString();
  const findCategory = (namePart: string) =>
    categories.find((c) => c.name.toLowerCase().includes(namePart.toLowerCase()))?.id ?? categories[0]?.id;

  const gear: GearItem[] = [
    {
      id: makeId(),
      name: 'Sony A7 IV',
      categoryId: findCategory('camera') ?? 'default-1',
      brand: 'Sony',
      model: 'A7 IV',
      condition: 'good',
      quantity: 1,
      tags: ['wedding', 'low light'],
      essential: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: makeId(),
      name: '24-70mm f/2.8',
      categoryId: findCategory('lenses') ?? 'default-2',
      brand: 'Sigma',
      condition: 'good',
      quantity: 1,
      tags: ['portrait', 'wedding'],
      essential: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: makeId(),
      name: 'NP-FZ100 Battery',
      categoryId: findCategory('power') ?? 'default-8',
      condition: 'good',
      quantity: 4,
      tags: ['spare'],
      essential: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: makeId(),
      name: 'CFexpress Card 256GB',
      categoryId: findCategory('media') ?? 'default-9',
      condition: 'new',
      quantity: 2,
      tags: ['recording'],
      essential: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: makeId(),
      name: 'Shotgun Mic',
      categoryId: findCategory('audio') ?? 'default-6',
      condition: 'good',
      quantity: 1,
      tags: ['interview'],
      essential: false,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const event: EventItem = {
    id: makeId(),
    title: 'Corporate Interview Demo',
    type: 'corporate interview',
    dateTime: new Date(Date.now() + 86_400_000).toISOString(),
    location: 'Milan',
    client: 'Acme Group',
    notes: 'Two speakers, indoor office',
    createdBy: 'manual',
    createdAt: now,
    updatedAt: now,
    packingChecklist: gear.slice(0, 4).map((g) => ({
      id: makeId(),
      eventId: 'temp',
      gearItemId: g.id,
      name: g.name,
      quantity: g.quantity > 1 ? 2 : 1,
      packed: false,
      priority: g.essential ? 'must-have' : 'nice-to-have',
    })),
    missingItems: [
      {
        id: makeId(),
        eventId: 'temp',
        name: 'Lavalier microphone',
        reason: 'Cleaner voice capture for two seated speakers.',
        priority: 'must-have',
        action: 'rent',
        resolvedStatus: 'unresolved',
      },
    ],
  };

  event.packingChecklist = event.packingChecklist.map((i) => ({ ...i, eventId: event.id }));
  event.missingItems = event.missingItems.map((i) => ({ ...i, eventId: event.id }));

  await db.transaction('rw', db.gearItems, db.events, async () => {
    await db.gearItems.bulkAdd(gear);
    await db.events.add(event);
  });
}
