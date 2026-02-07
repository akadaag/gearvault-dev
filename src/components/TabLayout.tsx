import { NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, ensureBaseData } from '../db';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const tabs = [
  { to: '/catalog', label: 'Catalog', icon: '📦' },
  { to: '/events', label: 'Events', icon: '📅' },
  { to: '/assistant', label: 'AI Assistant', icon: '✨' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
];

export function TabLayout() {
  useTheme();
  const { syncMessage } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const gearCount = useLiveQuery(() => db.gearItems.count(), [], 0);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(() =>
    window.matchMedia('(display-mode: standalone)').matches,
  );
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const isCatalogRoute = location.pathname === '/catalog';
  const catalogQuery = searchParams.get('q') ?? '';

  const pageTitle =
    location.pathname === '/catalog'
      ? 'Catalog'
      : location.pathname === '/events'
        ? 'Events'
        : location.pathname === '/assistant'
          ? 'AI Assistant'
          : location.pathname === '/settings'
            ? 'Settings'
            : 'Catalog';

  useEffect(() => {
    void ensureBaseData();
  }, []);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const onInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  async function handleInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  }

  function handleCatalogSearch(value: string) {
    const params = new URLSearchParams(searchParams);
    if (value.trim()) params.set('q', value);
    else params.delete('q');
    navigate({ pathname: '/catalog', search: params.toString() ? `?${params.toString()}` : '' });
  }

  function openCatalogFilters() {
    const params = new URLSearchParams(searchParams);
    params.set('filters', '1');
    navigate({ pathname: '/catalog', search: params.toString() ? `?${params.toString()}` : '' });
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="topbar-primary-row">
            <div className="topbar-title">
              <h1>{pageTitle}</h1>
              {isCatalogRoute && <p className="subtle">{gearCount} items</p>}
              {!isCatalogRoute && syncMessage && <p className="subtle topbar-sync">{syncMessage}</p>}
            </div>
            <div className="topbar-actions">
              <span className={`status-chip ${isOnline ? 'online' : 'offline'}`}>
                <span className="status-dot" aria-hidden="true" />
                {isOnline ? 'Online' : 'Offline'}
              </span>
              {!isInstalled && deferredPrompt && (
                <button className="ghost" onClick={() => void handleInstall()}>
                  Install App
                </button>
              )}
              {isInstalled && <span className="pill">Installed</span>}
            </div>
          </div>
          {isCatalogRoute && (
            <div className="topbar-search-row">
              <input
                className="topbar-search-input"
                aria-label="Search catalog items"
                placeholder="Search gear..."
                value={catalogQuery}
                onChange={(event) => handleCatalogSearch(event.target.value)}
              />
              <button className="ghost topbar-filter-btn" aria-label="Open filters" onClick={openCatalogFilters}>
                Filters
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="content">
        <Outlet />
      </main>

      <nav className="tabs" aria-label="Main navigation">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) => (isActive ? 'tab active' : 'tab')}
            aria-label={tab.label}
          >
            <span role="img" aria-hidden="true" style={{ fontSize: '1.05rem' }}>
              {tab.icon}
            </span>
            <span>{tab.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}