import { useMemo, useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { eventSchema } from '../lib/validators';
import { makeId } from '../lib/ids';
import type { EventItem } from '../types/models';

const magnifyingGlassIcon = (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    focusable="false"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-4-4" />
  </svg>
);

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

function getDaysUntilEvent(dateTime: string): { text: string; colorClass: string } {
  const eventDate = new Date(dateTime);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.ceil((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (days < 0)  return { text: `${Math.abs(days)}d ago`, colorClass: 'overdue' };
  if (days === 0) return { text: 'Today',               colorClass: 'today' };
  if (days === 1) return { text: '1 day',               colorClass: 'urgent' };
  if (days <= 5)  return { text: `${days} days`,        colorClass: 'upcoming' };
  return           { text: `${days} days`,              colorClass: 'later' };
}

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

  const selectedEventTypes = (searchParams.get('types') ?? '').split(',').filter(Boolean);
  const clientFilter   = searchParams.get('client') ?? '';
  const locationFilter = searchParams.get('location') ?? '';
  const sortBy = (searchParams.get('sort') as 'date' | 'title' | 'client' | 'newest') || 'date';

  // ── Local form state ───────────────────────────────────────────────────────
  const [draft, setDraft] = useState({
    title: '', type: EVENT_TYPE_OPTIONS[0], dateTime: '', location: '', client: '', notes: '',
  });
  const [error, setError] = useState('');

  // ── Sheet scroll lock ──────────────────────────────────────────────────────
  useEffect(() => {
    const anyOpen = showFilterSheet || showCreateForm;
    if (!anyOpen) return;
    document.body.classList.add('sheet-open');
    return () => document.body.classList.remove('sheet-open');
  }, [showFilterSheet, showCreateForm]);

  // ── URL helpers ────────────────────────────────────────────────────────────
  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams);
    if (value === null) params.delete(key);
    else params.set(key, value);
    navigate({ search: params.toString() }, { replace: true });
  }

  function closeFilterSheet() { setParam('filters', null); }
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

  // ── Create event ───────────────────────────────────────────────────────────
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
    closeCreateForm();
  }

  // ── Month calendar ─────────────────────────────────────────────────────────
  function MonthCalendar() {
    const now   = new Date();
    const year  = now.getFullYear();
    const month = now.getMonth();
    const firstDay       = new Date(year, month, 1);
    const startDayOfWeek = firstDay.getDay();
    const daysInMonth    = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

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
      <div className="card stack-sm">
        <h3>{firstDay.toLocaleString('default', { month: 'long', year: 'numeric' })}</h3>
        <div className="calendar-grid">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(label => (
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

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <section className="stack-lg main-page catalog-page">

      {/* Calendar – rendered below header when toggled */}
      {showCalendar && <MonthCalendar />}

      {/* Filter Sheet */}
      {showFilterSheet && (
        <>
          <button className="sheet-overlay" aria-label="Close filters" onClick={closeFilterSheet} />
          <aside className="filter-sheet card stack-md" aria-label="Event filters">
            <div className="row between">
              <h3>Filters</h3>
              <button className="ghost" onClick={closeFilterSheet}>Done</button>
            </div>
            <div className="stack-sm">
              <strong>Event Types</strong>
              <div className="catalog-filter-checklist">
                {eventTypes.map(eventType => (
                  <label className="checkbox-inline" key={eventType}>
                    <input
                      type="checkbox"
                      checked={selectedEventTypes.includes(eventType)}
                      onChange={() => toggleEventTypeFilter(eventType)}
                    />
                    {eventType}
                  </label>
                ))}
              </div>
            </div>
            <div className="grid filters">
              <select
                value={clientFilter}
                onChange={e => setParam('client', e.target.value || null)}
                aria-label="Filter by client"
              >
                <option value="">All clients</option>
                {clients.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select
                value={locationFilter}
                onChange={e => setParam('location', e.target.value || null)}
                aria-label="Filter by location"
              >
                <option value="">All locations</option>
                {locations.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              <select
                value={sortBy}
                onChange={e => setParam('sort', e.target.value)}
                aria-label="Sort events"
              >
                <option value="date">Sort: Date</option>
                <option value="title">Sort: Title</option>
                <option value="client">Sort: Client</option>
                <option value="newest">Sort: Recently Updated</option>
              </select>
            </div>
            <button className="ghost" onClick={clearAllFilters}>Clear all filters</button>
          </aside>
        </>
      )}

      {/* Create Event Sheet */}
      {showCreateForm && (
        <>
          <button className="sheet-overlay" aria-label="Close create event" onClick={closeCreateForm} />
          <aside className="filter-sheet card maintenance-add-sheet event-create-sheet" aria-label="Create new event">
            <div className="maintenance-sheet-header">
              <h3>New Event</h3>
              <button className="sheet-close-btn" onClick={closeCreateForm} aria-label="Close">✕</button>
            </div>
            <div className="maintenance-sheet-body stack-sm">
              <label className="gear-field-block">
                <span>Event Title*</span>
                <input
                  type="text"
                  placeholder="e.g., Smith Wedding"
                  value={draft.title}
                  onChange={e => setDraft({ ...draft, title: e.target.value })}
                />
              </label>
              <div className="gear-form-two-col">
                <label className="gear-field-block">
                  <span>Event Type*</span>
                  <select value={draft.type} onChange={e => setDraft({ ...draft, type: e.target.value })}>
                    {EVENT_TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </label>
                <label className="gear-field-block">
                  <span>Date & Time</span>
                  <input
                    type="datetime-local"
                    value={draft.dateTime}
                    onChange={e => setDraft({ ...draft, dateTime: e.target.value })}
                  />
                </label>
              </div>
              <div className="gear-form-two-col">
                <label className="gear-field-block">
                  <span>Location</span>
                  <input
                    type="text"
                    placeholder="e.g., Central Park, NYC"
                    value={draft.location}
                    onChange={e => setDraft({ ...draft, location: e.target.value })}
                  />
                </label>
                <label className="gear-field-block">
                  <span>Client Name</span>
                  <input
                    type="text"
                    placeholder="e.g., John Smith"
                    value={draft.client}
                    onChange={e => setDraft({ ...draft, client: e.target.value })}
                  />
                </label>
              </div>
              <label className="gear-field-block">
                <span>Notes & Special Requirements</span>
                <textarea
                  rows={3}
                  value={draft.notes}
                  onChange={e => setDraft({ ...draft, notes: e.target.value })}
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

      {/* Empty states */}
      {sorted.length === 0 && events.length === 0 && (
        <div className="card empty">
          <div className="empty-icon">{magnifyingGlassIcon}</div>
          <h3>No events added</h3>
          <p>Tap the + button to create your first event</p>
        </div>
      )}
      {sorted.length === 0 && events.length > 0 && (
        <div className="card empty">
          <div className="empty-icon">{magnifyingGlassIcon}</div>
          <h3>No events match</h3>
          <p>Try adjusting your search or filters</p>
        </div>
      )}

      {/* Event Cards */}
      {sorted.length > 0 && (
        <div className="grid cards">
          {sorted.map(event => {
            const packed = event.packingChecklist.filter(i => i.packed).length;
            const total  = event.packingChecklist.length;
            const ratio  = total > 0 ? Math.round((packed / total) * 100) : 0;
            const daysInfo = event.dateTime ? getDaysUntilEvent(event.dateTime) : null;

            const formattedDate = event.dateTime
              ? new Date(event.dateTime).toLocaleDateString('en-GB', {
                  day: '2-digit', month: 'short', year: 'numeric',
                })
              : '';
            const formattedTime = event.dateTime
              ? new Date(event.dateTime).toLocaleTimeString('en-GB', {
                  hour: '2-digit', minute: '2-digit', hour12: false,
                })
              : '';

            return (
              <Link key={event.id} to={`/events/${event.id}`} className="gear-card event-card">
                {/* Title row + days pill fixed top-right */}
                <div className="event-card-header">
                  <strong className="event-card-title">{event.title}</strong>
                  {daysInfo && (
                    <span className={`pill event-days ${daysInfo.colorClass}`}>
                      {daysInfo.text}
                    </span>
                  )}
                </div>

                {/* Event type subtitle */}
                <span className="event-card-type">{event.type}</span>

                {/* Date + time pills */}
                {event.dateTime && (
                  <div className="event-card-meta-row">
                    <span className="pill">
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                      {formattedDate}
                    </span>
                    <span className="pill">{formattedTime}</span>
                  </div>
                )}

                {/* Packing info */}
                {total > 0 && (
                  <>
                    <div className="event-card-packed">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="16 12 12 8 8 12" />
                      </svg>
                      <span>{packed}/{total} {packed === total ? 'Complete' : 'Packing'}</span>
                    </div>
                    <div className="progress-track" aria-hidden="true">
                      <span
                        className={packed === total ? 'complete' : ''}
                        style={{ width: `${ratio}%` }}
                      />
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
