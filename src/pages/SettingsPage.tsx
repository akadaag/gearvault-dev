import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, ensureBaseData } from '../db';
import { defaultCategories } from '../constants/defaultCategories';
import { useAuth } from '../hooks/useAuth';
import { seedDemoData, removeDemoData } from '../lib/demoData';
import { syncNow } from '../services/sync';
import { classificationQueue } from '../lib/gearClassifier';
import type { AppSettings, ExportBundle } from '../types/models';

export function SettingsPage() {
  const { user, signOut, syncMessage } = useAuth();
  const settings = useLiveQuery(() => db.settings.get('app-settings'), []);
  const categories = useLiveQuery(() => db.categories.toArray(), [], defaultCategories);
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

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

  async function loadDemoDataNow() {
    await seedDemoData(categories);
    setStatus('Demo data loaded successfully!');
  }

  async function clearDemoData() {
    if (!confirm('This will delete ALL gear items and events. Continue?')) return;
    await removeDemoData();
    setStatus('All data cleared.');
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
    
    // Classify any unclassified items
    const unclassified = await db.gearItems
      .filter(item => !item.classificationStatus || item.classificationStatus !== 'done')
      .toArray();
    
    for (const item of unclassified) {
      classificationQueue.enqueue(item);
    }
    
    setStatus('Database imported successfully.');
  }

  async function clearCacheAndReload() {
    try {
      // Unregister all service workers first so the new bundle is served
      // directly from the network on the next load, not from SW cache.
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((r) => r.unregister()));
      }
      // Delete every cache storage entry (SW precache, runtime cache, etc.)
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map((name) => caches.delete(name)));
      }
      // Hard reload — bypasses any remaining HTTP cache
      window.location.href = window.location.href;
    } catch {
      window.location.reload();
    }
  }

  async function handleSyncNow() {
    if (!user) return;
    setSyncing(true);
    setStatus('');
    try {
      const result = await syncNow(user.id);
      setStatus(result.direction === 'push' ? 'Local changes synced to cloud.' : 'Cloud changes pulled locally.');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Cloud sync failed.');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <section className="stack-lg">
      <div className="card stack-md">
        <h2>Settings</h2>
        <p className="subtle">Customize your GearVault experience</p>
      </div>

      <div className="card stack-md">
        <h3>Account</h3>
        <p><strong>Email:</strong> {user?.email ?? 'Not available'}</p>
        <p>
          <strong>Status:</strong>{' '}
          <span className={`status-chip ${isOnline ? 'online' : 'offline'}`}>
            <span className="status-dot" aria-hidden="true" />
            {isOnline ? 'Online' : 'Offline'}
          </span>
        </p>
        <div className="row wrap">
          <button className="ghost" onClick={() => void signOut()}>
            Logout
          </button>
        </div>
      </div>

      <div className="card stack-md">
        <h3>Appearance</h3>
        <label className="stack-sm">
          <strong>Theme</strong>
          <select value={settings.theme} onChange={(e) => void update('theme', e.target.value as typeof settings.theme)}>
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>

        <label className="stack-sm">
          <strong>Default currency</strong>
          <input value={settings.defaultCurrency} onChange={(e) => void update('defaultCurrency', e.target.value.toUpperCase())} placeholder="EUR" />
        </label>
      </div>

      <div className="card stack-md">
        <h3>Sync & Backup</h3>
        <label className="checkbox-inline">
          <input type="checkbox" checked={settings.syncEnabled} onChange={(e) => void update('syncEnabled', e.target.checked)} />
          <span>Enable cloud sync</span>
        </label>
        <p className="subtle">Your data syncs automatically while online. You can also trigger a manual sync.</p>
        <div className="row wrap">
          <button className="ghost" onClick={() => void handleSyncNow()} disabled={!settings.syncEnabled || syncing}>
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
          {syncMessage && <span className="subtle">{syncMessage}</span>}
        </div>
        
        <hr />

        <div className="stack-sm">
          <strong>Export & Import</strong>
          <div className="row wrap">
            <button className="ghost" onClick={() => void exportDb()}>Export Database</button>
            <button className="ghost" onClick={() => fileRef.current?.click()}>Import Database</button>
            <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => void importDb(e.target.files?.[0])} />
          </div>
          <p className="subtle">Download or restore your complete database as JSON</p>
        </div>
      </div>

      <div className="card stack-md">
        <h3>AI Assistant</h3>
        <p className="subtle">
          GearVault uses Groq AI (llama-3.3-70b-versatile) for intelligent packing suggestions. 
          The API key is hardcoded — no configuration needed.
        </p>

        <label className="checkbox-inline">
          <input type="checkbox" checked={settings.aiLearningEnabled} onChange={(e) => void update('aiLearningEnabled', e.target.checked)} />
          <span>Enable AI learning from feedback</span>
        </label>
        <p className="subtle">AI learns from your packing list feedback to improve suggestions</p>
      </div>

      <div className="card stack-md">
        <h3>Demo Data</h3>
        <label className="checkbox-inline">
          <input type="checkbox" checked={settings.demoDataEnabled} onChange={(e) => void toggleDemoData(e.target.checked)} />
          <span>Enable demo data</span>
        </label>
        <div className="row wrap" style={{ gap: '0.5rem' }}>
          <button className="ghost" onClick={() => void loadDemoDataNow()}>Load Demo Data</button>
          <button className="ghost" onClick={() => void clearDemoData()}>Remove All Data</button>
        </div>
        <p className="subtle">Load 22 sample photography/videography items to test AI packing suggestions</p>
      </div>

      <div className="card stack-md">
        <h3>App Updates</h3>
        <p className="subtle">If the app feels outdated or a new version isn't loading, clear the cache to force an update.</p>
        <button className="ghost" onClick={() => void clearCacheAndReload()}>
          Clear Cache & Reload
        </button>
      </div>

      <div className="card stack-md">
        <h3>About</h3>
        <p className="subtle">GearVault is a progressive web app with account-based cloud sync and offline-capable local storage.</p>
        <div className="stack-sm">
          <p><strong>Version:</strong> 1.0.0</p>
          <p><strong>Storage:</strong> IndexedDB + Supabase cloud sync</p>
          <p><strong>Open Source:</strong> Built with React + TypeScript</p>
        </div>
      </div>

      {status && (
        <div className="card">
          <p className="success">{status}</p>
        </div>
      )}
    </section>
  );
}