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
  const [showCalendar, setShowCalendar] = useState(true);
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
  }

  return (
    <section className="stack-lg">
      <div className="card stack-md">
        <div className="row between wrap">
          <h2>Events</h2>
          <div className="row wrap">
            <label className="checkbox-inline">
              <input
                type="checkbox"
                checked={showCalendar}
                onChange={(e) => setShowCalendar(e.target.checked)}
              />
              Calendar
            </label>
            <select
              value={calendarMode}
              onChange={(e) => setCalendarMode(e.target.value as 'month' | 'week')}
            >
              <option value="month">Month</option>
              <option value="week">Week</option>
            </select>
          </div>
        </div>
        <div className="grid filters">
          <input
            placeholder="Search events"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All types</option>
            {eventTypes.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      {showCalendar &&
        (calendarMode === 'month' ? (
          <MonthCalendar events={filtered} />
        ) : (
          <WeekCalendar events={filtered} />
        ))}

      <div className="card stack-md">
        <h3>Create Event</h3>
        <div className="grid two">
          <input
            placeholder="Title*"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
          <input
            placeholder="Type*"
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
        <button onClick={() => void createEvent()}>Save event</button>
      </div>

      {filtered.length === 0 && <div className="card empty">No events yet—create your first shoot.</div>}
      <div className="grid cards">
        {filtered.map((event) => {
          const packed = event.packingChecklist.filter((i) => i.packed).length;
          const total = event.packingChecklist.length;
          return (
            <Link key={event.id} to={`/events/${event.id}`} className="gear-card">
              <strong>{event.title}</strong>
              <span>{event.type}</span>
              <span className="subtle">
                {event.client ?? 'No client'} • {event.location ?? 'No location'}
              </span>
              <span className="pill">
                {packed}/{total} packed
              </span>
            </Link>
          );
        })}
      </div>
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
    <div className="card">
      <h3>
        Calendar ({first.toLocaleString(undefined, { month: 'long', year: 'numeric' })})
      </h3>
      <div className="calendar-grid">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label) => (
          <strong key={label}>{label}</strong>
        ))}
        {cells.map((cell, i) => (
          <div key={i} className="calendar-cell">
            {cell.dayNum > 0 && cell.dayNum <= days && (
              <>
                <span>{cell.dayNum}</span>
                {cell.dayEvents.slice(0, 2).map((ev) => (
                  <small key={ev.id}>{ev.title}</small>
                ))}
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
        <div key={d.label} className="checklist-row">
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
