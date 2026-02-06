import Dexie, { type EntityTable } from 'dexie';
import { defaultCategories } from './constants/defaultCategories';
import type { AIFeedback, AppSettings, Category, EventItem, GearItem } from './types/models';

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
