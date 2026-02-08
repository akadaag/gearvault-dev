import { Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, ensureBaseData } from '../db';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { MobileBottomNav } from './MobileBottomNav';

const catalogIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <rect x="3" y="5" width="18" height="14" rx="2" ry="2" />
    <path d="M9 9h6" />
    <path d="M9 13h4" />
  </svg>
);

const eventsIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <rect x="3" y="5" width="18" height="16" rx="2" ry="2" />
    <path d="M8 3v4" />
    <path d="M16 3v4" />
    <path d="M3 10h18" />
  </svg>
);

const assistantIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M12 4l1.8 4.2L18 10l-4.2 1.8L12 16l-1.8-4.2L6 10l4.2-1.8L12 4z" />
    <path d="M6.5 4.8l0.8 1.8 1.8 0.8-1.8 0.8-0.8 1.8-0.8-1.8-1.8-0.8 1.8-0.8 0.8-1.8z" />
    <path d="M18 14.5l0.7 1.5 1.5 0.7-1.5 0.7-0.7 1.5-0.7-1.5-1.5-0.7 1.5-0.7 0.7-1.5z" />
  </svg>
);

const settingsIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a2 2 0 0 1-4 0v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a2 2 0 0 1 0-4h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1 1 0 0 0 1.1.2h0a1 1 0 0 0 .6-.9V4a2 2 0 0 1 4 0v.2a1 1 0 0 0 .6.9h0a1 1 0 0 0 1.1-.2l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a1 1 0 0 0-.2 1.1v0a1 1 0 0 0 .9.6H20a2 2 0 0 1 0 4h-.2a1 1 0 0 0-.9.6z" />
  </svg>
);

const tabs = [
  { to: '/catalog', label: 'Catalog', icon: catalogIcon },
  { to: '/events', label: 'Events', icon: eventsIcon },
  { to: '/assistant', label: 'AI Assistant', icon: assistantIcon },
  { to: '/settings', label: 'Settings', icon: settingsIcon },
];

export function TabLayout() {
  useTheme();
  const { syncMessage } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const gearCount = useLiveQuery(() => db.gearItems.count(), [], 0);
  const isCatalogRoute = location.pathname === '/catalog';
  const isSettingsRoute = location.pathname === '/settings';
  const isGearDetailRoute = /^\/catalog\/item\/[^/]+$/.test(location.pathname);
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

  function openCatalogAdd() {
    const params = new URLSearchParams(searchParams);
    params.set('add', '1');
    navigate({ pathname: '/catalog', search: params.toString() ? `?${params.toString()}` : '' });
  }

  const searchIcon = (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4-4" />
    </svg>
  );

  const filterIcon = (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <line x1="4" y1="6" x2="20" y2="6" />
      <circle cx="10" cy="6" r="2" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <circle cx="15" cy="12" r="2" />
      <line x1="4" y1="18" x2="20" y2="18" />
      <circle cx="8" cy="18" r="2" />
    </svg>
  );

  const addIcon = (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );

  return (
    <div className="app-shell">
      {!isGearDetailRoute && (
        <header className="topbar">
          <div className="topbar-inner">
            <div className="topbar-primary-row">
              <div className="topbar-title">
                <h1 className={isCatalogRoute ? 'catalog-page-title' : undefined}>{pageTitle}</h1>
                {isCatalogRoute && <p className="subtle topbar-item-count">{gearCount} items</p>}
                {isSettingsRoute && syncMessage && <p className="subtle topbar-sync">{syncMessage}</p>}
              </div>
              <div className="topbar-actions">
                {isCatalogRoute && (
                  <button className="topbar-add-btn" aria-label="Add new item" onClick={openCatalogAdd}>
                    {addIcon}
                  </button>
                )}
              </div>
            </div>
            {isCatalogRoute && (
              <div className="topbar-search-row">
                <div className="topbar-search-field">
                  <span className="topbar-search-icon">{searchIcon}</span>
                  <input
                    className="topbar-search-input"
                    aria-label="Search catalog items"
                    placeholder="Search gear..."
                    value={catalogQuery}
                    onChange={(event) => handleCatalogSearch(event.target.value)}
                  />
                </div>
                <button className="ghost topbar-filter-btn" aria-label="Open filters" onClick={openCatalogFilters}>
                  {filterIcon}
                </button>
              </div>
            )}
          </div>
        </header>
      )}

      <main className={`${isGearDetailRoute ? 'content content-immersive' : 'content'}${isCatalogRoute ? ' content-catalog' : ''}`}>
        <Outlet />
      </main>

      <MobileBottomNav items={tabs} ariaLabel="Main navigation" />
    </div>
  );
}