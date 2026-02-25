import { useMemo, useEffect, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { EventFormSheet } from '../components/EventFormSheet';
import { getDaysUntilEvent } from '../lib/eventHelpers';
import { lockSheetScroll, unlockSheetScroll } from '../lib/sheetLock';
import { useSheetDismiss } from '../hooks/useSheetDismiss';
import { useSwipeReveal } from '../hooks/useSwipeReveal';
import type { EventItem } from '../types/models';

// ── MonthCalendar ────────────────────────────────────────────────────────────

interface MonthCalendarProps {
  events: EventItem[];
  calYear: number;
  calMonth: number;
  selectedDate: string | null;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onDayClick: (dateKey: string) => void;
}

function MonthCalendar({
  events,
  calYear,
  calMonth,
  selectedDate,
  onPrevMonth,
  onNextMonth,
  onDayClick,
}: MonthCalendarProps) {
  const now           = new Date();
  const todayKey      = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const firstDay       = new Date(calYear, calMonth, 1);
  const startDayOfWeek = firstDay.getDay();
  const daysInMonth    = new Date(calYear, calMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(calYear, calMonth, 0).getDate();

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
    const dateKey = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    cells.push({ day, dateKey, isCurrentMonth: true, eventCount: eventsByDate.get(dateKey) ?? 0 });
  }
  for (let day = 1; day <= 42 - cells.length; day++)
    cells.push({ day, dateKey: null, isCurrentMonth: false, eventCount: 0 });

  const monthLabel = firstDay.toLocaleString('default', { month: 'long', year: 'numeric' });

  return (
    <div className="ev-ios-cal-card">
      {/* Calendar header with prev/next navigation */}
      <div className="ev-ios-cal-header">
        <button className="ev-ios-cal-nav-btn" onClick={onPrevMonth} aria-label="Previous month">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h3 className="ev-ios-cal-title">{monthLabel}</h3>
        <button className="ev-ios-cal-nav-btn" onClick={onNextMonth} aria-label="Next month">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      <div className="ev-ios-cal-grid">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(label => (
          <span key={label} className="ev-ios-cal-day-label">{label}</span>
        ))}
        {cells.map((cell, idx) => {
          const isToday    = cell.isCurrentMonth && cell.dateKey === todayKey;
          const isSelected = cell.isCurrentMonth && cell.dateKey === selectedDate;
          let className = 'ev-ios-cal-cell';
          if (!cell.isCurrentMonth) className += ' muted';
          if (isToday)    className += ' today';
          if (isSelected) className += ' selected';
          if (cell.isCurrentMonth) className += ' clickable';

          return (
            <div
              key={idx}
              className={className}
              onClick={cell.isCurrentMonth && cell.dateKey ? () => onDayClick(cell.dateKey!) : undefined}
            >
              <span className="ev-ios-cal-day-num">{cell.day}</span>
              {cell.eventCount > 0 && (
                <span className="ev-ios-cal-dot-wrap">
                  <span className="ev-ios-cal-dot" />
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── EventsPage ───────────────────────────────────────────────────────────────

export function EventsPage() {
  const events = useLiveQuery(() => db.events.orderBy('updatedAt').reverse().toArray(), [], []);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // ── URL-driven state ───────────────────────────────────────────────────────
  const query           = searchParams.get('q')?.trim() ?? '';
  const quickFilter     = searchParams.get('qf') ?? '';           // '' = all
  const showFilterSheet = searchParams.get('filters') === '1';
  const showCreateForm  = searchParams.get('add') === '1';
  const showCalendar    = searchParams.get('calendar') === '1';

  // ── Local calendar state ───────────────────────────────────────────────────
  const now = new Date();
  const [calYear,  setCalYear]  = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [selectedCalDate, setSelectedCalDate] = useState<string | null>(null);

  // Clear selected date when calendar is closed
  useEffect(() => {
    if (!showCalendar) setSelectedCalDate(null);
  }, [showCalendar]);

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

  function closeCreateForm() { setParam('add', null); }

  function toggleQuickFilter(filter: string) {
    setParam('qf', quickFilter === filter ? null : filter);
  }

  function toggleEventTypeFilter(eventType: string) {
    const current = (searchParams.get('types') ?? '').split(',').filter(Boolean);
    const next = current.includes(eventType)
      ? current.filter(t => t !== eventType)
      : [...current, eventType];
    setParam('types', next.length ? next.join(',') : null);
  }

  function clearAllFilters() {
    const params = new URLSearchParams(searchParams);
    ['types', 'client', 'location', 'sort', 'qf'].forEach(k => params.delete(k));
    navigate({ search: params.toString() }, { replace: true });
  }

  const {
    openId: openSwipeId,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    getTransform,
    getActionsProgress,
    closeAll,
    isDragging,
    isOpen,
  } = useSwipeReveal({ openOffset: 168, openThreshold: 84, closeThreshold: 40 });

  async function deleteEventFromList(eventId: string) {
    closeAll();
    if (!window.confirm('Delete this event?')) return;
    await db.events.delete(eventId);
  }

  async function shareEvent(event: EventItem) {
    closeAll();
    const eventUrl = `${window.location.origin}/events/${event.id}`;

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: event.title,
          text: event.type,
          url: eventUrl,
        });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(eventUrl);
      window.alert('Event link copied to clipboard.');
      return;
    }

    window.prompt('Copy this event link:', eventUrl);
  }

  // ── Calendar month navigation ──────────────────────────────────────────────
  function handlePrevMonth() {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
    else setCalMonth(m => m - 1);
    setSelectedCalDate(null);
  }

  function handleNextMonth() {
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
    else setCalMonth(m => m + 1);
    setSelectedCalDate(null);
  }

  function handleDayClick(dateKey: string) {
    setSelectedCalDate(prev => prev === dateKey ? null : dateKey);
  }

  // ── Counts for filter pills ────────────────────────────────────────────────
  const upcomingCount = events.filter(e => e.dateTime && new Date(e.dateTime) >= now).length;
  const pastCount     = events.filter(e => e.dateTime && new Date(e.dateTime) < now).length;
  const weddingCount  = events.filter(e => e.type === 'Wedding').length;
  const corpCount     = events.filter(e => e.type === 'Corporate Event').length;
  const touristCount  = events.filter(e => e.type === 'Tourist portrait').length;

  // ── Derived values ─────────────────────────────────────────────────────────
  const eventTypes = Array.from(new Set(events.map(e => e.type))).sort();
  const clients    = Array.from(new Set(events.map(e => e.client).filter(Boolean))).sort();
  const locations  = Array.from(new Set(events.map(e => e.location).filter(Boolean))).sort();

  const filtered = useMemo(() => {
    const now = new Date();

    // When a calendar day is selected, override all other filters
    if (selectedCalDate) {
      return events.filter(e => e.dateTime?.slice(0, 10) === selectedCalDate);
    }

    return events.filter(e => {
      const text = [e.title, e.type, e.client, e.location, e.notes].join(' ').toLowerCase();
      if (query && !text.includes(query.toLowerCase())) return false;
      if (selectedEventTypes.length > 0 && !selectedEventTypes.includes(e.type)) return false;
      if (clientFilter   && e.client   !== clientFilter)   return false;
      if (locationFilter && e.location !== locationFilter) return false;
      if (quickFilter === 'upcoming') return e.dateTime ? new Date(e.dateTime) >= now : false;
      if (quickFilter === 'past')     return e.dateTime ? new Date(e.dateTime) <  now : false;
      if (quickFilter === 'wedding')  return e.type === 'Wedding';
      if (quickFilter === 'corporate') return e.type === 'Corporate Event';
      if (quickFilter === 'tourist')  return e.type === 'Tourist portrait';
      return true;
    });
  }, [events, query, selectedEventTypes, clientFilter, locationFilter, quickFilter, selectedCalDate]);

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

  // ── Filter pills definition ────────────────────────────────────────────────
  const filterPills = [
    { key: 'upcoming',  label: 'Upcoming',  count: upcomingCount },
    { key: 'past',      label: 'Past',      count: pastCount     },
    { key: 'wedding',   label: 'Wedding',   count: weddingCount  },
    { key: 'corporate', label: 'Corporate', count: corpCount     },
    { key: 'tourist',   label: 'Tourist',   count: touristCount  },
  ];

  // ── "No events on [date]" label ────────────────────────────────────────────
  const selectedDateLabel = selectedCalDate
    ? new Date(selectedCalDate + 'T00:00:00').toLocaleDateString('default', { weekday: 'long', month: 'long', day: 'numeric' })
    : null;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <section className="events-page ios-theme">

        {/* ── iOS Header ─────────────────────────────────────────────── */}
        <header className="ev-ios-header">
          {/* Row 1: Title + Toolbar pill */}
          <div className="ev-ios-header-top">
            <h1 className="ev-ios-large-title">Events</h1>

            {/* Toolbar pill — calendar + add */}
            <div className="ev-ios-toolbar" role="group" aria-label="Events actions">
              <button
                className={`ev-ios-toolbar-btn${showCalendar ? ' active' : ''}`}
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
                className="ev-ios-toolbar-btn"
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

          {/* Event count */}
          <div className="ev-ios-item-count">
            {sorted.length} event{sorted.length !== 1 ? 's' : ''}
          </div>

          {/* Row 2: Filter circle + scrollable filter pills */}
          <div className="ev-ios-filter-row">
            {/* Fixed filter circle button */}
            <button
              className={`ev-ios-filter-circle-btn${selectedEventTypes.length > 0 || clientFilter || locationFilter ? ' active' : ''}`}
              aria-label="Open event filters"
              onClick={() => setParam('filters', '1')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

            {/* Horizontally scrollable pills */}
            <div className="ev-ios-pills-scroll" role="group" aria-label="Quick event filters">
              {filterPills.map(pill => (
                <button
                  key={pill.key}
                  className={`ev-ios-filter-pill${quickFilter === pill.key ? ' active' : ''}`}
                  onClick={() => toggleQuickFilter(pill.key)}
                >
                  <span className="ev-ios-pill-count">{pill.count}</span>
                  {pill.label}
                </button>
              ))}
            </div>
          </div>
        </header>

        {/* ── Scrollable content area ───────────────────────────────── */}
        <div className="ev-ios-content-scroll page-scroll-area">
          {/* Calendar */}
          {showCalendar && (
            <MonthCalendar
              events={events}
              calYear={calYear}
              calMonth={calMonth}
              selectedDate={selectedCalDate}
              onPrevMonth={handlePrevMonth}
              onNextMonth={handleNextMonth}
              onDayClick={handleDayClick}
            />
          )}

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
          {sorted.length === 0 && events.length > 0 && selectedCalDate && (
            <div className="ev-ios-empty">
              <h3>No events on {selectedDateLabel}</h3>
              <p>Tap a day with a dot to filter events</p>
            </div>
          )}
          {sorted.length === 0 && events.length > 0 && !selectedCalDate && (
            <div className="ev-ios-empty">
              <h3>No events match</h3>
              <p>Try adjusting your search or filters</p>
              <button className="ev-ios-text-btn" onClick={clearAllFilters}>Clear Filters</button>
            </div>
          )}

          {/* Event Cards */}
          {sorted.map(event => {
            const dateObj = event.dateTime ? new Date(event.dateTime) : null;
            const day   = dateObj ? dateObj.getDate() : '';
            const month = dateObj ? dateObj.toLocaleString('default', { month: 'short' }).toUpperCase() : '';
            const packed = event.packingChecklist.filter(i => i.packed).length;
            const total  = event.packingChecklist.length;
            const packingPct = total > 0 ? Math.round((packed / total) * 100) : 0;
            const daysInfo = event.dateTime ? getDaysUntilEvent(event.dateTime) : null;
            const dragging = isDragging(event.id);
            const rowOpen = isOpen(event.id);

            return (
              <div key={event.id} className={`ev-ios-swipe-row${rowOpen ? ' is-open' : ''}`}>
                <div
                  className="ev-ios-swipe-actions"
                  aria-hidden={!rowOpen}
                >
                  <button
                    type="button"
                    className="ev-ios-swipe-btn ev-ios-swipe-btn--share"
                    aria-label="Share event"
                    onClick={() => void shareEvent(event)}
                    style={{
                      transform: `scale(${0.01 + 0.99 * Math.min(1, Math.max(0, (getActionsProgress(event.id) - 0.5) / 0.45))})`,
                      transition: dragging ? 'none' : 'transform 160ms ease',
                    }}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                      <path d="M12 16V4" />
                      <path d="m7 9 5-5 5 5" />
                      <path d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
                    </svg>
                    <span>Share</span>
                  </button>
                  <button
                    type="button"
                    className="ev-ios-swipe-btn ev-ios-swipe-btn--delete"
                    aria-label="Delete event"
                    onClick={() => void deleteEventFromList(event.id)}
                    style={{
                      transform: `scale(${0.01 + 0.99 * Math.min(1, Math.max(0, (getActionsProgress(event.id) - 0.05) / 0.5))})`,
                      transition: dragging ? 'none' : 'transform 160ms ease',
                    }}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                      <path d="M3 6h18" />
                      <path d="M8 6V4h8v2" />
                      <path d="M19 6l-1 14H6L5 6" />
                      <path d="M10 11v6M14 11v6" />
                    </svg>
                    <span>Delete</span>
                  </button>
                </div>

                <Link
                  to={`/events/${event.id}`}
                  className="ev-ios-event-item ev-ios-swipe-foreground"
                  style={{
                    transform: getTransform(event.id),
                    transition: dragging ? 'none' : 'transform 160ms ease',
                  }}
                  onTouchStart={(e) => onTouchStart(event.id, e)}
                  onTouchMove={(e) => onTouchMove(event.id, e)}
                  onTouchEnd={() => onTouchEnd(event.id)}
                  onClick={(e) => {
                    if (openSwipeId !== null) {
                      e.preventDefault();
                      closeAll();
                    }
                  }}
                >
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
                      {event.client   && ` \u00B7 ${event.client}`}
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
                </Link>
              </div>
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
