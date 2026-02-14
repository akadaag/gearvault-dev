import { db } from '../db';
import { makeId } from './ids';
import type { Category, EventItem, GearItem } from '../types/models';

export async function seedDemoData(categories: Category[]) {
  const now = new Date().toISOString();
  const findCategory = (namePart: string) =>
    categories.find((c) => c.name.toLowerCase().includes(namePart.toLowerCase()))?.id ?? categories[0]?.id;

  const gear: GearItem[] = [
    // Camera Bodies
    {
      id: makeId(),
      name: 'Sony A7 IV',
      categoryId: findCategory('camera') ?? 'default-1',
      brand: 'Sony',
      model: 'A7 IV',
      condition: 'good',
      quantity: 1,
      tags: ['hybrid', 'wedding', 'low-light'],
      essential: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: makeId(),
      name: 'Sony A7S III',
      categoryId: findCategory('camera') ?? 'default-1',
      brand: 'Sony',
      model: 'A7S III',
      condition: 'good',
      quantity: 1,
      tags: ['video', 'low-light', 'backup'],
      essential: false,
      createdAt: now,
      updatedAt: now,
    },

    // Lenses
    {
      id: makeId(),
      name: '24-70mm f/2.8 GM II',
      categoryId: findCategory('lenses') ?? 'default-2',
      brand: 'Sony',
      model: 'FE 24-70mm f/2.8 GM II',
      condition: 'good',
      quantity: 1,
      tags: ['portrait', 'wedding', 'versatile'],
      essential: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: makeId(),
      name: '70-200mm f/2.8',
      categoryId: findCategory('lenses') ?? 'default-2',
      brand: 'Sigma',
      model: '70-200mm f/2.8 DG DN',
      condition: 'good',
      quantity: 1,
      tags: ['telephoto', 'events', 'portraits'],
      essential: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: makeId(),
      name: '35mm f/1.4',
      categoryId: findCategory('lenses') ?? 'default-2',
      brand: 'Sigma',
      model: '35mm f/1.4 DG DN',
      condition: 'good',
      quantity: 1,
      tags: ['prime', 'low-light', 'documentary'],
      essential: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: makeId(),
      name: '85mm f/1.8',
      categoryId: findCategory('lenses') ?? 'default-2',
      brand: 'Sony',
      model: 'FE 85mm f/1.8',
      condition: 'good',
      quantity: 1,
      tags: ['portrait', 'shallow-dof'],
      essential: false,
      createdAt: now,
      updatedAt: now,
    },

    // Audio
    {
      id: makeId(),
      name: 'Rode VideoMic Pro+',
      categoryId: findCategory('audio') ?? 'default-6',
      brand: 'Rode',
      model: 'VideoMic Pro+',
      condition: 'good',
      quantity: 1,
      tags: ['on-camera', 'interview', 'video'],
      essential: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: makeId(),
      name: 'Wireless Go II',
      categoryId: findCategory('audio') ?? 'default-6',
      brand: 'Rode',
      model: 'Wireless Go II',
      condition: 'good',
      quantity: 1,
      tags: ['wireless', 'interview', 'lav'],
      essential: false,
      createdAt: now,
      updatedAt: now,
    },

    // Lighting
    {
      id: makeId(),
      name: 'Godox V1',
      categoryId: findCategory('lighting') ?? 'default-4',
      brand: 'Godox',
      model: 'V1 Flash',
      condition: 'good',
      quantity: 1,
      tags: ['flash', 'wedding', 'events'],
      essential: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: makeId(),
      name: 'Aputure MC',
      categoryId: findCategory('lighting') ?? 'default-4',
      brand: 'Aputure',
      model: 'MC RGB',
      condition: 'good',
      quantity: 2,
      tags: ['led', 'compact', 'rgb'],
      essential: false,
      createdAt: now,
      updatedAt: now,
    },

    // Support
    {
      id: makeId(),
      name: 'Manfrotto Tripod',
      categoryId: findCategory('tripods') ?? 'default-3',
      brand: 'Manfrotto',
      model: 'MT055XPRO3',
      condition: 'good',
      quantity: 1,
      tags: ['stable', 'video', 'heavy'],
      essential: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: makeId(),
      name: 'Peak Design Camera Strap',
      categoryId: findCategory('accessories') ?? 'default-10',
      brand: 'Peak Design',
      model: 'Slide',
      condition: 'good',
      quantity: 2,
      tags: ['strap', 'essential'],
      essential: true,
      createdAt: now,
      updatedAt: now,
    },

    // Power
    {
      id: makeId(),
      name: 'NP-FZ100 Battery',
      categoryId: findCategory('power') ?? 'default-8',
      brand: 'Sony',
      model: 'NP-FZ100',
      condition: 'good',
      quantity: 6,
      tags: ['spare', 'essential'],
      essential: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: makeId(),
      name: 'Dual Battery Charger',
      categoryId: findCategory('power') ?? 'default-8',
      brand: 'Sony',
      model: 'BC-QZ1',
      condition: 'good',
      quantity: 1,
      tags: ['charger', 'essential'],
      essential: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: makeId(),
      name: 'USB-C Power Bank 20000mAh',
      categoryId: findCategory('power') ?? 'default-8',
      brand: 'Anker',
      model: '737',
      condition: 'good',
      quantity: 1,
      tags: ['backup', 'usb-c'],
      essential: false,
      createdAt: now,
      updatedAt: now,
    },

    // Media Storage
    {
      id: makeId(),
      name: 'CFexpress Type A 160GB',
      categoryId: findCategory('media') ?? 'default-9',
      brand: 'Sony',
      model: 'CEA-G160T',
      condition: 'new',
      quantity: 3,
      tags: ['fast', 'recording'],
      essential: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: makeId(),
      name: 'SD Card 128GB UHS-II',
      categoryId: findCategory('media') ?? 'default-9',
      brand: 'SanDisk',
      model: 'Extreme Pro',
      condition: 'good',
      quantity: 4,
      tags: ['backup', 'photo'],
      essential: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: makeId(),
      name: 'Portable SSD 1TB',
      categoryId: findCategory('media') ?? 'default-9',
      brand: 'SanDisk',
      model: 'Extreme Pro',
      condition: 'good',
      quantity: 1,
      tags: ['backup', 'transfer'],
      essential: false,
      createdAt: now,
      updatedAt: now,
    },

    // Accessories
    {
      id: makeId(),
      name: 'Lens Cleaning Kit',
      categoryId: findCategory('accessories') ?? 'default-10',
      brand: 'Generic',
      condition: 'good',
      quantity: 1,
      tags: ['maintenance', 'essential'],
      essential: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: makeId(),
      name: 'Camera Backpack',
      categoryId: findCategory('bags') ?? 'default-10',
      brand: 'Peak Design',
      model: 'Everyday Backpack 30L',
      condition: 'good',
      quantity: 1,
      tags: ['travel', 'protection'],
      essential: true,
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

export async function removeDemoData() {
  // Remove all gear items and events created by demo data
  // This is a simple implementation that clears ALL data
  // In a production app, you'd want to tag demo items and only remove those
  await db.transaction('rw', db.gearItems, db.events, async () => {
    await db.gearItems.clear();
    await db.events.clear();
  });
}
