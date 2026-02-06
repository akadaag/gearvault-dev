import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { eventSchema } from '../lib/validators';
import { makeId } from '../lib/ids';
import type { EventItem } from '../types/models';

export function EventsPage() {
  const events = useLiveQuery(() => db.events.orderBy('updatedAt').reverse().toArray(), [], []);
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [calendarMode, setCalendarMode] = useState<'month' | 'week'>('month');
  const [showCalendar, setShowCalendar] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [draft, setDraft] = useState({
    title: '',
    type: '',
    dateTime: '',
    location: '',
    client: '',
    notes: '',
  });
  const [error, setError] = useState('');

  const filtered = useMemo(
    () =>
      events.filter((e) => {
        const text = [e.title, e.type, e.client, e.location, e.notes].join(' ').toLowerCase();
        return text.includes(query.toLowerCase()) && (!type || e.type === type);
      }),
    [events, query, type],
  );

  const eventTypes = Array.from(new Set(events.map((e) => e.type))).sort();

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
    setDraft({ title: '', type: '', dateTime: '', location: '', client: '', notes: '' });
    setShowCreateForm(false);
  }

  return (
    <section className="stack-lg">
      <div className="card stack-md">
        <div className="page-header">
          <div className="page-title-section">
            <h2>Events</h2>
            <p className="subtle">{filtered.length} of {events.length} events</p>
          </div>
          <div className="page-actions">
            <button className="ghost" onClick={() => setShowCalendar((prev) => !prev)}>
              {showCalendar ? 'Hide' : 'Show'} Calendar
            </button>
            <button onClick={() => setShowCreateForm((prev) => !prev)}>
              {showCreateForm ? 'Hide' : 'New Event'}
            </button>
          </div>
        </div>

        <input
          placeholder="Search events..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <div className="row wrap">
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All types</option>
            {eventTypes.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          {showCalendar && (
            <select
              value={calendarMode}
              onChange={(e) => setCalendarMode(e.target.value as 'month' | 'week')}
            >
              <option value="month">Month view</option>
              <option value="week">Week view</option>
            </select>
          )}
        </div>
      </div>

      {showCalendar &&
        (calendarMode === 'month' ? (
          <MonthCalendar events={filtered} />
        ) : (
          <WeekCalendar events={filtered} />
        ))}

      {showCreateForm && (
        <div className="card stack-md">
          <div className="row between wrap">
            <h3>Create Event</h3>
            <button className="ghost" onClick={() => setShowCreateForm(false)}>Close</button>
          </div>
          <div className="grid two">
            <input
              placeholder="Title*"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
            <input
              placeholder="Type* (e.g., Wedding, Portrait)"
              value={draft.type}
              onChange={(e) => setDraft({ ...draft, type: e.target.value })}
            />
            <input
              type="datetime-local"
              value={draft.dateTime}
              onChange={(e) => setDraft({ ...draft, dateTime: e.target.value })}
            />
            <input
              placeholder="Location"
              value={draft.location}
              onChange={(e) => setDraft({ ...draft, location: e.target.value })}
            />
            <input
              placeholder="Client"
              value={draft.client}
              onChange={(e) => setDraft({ ...draft, client: e.target.value })}
            />
          </div>
          <textarea
            placeholder="Notes / requirements"
            value={draft.notes}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          />
          {error && <p className="error">{error}</p>}
          <button onClick={() => void createEvent()}>Create event</button>
        </div>
      )}

      {filtered.length === 0 && events.length === 0 && (
        <div className="card empty">
          <h3>No events yet</h3>
          <p>Create your first event to get started</p>
        </div>
      )}

      {filtered.length === 0 && events.length > 0 && (
        <div className="card empty">
          <h3>No results found</h3>
          <p>Try adjusting your search or filters</p>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="grid cards">
          {filtered.map((event) => {
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

function MonthCalendar({ events }: { events: EventItem[] }) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const first = new Date(y, m, 1);
  const startDay = first.getDay();
  const days = new Date(y, m + 1, 0).getDate();

  const cells = Array.from({ length: 42 }, (_, idx) => {
    const dayNum = idx - startDay + 1;
    const date = dayNum > 0 && dayNum <= days ? new Date(y, m, dayNum) : null;
    const dateKey = date ? date.toISOString().slice(0, 10) : '';
    const dayEvents = date ? events.filter((e) => e.dateTime?.slice(0, 10) === dateKey) : [];
    return { dayNum, dayEvents };
  });

  return (
    <div className="card stack-sm">
      <h3>
        {first.toLocaleString(undefined, { month: 'long', year: 'numeric' })}
      </h3>
      <div className="calendar-grid">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label) => (
          <strong key={label} style={{ fontSize: '0.8125rem' }}>{label}</strong>
        ))}
        {cells.map((cell, i) => (
          <div key={i} className="calendar-cell">
            {cell.dayNum > 0 && cell.dayNum <= days && (
              <>
                <span style={{ fontWeight: 600 }}>{cell.dayNum}</span>
                {cell.dayEvents.slice(0, 2).map((ev) => (
                  <small key={ev.id} className="subtle" style={{ fontSize: '0.7rem' }}>{ev.title}</small>
                ))}
                {cell.dayEvents.length > 2 && (
                  <small className="subtle" style={{ fontSize: '0.7rem' }}>+{cell.dayEvents.length - 2} more</small>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function WeekCalendar({ events }: { events: EventItem[] }) {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay());
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    return {
      label: d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
      events: events.filter((e) => e.dateTime?.slice(0, 10) === key),
    };
  });

  return (
    <div className="card stack-sm">
      <h3>Week view</h3>
      {week.map((d) => (
        <div key={d.label} className="checklist-row stack-sm">
          <strong>{d.label}</strong>
          {d.events.length === 0 ? (
            <p className="subtle">No events</p>
          ) : (
            d.events.map((ev) => <p key={ev.id}>{ev.title}</p>)
          )}
        </div>
      ))}
    </div>
  );
}