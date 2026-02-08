import { useEffect, useMemo, useState } from 'react';
import { makeId } from '../lib/ids';
import { lockSheetScroll, unlockSheetScroll } from '../lib/sheetLock';
import type { MaintenanceEntry } from '../types/models';

interface MaintenanceSheetProps {
  open: boolean;
  itemName: string;
  history: MaintenanceEntry[];
  onClose: () => void;
  onSaveEntry: (entry: MaintenanceEntry) => Promise<void> | void;
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

export function MaintenanceSheet({ open, itemName, history, onClose, onSaveEntry }: MaintenanceSheetProps) {
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [date, setDate] = useState(initialDraft.date);
  const [type, setType] = useState(initialDraft.type);
  const [description, setDescription] = useState(initialDraft.description);
  const [error, setError] = useState('');

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

  if (!open) return null;

  async function saveEntry() {
    if (!date) {
      setError('Date is required.');
      return;
    }
    await onSaveEntry({
      id: makeId(),
      date,
      type,
      note: description.trim(),
    });

    setDate(new Date().toISOString().slice(0, 10));
    setType(initialDraft.type);
    setDescription('');
    setError('');
    setShowAddSheet(false);
  }

  return (
    <>
      <button className="sheet-overlay" aria-label="Close maintenance history" onClick={onClose} />
      <aside className="filter-sheet card maintenance-history-sheet" aria-label="Maintenance history">
        <div className="maintenance-sheet-header">
          <h3>Maintenance</h3>
          <button className="sheet-close-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="maintenance-sheet-body stack-sm">
          <p className="subtle maintenance-sheet-subtitle">{itemName}</p>

          {sortedHistory.length === 0 ? (
            <div className="maintenance-empty card">
              <p>No history yet</p>
            </div>
          ) : (
            <div className="maintenance-list stack-sm">
              {sortedHistory.map((entry) => (
                <article key={entry.id} className="maintenance-entry card">
                  <div className="row between">
                    <strong>{new Date(entry.date).toLocaleDateString()}</strong>
                    {entry.type && <span className="pill">{entry.type}</span>}
                  </div>
                  {entry.note && <p className="subtle maintenance-note">{entry.note}</p>}
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="maintenance-sheet-footer">
          <button onClick={() => setShowAddSheet(true)}>
            <span className="maintenance-plus" aria-hidden="true">+</span>
            Add Maintenance Record
          </button>
        </div>
      </aside>

      {showAddSheet && (
        <>
          <button className="sheet-overlay maintenance-add-overlay" aria-label="Close add maintenance" onClick={() => setShowAddSheet(false)} />
          <aside className="filter-sheet card maintenance-add-sheet" aria-label="Add maintenance record">
            <div className="maintenance-sheet-header">
              <h3>Add Maintenance</h3>
              <button className="sheet-close-btn" onClick={() => setShowAddSheet(false)} aria-label="Close">✕</button>
            </div>

            <div className="maintenance-sheet-body stack-sm">
              <label className="gear-field-block">
                <span>Date</span>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>

              <label className="gear-field-block">
                <span>Type</span>
                <select value={type} onChange={(e) => setType(e.target.value)}>
                  {maintenanceTypeOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>

              <label className="gear-field-block">
                <span>Description</span>
                <textarea
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe what was done"
                />
              </label>

              {error && <p className="error">{error}</p>}
            </div>

            <div className="maintenance-sheet-footer">
              <button onClick={() => void saveEntry()}>Save Changes</button>
            </div>
          </aside>
        </>
      )}
    </>
  );
}