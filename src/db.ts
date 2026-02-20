import Dexie, { type EntityTable } from 'dexie';
import { defaultCategories } from './constants/defaultCategories';
import type { AIFeedback, AppSettings, Category, ChatSession, EventItem, ExportBundle, GearItem } from './types/models';

class GearVaultDB extends Dexie {
  gearItems!: EntityTable<GearItem, 'id'>;
  categories!: EntityTable<Category, 'id'>;
  events!: EntityTable<EventItem, 'id'>;
  settings!: EntityTable<AppSettings, 'id'>;
  aiFeedback!: EntityTable<AIFeedback, 'id'>;
  chatSessions!: EntityTable<ChatSession, 'id'>;

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
    this.version(2)
      .stores({
        gearItems: 'id, name, categoryId, essential, condition, updatedAt, *tags',
        categories: 'id, sortOrder, name',
        events: 'id, title, type, dateTime, client, updatedAt, createdBy',
        settings: 'id',
        aiFeedback: 'id, eventType, useful, createdAt',
      })
      .upgrade(async tx => {
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

    // v3: add eventFit and strengths fields to gearItems
    this.version(3).stores({
      gearItems: 'id, name, categoryId, essential, condition, updatedAt, *tags',
      categories: 'id, sortOrder, name',
      events: 'id, title, type, dateTime, client, updatedAt, createdBy',
      settings: 'id',
      aiFeedback: 'id, eventType, useful, createdAt',
    });

    // v4: add chatSessions table for AI Q&A feature
    this.version(4).stores({
      gearItems: 'id, name, categoryId, essential, condition, updatedAt, *tags',
      categories: 'id, sortOrder, name',
      events: 'id, title, type, dateTime, client, updatedAt, createdBy',
      settings: 'id',
      aiFeedback: 'id, eventType, useful, createdAt',
      chatSessions: 'id, updatedAt',
    });
  }
}

export const db = new GearVaultDB();

// ── Local change tracking ────────────────────────────────────────────────────
// Stored in localStorage (survives IndexedDB clears) so the sync layer can
// determine whether local data has been modified since the last cloud push.
// We use localStorage instead of IndexedDB because it persists even after
// db.gearItems.clear() / db.events.clear() calls.

const LOCAL_CHANGE_KEY = 'gearvault_last_local_change';

// Set to true during importBundle() so that the bulk-write from a cloud pull
// does not itself mark local data as "changed" (which would cause an infinite
// push-pull loop).
export let suppressChangeTracking = false;

export function markLocalDataChanged() {
  if (!suppressChangeTracking) {
    localStorage.setItem(LOCAL_CHANGE_KEY, new Date().toISOString());
  }
}

export function getLastLocalChange(): string | null {
  return localStorage.getItem(LOCAL_CHANGE_KEY);
}

export function clearLocalChangeMarker() {
  localStorage.removeItem(LOCAL_CHANGE_KEY);
}

// Automatically mark local changes on every gearItems / events mutation.
// Note: Dexie hooks do NOT fire for .clear(), so call-sites that use .clear()
// must invoke markLocalDataChanged() manually.
db.gearItems.hook('creating', function () { markLocalDataChanged(); });
db.gearItems.hook('updating', function () { markLocalDataChanged(); });
db.gearItems.hook('deleting', function () { markLocalDataChanged(); });
db.events.hook('creating', function () { markLocalDataChanged(); });
db.events.hook('updating', function () { markLocalDataChanged(); });
db.events.hook('deleting', function () { markLocalDataChanged(); });

export const defaultSettings: AppSettings = {
  id: 'app-settings',
  demoDataEnabled: false,
  defaultCurrency: 'EUR',
  syncEnabled: false,
  theme: 'system',
  aiLearningEnabled: true,
};

// Canonical map of default category IDs to their clean names.
// Used both by the v2 Dexie upgrade and the ensureBaseData() fallback patch.
export const defaultCategoryRenames: Record<string, string> = {
  'default-4': 'Lighting',
  'default-5': 'Modifiers',
  'default-6': 'Audio',
  'default-7': 'Monitoring',
  'default-8': 'Power',
  'default-9': 'Media',
};

export async function ensureBaseData() {
  const count = await db.categories.count();
  if (!count) {
    await db.categories.bulkAdd(defaultCategories);
  } else {
    // Fallback patch: fix any default category that still has the old
    // parenthetical name (e.g. if the Dexie v2 upgrade was skipped due
    // to a stale service worker serving an old JS bundle).
    const stale = await db.categories
      .where('id')
      .anyOf(Object.keys(defaultCategoryRenames))
      .toArray();
    for (const cat of stale) {
      const cleanName = defaultCategoryRenames[cat.id];
      if (cleanName && cat.name !== cleanName) {
        await db.categories.update(cat.id, { name: cleanName });
      }
    }
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
  // Suppress change tracking during import so that writing cloud data locally
  // does not mark local data as "changed" (which would trigger an immediate
  // re-push and cause a push-pull loop).
  suppressChangeTracking = true;
  try {
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
  } finally {
    suppressChangeTracking = false;
  }

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

  // .clear() does not trigger Dexie hooks, so mark the change manually.
  markLocalDataChanged();
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
