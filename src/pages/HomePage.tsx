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

  // ── Search State ───────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Click-outside handler (mouse + touch for mobile)
  useEffect(() => {
    function handleOutside(e: MouseEvent | TouchEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchFocused(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, []);

  // ── Greeting & Time ────────────────────────────────────────────────────────
  const hour = new Date().getHours();
  let greeting = 'Good morning';
  if (hour >= 12 && hour < 17) greeting = 'Good afternoon';
  else if (hour >= 17 && hour < 21) greeting = 'Good evening';
  else if (hour >= 21 || hour < 5) greeting = 'Good night';

  // First name only
  const firstName = settings?.displayName?.split(' ')[0] ?? '';

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  // ── Data & Stats ───────────────────────────────────────────────────────────
  const totalItems = gearItems?.length ?? 0;
  const totalValue =
    gearItems?.reduce((sum, item) => sum + (item.purchasePrice?.amount ?? 0), 0) ?? 0;

  // Next upcoming event
  const now = new Date();
  const upcomingEvents = useMemo(
    () =>
      events
        ?.filter((e) => e.dateTime && new Date(e.dateTime) >= now)
        .sort(
          (a, b) =>
            new Date(a.dateTime!).getTime() - new Date(b.dateTime!).getTime()
        ) ?? [],
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
    packingProgress =
      totalCount > 0 ? Math.round((packedCount / totalCount) * 100) : 0;
  }

  // Days until next event
  let daysUntil = 0;
  let urgencyClass = 'later';
  if (nextEvent?.dateTime) {
    const eventDate = new Date(nextEvent.dateTime);
    daysUntil = Math.ceil(
      (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysUntil <= 2) urgencyClass = 'urgent';
    else if (daysUntil <= 7) urgencyClass = 'soon';
  }

  // Essential items
  const essentialItems = gearItems?.filter((item) => item.essential) ?? [];

  // Recently added items (last 5)
  const recentItems = useMemo(
    () =>
      [...(gearItems ?? [])]
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
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
          const days = Math.ceil(
            (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          );
          return { event, missing, days, total, packed };
        })
        .filter((a) => a.missing > 0 && a.days <= 14)
        .sort((a, b) => a.days - b.days),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [upcomingEvents]
  );

  // ── Search Logic ───────────────────────────────────────────────────────────
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return { gear: [], events: [], settings: [] };

    const matchedGear = (gearItems ?? [])
      .filter((item) => {
        const text = [item.name, item.brand, item.model]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return text.includes(q);
      })
      .slice(0, 5);

    const matchedEvents = (events ?? [])
      .filter((e) => {
        const text = [e.title, e.type, e.location]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
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

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <section className="home-page ios-theme">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="home-ios-header">
        <div className="home-ios-date">{today}</div>
        <div className="home-ios-title-row">
          <h1 className="home-ios-title">
            {greeting}
            {firstName ? `, ${firstName}` : ''}
          </h1>
          <button
            className="home-ios-profile-btn"
            onClick={() => navigate('/settings')}
          >
            <div className="home-ios-avatar">
              {firstName ? firstName.charAt(0).toUpperCase() : 'G'}
            </div>
          </button>
        </div>

        {/* Search Bar */}
        <div className="home-ios-search-container" ref={searchRef}>
          <div
            className={`home-ios-search-bar${searchFocused ? ' focused' : ''}`}
          >
            <svg
              className="home-search-icon"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
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
                  <path
                    d="M15 9l-6 6M9 9l6 6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    fill="none"
                  />
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
                  {searchResults.gear.map((item) => (
                    <button
                      key={item.id}
                      className="home-search-item"
                      onClick={() => navigate(`/catalog/item/${item.id}`)}
                    >
                      <div className="home-search-item-icon gear">
                        {item.photo ? (
                          <img src={item.photo} alt="" />
                        ) : (
                          item.name.charAt(0)
                        )}
                      </div>
                      <div className="home-search-item-text">
                        <span className="name">{item.name}</span>
                        <span className="sub">
                          {item.brand} {item.model}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {searchResults.events.length > 0 && (
                <div className="home-search-section">
                  <div className="home-search-label">Events</div>
                  {searchResults.events.map((event) => (
                    <button
                      key={event.id}
                      className="home-search-item"
                      onClick={() => navigate(`/events/${event.id}`)}
                    >
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

              {searchResults.settings.length > 0 && (
                <div className="home-search-section">
                  <div className="home-search-label">Settings</div>
                  {searchResults.settings.map((section) => (
                    <button
                      key={section.label}
                      className="home-search-item"
                      onClick={() => navigate(section.path)}
                    >
                      <div className="home-search-item-icon settings">
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        >
                          <circle cx="12" cy="12" r="3" />
                          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
                        </svg>
                      </div>
                      <div className="home-search-item-text">
                        <span className="name">{section.label}</span>
                        <span className="sub">Settings</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* ── Scrollable Content ────────────────────────────────────────── */}
      <div className="home-ios-content">
        {/* Hero Card — Next Event */}
        {nextEvent ? (
          <div
            className="home-ios-hero-card"
            onClick={() => navigate(`/events/${nextEvent.id}`)}
          >
            <div className="home-ios-hero-top">
              <span className="home-ios-hero-label">Up Next</span>
              <span className={`home-ios-hero-badge ${urgencyClass}`}>
                {daysUntil === 0
                  ? 'Today'
                  : daysUntil === 1
                    ? 'Tomorrow'
                    : `In ${daysUntil} days`}
              </span>
            </div>
            <h3 className="home-ios-hero-title">{nextEvent.title}</h3>
            <p className="home-ios-hero-subtitle">
              {new Date(nextEvent.dateTime!).toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
              {nextEvent.location ? ` · ${nextEvent.location}` : ''}
            </p>
            {totalCount > 0 && (
              <div className="home-ios-hero-progress-wrap">
                <div className="home-ios-hero-progress-bar">
                  <div
                    className="home-ios-hero-progress-fill"
                    style={{ width: `${packingProgress}%` }}
                  />
                </div>
                <div className="home-ios-hero-progress-labels">
                  <span>{packedCount} packed</span>
                  <span>{totalCount - packedCount} left</span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="home-ios-hero-card empty">
            <p className="home-ios-hero-empty-text">No upcoming events</p>
            <button
              className="home-ios-hero-cta"
              onClick={() => navigate('/events?add=1')}
            >
              Plan a Shoot
            </button>
          </div>
        )}

        {/* Bento Grid */}
        <div className="home-ios-bento-grid">
          {/* Value Card — left, spans 2 rows */}
          <div
            className="home-ios-value-card"
            onClick={() => navigate('/catalog')}
          >
            <span className="home-ios-value-label">Total Value</span>
            <span className="home-ios-value-amount">
              {formatMoney(totalValue, settings?.defaultCurrency ?? 'EUR')}
            </span>
            <span className="home-ios-value-count">
              {totalItems} {totalItems === 1 ? 'item' : 'items'}
            </span>
          </div>

          {/* Action Buttons — right column */}
          <button
            className="home-ios-action-btn"
            onClick={() => navigate('/catalog?add=1')}
          >
            <div className="home-ios-action-icon blue">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </div>
            <span className="home-ios-action-btn-label">Add Gear</span>
          </button>

          <button
            className="home-ios-action-btn"
            onClick={() => navigate('/events?add=1')}
          >
            <div className="home-ios-action-icon orange">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
            <span className="home-ios-action-btn-label">New Event</span>
          </button>

          <button
            className="home-ios-action-btn"
            onClick={() => navigate('/assistant')}
          >
            <div className="home-ios-action-icon purple">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M12 3 L14.5 8.5 L20 9.5 L16 13.5 L17 19 L12 16.5 L7 19 L8 13.5 L4 9.5 L9.5 8.5 Z" />
              </svg>
            </div>
            <span className="home-ios-action-btn-label">Ask AI</span>
          </button>
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
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                  </div>
                  <div className="home-list-content">
                    <span className="home-list-title">
                      {alert.event.title}
                    </span>
                    <span className="home-list-subtitle">
                      {alert.days === 0 ? 'Today' : `${alert.days} days away`}{' '}
                      ·{' '}
                      <span className="text-red">
                        {alert.missing} missing
                      </span>
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
              <button
                className="home-text-btn"
                onClick={() => navigate('/catalog?qf=essential')}
              >
                View All
              </button>
            </div>
            <div className="home-ios-carousel">
              {essentialItems.map((item) => (
                <div
                  key={item.id}
                  className="home-ios-carousel-card"
                  onClick={() => navigate(`/catalog/item/${item.id}`)}
                >
                  <div className="home-ios-carousel-thumb">
                    {item.photo ? (
                      <img src={item.photo} alt={item.name} />
                    ) : (
                      <div className="placeholder">
                        {item.name.charAt(0)}
                      </div>
                    )}
                  </div>
                  <div className="home-ios-carousel-info">
                    <span className="home-ios-carousel-name">
                      {item.name}
                    </span>
                    {item.brand && (
                      <span className="home-ios-carousel-sub">
                        {item.brand}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recently Added Carousel */}
        {recentItems.length > 0 && (
          <div className="home-ios-section">
            <div className="home-section-header">
              <h3 className="home-section-title">Recently Added</h3>
              <button
                className="home-text-btn"
                onClick={() => navigate('/catalog')}
              >
                View All
              </button>
            </div>
            <div className="home-ios-carousel">
              {recentItems.map((item) => (
                <div
                  key={item.id}
                  className="home-ios-carousel-card"
                  onClick={() => navigate(`/catalog/item/${item.id}`)}
                >
                  <div className="home-ios-carousel-thumb">
                    {item.photo ? (
                      <img src={item.photo} alt={item.name} />
                    ) : (
                      <div className="placeholder">
                        {item.name.charAt(0)}
                      </div>
                    )}
                  </div>
                  <div className="home-ios-carousel-info">
                    <span className="home-ios-carousel-name">
                      {item.name}
                    </span>
                    {item.brand && (
                      <span className="home-ios-carousel-sub">
                        {item.brand}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="home-ios-bottom-spacer" />
      </div>
    </section>
  );
}
