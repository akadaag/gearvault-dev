import { useEffect, useMemo, useState, type TouchEvent } from 'react';
import { makeId } from '../lib/ids';
import { lockSheetScroll, unlockSheetScroll } from '../lib/sheetLock';
import { useSheetDismiss } from '../hooks/useSheetDismiss';
import type { MaintenanceEntry } from '../types/models';

interface MaintenanceSheetProps {
  open: boolean;
  itemName: string;
  history: MaintenanceEntry[];
  onClose: () => void;
  onSaveEntry: (entry: MaintenanceEntry) => Promise<void> | void;
  onUpdateEntry: (entry: MaintenanceEntry) => Promise<void> | void;
  onDeleteEntry: (entryId: string) => Promise<void> | void;
}

const maintenanceTypeOptions = [
  'Routine Check',
  'Cleaning',
  'Firmware Update',
  'Repair',
  'Parts Replacement',
  'Calibration',
  'Battery Service',
  'Inspection/Test',
];

const initialDraft = {
  date: new Date().toISOString().slice(0, 10),
  type: maintenanceTypeOptions[0],
  description: '',
};

export function MaintenanceSheet({
  open,
  itemName,
  history,
  onClose,
  onSaveEntry,
  onUpdateEntry,
  onDeleteEntry,
}: MaintenanceSheetProps) {
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [date, setDate] = useState(initialDraft.date);
  const [type, setType] = useState(initialDraft.type);
  const [description, setDescription] = useState(initialDraft.description);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [openEntryActionsId, setOpenEntryActionsId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchCurrentX, setTouchCurrentX] = useState<number | null>(null);

  const sortedHistory = useMemo(
    () => [...(history ?? [])].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [history],
  );

  useEffect(() => {
    if (!open) return;
    lockSheetScroll();
    return () => unlockSheetScroll();
  }, [open]);

  useEffect(() => {
    if (!showAddSheet) return;
    lockSheetScroll();
    return () => unlockSheetScroll();
  }, [showAddSheet]);

  useEffect(() => {
    setOpenEntryActionsId(null);
  }, [history]);

  const { closing, dismiss, onAnimationEnd } = useSheetDismiss(onClose);
  const closeAddSheet = () => { setShowAddSheet(false); setEditingEntryId(null); };
  const { closing: closingAdd, dismiss: dismissAdd, onAnimationEnd: onAnimationEndAdd } = useSheetDismiss(closeAddSheet);

  if (!open) return null;

  async function saveEntry() {
    if (!date) {
      setError('Date is required.');
      return;
    }
    const entry: MaintenanceEntry = {
      id: editingEntryId ?? makeId(),
      date,
      type,
      note: description.trim(),
    };

    if (editingEntryId) {
      await onUpdateEntry(entry);
    } else {
      await onSaveEntry(entry);
    }

    setDate(new Date().toISOString().slice(0, 10));
    setType(initialDraft.type);
    setDescription('');
    setEditingEntryId(null);
    setError('');
    setShowAddSheet(false);
  }

  function openAddEntrySheet() {
    setEditingEntryId(null);
    setDate(new Date().toISOString().slice(0, 10));
    setType(initialDraft.type);
    setDescription('');
    setError('');
    setShowAddSheet(true);
  }

  function openEditEntrySheet(entry: MaintenanceEntry) {
    setEditingEntryId(entry.id);
    setDate(entry.date);
    setType(entry.type || initialDraft.type);
    setDescription(entry.note || '');
    setError('');
    setOpenEntryActionsId(null);
    setShowAddSheet(true);
  }

  async function removeEntry(entry: MaintenanceEntry) {
    if (!window.confirm('Delete this maintenance record?')) return;
    await onDeleteEntry(entry.id);
    setOpenEntryActionsId(null);
  }

  function onTouchStart(e: TouchEvent<HTMLDivElement>) {
    setTouchStartX(e.touches[0]?.clientX ?? null);
    setTouchCurrentX(e.touches[0]?.clientX ?? null);
  }

  function onTouchMove(e: TouchEvent<HTMLDivElement>) {
    setTouchCurrentX(e.touches[0]?.clientX ?? null);
  }

  function onTouchEnd(entryId: string) {
    const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
    if (!isMobile || touchStartX == null || touchCurrentX == null) {
      setTouchStartX(null);
      setTouchCurrentX(null);
      return;
    }

    const deltaX = touchCurrentX - touchStartX;
    if (deltaX < -40) {
      setOpenEntryActionsId(entryId);
    } else if (deltaX > 40) {
      setOpenEntryActionsId(null);
    }

    setTouchStartX(null);
    setTouchCurrentX(null);
  }

  return (
    <>
      <div className={`ios-sheet-backdrop${closing ? ' closing' : ''}`} onClick={dismiss} />
      <div className={`ios-sheet-modal${closing ? ' closing' : ''}`} aria-label="Maintenance history" onAnimationEnd={onAnimationEnd}>
        <div className="ios-sheet-handle" />
        <div className="ios-sheet-header">
          <button className="ios-sheet-btn secondary" onClick={dismiss}>Close</button>
          <h3 className="ios-sheet-title">Maintenance</h3>
          <button className="ios-sheet-btn primary" onClick={openAddEntrySheet}>Add</button>
        </div>

        <div className="ios-sheet-content">
          <p className="maintenance-sheet-subtitle">{itemName}</p>

          {sortedHistory.length === 0 ? (
            <div className="maintenance-empty">
              <p>No history yet</p>
            </div>
          ) : (
            <div className="maintenance-list">
              {sortedHistory.map((entry) => (
                <div
                  key={entry.id}
                  className={`maintenance-swipe-row ${openEntryActionsId === entry.id ? 'is-open' : ''}`}
                >
                  <div className="maintenance-swipe-actions" aria-hidden={openEntryActionsId !== entry.id}>
                    <button
                      type="button"
                      className="maintenance-action-btn maintenance-action-edit"
                      onClick={() => openEditEntrySheet(entry)}
                      aria-label="Edit maintenance entry"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <path d="M14 2v6h6" />
                        <path d="m9 16 4.4-4.4a1.5 1.5 0 0 1 2.1 2.1L11.1 18.1 8 19z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="maintenance-action-btn maintenance-action-delete"
                      onClick={() => void removeEntry(entry)}
                      aria-label="Delete maintenance entry"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M3 6h18" />
                        <path d="M8 6V4h8v2" />
                        <path d="M19 6l-1 14H6L5 6" />
                        <path d="M10 11v6M14 11v6" />
                      </svg>
                    </button>
                  </div>

                  <article
                    className="maintenance-entry maintenance-swipe-foreground"
                    onTouchStart={onTouchStart}
                    onTouchMove={onTouchMove}
                    onTouchEnd={() => onTouchEnd(entry.id)}
                  >
                    <div className="maintenance-entry-top">
                      <div className="row between maintenance-entry-mainline">
                        <strong>{new Date(entry.date).toLocaleDateString()}</strong>
                        {entry.type && <span className="pill">{entry.type}</span>}
                      </div>
                      <button
                        type="button"
                        className="maintenance-more-btn"
                        aria-label="Show maintenance actions"
                        onClick={() => setOpenEntryActionsId((prev) => (prev === entry.id ? null : entry.id))}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                          <circle cx="12" cy="5" r="1.8" />
                          <circle cx="12" cy="12" r="1.8" />
                          <circle cx="12" cy="19" r="1.8" />
                        </svg>
                      </button>
                    </div>
                    {entry.note && <p className="subtle maintenance-note">{entry.note}</p>}
                  </article>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showAddSheet && (
        <>
          <div className={`ios-sheet-backdrop ios-sheet-backdrop--nested${closingAdd ? ' closing' : ''}`} onClick={dismissAdd} />
          <div
            className={`ios-sheet-modal ios-sheet-modal--nested${closingAdd ? ' closing' : ''}`}
            aria-label={editingEntryId ? 'Edit maintenance record' : 'Add maintenance record'}
            onAnimationEnd={onAnimationEndAdd}
          >
            <div className="ios-sheet-handle" />
            <div className="ios-sheet-header">
              <button
                className="ios-sheet-btn secondary"
                onClick={dismissAdd}
              >
                Cancel
              </button>
              <h3 className="ios-sheet-title">{editingEntryId ? 'Edit Record' : 'New Record'}</h3>
              <button className="ios-sheet-btn primary" onClick={() => void saveEntry()}>Save</button>
            </div>

            <div className="ios-sheet-content">
              <div className="ios-form-group">
                <div className="ios-form-row">
                  <span className="ios-form-label">Date</span>
                  <input
                    type="date"
                    className="ios-form-input"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    onFocus={() => document.documentElement.classList.add('keyboard-open')}
                    onBlur={() => document.documentElement.classList.remove('keyboard-open')}
                  />
                </div>
                <label className="ios-form-row">
                  <span className="ios-form-label">Type</span>
                  <select
                    className="ios-form-input"
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                  >
                    {maintenanceTypeOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>
                <div className="ios-form-row textarea-row">
                  <span className="ios-form-label">Description</span>
                  <textarea
                    className="ios-form-textarea"
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe what was done"
                    onFocus={() => document.documentElement.classList.add('keyboard-open')}
                    onBlur={() => document.documentElement.classList.remove('keyboard-open')}
                  />
                </div>
              </div>

              {error && <p className="ios-sheet-error">{error}</p>}
            </div>
          </div>
        </>
      )}
    </>
  );
}