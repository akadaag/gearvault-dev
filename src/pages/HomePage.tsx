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

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Close search on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchFocused(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Time of day greeting
  const hour = new Date().getHours();
  let greeting = 'Good morning';
  if (hour >= 12 && hour < 17) greeting = 'Good afternoon';
  else if (hour >= 17 && hour < 21) greeting = 'Good evening';
  else if (hour >= 21 || hour < 5) greeting = 'Good night';

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  // Stats
  const totalItems = gearItems?.length ?? 0;
  const totalValue =
    gearItems?.reduce((sum, item) => sum + (item.purchasePrice?.amount ?? 0), 0) ?? 0;
  const totalCategories = categories?.length ?? 0;

  // Next upcoming event
  const now = new Date();
  const upcomingEvents = useMemo(
    () =>
      events
        ?.filter((e) => e.dateTime && new Date(e.dateTime) >= now)
        .sort((a, b) => new Date(a.dateTime!).getTime() - new Date(b.dateTime!).getTime()) ?? [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events],
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
  let urgencyClass = '';
  if (nextEvent?.dateTime) {
    const eventDate = new Date(nextEvent.dateTime);
    daysUntil = Math.ceil((eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntil <= 2) urgencyClass = 'priority-must-have';
    else if (daysUntil <= 7) urgencyClass = 'priority-nice-to-have';
    else urgencyClass = 'priority-nice-to-have';
  }

  // Essential items
  const essentialItems = gearItems?.filter((item) => item.essential) ?? [];

  // Recently added items (last 4)
  const recentItems = useMemo(
    () =>
      [...(gearItems ?? [])]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 4),
    [gearItems],
  );

  // Packing alerts (events within 14 days with incomplete packing)
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
    [upcomingEvents],
  );

  // Search results
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
    <section className="home-page">
      {/* Header */}
      <div className="home-header animate-enter stagger-1">
        <h1 className="home-title">
          {greeting}
          {settings?.displayName ? `, ${settings.displayName}` : ''}
        </h1>
        <p className="home-date">{today}</p>
      </div>

      {/* Search Bar */}
      <div className="home-search-wrap animate-enter stagger-1" ref={searchRef}>
        <div className={`topbar-search-field${searchFocused ? ' focused' : ''}`}>
          <span className="topbar-search-icon">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-4-4" />
            </svg>
          </span>
          <input
            className="topbar-search-input"
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
              aria-label="Clear search"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        {showSearchDropdown && (
          <div className="home-search-results card">
            {!hasSearchResults && (
              <p className="home-search-empty">No results for "{searchQuery}"</p>
            )}

            {searchResults.gear.length > 0 && (
              <div className="home-search-group">
                <p className="home-search-group-label">Gear</p>
                {searchResults.gear.map((item) => (
                  <button
                    key={item.id}
                    className="home-search-result-row"
                    onClick={() => {
                      navigate(`/catalog/item/${item.id}`);
                      setSearchQuery('');
                      setSearchFocused(false);
                    }}
                  >
                    <div className="home-search-result-icon">
                      {item.photo ? (
                        <img src={item.photo} alt="" className="catalog-item-icon-img" />
                      ) : (
                        <div className="catalog-item-icon">{item.name.charAt(0).toUpperCase()}</div>
                      )}
                    </div>
                    <div className="home-search-result-text">
                      <span className="home-search-result-name">{item.name}</span>
                      <span className="home-search-result-sub">
                        {[item.brand, item.model].filter(Boolean).join(' ') ||
                          categories?.find((c) => c.id === item.categoryId)?.name ||
                          'Gear'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {searchResults.events.length > 0 && (
              <div className="home-search-group">
                <p className="home-search-group-label">Events</p>
                {searchResults.events.map((event) => (
                  <button
                    key={event.id}
                    className="home-search-result-row"
                    onClick={() => {
                      navigate(`/events/${event.id}`);
                      setSearchQuery('');
                      setSearchFocused(false);
                    }}
                  >
                    <div className="home-search-result-icon">
                      <div className="catalog-item-icon">{event.title.charAt(0).toUpperCase()}</div>
                    </div>
                    <div className="home-search-result-text">
                      <span className="home-search-result-name">{event.title}</span>
                      <span className="home-search-result-sub">{event.type}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {searchResults.settings.length > 0 && (
              <div className="home-search-group">
                <p className="home-search-group-label">Settings</p>
                {searchResults.settings.map((s) => (
                  <button
                    key={s.label}
                    className="home-search-result-row"
                    onClick={() => {
                      navigate(s.path);
                      setSearchQuery('');
                      setSearchFocused(false);
                    }}
                  >
                    <div className="home-search-result-icon">
                      <div className="catalog-item-icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="3" />
                          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                        </svg>
                      </div>
                    </div>
                    <div className="home-search-result-text">
                      <span className="home-search-result-name">{s.label}</span>
                      <span className="home-search-result-sub">Settings</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Next Event Card */}
      {nextEvent ? (
        <div className="card home-event-card animate-enter stagger-2" onClick={() => navigate(`/events/${nextEvent.id}`)}>
          <div className="home-event-top">
            <div className="home-event-info">
              <strong className="home-event-title">{nextEvent.title}</strong>
              <span className="home-event-meta">
                {nextEvent.dateTime &&
                  new Date(nextEvent.dateTime).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                {nextEvent.location && ` \u00B7 ${nextEvent.location}`}
              </span>
            </div>
            <span className={`pill home-event-days ${urgencyClass}`}>
              {daysUntil === 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : `${daysUntil}d`}
            </span>
          </div>
          {totalCount > 0 && (
            <div className="home-event-packing">
              <div className="progress-track" aria-hidden="true">
                <span
                  className={packedCount === totalCount ? 'complete' : ''}
                  style={{ width: `${packingProgress}%` }}
                />
              </div>
              <span className="home-event-packed-label">
                {packedCount}/{totalCount} packed
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="card home-event-card home-event-empty animate-enter stagger-2">
          <p>No upcoming events</p>
          <button className="text-btn" onClick={() => navigate('/events?add=1')}>
            Plan a shoot
          </button>
        </div>
      )}

      {/* Quick Actions */}
      <div className="home-actions animate-enter stagger-3">
        <button className="home-action" onClick={() => navigate('/catalog?add=1')}>
          <span className="home-action-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </span>
          <span>Add Gear</span>
        </button>
        <button className="home-action" onClick={() => navigate('/events?add=1')}>
          <span className="home-action-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </span>
          <span>New Event</span>
        </button>
        <button className="home-action" onClick={() => navigate('/assistant')}>
          <span className="home-action-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 3 L14.5 8.5 L20 9.5 L16 13.5 L17 19 L12 16.5 L7 19 L8 13.5 L4 9.5 L9.5 8.5 Z" />
            </svg>
          </span>
          <span>Ask AI</span>
        </button>
      </div>

      {/* Essentials */}
      {essentialItems.length > 0 && (
        <div className="home-section animate-enter stagger-4">
          <div className="home-section-header">
            <h3>Essentials</h3>
            <button className="text-btn" onClick={() => navigate('/catalog?qf=essential')}>
              See All
            </button>
          </div>
          <div className="home-essentials">
            {essentialItems.map((item) => (
              <button
                key={item.id}
                className="home-essential"
                onClick={() => navigate(`/catalog/item/${item.id}`)}
              >
                {item.photo ? (
                  <img src={item.photo} alt={item.name} className="home-essential-thumb" />
                ) : (
                  <div className="home-essential-letter">
                    {item.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="home-essential-name">{item.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Packing Alerts */}
      {packingAlerts.length > 0 && (
        <div className="home-section animate-enter stagger-4">
          <div className="home-section-header">
            <h3>Packing Alerts</h3>
          </div>
          {packingAlerts.map((alert) => (
            <button
              key={alert.event.id}
              className="home-alert-row"
              onClick={() => navigate(`/events/${alert.event.id}`)}
            >
              <div className="home-alert-left">
                <span className="home-alert-title">{alert.event.title}</span>
                <span className="home-alert-sub subtle">
                  {alert.days === 0
                    ? 'Today'
                    : alert.days === 1
                      ? 'Tomorrow'
                      : `${alert.days} days`}
                </span>
              </div>
              <span className={`pill ${alert.days <= 2 ? 'priority-must-have' : 'priority-nice-to-have'}`}>
                {alert.missing} needed
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Gear Overview */}
      <div className="home-stats animate-enter stagger-5">
        <div className="home-stat" onClick={() => navigate('/catalog')}>
          <span className="home-stat-val">{totalItems}</span>
          <span className="home-stat-lbl">Items</span>
        </div>
        <div className="home-stat" onClick={() => navigate('/catalog')}>
          <span className="home-stat-val">
            {formatMoney(totalValue, settings?.defaultCurrency ?? 'EUR')}
          </span>
          <span className="home-stat-lbl">Total Value</span>
        </div>
        <div className="home-stat" onClick={() => navigate('/catalog')}>
          <span className="home-stat-val">{totalCategories}</span>
          <span className="home-stat-lbl">Categories</span>
        </div>
      </div>

      {/* Recently Added */}
      {recentItems.length > 0 && (
        <div className="home-section animate-enter stagger-5">
          <div className="home-section-header">
            <h3>Recently Added</h3>
            <button className="text-btn" onClick={() => navigate('/catalog')}>
              View All
            </button>
          </div>
          <div className="home-recent-list">
            {recentItems.map((item) => (
              <button
                key={item.id}
                className="home-recent-row"
                onClick={() => navigate(`/catalog/item/${item.id}`)}
              >
                <div className="catalog-item-icon-wrapper">
                  {item.photo ? (
                    <img src={item.photo} alt={item.name} className="catalog-item-icon-img" />
                  ) : (
                    <div className="catalog-item-icon">{item.name.charAt(0).toUpperCase()}</div>
                  )}
                </div>
                <div className="home-recent-info">
                  <strong>{item.name}</strong>
                  <span className="subtle">
                    {categories?.find((c) => c.id === item.categoryId)?.name ?? 'Gear'}
                    {' \u00B7 '}
                    {new Date(item.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </div>
                <span className="catalog-item-arrow" aria-hidden="true">
                  ›
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
