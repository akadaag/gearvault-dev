import { useState, useEffect } from 'react';
import { db } from '../db';
import { eventSchema } from '../lib/validators';
import { makeId } from '../lib/ids';
import { lockSheetScroll, unlockSheetScroll } from '../lib/sheetLock';
import { useSheetDismiss } from '../hooks/useSheetDismiss';
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
  const { closing, dismiss, onAnimationEnd } = useSheetDismiss(onClose);
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
    lockSheetScroll();
    return () => unlockSheetScroll();
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
      <div className={`ios-sheet-backdrop${closing ? ' closing' : ''}`} onClick={dismiss} />
      <div
        className={`ios-sheet-modal${closing ? ' closing' : ''}`}
        aria-label={mode === 'create' ? 'Create new event' : 'Edit event'}
        onAnimationEnd={onAnimationEnd}
      >
        <div className="ios-sheet-handle" />
        <div className="ios-sheet-header ios-sheet-header--icon">
          <button className="ios-sheet-icon-btn ios-sheet-icon-btn--cancel" onClick={dismiss} aria-label="Cancel">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M2 2L16 16M16 2L2 16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>
          </button>
          <h3 className="ios-sheet-title">{mode === 'create' ? 'New Event' : 'Edit Event'}</h3>
          <button className="ios-sheet-icon-btn ios-sheet-icon-btn--save" onClick={() => void handleSubmit()} aria-label={mode === 'create' ? 'Create' : 'Save'}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M2.5 9.5L7 14L15.5 4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>

        <div className="ios-sheet-content">
          {error && <p className="ios-sheet-error">{error}</p>}

          <p className="ios-form-group-title">Event Details</p>
          <div className="ios-form-group">
            <label className="ios-form-row">
              <span className="ios-form-label">Title</span>
              <input
                type="text"
                className="ios-form-input"
                placeholder="e.g., Smith Wedding"
                value={draft.title}
                onChange={e => setDraft({ ...draft, title: e.target.value })}
                onFocus={() => document.documentElement.classList.add('keyboard-open')}
                onBlur={() => document.documentElement.classList.remove('keyboard-open')}
              />
            </label>
            <label className="ios-form-row">
              <span className="ios-form-label">Type</span>
              <select
                className="ios-form-input"
                value={draft.type}
                onChange={e => setDraft({ ...draft, type: e.target.value })}
              >
                {EVENT_TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
            <label className="ios-form-row">
              <span className="ios-form-label">Date &amp; Time</span>
              <input
                type="datetime-local"
                className="ios-form-input"
                value={draft.dateTime}
                onChange={e => setDraft({ ...draft, dateTime: e.target.value })}
                onFocus={() => document.documentElement.classList.add('keyboard-open')}
                onBlur={() => document.documentElement.classList.remove('keyboard-open')}
              />
            </label>
          </div>

          <p className="ios-form-group-title">Location &amp; Client</p>
          <div className="ios-form-group">
            <label className="ios-form-row">
              <span className="ios-form-label">Location</span>
              <input
                type="text"
                className="ios-form-input"
                placeholder="e.g., Central Park, NYC"
                value={draft.location}
                onChange={e => setDraft({ ...draft, location: e.target.value })}
                onFocus={() => document.documentElement.classList.add('keyboard-open')}
                onBlur={() => document.documentElement.classList.remove('keyboard-open')}
              />
            </label>
            <label className="ios-form-row">
              <span className="ios-form-label">Client</span>
              <input
                type="text"
                className="ios-form-input"
                placeholder="e.g., John Smith"
                value={draft.client}
                onChange={e => setDraft({ ...draft, client: e.target.value })}
                onFocus={() => document.documentElement.classList.add('keyboard-open')}
                onBlur={() => document.documentElement.classList.remove('keyboard-open')}
              />
            </label>
          </div>

          <p className="ios-form-group-title">Notes</p>
          <div className="ios-form-group">
            <div className="ios-form-row textarea-row">
              <span className="ios-form-label">Notes &amp; Requirements</span>
              <textarea
                className="ios-form-textarea"
                rows={3}
                value={draft.notes}
                onChange={e => setDraft({ ...draft, notes: e.target.value })}
                placeholder="Any special requirements, equipment needed, or important details..."
                onFocus={() => document.documentElement.classList.add('keyboard-open')}
                onBlur={() => document.documentElement.classList.remove('keyboard-open')}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
