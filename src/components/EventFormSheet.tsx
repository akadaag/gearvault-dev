import { useState, useEffect } from 'react';
import { db } from '../db';
import { eventSchema } from '../lib/validators';
import { makeId } from '../lib/ids';
import type { EventItem } from '../types/models';

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

interface EventFormSheetProps {
  mode: 'create' | 'edit';
  initialData?: EventItem;
  onClose: () => void;
  onSaved?: (event: EventItem) => void;
}

export function EventFormSheet({ mode, initialData, onClose, onSaved }: EventFormSheetProps) {
  const [draft, setDraft] = useState({
    title: '',
    type: EVENT_TYPE_OPTIONS[0],
    dateTime: '',
    location: '',
    client: '',
    notes: '',
  });
  const [error, setError] = useState('');

  useEffect(() => {
    if (mode === 'edit' && initialData) {
      setDraft({
        title: initialData.title ?? '',
        type: initialData.type ?? EVENT_TYPE_OPTIONS[0],
        dateTime: initialData.dateTime
          ? new Date(initialData.dateTime).toISOString().slice(0, 16)
          : '',
        location: initialData.location ?? '',
        client: initialData.client ?? '',
        notes: initialData.notes ?? '',
      });
    }
  }, [mode, initialData]);

  // Sheet scroll lock
  useEffect(() => {
    document.body.classList.add('sheet-open');
    return () => document.body.classList.remove('sheet-open');
  }, []);

  async function handleSubmit() {
    setError('');
    const parsed = eventSchema.safeParse({ title: draft.title, type: draft.type });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid event');
      return;
    }

    const now = new Date().toISOString();

    if (mode === 'create') {
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
      onSaved?.(row);
    } else if (mode === 'edit' && initialData) {
      const updated: Partial<EventItem> = {
        title: draft.title,
        type: draft.type,
        dateTime: draft.dateTime || undefined,
        location: draft.location || undefined,
        client: draft.client || undefined,
        notes: draft.notes || undefined,
        updatedAt: now,
      };
      await db.events.update(initialData.id, updated);
      onSaved?.({ ...initialData, ...updated });
    }

    onClose();
  }

  return (
    <>
      <button className="sheet-overlay" aria-label="Close event form" onClick={onClose} />
      <aside
        className="filter-sheet card maintenance-add-sheet event-create-sheet"
        aria-label={mode === 'create' ? 'Create new event' : 'Edit event'}
      >
        <div className="maintenance-sheet-header">
          <h3>{mode === 'create' ? 'New Event' : 'Edit Event'}</h3>
          <button className="sheet-close-btn" onClick={onClose} aria-label="Close">✕</button>
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
              <span>Date &amp; Time</span>
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
            <span>Notes &amp; Special Requirements</span>
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
          <button onClick={() => void handleSubmit()}>
            {mode === 'create' ? 'Create Event' : 'Save Changes'}
          </button>
        </div>
      </aside>
    </>
  );
}
