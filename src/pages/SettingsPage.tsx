import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, ensureBaseData } from '../db';
import { defaultCategories } from '../constants/defaultCategories';
import { seedDemoData } from '../lib/demoData';
import type { AppSettings, ExportBundle } from '../types/models';

export function SettingsPage() {
  const settings = useLiveQuery(() => db.settings.get('app-settings'), []);
  const categories = useLiveQuery(() => db.categories.toArray(), [], defaultCategories);
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState('');

  if (!settings) return <div className="card">Loading settings…</div>;

  async function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    await db.settings.update('app-settings', { [key]: value });
  }

  async function toggleDemoData(enabled: boolean) {
    await update('demoDataEnabled', enabled);
    if (enabled) {
      await seedDemoData(categories);
      setStatus('Demo data enabled.');
    } else {
      setStatus('Demo data preference disabled (existing data retained).');
    }
  }

  async function exportDb() {
    const bundle: ExportBundle = {
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

    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gearvault-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus('Database exported.');
  }

  async function importDb(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    const payload = JSON.parse(text) as ExportBundle;

    await db.transaction('rw', db.gearItems, db.categories, db.events, db.settings, async () => {
      await db.gearItems.clear();
      await db.categories.clear();
      await db.events.clear();
      await db.settings.clear();

      await db.gearItems.bulkPut(payload.data.gearItems ?? []);
      await db.categories.bulkPut(payload.data.categories ?? []);
      await db.events.bulkPut(payload.data.events ?? []);
      await db.settings.bulkPut(payload.data.settings ?? []);
    });

    await db.aiFeedback.clear();
    await db.aiFeedback.bulkPut(payload.data.aiFeedback ?? []);

    await ensureBaseData();
    setStatus('Database imported successfully.');
  }

  return (
    <section className="stack-lg">
      <div className="card stack-md">
        <h2>Settings</h2>

        <label className="row between">
          <span>Theme</span>
          <select value={settings.theme} onChange={(e) => void update('theme', e.target.value as typeof settings.theme)}>
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>

        <label className="row between">
          <span>Default currency</span>
          <input value={settings.defaultCurrency} onChange={(e) => void update('defaultCurrency', e.target.value.toUpperCase())} />
        </label>

        <label className="checkbox-inline">
          <input type="checkbox" checked={settings.syncEnabled} onChange={(e) => void update('syncEnabled', e.target.checked)} />
          Optional sync placeholder
        </label>
        <p className="subtle">Toggle is local and ready for a future Supabase/Firebase/WebDAV adapter.</p>

        <hr />

        <h3>AI Provider</h3>
        <label className="row between">
          <span>Provider</span>
          <select value={settings.aiProvider} onChange={(e) => void update('aiProvider', e.target.value as typeof settings.aiProvider)}>
            <option value="mock">Mock (offline)</option>
            <option value="openai">OpenAI</option>
          </select>
        </label>
        <label>
          API key (stored locally)
          <input
            type="password"
            value={settings.apiKey ?? ''}
            onChange={(e) => void update('apiKey', e.target.value)}
            placeholder="sk-..."
          />
        </label>
        <label className="checkbox-inline">
          <input type="checkbox" checked={settings.aiLearningEnabled} onChange={(e) => void update('aiLearningEnabled', e.target.checked)} />
          Enable local AI learning
        </label>

        <hr />

        <h3>Data</h3>
        <label className="checkbox-inline">
          <input type="checkbox" checked={settings.demoDataEnabled} onChange={(e) => void toggleDemoData(e.target.checked)} />
          Enable demo/sample data
        </label>
        <div className="row wrap">
          <button onClick={() => void seedDemoData(categories)}>Load demo now</button>
          <button onClick={() => void exportDb()}>Export full DB JSON</button>
          <button onClick={() => fileRef.current?.click()}>Import DB JSON</button>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => void importDb(e.target.files?.[0])} />
        </div>
        <p className="subtle">MVP works fully offline and requires no account/login.</p>
        {status && <p className="success">{status}</p>}
      </div>
    </section>
  );
}
