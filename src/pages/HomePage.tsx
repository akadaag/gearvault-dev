import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { formatMoney } from '../lib/format';




export function HomePage() {
  const navigate = useNavigate();
  const settings = useLiveQuery(() => db.settings.get('app-settings'));
  const gearItems = useLiveQuery(() => db.gearItems.toArray(), []);
  const events = useLiveQuery(() => db.events.toArray(), []);
  const categories = useLiveQuery(() => db.categories.toArray(), []);




  // ── Search State ───────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);




  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchFocused(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);




  // ── Greeting & Time ────────────────────────────────────────────────────────
  const hour = new Date().getHours();
  let greeting = 'Good morning';
  if (hour >= 12 && hour < 17) greeting = 'Good afternoon';
  else if (hour >= 17 && hour < 21) greeting = 'Good evening';
  else if (hour >= 21 || hour < 5) greeting = 'Good night';




  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });




  // ── Data & Stats ───────────────────────────────────────────────────────────
  const totalItems = gearItems?.length ?? 0;
  const totalValue = gearItems?.reduce((sum, item) => sum + (item.purchasePrice?.amount ?? 0), 0) ?? 0;
  const totalCategories = categories?.length ?? 0;




  // Next upcoming event
  const now = new Date();
  const upcomingEvents = useMemo(
    () =>
      events
        ?.filter((e) => e.dateTime && new Date(e.dateTime) >= now)
        .sort((a, b) => new Date(a.dateTime!).getTime() - new Date(b.dateTime!).getTime()) ?? [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events]
  );
  const nextEvent = upcomingEvents[0];




  // Packing progress for next event
  let packedCount = 0;
  let totalCount = 0;
  let packingProgress = 0;
  if (nextEvent) {
    totalCount = nextEvent.packingChecklist.length;
    packedCount = nextEvent.packingChecklist.filter((i) => i.packed).length;
    packingProgress = totalCount > 0 ? Math.round((packedCount / totalCount) * 100) : 0;
  }




  // Days until next event
  let daysUntil = 0;
  let urgencyClass = 'later';
  if (nextEvent?.dateTime) {
    const eventDate = new Date(nextEvent.dateTime);
    daysUntil = Math.ceil((eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntil <= 2) urgencyClass = 'urgent';
    else if (daysUntil <= 7) urgencyClass = 'soon';
  }




  // Essential items
  const essentialItems = gearItems?.filter((item) => item.essential) ?? [];




  // Recently added items (last 5)
  const recentItems = useMemo(
    () =>
      [...(gearItems ?? [])]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5),
    [gearItems]
  );




  // Packing alerts
  const packingAlerts = useMemo(
    () =>
      upcomingEvents
        .map((event) => {
          const total = event.packingChecklist.length;
          const packed = event.packingChecklist.filter((i) => i.packed).length;
          const missing = total - packed;
          const eventDate = new Date(event.dateTime!);
          const days = Math.ceil((eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          return { event, missing, days, total, packed };
        })
        .filter((a) => a.missing > 0 && a.days <= 14)
        .sort((a, b) => a.days - b.days),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [upcomingEvents]
  );




  // Search Logic
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return { gear: [], events: [], settings: [] };




    const matchedGear = (gearItems ?? [])
      .filter((item) => {
        const text = [item.name, item.brand, item.model].filter(Boolean).join(' ').toLowerCase();
        return text.includes(q);
      })
      .slice(0, 5);




    const matchedEvents = (events ?? [])
      .filter((e) => {
        const text = [e.title, e.type, e.location].filter(Boolean).join(' ').toLowerCase();
        return text.includes(q);
      })
      .slice(0, 5);




    const settingsSections = [
      { label: 'Account', path: '/settings', keywords: 'account name email display profile' },
      { label: 'Categories', path: '/settings', keywords: 'categories gear type' },
      { label: 'Appearance', path: '/settings', keywords: 'appearance theme dark light mode' },
      { label: 'Data', path: '/settings', keywords: 'data export import backup' },
    ];
    const matchedSettings = settingsSections.filter((s) => s.keywords.includes(q));




    return { gear: matchedGear, events: matchedEvents, settings: matchedSettings };
  }, [searchQuery, gearItems, events]);




  const hasSearchResults =
    searchResults.gear.length > 0 ||
    searchResults.events.length > 0 ||
    searchResults.settings.length > 0;
  const showSearchDropdown = searchFocused && searchQuery.trim().length > 0;




  return (
    <section className="home-page ios-theme">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="home-ios-header">
        <div className="home-ios-date">{today}</div>
        <div className="home-ios-title-row">
          <h1 className="home-ios-title">
            {greeting}
            {settings?.displayName ? `, ${settings.displayName}` : ''}
          </h1>
          <button className="home-ios-profile-btn" onClick={() => navigate('/settings')}>
            <div className="home-ios-avatar">
              {settings?.displayName ? settings.displayName.charAt(0).toUpperCase() : 'G'}
            </div>
          </button>
        </div>




        {/* Search Bar */}
        <div className="home-ios-search-container" ref={searchRef}>
          <div className={`home-ios-search-bar${searchFocused ? ' focused' : ''}`}>
            <svg className="home-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search gear, events, settings..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
            />
            {searchQuery && (
              <button
                className="home-search-clear"
                onClick={() => {
                  setSearchQuery('');
                  setSearchFocused(false);
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="12" r="10" opacity="0.25" />
                  <path d="M15 9l-6 6M9 9l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
                </svg>
              </button>
            )}
          </div>




          {/* Dropdown Results */}
          {showSearchDropdown && (
            <div className="home-search-dropdown">
              {!hasSearchResults && (
                <div className="home-search-empty">No results found</div>
              )}
              
              {searchResults.gear.length > 0 && (
                <div className="home-search-section">
                  <div className="home-search-label">Gear</div>
                  {searchResults.gear.map(item => (
                    <button key={item.id} className="home-search-item" onClick={() => navigate(`/catalog/item/${item.id}`)}>
                      <div className="home-search-item-icon gear">
                        {item.photo ? <img src={item.photo} alt="" /> : item.name.charAt(0)}
                      </div>
                      <div className="home-search-item-text">
                        <span className="name">{item.name}</span>
                        <span className="sub">{item.brand} {item.model}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}




              {searchResults.events.length > 0 && (
                <div className="home-search-section">
                  <div className="home-search-label">Events</div>
                  {searchResults.events.map(event => (
                    <button key={event.id} className="home-search-item" onClick={() => navigate(`/events/${event.id}`)}>
                      <div className="home-search-item-icon event">
                        {event.title.charAt(0)}
                      </div>
                      <div className="home-search-item-text">
                        <span className="name">{event.title}</span>
                        <span className="sub">{event.type}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </header>




      {/* ── Scrollable Content ────────────────────────────────────────────── */}
      <div className="home-ios-content">
        
        {/* Up Next Widget */}
        {nextEvent ? (
          <div className="home-ios-widget-large" onClick={() => navigate(`/events/${nextEvent.id}`)}>
            <div className="home-widget-header">
              <div className="home-widget-icon-box">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                </svg>
              </div>
              <div className="home-widget-header-text">
                <span className="home-widget-supertitle">Up Next</span>
                <span className={`home-widget-tag ${urgencyClass}`}>
                  {daysUntil === 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : `In ${daysUntil} days`}
                </span>
              </div>
              <span className="home-widget-chevron">&#8250;</span>
            </div>
            
            <div className="home-widget-body">
              <h3 className="home-widget-title">{nextEvent.title}</h3>
              <p className="home-widget-subtitle">
                {new Date(nextEvent.dateTime!).toLocaleDateString('en-US', {
                  weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
                })}
              </p>
              
              {totalCount > 0 && (
                <div className="home-widget-progress-wrap">
                  <div className="home-progress-bar">
                    <div className="home-progress-fill" style={{ width: `${packingProgress}%` }} />
                  </div>
                  <div className="home-progress-labels">
                    <span>{packedCount} packed</span>
                    <span>{totalCount - packedCount} left</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="home-ios-widget-large empty">
            <p>No upcoming events</p>
            <button className="home-text-btn" onClick={() => navigate('/events?add=1')}>Plan a shoot</button>
          </div>
        )}

        {/* Quick Actions Grid */}
        <div className="home-ios-quick-actions">
          <button className="home-ios-action-card" onClick={() => navigate('/catalog?add=1')}>
            <div className="home-action-icon blue">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </div>
            <span className="home-action-label">Add Gear</span>
          </button>
          
          <button className="home-ios-action-card" onClick={() => navigate('/events?add=1')}>
            <div className="home-action-icon purple">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
            <span className="home-action-label">New Event</span>
          </button>




          <button className="home-ios-action-card" onClick={() => navigate('/assistant')}>
            <div className="home-action-icon indigo">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 3 L14.5 8.5 L20 9.5 L16 13.5 L17 19 L12 16.5 L7 19 L8 13.5 L4 9.5 L9.5 8.5 Z" />
              </svg>
            </div>
            <span className="home-action-label">Ask AI</span>
          </button>
        </div>




        {/* Stats Grid */}
        <div className="home-ios-stats-grid">
          <div className="home-stat-card" onClick={() => navigate('/catalog')}>
            <span className="home-stat-value">{totalItems}</span>
            <span className="home-stat-label">Items</span>
          </div>
          <div className="home-stat-card" onClick={() => navigate('/catalog')}>
            <span className="home-stat-value">{formatMoney(totalValue, settings?.defaultCurrency ?? 'EUR')}</span>
            <span className="home-stat-label">Value</span>
          </div>
          <div className="home-stat-card" onClick={() => navigate('/catalog')}>
            <span className="home-stat-value">{totalCategories}</span>
            <span className="home-stat-label">Types</span>
          </div>
        </div>




        {/* Packing Alerts */}
        {packingAlerts.length > 0 && (
          <div className="home-ios-section">
            <h3 className="home-section-title">Packing Alerts</h3>
            <div className="home-ios-list-group">
              {packingAlerts.map((alert) => (
                <button
                  key={alert.event.id}
                  className="home-ios-list-item"
                  onClick={() => navigate(`/events/${alert.event.id}`)}
                >
                  <div className="home-list-icon alert">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                  </div>
                  <div className="home-list-content">
                    <span className="home-list-title">{alert.event.title}</span>
                    <span className="home-list-subtitle">
                      {alert.days === 0 ? 'Today' : `${alert.days} days away`} • <span className="text-red">{alert.missing} missing</span>
                    </span>
                  </div>
                  <span className="home-list-chevron">&#8250;</span>
                </button>
              ))}
            </div>
          </div>
        )}




        {/* Essentials Carousel */}
        {essentialItems.length > 0 && (
          <div className="home-ios-section">
            <div className="home-section-header">
              <h3 className="home-section-title">Essentials</h3>
              <button className="home-text-btn" onClick={() => navigate('/catalog')}>View All</button>
            </div>
            <div className="home-ios-carousel">
              {essentialItems.map((item) => (
                <button
                  key={item.id}
                  className="home-carousel-item"
                  onClick={() => navigate(`/catalog/item/${item.id}`)}
                >
                  <div className="home-carousel-thumb">
                    {item.photo ? (
                      <img src={item.photo} alt={item.name} />
                    ) : (
                      <div className="placeholder">{item.name.charAt(0)}</div>
                    )}
                  </div>
                  <span className="home-carousel-label">{item.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}




        {/* Recent Items */}
        {recentItems.length > 0 && (
          <div className="home-ios-section">
            <h3 className="home-section-title">Recently Added</h3>
            <div className="home-ios-list-group">
              {recentItems.map((item) => (
                <button
                  key={item.id}
                  className="home-ios-list-item"
                  onClick={() => navigate(`/catalog/item/${item.id}`)}
                >
                  <div className="home-list-img-box">
                    {item.photo ? (
                      <img src={item.photo} alt="" />
                    ) : (
                      <span>{item.name.charAt(0)}</span>
                    )}
                  </div>
                  <div className="home-list-content">
                    <span className="home-list-title">{item.name}</span>
                    <span className="home-list-subtitle">
                      {item.brand} {item.model}
                    </span>
                  </div>
                  <span className="home-list-chevron">&#8250;</span>
                </button>
              ))}
            </div>
          </div>
        )}




        <div className="home-ios-bottom-spacer" />
      </div>
    </section>
  );
}
