import { useMemo, useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { eventSchema } from '../lib/validators';
import { makeId } from '../lib/ids';
import type { EventItem } from '../types/models';

// SVG Icons for UI consistency
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

const calendarIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const magnifyingGlassIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-4-4" />
  </svg>
);

// Event type options matching user requirements
const EVENT_TYPE_OPTIONS = [
  'Wedding',
  'Corporate Event',
  'Engagement',
  'Tourist portrait',
  'Sport event',
  'Studio session',
  'Documentary',
  'Commercial shoot',
];

export function EventsPage() {
  const events = useLiveQuery(() => db.events.orderBy('updatedAt').reverse().toArray(), [], []);
  const [searchParams, setSearchParams] = useSearchParams();

  // URL-based state
  const query = searchParams.get('q')?.trim() ?? '';
  const quickFilter = searchParams.get('qf') ?? 'upcoming';
  const showFilterSheet = searchParams.get('filters') === '1';

  // Filter state is now sourced from URL params, not useState
  const selectedEventTypes = (searchParams.get('types') ?? '').split(',').filter(Boolean);
  const clientFilter = searchParams.get('client') ?? '';
  const locationFilter = searchParams.get('location') ?? '';
  const sortBy = (searchParams.get('sort') as 'date' | 'title' | 'client' | 'newest') || 'date';
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [draft, setDraft] = useState({
    title: '',
    type: EVENT_TYPE_OPTIONS[0],
    dateTime: '',
    location: '',
    client: '',
    notes: '',
  });
  const [error, setError] = useState('');

  // URL param helpers
  function updateSearchParams(updater: (params: URLSearchParams) => void) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      updater(next);
      return next;
    });
  }
  function openFilterSheet() {
    updateSearchParams(params => params.set('filters', '1'));
  }
  function closeFilterSheet() {
    updateSearchParams(params => params.delete('filters'));
  }
  function setQuickFilterParam(filter: 'upcoming' | 'past' | 'all') {
    updateSearchParams(params => params.set('qf', filter));
  }
  function handleSearch(value: string) {
    updateSearchParams(params => {
      if (value.trim()) {
        params.set('q', value.trim());
      } else {
        params.delete('q');
      }
    });
  }
  function toggleEventTypeFilter(eventType: string) {
    const current = (searchParams.get('types') ?? '').split(',').filter(Boolean);
    const next = current.includes(eventType)
      ? current.filter(t => t !== eventType)
      : [...current, eventType];
    updateSearchParams(params => {
      if (next.length > 0) params.set('types', next.join(','));
      else params.delete('types');
    });
  }
  function clearAllFilters() {
    updateSearchParams(params => {
      params.delete('types');
      params.delete('client');
      params.delete('location');
      params.delete('sort');
    });
  }
  // For disabling scroll when sheet is open (matching catalog implementation)
  function lockSheetScroll() { document.body.classList.add('sheet-open'); }
  function unlockSheetScroll() { document.body.classList.remove('sheet-open'); }
  useEffect(() => {
    const anySheetOpen = showFilterSheet || showCreateForm || showCalendar;
    if (!anySheetOpen) return;
    lockSheetScroll();
    return () => unlockSheetScroll();
  }, [showFilterSheet, showCreateForm, showCalendar]);
  // List, counts, and helper values
  const now = new Date();
  const eventTypes = Array.from(new Set(events.map((e) => e.type))).sort();
  const clients = Array.from(new Set(events.map((e) => e.client).filter(Boolean))).sort();
  const locations = Array.from(new Set(events.map((e) => e.location).filter(Boolean))).sort();
  const upcomingCount = events.filter(e => e.dateTime && new Date(e.dateTime) >= now).length;
  const pastCount = events.filter(e => e.dateTime && new Date(e.dateTime) < now).length;
  const hasTypeFilters = selectedEventTypes.length > 0;
  const isFilterActive = hasTypeFilters || clientFilter || locationFilter || quickFilter !== 'upcoming';
  function getCounterText() {
    const count = sorted.length;
    if (quickFilter === 'upcoming') return `${count} upcoming event${count === 1 ? '' : 's'}`;
    if (quickFilter === 'past') return `${count} past event${count === 1 ? '' : 's'}`;
    return `${count} event${count === 1 ? '' : 's'}`;
  }
  // Filtering logic with quick filter, event type, client/location, and search
  const filtered = useMemo(() => {
    const now = new Date();
    return events.filter(e => {
      // Text search filter
      const text = [e.title, e.type, e.client, e.location, e.notes].join(' ').toLowerCase();
      if (query && !text.includes(query.toLowerCase())) return false;
      // Event type filter
      if (selectedEventTypes.length > 0 && !selectedEventTypes.includes(e.type)) return false;
      if (clientFilter && e.client !== clientFilter) return false;
      if (locationFilter && e.location !== locationFilter) return false;
      // Quick filter logic
      if (quickFilter === 'upcoming') {
        return e.dateTime ? new Date(e.dateTime) >= now : false;
      } else if (quickFilter === 'past') {
        return e.dateTime ? new Date(e.dateTime) < now : false;
      }
      // quickFilter === 'all'
      return true;
    });
  }, [events, query, selectedEventTypes, clientFilter, locationFilter, quickFilter]);
  // Sorted list based on sortBy
  const sorted = useMemo(() => {
    const items = [...filtered];
    if (sortBy === 'title') {
      items.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortBy === 'client') {
      items.sort((a, b) => (a.client ?? '').localeCompare(b.client ?? ''));
    } else if (sortBy === 'newest') {
      items.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    } else { // sortBy === 'date'
      items.sort((a, b) => {
        if (!a.dateTime && !b.dateTime) return 0;
        if (!a.dateTime) return 1;
        if (!b.dateTime) return -1;
        return new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime();
      });
    }
    return items;
  }, [filtered, sortBy]);
  async function createEvent() {
    setError('');
    const parsed = eventSchema.safeParse({ title: draft.title, type: draft.type });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid event');
      return;
    }
    const now = new Date().toISOString();
    const row: EventItem = {
      id: makeId(),
      title: draft.title,
      type: draft.type,
      dateTime: draft.dateTime || undefined,
      location: draft.location || undefined,
      client: draft.client || undefined,
      notes: draft.notes || undefined,
      packingChecklist: [],
      missingItems: [],
      createdBy: 'manual',
      createdAt: now,
      updatedAt: now,
    };
    await db.events.add(row);
    setDraft({ title: '', type: EVENT_TYPE_OPTIONS[0], dateTime: '', location: '', client: '', notes: '' });
    setShowCreateForm(false);
  }

  // Month calendar component with event indicators
  function MonthCalendar() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const firstDay = new Date(year, month, 1);
    const startDayOfWeek = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    // Create a map of dates to event count for quick lookup
    const eventsByDate = new Map<string, number>();
    events.forEach((event) => {
      if (event.dateTime) {
        const dateKey = event.dateTime.slice(0, 10);
        eventsByDate.set(dateKey, (eventsByDate.get(dateKey) ?? 0) + 1);
      }
    });

    // Generate calendar cells
    const cells = [];

    // Previous month's trailing days
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const day = daysInPrevMonth - i;
      cells.push({
        day,
        dateKey: null,
        isCurrentMonth: false,
        eventCount: 0,
      });
    }

    // Current month's days
    for (let day = 1; day <= daysInMonth; day++) {
      const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const eventCount = eventsByDate.get(dateKey) ?? 0;
      cells.push({
        day,
        dateKey,
        isCurrentMonth: true,
        eventCount,
      });
    }

    // Next month's leading days
    const remainingCells = 42 - cells.length;
    for (let day = 1; day <= remainingCells; day++) {
      cells.push({
        day,
        dateKey: null,
        isCurrentMonth: false,
        eventCount: 0,
      });
    }

    const monthName = firstDay.toLocaleString('default', { month: 'long', year: 'numeric' });

    return (
      <div className="card stack-sm">
        <h3>{monthName}</h3>
        <div className="calendar-grid">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label) => (
            <strong key={label} style={{ fontSize: '0.8125rem', textAlign: 'center', padding: '0.375rem 0' }}>
              {label}
            </strong>
          ))}
          {cells.map((cell, idx) => (
            <div key={idx} className="calendar-cell">
              {cell.isCurrentMonth ? (
                <>
                  <strong style={{ display: 'block', textAlign: 'center' }}>{cell.day}</strong>
                  {cell.eventCount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.25rem' }}>
                      <div className="calendar-event-dot" />
                    </div>
                  )}
                </>
              ) : (
                <span style={{ color: 'var(--border)' }}>{cell.day}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <section className="stack-lg">
      {/* New Topbar Header for Events */}
      <header className="topbar topbar-events">
        <div className="topbar-inner">
          <div className="topbar-primary-row">
            <div className="topbar-title">
              <h1 className="catalog-page-title">Events</h1>
              <p className="subtle topbar-item-count">{getCounterText()}</p>
            </div>
            <div className="topbar-actions">
              {/* Filter Button */}
              <button
                className={`topbar-filter-pill${isFilterActive ? ' is-active' : ''}`}
                aria-label="Open filters"
                aria-pressed={!!isFilterActive}
                onClick={openFilterSheet}
              >
                <span className="catalog-filter-pill-icon" aria-hidden="true">{filterIcon}</span>
                Filters
                {isFilterActive && <span className="topbar-filter-pill-dot" aria-hidden="true" />}
              </button>
              {/* Calendar Button */}
              <button 
                className="topbar-add-btn" 
                aria-label="Toggle calendar view" 
                onClick={() => setShowCalendar((prev) => !prev)}
              >
                {calendarIcon}
              </button>
              {/* Add Event Button */}
              <button 
                className="topbar-add-btn" 
                aria-label="Create new event" 
                onClick={() => setShowCreateForm((prev) => !prev)}
              >
                {addIcon}
              </button>
            </div>
          </div>
          {/* Search and Quick Filters */}
          <div className="topbar-catalog-controls">
            <div className="topbar-search-row">
              <div className="topbar-search-field">
                <span className="topbar-search-icon">{searchIcon}</span>
                <input
                  className="topbar-search-input"
                  aria-label="Search events"
                  placeholder="Search events..."
                  value={query}
                  onChange={(e) => handleSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="catalog-quick-filters" role="group" aria-label="Quick event filters">
              <button
                className={`catalog-quick-pill${quickFilter === 'upcoming' ? ' is-active' : ''}`}
                onClick={() => setQuickFilterParam('upcoming')}
              >
                Upcoming
                <span className="catalog-quick-pill-count">{upcomingCount}</span>
              </button>
              <button
                className={`catalog-quick-pill${quickFilter === 'past' ? ' is-active' : ''}`}
                onClick={() => setQuickFilterParam('past')}
              >
                Past
                <span className="catalog-quick-pill-count">{pastCount}</span>
              </button>
              <button
                className={`catalog-quick-pill${quickFilter === 'all' ? ' is-active' : ''}`}
                onClick={() => setQuickFilterParam('all')}
              >
                All
                <span className="catalog-quick-pill-count">{events.length}</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Filter Sheet Modal */}
      {showFilterSheet && (
        <>
          <button className="sheet-overlay" aria-label="Close filters" onClick={closeFilterSheet} />
          <aside className="filter-sheet card stack-md" aria-label="Event filters">
            <div className="row between">
              <h3>Filters</h3>
              <button className="ghost" onClick={closeFilterSheet}>Done</button>
            </div>
            {/* Event Type Checkboxes */}
            <div className="stack-sm">
              <strong>Event Types</strong>
              <div className="catalog-filter-checklist">
                {eventTypes.map((eventType) => {
                  const checked = selectedEventTypes.includes(eventType);
                  return (
                    <label className="checkbox-inline" key={eventType}>
                      <input 
                        type="checkbox" 
                        checked={checked} 
                        onChange={() => toggleEventTypeFilter(eventType)} 
                      />
                      {eventType}
                    </label>
                  );
                })}
              </div>
            </div>
            {/* Additional Filters */}
            <div className="grid filters">
              {/* Client Filter */}
              <select 
                value={clientFilter} 
                onChange={(e) => updateSearchParams(params => { e.target.value ? params.set('client', e.target.value) : params.delete('client') })} 
                aria-label="Filter by client"
              >
                <option value="">All clients</option>
                {clients.map((client) => (
                  <option key={client} value={client}>{client}</option>
                ))}
              </select>
              {/* Location Filter */}
              <select 
                value={locationFilter} 
                onChange={(e) => updateSearchParams(params => { e.target.value ? params.set('location', e.target.value) : params.delete('location') })} 
                aria-label="Filter by location"
              >
                <option value="">All locations</option>
                {locations.map((location) => (
                  <option key={location} value={location}>{location}</option>
                ))}
              </select>
              {/* Sort By */}
              <select 
                value={sortBy} 
                onChange={(e) => updateSearchParams(params => { params.set('sort', e.target.value) })} 
                aria-label="Sort events"
              >
                <option value="date">Sort: Date</option>
                <option value="title">Sort: Title</option>
                <option value="client">Sort: Client</option>
                <option value="newest">Sort: Recently Updated</option>
              </select>
            </div>
            {/* Clear Filters Button */}
            <button className="ghost" onClick={clearAllFilters}>Clear all filters</button>
          </aside>
        </>
      )}
      {/* Create Event Sheet/Modal*/}
      {showCreateForm && (
        <>
          <button className="sheet-overlay" aria-label="Close create event" onClick={() => setShowCreateForm(false)} />
          <aside className="filter-sheet card maintenance-add-sheet event-create-sheet" aria-label="Create new event">
            <div className="maintenance-sheet-header">
              <h3>New Event</h3>
              <button
                className="sheet-close-btn"
                onClick={() => setShowCreateForm(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="maintenance-sheet-body stack-sm">
              {/* Title */}
              <label className="gear-field-block">
                <span>Event Title*</span>
                <input
                  type="text"
                  placeholder="e.g., Smith Wedding"
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                />
              </label>

              {/* Event Type & Date in two-column layout */}
              <div className="gear-form-two-col">
                <label className="gear-field-block">
                  <span>Event Type*</span>
                  <select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}>
                    {EVENT_TYPE_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>

                <label className="gear-field-block">
                  <span>Date & Time</span>
                  <input
                    type="datetime-local"
                    value={draft.dateTime}
                    onChange={(e) => setDraft({ ...draft, dateTime: e.target.value })}
                  />
                </label>
              </div>

              {/* Location & Client in two-column layout */}
              <div className="gear-form-two-col">
                <label className="gear-field-block">
                  <span>Location</span>
                  <input
                    type="text"
                    placeholder="e.g., Central Park, NYC"
                    value={draft.location}
                    onChange={(e) => setDraft({ ...draft, location: e.target.value })}
                  />
                </label>

                <label className="gear-field-block">
                  <span>Client Name</span>
                  <input
                    type="text"
                    placeholder="e.g., John Smith"
                    value={draft.client}
                    onChange={(e) => setDraft({ ...draft, client: e.target.value })}
                  />
                </label>
              </div>

              {/* Notes & Special Requirements */}
              <label className="gear-field-block">
                <span>Notes & Special Requirements</span>
                <textarea
                  rows={3}
                  value={draft.notes}
                  onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                  placeholder="Any special requirements, equipment needed, or important details..."
                />
              </label>

              {error && <p className="error">{error}</p>}
            </div>

            <div className="maintenance-sheet-footer">
              <button onClick={() => void createEvent()}>Create Event</button>
            </div>
          </aside>
        </>
      )}
      {/* Calendar View */}
      {showCalendar && <MonthCalendar />}
      {/* Empty states */}
      {sorted.length === 0 && events.length === 0 && (
        <div className="card empty">
          <div style={{ fontSize: '3rem', color: 'var(--subtle)', marginBottom: '1rem', display: 'flex', justifyContent: 'center' }}>
            {magnifyingGlassIcon}
          </div>
          <h3>No events added</h3>
          <p>Tap the + button to create your first event</p>
        </div>
      )}
      {sorted.length === 0 && events.length > 0 && (
        <div className="card empty">
          <div style={{ fontSize: '3rem', color: 'var(--subtle)', marginBottom: '1rem', display: 'flex', justifyContent: 'center' }}>
            {magnifyingGlassIcon}
          </div>
          <h3>No events match</h3>
          <p>Try adjusting your search or filters</p>
        </div>
      )}
      {/* Event Cards */}
      {sorted.length > 0 && (
        <div className="grid cards">
          {sorted.map((event) => {
            const packed = event.packingChecklist.filter((i) => i.packed).length;
            const total = event.packingChecklist.length;
            const ratio = total > 0 ? Math.round((packed / total) * 100) : 0;
            const status = total === 0 ? 'Draft' : packed === total ? 'Ready' : 'Packing';
            return (
              <Link key={event.id} to={`/events/${event.id}`} className="gear-card event-card">
                <div className="event-card-head">
                  <strong>{event.title}</strong>
                  <span className={`pill event-status ${status.toLowerCase()}`}>{status}</span>
                </div>
                <span className="pill">{event.type}</span>
                {event.dateTime && (
                  <span className="subtle">
                    {new Date(event.dateTime).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                )}
                <div className="stack-sm" style={{ width: '100%' }}>
                  {event.client && <span className="subtle">Client: {event.client}</span>}
                  {event.location && <span className="subtle">📍 {event.location}</span>}
                </div>
                {total > 0 && (
                  <>
                    <span className="subtle">
                      {packed}/{total} items packed
                    </span>
                    <div className="progress-track" aria-hidden="true">
                      <span style={{ width: `${ratio}%` }} />
                    </div>
                  </>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
