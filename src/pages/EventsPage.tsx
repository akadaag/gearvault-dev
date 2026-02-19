import { useMemo, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { EventFormSheet } from '../components/EventFormSheet';
import { getDaysUntilEvent } from '../lib/eventHelpers';
import { lockSheetScroll, unlockSheetScroll } from '../lib/sheetLock';
import { useSheetDismiss } from '../hooks/useSheetDismiss';

export function EventsPage() {
  const events = useLiveQuery(() => db.events.orderBy('updatedAt').reverse().toArray(), [], []);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // ── URL-driven state ───────────────────────────────────────────────────────
  const query          = searchParams.get('q')?.trim() ?? '';
  const quickFilter    = searchParams.get('qf') ?? 'upcoming';
  const showFilterSheet = searchParams.get('filters') === '1';
  const showCreateForm  = searchParams.get('add') === '1';
  const showCalendar    = searchParams.get('calendar') === '1';

  // ── Closing animation for filter sheet ─────────────────────────────────────
  const { closing: closingFilter, dismiss: dismissFilter, onAnimationEnd: onFilterAnimEnd } = useSheetDismiss(() => {
    const params = new URLSearchParams(searchParams);
    params.delete('filters');
    navigate({ search: params.toString() }, { replace: true });
  });

  const selectedEventTypes = (searchParams.get('types') ?? '').split(',').filter(Boolean);
  const clientFilter   = searchParams.get('client') ?? '';
  const locationFilter = searchParams.get('location') ?? '';
  const sortBy = (searchParams.get('sort') as 'date' | 'title' | 'client' | 'newest') || 'date';

  // ── Sheet scroll lock ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!showFilterSheet) return;
    lockSheetScroll();
    return () => unlockSheetScroll();
  }, [showFilterSheet]);

  // ── URL helpers ────────────────────────────────────────────────────────────
  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams);
    if (value === null) params.delete(key);
    else params.set(key, value);
    navigate({ search: params.toString() }, { replace: true });
  }

  // closeFilterSheet replaced by dismissFilter for animated close
  function closeCreateForm()  { setParam('add', null); }

  function toggleEventTypeFilter(eventType: string) {
    const current = (searchParams.get('types') ?? '').split(',').filter(Boolean);
    const next = current.includes(eventType)
      ? current.filter(t => t !== eventType)
      : [...current, eventType];
    setParam('types', next.length ? next.join(',') : null);
  }

  function clearAllFilters() {
    const params = new URLSearchParams(searchParams);
    ['types', 'client', 'location', 'sort'].forEach(k => params.delete(k));
    navigate({ search: params.toString() }, { replace: true });
  }

  // ── Derived values ─────────────────────────────────────────────────────────
  const eventTypes = Array.from(new Set(events.map(e => e.type))).sort();
  const clients    = Array.from(new Set(events.map(e => e.client).filter(Boolean))).sort();
  const locations  = Array.from(new Set(events.map(e => e.location).filter(Boolean))).sort();

  const now = new Date();
  const upcomingCount = events.filter(e => e.dateTime && new Date(e.dateTime) >= now).length;
  const pastCount = events.filter(e => e.dateTime && new Date(e.dateTime) < now).length;

  const filtered = useMemo(() => {
    const now = new Date();
    return events.filter(e => {
      const text = [e.title, e.type, e.client, e.location, e.notes].join(' ').toLowerCase();
      if (query && !text.includes(query.toLowerCase())) return false;
      if (selectedEventTypes.length > 0 && !selectedEventTypes.includes(e.type)) return false;
      if (clientFilter   && e.client   !== clientFilter)   return false;
      if (locationFilter && e.location !== locationFilter) return false;
      if (quickFilter === 'upcoming') return e.dateTime ? new Date(e.dateTime) >= now : false;
      if (quickFilter === 'past')     return e.dateTime ? new Date(e.dateTime) <  now : false;
      return true;
    });
  }, [events, query, selectedEventTypes, clientFilter, locationFilter, quickFilter]);

  const sorted = useMemo(() => {
    const items = [...filtered];
    if (sortBy === 'title')  items.sort((a, b) => a.title.localeCompare(b.title));
    else if (sortBy === 'client')  items.sort((a, b) => (a.client ?? '').localeCompare(b.client ?? ''));
    else if (sortBy === 'newest')  items.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    else items.sort((a, b) => {
      if (!a.dateTime && !b.dateTime) return 0;
      if (!a.dateTime) return 1;
      if (!b.dateTime) return -1;
      return new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime();
    });
    return items;
  }, [filtered, sortBy]);

  // ── Month calendar ─────────────────────────────────────────────────────────
  function MonthCalendar() {
    const now   = new Date();
    const year  = now.getFullYear();
    const month = now.getMonth();
    const firstDay       = new Date(year, month, 1);
    const startDayOfWeek = firstDay.getDay();
    const daysInMonth    = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    const todayDate = now.getDate();

    const eventsByDate = new Map<string, number>();
    events.forEach(event => {
      if (event.dateTime) {
        const key = event.dateTime.slice(0, 10);
        eventsByDate.set(key, (eventsByDate.get(key) ?? 0) + 1);
      }
    });

    const cells: { day: number; dateKey: string | null; isCurrentMonth: boolean; eventCount: number }[] = [];
    for (let i = startDayOfWeek - 1; i >= 0; i--)
      cells.push({ day: daysInPrevMonth - i, dateKey: null, isCurrentMonth: false, eventCount: 0 });
    for (let day = 1; day <= daysInMonth; day++) {
      const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      cells.push({ day, dateKey, isCurrentMonth: true, eventCount: eventsByDate.get(dateKey) ?? 0 });
    }
    for (let day = 1; day <= 42 - cells.length; day++)
      cells.push({ day, dateKey: null, isCurrentMonth: false, eventCount: 0 });

    return (
      <div className="ios-glass-card ev-ios-cal-card">
        <h3 className="ev-ios-cal-title">
          {firstDay.toLocaleString('default', { month: 'long', year: 'numeric' })}
        </h3>
        <div className="ev-ios-cal-grid">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(label => (
            <span key={label} className="ev-ios-cal-day-label">{label}</span>
          ))}
          {cells.map((cell, idx) => (
            <div
              key={idx}
              className={`ev-ios-cal-cell${!cell.isCurrentMonth ? ' muted' : ''}${cell.isCurrentMonth && cell.day === todayDate ? ' today' : ''}`}
            >
              <span className="ev-ios-cal-day-num">{cell.day}</span>
              {cell.eventCount > 0 && (
                <span className="ev-ios-cal-dot-wrap">
                  <span className="ev-ios-cal-dot" />
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <section className="events-page ios-theme">
        {/* iOS Header */}
        <header className="ev-ios-header">
          <div className="ev-ios-header-top">
            <h1 className="ev-ios-large-title">Events</h1>
            <div className="ev-ios-header-actions">
              <button
                className={`ev-ios-icon-btn${showCalendar ? ' active' : ''}`}
                onClick={() => setParam('calendar', showCalendar ? null : '1')}
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
                className="ev-ios-icon-btn primary"
                onClick={() => setParam('add', '1')}
                aria-label="Create new event"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Search Bar */}
          {/* Quick Filter Pills */}
          <div className="ev-ios-filter-scroll" role="group" aria-label="Quick event filters">
            <button
              className={`ev-ios-filter-pill${quickFilter === 'upcoming' ? ' active' : ''}`}
              onClick={() => setParam('qf', 'upcoming')}
            >
              Upcoming
              <span className="ev-ios-pill-count">{upcomingCount}</span>
            </button>
            <button
              className={`ev-ios-filter-pill${quickFilter === 'past' ? ' active' : ''}`}
              onClick={() => setParam('qf', 'past')}
            >
              Past
              <span className="ev-ios-pill-count">{pastCount}</span>
            </button>
            <button
              className={`ev-ios-filter-pill${quickFilter === 'all' ? ' active' : ''}`}
              onClick={() => setParam('qf', 'all')}
            >
              All
              <span className="ev-ios-pill-count">{events.length}</span>
            </button>

            <span className="ev-ios-filter-divider" />

            <button
              className={`ev-ios-filter-icon-btn${selectedEventTypes.length > 0 || clientFilter || locationFilter ? ' active' : ''}`}
              aria-label="Open event filters"
              onClick={() => setParam('filters', '1')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
          </div>

          <div className="ev-ios-item-count">
            {sorted.length} event{sorted.length !== 1 ? 's' : ''}
          </div>
        </header>

        {/* Scrollable content area */}
        <div className="ev-ios-content-scroll page-scroll-area">
          {/* Calendar */}
          {showCalendar && <MonthCalendar />}

          {/* Empty states */}
          {sorted.length === 0 && events.length === 0 && (
            <div className="ev-ios-empty">
              <div className="ev-ios-empty-icon" aria-hidden="true">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="5" width="18" height="16" rx="2" ry="2" />
                  <path d="M8 3v4" />
                  <path d="M16 3v4" />
                  <path d="M3 10h18" />
                </svg>
              </div>
              <h3>No Events Yet</h3>
              <p>Tap + to create your first event</p>
            </div>
          )}
          {sorted.length === 0 && events.length > 0 && (
            <div className="ev-ios-empty">
              <h3>No events match</h3>
              <p>Try adjusting your search or filters</p>
              <button className="ev-ios-text-btn" onClick={clearAllFilters}>Clear Filters</button>
            </div>
          )}

          {/* Event Cards */}
          {sorted.map(event => {
            const dateObj = event.dateTime ? new Date(event.dateTime) : null;
            const day = dateObj ? dateObj.getDate() : '';
            const month = dateObj ? dateObj.toLocaleString('default', { month: 'short' }).toUpperCase() : '';
            const packed = event.packingChecklist.filter(i => i.packed).length;
            const total  = event.packingChecklist.length;
            const packingPct = total > 0 ? Math.round((packed / total) * 100) : 0;
            const daysInfo = event.dateTime ? getDaysUntilEvent(event.dateTime) : null;

            return (
              <Link key={event.id} to={`/events/${event.id}`} className="ios-glass-card ev-ios-event-item">
                {/* Date badge */}
                {dateObj ? (
                  <div className="ev-ios-date-badge">
                    <span className="ev-ios-date-month">{month}</span>
                    <span className="ev-ios-date-day">{day}</span>
                  </div>
                ) : (
                  <div className="ev-ios-date-badge placeholder">?</div>
                )}

                {/* Info */}
                <div className="ev-ios-event-info">
                  <div className="ev-ios-event-row-top">
                    <span className="ev-ios-event-title">{event.title}</span>
                    {daysInfo && (
                      <span className={`ev-ios-urgency-tag ${daysInfo.colorClass}`}>
                        {daysInfo.text}
                      </span>
                    )}
                  </div>
                  <div className="ev-ios-event-meta">
                    {event.type}
                    {event.client && ` \u00B7 ${event.client}`}
                    {event.location && ` \u00B7 ${event.location}`}
                  </div>
                  {total > 0 && (
                    <div className="ev-ios-event-packing">
                      <div className="ev-ios-packing-bar" aria-hidden="true">
                        <span
                          className={`ev-ios-packing-fill${packed === total ? ' complete' : ''}`}
                          style={{ width: `${packingPct}%` }}
                        />
                      </div>
                      <span className="ev-ios-packing-label">{packed}/{total} packed</span>
                    </div>
                  )}
                </div>

                {/* Chevron */}
                <span className="ev-ios-chevron" aria-hidden="true">&#8250;</span>
              </Link>
            );
          })}

          {/* Bottom spacer for nav bar */}
          <div className="ev-ios-bottom-spacer" />
        </div>
      </section>

      {/* ── Filter Sheet ─────────────────────────────────────────────── */}
      {showFilterSheet && (
        <>
          <div className={`ios-sheet-backdrop${closingFilter ? ' closing' : ''}`} onClick={dismissFilter} />
          <div className={`ios-sheet-modal${closingFilter ? ' closing' : ''}`} aria-label="Event filters" onAnimationEnd={onFilterAnimEnd}>
            <div className="ios-sheet-header ios-sheet-header--icon">
              <button className="ios-sheet-pill-btn" onClick={clearAllFilters}>Reset</button>
              <h3 className="ios-sheet-title">Filters</h3>
              <button className="ios-sheet-pill-btn" onClick={dismissFilter}>Done</button>
            </div>

            <div className="ios-sheet-content">
              <p className="ios-form-group-title">Event Types</p>
              <div className="ios-form-group">
                {eventTypes.map(eventType => (
                  <label className="ios-form-row" key={eventType}>
                    <span className="ios-form-label">{eventType}</span>
                    <input
                      type="checkbox"
                      className="ios-switch"
                      checked={selectedEventTypes.includes(eventType)}
                      onChange={() => toggleEventTypeFilter(eventType)}
                    />
                  </label>
                ))}
              </div>

              <p className="ios-form-group-title">Filters</p>
              <div className="ios-form-group">
                <label className="ios-form-row">
                  <span className="ios-form-label">Client</span>
                  <select
                    className="ios-form-input"
                    value={clientFilter}
                    onChange={e => setParam('client', e.target.value || null)}
                    aria-label="Filter by client"
                  >
                    <option value="">All clients</option>
                    {clients.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label className="ios-form-row">
                  <span className="ios-form-label">Location</span>
                  <select
                    className="ios-form-input"
                    value={locationFilter}
                    onChange={e => setParam('location', e.target.value || null)}
                    aria-label="Filter by location"
                  >
                    <option value="">All locations</option>
                    {locations.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </label>
              </div>

              <p className="ios-form-group-title">Sort By</p>
              <div className="ios-form-group">
                <label className="ios-form-row">
                  <span className="ios-form-label">Sort</span>
                  <select
                    className="ios-form-input"
                    value={sortBy}
                    onChange={e => setParam('sort', e.target.value)}
                    aria-label="Sort events"
                  >
                    <option value="date">Date</option>
                    <option value="title">Title</option>
                    <option value="client">Client</option>
                    <option value="newest">Recently Updated</option>
                  </select>
                </label>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Create Event Sheet ─────────────────────────────────────────── */}
      {showCreateForm && (
        <EventFormSheet mode="create" onClose={closeCreateForm} />
      )}
    </>
  );
}
