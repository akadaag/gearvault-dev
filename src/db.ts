import Dexie, { type EntityTable } from 'dexie';
import { defaultCategories } from './constants/defaultCategories';
import type { AIFeedback, AppSettings, Category, EventItem, ExportBundle, GearItem } from './types/models';

class GearVaultDB extends Dexie {
  gearItems!: EntityTable<GearItem, 'id'>;
  categories!: EntityTable<Category, 'id'>;
  events!: EntityTable<EventItem, 'id'>;
  settings!: EntityTable<AppSettings, 'id'>;
  aiFeedback!: EntityTable<AIFeedback, 'id'>;

  constructor() {
    super('gearvault-db');
    this.version(1).stores({
      gearItems: 'id, name, categoryId, essential, condition, updatedAt, *tags',
      categories: 'id, sortOrder, name',
      events: 'id, title, type, dateTime, client, updatedAt, createdBy',
      settings: 'id',
      aiFeedback: 'id, eventType, useful, createdAt',
    });

    // v2: strip parenthetical hints from default category names
    this.version(2).upgrade(async tx => {
      const renames: Record<string, string> = {
        'default-4': 'Lighting',
        'default-5': 'Modifiers',
        'default-6': 'Audio',
        'default-7': 'Monitoring',
        'default-8': 'Power',
        'default-9': 'Media',
      };
      for (const [id, name] of Object.entries(renames)) {
        await tx.table('categories').update(id, { name });
      }
    });
  }
}

export const db = new GearVaultDB();

export const defaultSettings: AppSettings = {
  id: 'app-settings',
  demoDataEnabled: false,
  defaultCurrency: 'EUR',
  aiProvider: 'mock',
  apiKey: '',
  syncEnabled: false,
  theme: 'system',
  aiLearningEnabled: true,
};

export async function ensureBaseData() {
  const count = await db.categories.count();
  if (!count) {
    await db.categories.bulkAdd(defaultCategories);
  }

  const settings = await db.settings.get('app-settings');
  if (!settings) {
    await db.settings.put(defaultSettings);
  }
}

export async function exportBundle(): Promise<ExportBundle> {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      gearItems: await db.gearItems.toArray(),
      categories: await db.categories.toArray(),
      events: await db.events.toArray(),
      settings: await db.settings.toArray(),
      aiFeedback: await db.aiFeedback.toArray(),
    },
  };
}

export async function importBundle(bundle: ExportBundle) {
  await db.transaction('rw', db.gearItems, db.categories, db.events, db.settings, async () => {
    await db.gearItems.clear();
    await db.categories.clear();
    await db.events.clear();
    await db.settings.clear();

    await db.gearItems.bulkPut(bundle.data.gearItems ?? []);
    await db.categories.bulkPut(bundle.data.categories ?? []);
    await db.events.bulkPut(bundle.data.events ?? []);
    await db.settings.bulkPut(bundle.data.settings ?? []);
  });

  await db.transaction('rw', db.aiFeedback, async () => {
    await db.aiFeedback.clear();
    await db.aiFeedback.bulkPut(bundle.data.aiFeedback ?? []);
  });

  await ensureBaseData();
}

export async function clearAllData() {
  await db.transaction('rw', db.gearItems, db.categories, db.events, db.settings, async () => {
    await db.gearItems.clear();
    await db.categories.clear();
    await db.events.clear();
    await db.settings.clear();
  });

  await db.transaction('rw', db.aiFeedback, async () => {
    await db.aiFeedback.clear();
  });
}

export async function getLocalDataStats() {
  const [gearItems, events, aiFeedback] = await Promise.all([
    db.gearItems.count(),
    db.events.count(),
    db.aiFeedback.count(),
  ]);

  return {
    gearItems,
    events,
    aiFeedback,
    hasUserData: gearItems > 0 || events > 0 || aiFeedback > 0,
  };
}
