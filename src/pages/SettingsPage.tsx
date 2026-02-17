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
    a.download = `packshot-export-${Date.now()}.json`;
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
    <section className="settings-page-ios">
      {/* iOS-style inline header */}
      <header className="ios-header">
        <div className="ios-header-top">
          <h1 className="ios-title">Settings</h1>
        </div>
      </header>

      {/* Scrollable settings list */}
      <div className="ios-list">

        {/* ── Account ─────────────────────────────────────────────────── */}
        <div className="ios-list-group">
          <div className="ios-list-group-header"><h3>Account</h3></div>

          <div className="ios-list-item" style={{ cursor: 'default' }}>
            <div className="ios-list-content">
              <span className="ios-list-title">Display Name</span>
            </div>
            <div className="ios-list-action">
              <input
                className="ios-settings-input"
                type="text"
                value={settings.displayName ?? ''}
                onChange={(e) => void update('displayName', e.target.value)}
                placeholder="Your name"
              />
            </div>
          </div>

          <div className="ios-list-item" style={{ cursor: 'default' }}>
            <div className="ios-list-content">
              <span className="ios-list-title">Email</span>
            </div>
            <div className="ios-list-action">
              <span className="ios-list-sub">{user?.email ?? 'Not available'}</span>
            </div>
          </div>

          <div className="ios-list-item" style={{ cursor: 'default' }}>
            <div className="ios-list-content">
              <span className="ios-list-title">Status</span>
            </div>
            <div className="ios-list-action">
              <span style={{ color: isOnline ? 'var(--ios-green)' : 'var(--ios-red)', fontWeight: 600, fontSize: '0.9rem' }}>
                {isOnline ? 'Online' : 'Offline'}
              </span>
            </div>
          </div>

          <button className="ios-list-item" onClick={() => void signOut()}>
            <div className="ios-list-content">
              <span className="ios-list-title ios-settings-destructive">Log Out</span>
            </div>
            <span className="ios-arrow" aria-hidden="true">&#8250;</span>
          </button>
        </div>

        {/* ── Appearance ──────────────────────────────────────────────── */}
        <div className="ios-list-group">
          <div className="ios-list-group-header"><h3>Appearance</h3></div>

          <div className="ios-list-item" style={{ cursor: 'default' }}>
            <div className="ios-list-content">
              <span className="ios-list-title">Theme</span>
            </div>
            <div className="ios-list-action">
              <select
                className="ios-settings-input"
                value={settings.theme}
                onChange={(e) => void update('theme', e.target.value as typeof settings.theme)}
              >
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>
          </div>

          <div className="ios-list-item" style={{ cursor: 'default' }}>
            <div className="ios-list-content">
              <span className="ios-list-title">Default Currency</span>
            </div>
            <div className="ios-list-action">
              <input
                className="ios-settings-input"
                value={settings.defaultCurrency}
                onChange={(e) => void update('defaultCurrency', e.target.value.toUpperCase())}
                placeholder="EUR"
                style={{ width: '60px', textAlign: 'center' }}
              />
            </div>
          </div>
        </div>

        {/* ── Sync & Backup ───────────────────────────────────────────── */}
        <div className="ios-list-group">
          <div className="ios-list-group-header"><h3>Sync & Backup</h3></div>

          <label className="ios-list-item" style={{ cursor: 'pointer' }}>
            <div className="ios-list-content">
              <span className="ios-list-title">Cloud Sync</span>
              <span className="ios-list-sub">Your data syncs automatically while online</span>
            </div>
            <div className="ios-list-action">
              <input
                type="checkbox"
                className="ios-toggle"
                checked={settings.syncEnabled}
                onChange={(e) => void update('syncEnabled', e.target.checked)}
              />
            </div>
          </label>

          <button
            className="ios-list-item"
            onClick={() => void handleSyncNow()}
            disabled={!settings.syncEnabled || syncing}
          >
            <div className="ios-list-content">
              <span className="ios-list-title ios-settings-action">
                {syncing ? 'Syncing…' : 'Sync Now'}
              </span>
              {syncMessage && <span className="ios-list-sub">{syncMessage}</span>}
            </div>
            <span className="ios-arrow" aria-hidden="true">&#8250;</span>
          </button>

          <button className="ios-list-item" onClick={() => void exportDb()}>
            <div className="ios-list-content">
              <span className="ios-list-title ios-settings-action">Export Database</span>
              <span className="ios-list-sub">Download your complete database as JSON</span>
            </div>
            <span className="ios-arrow" aria-hidden="true">&#8250;</span>
          </button>

          <button className="ios-list-item" onClick={() => fileRef.current?.click()}>
            <div className="ios-list-content">
              <span className="ios-list-title ios-settings-action">Import Database</span>
              <span className="ios-list-sub">Restore from a JSON backup</span>
            </div>
            <span className="ios-arrow" aria-hidden="true">&#8250;</span>
          </button>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => void importDb(e.target.files?.[0])} />
        </div>

        {/* ── AI Assistant ────────────────────────────────────────────── */}
        <div className="ios-list-group">
          <div className="ios-list-group-header"><h3>AI Assistant</h3></div>

          <div className="ios-list-item" style={{ cursor: 'default' }}>
            <div className="ios-list-content">
              <span className="ios-list-title">Provider</span>
              <span className="ios-list-sub">Groq AI (compound-mini, scout-17b fallback)</span>
            </div>
          </div>

          <div className="ios-list-item" style={{ cursor: 'default' }}>
            <div className="ios-list-content">
              <span className="ios-list-title">API Keys</span>
              <span className="ios-list-sub">
                Primary: VITE_GROQ_API_KEY (required)
              </span>
              <span className="ios-list-sub">
                Fallback: VITE_GROQ_API_KEY_FALLBACK (optional)
              </span>
            </div>
          </div>

          <label className="ios-list-item" style={{ cursor: 'pointer' }}>
            <div className="ios-list-content">
              <span className="ios-list-title">AI Learning</span>
              <span className="ios-list-sub">Learn from your packing list feedback</span>
            </div>
            <div className="ios-list-action">
              <input
                type="checkbox"
                className="ios-toggle"
                checked={settings.aiLearningEnabled}
                onChange={(e) => void update('aiLearningEnabled', e.target.checked)}
              />
            </div>
          </label>
        </div>

        {/* ── Demo Data ───────────────────────────────────────────────── */}
        <div className="ios-list-group">
          <div className="ios-list-group-header"><h3>Demo Data</h3></div>

          <label className="ios-list-item" style={{ cursor: 'pointer' }}>
            <div className="ios-list-content">
              <span className="ios-list-title">Enable Demo Data</span>
              <span className="ios-list-sub">22 sample photography/videography items</span>
            </div>
            <div className="ios-list-action">
              <input
                type="checkbox"
                className="ios-toggle"
                checked={settings.demoDataEnabled}
                onChange={(e) => void toggleDemoData(e.target.checked)}
              />
            </div>
          </label>

          <button className="ios-list-item" onClick={() => void loadDemoDataNow()}>
            <div className="ios-list-content">
              <span className="ios-list-title ios-settings-action">Load Demo Data</span>
            </div>
            <span className="ios-arrow" aria-hidden="true">&#8250;</span>
          </button>

          <button className="ios-list-item" onClick={() => void clearDemoData()}>
            <div className="ios-list-content">
              <span className="ios-list-title ios-settings-destructive">Remove All Data</span>
            </div>
            <span className="ios-arrow" aria-hidden="true">&#8250;</span>
          </button>
        </div>

        {/* ── App Updates ─────────────────────────────────────────────── */}
        <div className="ios-list-group">
          <div className="ios-list-group-header"><h3>App Updates</h3></div>

          <button className="ios-list-item" onClick={() => void clearCacheAndReload()}>
            <div className="ios-list-content">
              <span className="ios-list-title ios-settings-action">Clear Cache & Reload</span>
              <span className="ios-list-sub">Force update if the app feels outdated</span>
            </div>
            <span className="ios-arrow" aria-hidden="true">&#8250;</span>
          </button>
        </div>

        {/* ── About ───────────────────────────────────────────────────── */}
        <div className="ios-list-group">
          <div className="ios-list-group-header"><h3>About</h3></div>

          <div className="ios-list-item" style={{ cursor: 'default' }}>
            <div className="ios-list-content">
              <span className="ios-list-title">Version</span>
            </div>
            <div className="ios-list-action">
              <span className="ios-list-sub">1.0.0</span>
            </div>
          </div>

          <div className="ios-list-item" style={{ cursor: 'default' }}>
            <div className="ios-list-content">
              <span className="ios-list-title">Storage</span>
            </div>
            <div className="ios-list-action">
              <span className="ios-list-sub">IndexedDB + Supabase</span>
            </div>
          </div>

          <div className="ios-list-item" style={{ cursor: 'default' }}>
            <div className="ios-list-content">
              <span className="ios-list-title">Built With</span>
            </div>
            <div className="ios-list-action">
              <span className="ios-list-sub">React + TypeScript</span>
            </div>
          </div>
        </div>

        {/* ── Status Toast ────────────────────────────────────────────── */}
        {status && (
          <div className="ios-list-group">
            <div className="ios-list-item" style={{ cursor: 'default' }}>
              <div className="ios-list-content">
                <span className="ios-list-title" style={{ color: 'var(--ios-green)' }}>{status}</span>
              </div>
            </div>
          </div>
        )}

      </div>
    </section>
  );
}
