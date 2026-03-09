import { Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, ensureBaseData } from '../db';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { resetSheetScrollLock } from '../lib/sheetLock';
import { FloatingNavBar } from './FloatingNavBar';
import { ToolbarSearch } from './ToolbarSearch';
import { AIAssistantProvider } from '../contexts/AIAssistantContext';

const homeIcon = (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
    <path d="M22 12.2039V13.725C22 17.6258 22 19.5763 20.8284 20.7881C19.6569 22 17.7712 22 14 22H10C6.22876 22 4.34315 22 3.17157 20.7881C2 19.5763 2 17.6258 2 13.725V12.2039C2 9.91549 2 8.77128 2.5192 7.82274C3.0384 6.87421 3.98695 6.28551 5.88403 5.10813L7.88403 3.86687C9.88939 2.62229 10.8921 2 12 2C13.1079 2 14.1106 2.62229 16.116 3.86687L18.116 5.10812C20.0131 6.28551 20.9616 6.87421 21.4808 7.82274" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M15 18H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

const catalogIcon = (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
    <circle cx="12" cy="13" r="3" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M2 13.3636C2 10.2994 2 8.76721 2.74902 7.6666C3.07328 7.19014 3.48995 6.78104 3.97524 6.46268C4.69555 5.99013 5.59733 5.82123 6.978 5.76086C7.63685 5.76086 8.20412 5.27068 8.33333 4.63636C8.52715 3.68489 9.37805 3 10.3663 3H13.6337C14.6219 3 15.4728 3.68489 15.6667 4.63636C15.7959 5.27068 16.3631 5.76086 17.022 5.76086C18.4027 5.82123 19.3044 5.99013 20.0248 6.46268C20.51 6.78104 20.9267 7.19014 21.251 7.6666C22 8.76721 22 10.2994 22 13.3636C22 16.4279 22 17.9601 21.251 19.0607C20.9267 19.5371 20.51 19.9462 20.0248 20.2646C18.9038 21 17.3433 21 14.2222 21H9.77778C6.65675 21 5.09624 21 3.97524 20.2646C3.48995 19.9462 3.07328 19.5371 2.74902 19.0607C2.53746 18.7498 2.38566 18.4045 2.27673 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M19 10H18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

const eventsIcon = (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
    <path d="M14 22H10C6.22876 22 4.34315 22 3.17157 20.8284C2 19.6569 2 17.7712 2 14V12C2 8.22876 2 6.34315 3.17157 5.17157C4.34315 4 6.22876 4 10 4H14C17.7712 4 19.6569 4 20.8284 5.17157C22 6.34315 22 8.22876 22 12V14C22 17.7712 22 19.6569 20.8284 20.8284C20.1752 21.4816 19.3001 21.7706 18 21.8985" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M7 4V2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M17 4V2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M21.5 9H16.625H10.75M2 9H5.875" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M18 17C18 17.5523 17.5523 18 17 18C16.4477 18 16 17.5523 16 17C16 16.4477 16.4477 16 17 16C17.5523 16 18 16.4477 18 17Z" fill="currentColor"/>
    <path d="M18 13C18 13.5523 17.5523 14 17 14C16.4477 14 16 13.5523 16 13C16 12.4477 16.4477 12 17 12C17.5523 12 18 12.4477 18 13Z" fill="currentColor"/>
    <path d="M13 17C13 17.5523 12.5523 18 12 18C11.4477 18 11 17.5523 11 17C11 16.4477 11.4477 16 12 16C12.5523 16 13 16.4477 13 17Z" fill="currentColor"/>
    <path d="M13 13C13 13.5523 12.5523 14 12 14C11.4477 14 11 13.5523 11 13C11 12.4477 11.4477 12 12 12C12.5523 12 13 12.4477 13 13Z" fill="currentColor"/>
    <path d="M8 17C8 17.5523 7.55228 18 7 18C6.44772 18 6 17.5523 6 17C6 16.4477 6.44772 16 7 16C7.55228 16 8 16.4477 8 17Z" fill="currentColor"/>
    <path d="M8 13C8 13.5523 7.55228 14 7 14C6.44772 14 6 13.5523 6 13C6 12.4477 6.44772 12 7 12C7.55228 12 8 12.4477 8 13Z" fill="currentColor"/>
  </svg>
);

// Settings icon removed from tabs — now lives in ProfileMenu
// Assistant icon removed from tabs — now accessed via AI circle in FloatingNavBar

const tabs = [
  { to: '/home', label: 'Home', icon: homeIcon },
  { to: '/catalog', label: 'Catalog', icon: catalogIcon },
  { to: '/events', label: 'Events', icon: eventsIcon },
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
  const isHomeRoute = location.pathname === '/home';
  const isCatalogRoute = location.pathname === '/catalog';
  const isSettingsRoute = location.pathname === '/settings';
  const isEventsRoute = location.pathname === '/events';
  const isAssistantRoute = location.pathname === '/assistant';
  const isGearDetailRoute = /^\/catalog\/item\/[^/]+$/.test(location.pathname);
  const isEventDetailRoute = /^\/events\/[^/]+$/.test(location.pathname);

  // All main tabs that use the iOS design system
  const isIosThemeRoute = isHomeRoute || isCatalogRoute || isGearDetailRoute || isEventsRoute || isEventDetailRoute || isAssistantRoute || isSettingsRoute;

  // ── Catalog search params ─────────────────────────────────────────────────
  const quickFilter = searchParams.get('qf') ?? 'all';
  const hasCategoryFilters = (searchParams.get('cats') ?? '').split(',').filter(Boolean).length > 0;
  const isTopFilterActive = quickFilter !== 'all' || hasCategoryFilters;

  // ── Events search params ──────────────────────────────────────────────────
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
    location.pathname === '/home'
      ? 'Home'
      : location.pathname === '/catalog'
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

  // ── Search state (toolbar search open/close) ───────────────────────────────
  const [searchOpen, setSearchOpen] = useState(false);

  // ── SVG icons ─────────────────────────────────────────────────────────────

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
    <AIAssistantProvider>
    <div className={`app-shell${isIosThemeRoute ? ' ios-theme' : ''}`}>
      {!isHomeRoute && !isGearDetailRoute && !isEventDetailRoute && !isSettingsRoute && !isAssistantRoute && (
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

      <main className={`${isHomeRoute ? 'content content-home' : isGearDetailRoute || isEventDetailRoute ? 'content content-immersive' : 'content'}${isCatalogRoute ? ' content-catalog' : ''}${isEventsRoute ? ' content-events' : ''}${isAssistantRoute ? ' content-assistant' : ''}${isSettingsRoute ? ' content-settings' : ''}`}>
        <Outlet />
      </main>

      {/* Catalog action toolbar — outside <main> so glass backdrop-filter blurs real content */}
      {isCatalogRoute && (
        <div className="toolbar-area">
          <div className={`ios-catalog-toolbar${searchOpen ? ' toolbar-pill--search-open' : ''}`} role="group" aria-label="Catalog actions">
            <button
              className={`ios-catalog-toolbar-btn${isTopFilterActive ? ' active' : ''}`}
              onClick={openCatalogFilters}
              aria-label="Filters"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="21" x2="4" y2="14" />
                <line x1="4" y1="10" x2="4" y2="3" />
                <line x1="12" y1="21" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12" y2="3" />
                <line x1="20" y1="21" x2="20" y2="16" />
                <line x1="20" y1="12" x2="20" y2="3" />
                <line x1="1" y1="14" x2="7" y2="14" />
                <line x1="9" y1="8" x2="15" y2="8" />
                <line x1="17" y1="16" x2="23" y2="16" />
              </svg>
            </button>
            <button
              className="ios-catalog-toolbar-btn"
              onClick={openCatalogAdd}
              aria-label="Add Item"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>
          <ToolbarSearch onOpenChange={setSearchOpen} />
        </div>
      )}

      {/* Events action toolbar — outside <main> so glass backdrop-filter blurs real content */}
      {isEventsRoute && (
        <div className="toolbar-area">
          <div className={`ev-ios-toolbar${searchOpen ? ' toolbar-pill--search-open' : ''}`} role="group" aria-label="Events actions">
            <button
              className={`ev-ios-toolbar-btn${showEventsCalendar ? ' active' : ''}`}
              onClick={toggleEventsCalendar}
              aria-label="Toggle calendar view"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </button>
            <button
              className="ev-ios-toolbar-btn"
              onClick={openEventsAdd}
              aria-label="Create new event"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>
          <ToolbarSearch onOpenChange={setSearchOpen} />
        </div>
      )}

      {/* Assistant action toolbar — outside <main> so glass backdrop-filter blurs real content */}
      {isAssistantRoute && (
        <div className="toolbar-area">
          <div className={`ai-ios-toolbar${searchOpen ? ' toolbar-pill--search-open' : ''}`} role="group" aria-label="Assistant actions">
            <button
              className="ai-ios-toolbar-btn"
              onClick={openAssistantHistory}
              aria-label="Chat history"
            >
              {/* 3 staggered lines: long, medium, short */}
              <svg width="20" height="16" viewBox="0 0 18 14" fill="none" aria-hidden="true">
                <line x1="1" y1="2" x2="17" y2="2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                <line x1="1" y1="7" x2="13" y2="7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                <line x1="1" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </button>
            <button
              className="ai-ios-toolbar-btn"
              aria-label="Temporary chat (coming soon)"
            >
              {/* Circular arrows icon */}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                <path d="M3 3v5h5"/>
              </svg>
            </button>
          </div>
          <ToolbarSearch onOpenChange={setSearchOpen} />
        </div>
      )}

      {!isGearDetailRoute && !isEventDetailRoute && <FloatingNavBar items={tabs} />}
    </div>
    </AIAssistantProvider>
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
