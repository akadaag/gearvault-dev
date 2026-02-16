import { Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, ensureBaseData } from '../db';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { resetSheetScrollLock } from '../lib/sheetLock';
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

  // ── Catalog data ──────────────────────────────────────────────────────────
  const gear = useLiveQuery(() => db.gearItems.toArray(), [], []);
  const gearCount = gear.length;
  const essentialCount = gear.filter((item) => item.essential).length;
  const maintenanceCount = gear.filter(isNeedsMaintenance).length;

  // ── Events data ───────────────────────────────────────────────────────────
  const eventsAll = useLiveQuery(() => db.events.toArray(), [], []);
  const eventsNow = new Date();
  const eventsCount = eventsAll.length;
  const upcomingCount = eventsAll.filter(e => e.dateTime && new Date(e.dateTime) >= eventsNow).length;
  const pastCount = eventsAll.filter(e => e.dateTime && new Date(e.dateTime) < eventsNow).length;

  // ── Route flags ───────────────────────────────────────────────────────────
  const isCatalogRoute = location.pathname === '/catalog';
  const isSettingsRoute = location.pathname === '/settings';
  const isEventsRoute = location.pathname === '/events';
  const isAssistantRoute = location.pathname === '/assistant';
  const isGearDetailRoute = /^\/catalog\/item\/[^/]+$/.test(location.pathname);
  const isEventDetailRoute = /^\/events\/[^/]+$/.test(location.pathname);

  // ── Catalog search params ─────────────────────────────────────────────────
  const catalogQuery = searchParams.get('q') ?? '';
  const quickFilter = searchParams.get('qf') ?? 'all';
  const hasCategoryFilters = (searchParams.get('cats') ?? '').split(',').filter(Boolean).length > 0;
  const isTopFilterActive = quickFilter !== 'all' || hasCategoryFilters;

  // ── Events search params ──────────────────────────────────────────────────
  const eventsQuery = searchParams.get('q') ?? '';
  const eventsQuickFilter = searchParams.get('qf') ?? 'upcoming';
  const hasEventsTypeFilters = (searchParams.get('types') ?? '').split(',').filter(Boolean).length > 0;
  const hasEventsClientFilter = !!searchParams.get('client');
  const hasEventsLocationFilter = !!searchParams.get('location');
  const isEventsFilterActive =
    eventsQuickFilter !== 'upcoming' ||
    hasEventsTypeFilters ||
    hasEventsClientFilter ||
    hasEventsLocationFilter;
  const showEventsCalendar = searchParams.get('calendar') === '1';

  const pageTitle =
    location.pathname === '/catalog'
      ? 'Catalog'
      : location.pathname === '/events'
        ? 'Events'
        : location.pathname === '/assistant'
          ? 'PackShot AI Assistant'
          : location.pathname === '/settings'
            ? 'Settings'
            : 'Catalog';

  useEffect(() => {
    void ensureBaseData();
  }, []);

  useEffect(() => {
    resetSheetScrollLock();
  }, [location.pathname]);

  // ── Catalog handlers ──────────────────────────────────────────────────────
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

  function setQuickFilter(value: 'all' | 'essential' | 'maintenance') {
    const params = new URLSearchParams(searchParams);
    if (value === 'all') params.delete('qf');
    else params.set('qf', value);
    navigate({ pathname: '/catalog', search: params.toString() ? `?${params.toString()}` : '' });
  }

  function openCatalogAdd() {
    const params = new URLSearchParams(searchParams);
    params.set('add', '1');
    navigate({ pathname: '/catalog', search: params.toString() ? `?${params.toString()}` : '' });
  }

  // ── Events handlers ───────────────────────────────────────────────────────
  function handleEventsSearch(value: string) {
    const params = new URLSearchParams(searchParams);
    if (value.trim()) params.set('q', value);
    else params.delete('q');
    navigate({ pathname: '/events', search: params.toString() ? `?${params.toString()}` : '' });
  }

  function openEventsFilters() {
    const params = new URLSearchParams(searchParams);
    params.set('filters', '1');
    navigate({ pathname: '/events', search: params.toString() ? `?${params.toString()}` : '' });
  }

  function setEventsQuickFilter(value: 'upcoming' | 'past' | 'all') {
    const params = new URLSearchParams(searchParams);
    params.set('qf', value);
    navigate({ pathname: '/events', search: params.toString() ? `?${params.toString()}` : '' });
  }

  function openEventsAdd() {
    const params = new URLSearchParams(searchParams);
    params.set('add', '1');
    navigate({ pathname: '/events', search: params.toString() ? `?${params.toString()}` : '' });
  }

  function toggleEventsCalendar() {
    const params = new URLSearchParams(searchParams);
    if (showEventsCalendar) params.delete('calendar');
    else params.set('calendar', '1');
    navigate({ pathname: '/events', search: params.toString() ? `?${params.toString()}` : '' });
  }

  function getEventsCounterText() {
    if (eventsQuickFilter === 'upcoming') return `${upcomingCount} upcoming event${upcomingCount === 1 ? '' : 's'}`;
    if (eventsQuickFilter === 'past') return `${pastCount} past event${pastCount === 1 ? '' : 's'}`;
    return `${eventsCount} event${eventsCount === 1 ? '' : 's'}`;
  }

  // ── Assistant handlers ────────────────────────────────────────────────────
  function openAssistantHistory() {
    const params = new URLSearchParams(searchParams);
    params.set('history', '1');
    navigate({ pathname: '/assistant', search: params.toString() ? `?${params.toString()}` : '' });
  }

  // ── SVG icons (defined inside function to avoid JSX hoisting issues) ──────
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

  const calendarBtnIcon = (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );

  const historyIcon = (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  );

  return (
    <div className="app-shell">
      {!isGearDetailRoute && !isEventDetailRoute && (
        <header className={`topbar${isCatalogRoute || isEventsRoute ? ' topbar-catalog' : ''}`}>
          <div className="topbar-inner">
            <div className="topbar-primary-row">
              <div className="topbar-title">
                <h1 className={isCatalogRoute || isEventsRoute ? 'catalog-page-title' : undefined}>
                  {pageTitle}
                </h1>
                {isCatalogRoute && <p className="subtle topbar-item-count">{gearCount} items</p>}
                {isEventsRoute && <p className="subtle topbar-item-count">{getEventsCounterText()}</p>}
                {isSettingsRoute && syncMessage && <p className="subtle topbar-sync">{syncMessage}</p>}
              </div>
               <div className="topbar-actions">
                  {isCatalogRoute && (
                     <>
                       <button className="topbar-add-btn" aria-label="Add new item" onClick={openCatalogAdd}>
                         {addIcon}
                          <span>Add</span>
                       </button>
                     </>
                  )}
                  {isEventsRoute && (
                     <>

<button
                       className={`topbar-icon-btn${showEventsCalendar ? ' is-active' : ''}`}
                       aria-label="Toggle calendar view"
                       onClick={toggleEventsCalendar}
                     >
                       {calendarBtnIcon}
                     </button>
<button className="topbar-icon-btn" aria-label="Create new event" onClick={openEventsAdd}>
                       {addIcon}
                     </button>
                  </>
                )}
                  {isAssistantRoute && (
                    <button 
                      className="topbar-icon-btn" 
                      aria-label="Chat history" 
                      onClick={openAssistantHistory}
                    >
                      {historyIcon}
                    </button>
                  )}
              </div>
            </div>

            {isCatalogRoute && (
              <div className="topbar-catalog-controls">
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
                </div>
                <div className="catalog-quick-filters" role="group" aria-label="Quick catalog filters">
                   <button
                     className={`catalog-quick-pill${quickFilter === 'all' ? ' is-active' : ''}`}
                     onClick={() => setQuickFilter('all')}
                   >
                     All
                     <span className="catalog-quick-pill-count">{gearCount}</span>
                   </button>
                   <button
                     className={`catalog-quick-pill${quickFilter === 'essential' ? ' is-active' : ''}`}
                     onClick={() => setQuickFilter('essential')}
                   >
                     Essential
                     <span className="catalog-quick-pill-count">{essentialCount}</span>
                   </button>
                   <button
                     className={`catalog-quick-pill${quickFilter === 'maintenance' ? ' is-active' : ''}`}
                     onClick={() => setQuickFilter('maintenance')}
                   >
                     Maintenance
                     <span className="catalog-quick-pill-count">{maintenanceCount}</span>
                   </button>
                   <button
                     className={`catalog-quick-pill catalog-quick-filter-btn${isTopFilterActive ? ' is-active' : ''}`}
                     aria-label="Open filters"
                     aria-pressed={isTopFilterActive}
                     onClick={openCatalogFilters}
                   >
                     <span className="catalog-filter-pill-icon" aria-hidden="true">{filterIcon}</span>
                   </button>
                 </div>
              </div>
            )}

            {isEventsRoute && (
              <div className="topbar-catalog-controls">
                <div className="topbar-search-row">
                  <div className="topbar-search-field">
                    <span className="topbar-search-icon">{searchIcon}</span>
                    <input
                      className="topbar-search-input"
                      aria-label="Search events"
                      placeholder="Search events..."
                      value={eventsQuery}
                      onChange={(event) => handleEventsSearch(event.target.value)}
                    />
                  </div>
                </div>
                 <div className="catalog-quick-filters" role="group" aria-label="Quick event filters">
                   <button
                     className={`catalog-quick-pill${eventsQuickFilter === 'upcoming' ? ' is-active' : ''}`}
                     onClick={() => setEventsQuickFilter('upcoming')}
                   >
                     Upcoming
                     <span className="catalog-quick-pill-count">{upcomingCount}</span>
                   </button>
                   <button
                     className={`catalog-quick-pill${eventsQuickFilter === 'past' ? ' is-active' : ''}`}
                     onClick={() => setEventsQuickFilter('past')}
                   >
                     Past
                     <span className="catalog-quick-pill-count">{pastCount}</span>
                   </button>
                   <button
                     className={`catalog-quick-pill${eventsQuickFilter === 'all' ? ' is-active' : ''}`}
                     onClick={() => setEventsQuickFilter('all')}
                   >
                     All
                     <span className="catalog-quick-pill-count">{eventsCount}</span>
                   </button>
                   <button
                     className={`catalog-quick-pill catalog-quick-filter-btn${isEventsFilterActive ? ' is-active' : ''}`}
                     aria-label="Open event filters"
                     aria-pressed={isEventsFilterActive}
                     onClick={openEventsFilters}
                   >
                     <span className="catalog-filter-pill-icon" aria-hidden="true">{filterIcon}</span>
                   </button>
                 </div>
              </div>
            )}
          </div>
        </header>
      )}

      <main className={`${isGearDetailRoute || isEventDetailRoute ? 'content content-immersive' : 'content'}${isCatalogRoute ? ' content-catalog' : ''}${isEventsRoute ? ' content-events' : ''}`}>
        <Outlet />
      </main>

      <MobileBottomNav items={tabs} ariaLabel="Main navigation" />
    </div>
  );
}

function isNeedsMaintenance(item: { condition: string; maintenanceHistory?: Array<{ date: string }> }) {
  if (item.condition === 'worn') return true;
  const latest = [...(item.maintenanceHistory ?? [])].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  )[0];
  if (!latest) return true;
  const daysSinceLast = (Date.now() - new Date(latest.date).getTime()) / (1000 * 60 * 60 * 24);
  return daysSinceLast > 180;
}
