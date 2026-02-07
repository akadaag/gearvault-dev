import { NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, ensureBaseData } from '../db';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';

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

  return (
    <div className="app-shell">
      {!isGearDetailRoute && (
        <header className="topbar">
          <div className="topbar-inner">
            <div className="topbar-primary-row">
              <div className="topbar-title">
                <h1>{pageTitle}</h1>
                {isCatalogRoute && <p className="subtle">{gearCount} items</p>}
                {isSettingsRoute && syncMessage && <p className="subtle topbar-sync">{syncMessage}</p>}
              </div>
              <div className="topbar-actions">
                {isCatalogRoute && (
                  <button className="icon-circle-btn topbar-add-btn" aria-label="Add new item" onClick={openCatalogAdd}>
                    +
                  </button>
                )}
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
                  ⚙
                </button>
              </div>
            )}
          </div>
        </header>
      )}

      <main className={isGearDetailRoute ? 'content content-immersive' : 'content'}>
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