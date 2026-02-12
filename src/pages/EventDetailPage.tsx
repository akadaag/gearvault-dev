import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { makeId } from '../lib/ids';
import { exportEventToPdf } from '../lib/pdf';
import { EventFormSheet } from '../components/EventFormSheet';
import { getDaysUntilEvent } from '../lib/eventHelpers';
import type { PackingChecklistItem } from '../types/models';

export function EventDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const event = useLiveQuery(() => (id ? db.events.get(id) : undefined), [id]);
  const catalog = useLiveQuery(() => db.gearItems.toArray(), [], []);
  const [newItemName, setNewItemName] = useState('');
  const [catalogItemId, setCatalogItemId] = useState('');
  const [showAddItem, setShowAddItem] = useState(false);
  const [showEditSheet, setShowEditSheet] = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);

  if (!event) return <div className="card">Event not found.</div>;
  const currentEvent = event;

  const packed = currentEvent.packingChecklist.filter((i) => i.packed).length;
  const total = currentEvent.packingChecklist.length;
  const ratio = total > 0 ? Math.round((packed / total) * 100) : 0;

  // Calculate days until event
  const daysInfo = currentEvent.dateTime ? getDaysUntilEvent(currentEvent.dateTime) : null;

  // Format date and time
  const formattedDate = currentEvent.dateTime
    ? new Date(currentEvent.dateTime).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '';

  const formattedTime = currentEvent.dateTime
    ? new Date(currentEvent.dateTime).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    : '';

  async function setChecklist(nextChecklist: typeof currentEvent.packingChecklist) {
    await db.events.update(currentEvent.id, {
      packingChecklist: nextChecklist,
      updatedAt: new Date().toISOString(),
    });
  }

  async function setMissing(nextMissing: typeof currentEvent.missingItems) {
    await db.events.update(currentEvent.id, {
      missingItems: nextMissing,
      updatedAt: new Date().toISOString(),
    });
  }

  async function resetChecklist() {
    if (!window.confirm('Reset all packed statuses?')) return;
    const next = currentEvent.packingChecklist.map((i) => ({ ...i, packed: false }));
    await setChecklist(next);
  }

  async function deleteEvent() {
    if (!window.confirm('Delete this event? This cannot be undone.')) return;
    await db.events.delete(currentEvent.id);
    navigate('/events');
  }

  async function addManualItem() {
    if (!newItemName.trim()) return;
    const next: PackingChecklistItem[] = [...currentEvent.packingChecklist, {
      id: makeId(),
      eventId: currentEvent.id,
      gearItemId: null,
      name: newItemName.trim(),
      quantity: 1,
      packed: false,
      priority: 'optional' as const,
    }];
    setNewItemName('');
    await setChecklist(next);
    setShowAddItem(false);
  }

  async function addCatalogItem() {
    const item = catalog.find((c) => c.id === catalogItemId);
    if (!item) return;
    const priority: PackingChecklistItem['priority'] = item.essential ? 'must-have' : 'nice-to-have';
    const next: PackingChecklistItem[] = [...currentEvent.packingChecklist, {
      id: makeId(),
      eventId: currentEvent.id,
      gearItemId: item.id,
      name: item.name,
      quantity: 1,
      packed: false,
      priority,
    }];
    setCatalogItemId('');
    await setChecklist(next);
    setShowAddItem(false);
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= currentEvent.packingChecklist.length) return;
    const copy = [...currentEvent.packingChecklist];
    [copy[index], copy[target]] = [copy[target], copy[index]];
    void setChecklist(copy);
  }

  function exportEventJson() {
    const blob = new Blob([JSON.stringify(currentEvent, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentEvent.title.replace(/\s+/g, '-').toLowerCase()}-event.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="detail-page detail-page-immersive detail-page-event">

      {/* ── WHITE TOPBAR ── */}
      <div className="detail-page-topbar detail-page-topbar-white">
        <button
          onClick={() => navigate('/events')}
          className="detail-back-link"
          aria-label="Back to events"
        >
          ‹ Events
        </button>
        <div className="row detail-topbar-actions">

          {/* Share button - opens share sheet */}
          <button
            className="detail-topbar-icon-btn"
            aria-label="Share & export event"
            onClick={() => setShowShareSheet(true)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
          </button>

          {/* Edit button */}
          <button
            className="detail-topbar-icon-btn"
            onClick={() => setShowEditSheet(true)}
            aria-label="Edit event"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6" />
              <path d="m9 16 4.4-4.4a1.5 1.5 0 0 1 2.1 2.1L11.1 18.1 8 19z" />
            </svg>
          </button>

          {/* Delete button */}
          <button
            className="detail-topbar-icon-btn detail-delete-btn"
            onClick={() => void deleteEvent()}
            aria-label="Delete event"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M3 6h18" />
              <path d="M8 6V4h8v2" />
              <path d="M19 6l-1 14H6L5 6" />
              <path d="M10 11v6M14 11v6" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── EDIT SHEET ── */}
      {showEditSheet && (
        <EventFormSheet
          mode="edit"
          initialData={currentEvent}
          onClose={() => setShowEditSheet(false)}
        />
      )}

      {/* ── SHARE SHEET ── */}
      {showShareSheet && (
        <>
          <button className="sheet-overlay" aria-label="Close share sheet" onClick={() => setShowShareSheet(false)} />
          <aside className="filter-sheet card detail-share-sheet" aria-label="Share & export">
            <div className="maintenance-sheet-header">
              <h3>Share &amp; Export</h3>
              <button className="sheet-close-btn" onClick={() => setShowShareSheet(false)} aria-label="Close">✕</button>
            </div>
            <div className="detail-share-sheet-body">
              <button
                className="detail-share-action"
                onClick={() => {
                  exportEventToPdf(currentEvent);
                  setShowShareSheet(false);
                }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M14 2H6a2 2 0 0 0 2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <path d="M14 2v6h6" />
                </svg>
                <span>Export PDF</span>
              </button>
              <button
                className="detail-share-action"
                onClick={() => {
                  exportEventJson();
                  setShowShareSheet(false);
                }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M7 7h10M7 12h10M7 17h6" />
                </svg>
                <span>Export JSON</span>
              </button>
              <button
                className="detail-share-action"
                onClick={() => {
                  window.print();
                  setShowShareSheet(false);
                }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <polyline points="6 9 6 2 18 2 18 9" />
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                  <rect x="6" y="14" width="12" height="8" />
                </svg>
                <span>Print</span>
              </button>
              <button className="detail-share-action" disabled>
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <circle cx="18" cy="5" r="3" />
                  <circle cx="6" cy="12" r="3" />
                  <circle cx="18" cy="19" r="3" />
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                </svg>
                <span>Share Link (Coming Soon)</span>
              </button>
            </div>
          </aside>
        </>
      )}

      {/* ── HERO SECTION ── */}
      <div className="detail-event-hero">
        {/* Days pill - absolutely positioned top-right */}
        {daysInfo && (
          <span className={`pill event-days ${daysInfo.colorClass}`}>
            {daysInfo.text}
          </span>
        )}

        {/* Event title */}
        <h1 className="detail-event-title">{currentEvent.title}</h1>

        {/* Type — plain text, no pill */}
        <span className="detail-event-type">{currentEvent.type}</span>

        {/* Date/Time + Location + Client — one row, SVG icons, no emojis */}
        {(currentEvent.dateTime || currentEvent.location || currentEvent.client) && (
          <div className="detail-event-meta-row">
            {currentEvent.dateTime && (
              <span className="pill detail-event-meta-pill">
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="detail-event-meta-icon">
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <path d="M16 2v4M8 2v4M3 10h18" />
                </svg>
                {formattedDate} • {formattedTime}
              </span>
            )}
            {currentEvent.location && (
              <button
                className="pill detail-event-meta-pill detail-event-location-pill"
                onClick={() => {/* TODO: Open map/navigate */}}
                aria-label={`Location: ${currentEvent.location}`}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="detail-event-meta-icon">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
                  <circle cx="12" cy="9" r="2.5" />
                </svg>
                {currentEvent.location}
              </button>
            )}
            {currentEvent.client && (
              <span className="pill detail-event-meta-pill">Client: {currentEvent.client}</span>
            )}
          </div>
        )}
      </div>

      {/* ── CONTENT CARDS ── */}
      <div className="detail-event-body">

        {/* Notes Card - only if notes exist, read-only, no label */}
        {currentEvent.notes && (
          <div className="card detail-event-notes-card">
            {currentEvent.notes}
          </div>
        )}

        {/* Packing Progress Card */}
        <div className="card stack-md">
          <div className="row between wrap">
            <strong>Packing Progress</strong>
            <span>{packed}/{total} items packed</span>
          </div>
          <div className="progress-track">
            <span style={{ width: `${ratio}%` }} />
          </div>
        </div>

        {/* Packing Checklist Card */}
        <div className="card stack-md">
          <div className="row between wrap">
            <h3>Packing Checklist ({total})</h3>
            <div className="row wrap" style={{ gap: '0.5rem' }}>
              {total > 0 && (
                <button className="ghost danger" onClick={() => void resetChecklist()} style={{ fontSize: '0.9rem', padding: '0.35rem 0.75rem' }}>
                  Reset
                </button>
              )}
              <button onClick={() => setShowAddItem((prev) => !prev)}>
                {showAddItem ? 'Hide' : '+ Add Item'}
              </button>
            </div>
          </div>

          {showAddItem && (
            <div className="stack-sm">
              <label className="stack-sm">
                <strong>Add from Catalog</strong>
                <select value={catalogItemId} onChange={(e) => setCatalogItemId(e.target.value)}>
                  <option value="">Choose an item</option>
                  {catalog.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <button onClick={() => void addCatalogItem()} disabled={!catalogItemId}>Add from Catalog</button>

              <hr />

              <label className="stack-sm">
                <strong>Add Custom Item</strong>
                <input
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  placeholder="Item name"
                  onKeyDown={(e) => e.key === 'Enter' && void addManualItem()}
                />
              </label>
              <button onClick={() => void addManualItem()} disabled={!newItemName.trim()}>Add Manual Item</button>
            </div>
          )}

          {currentEvent.packingChecklist.length === 0 ? (
            <div className="empty">
              <h4>No items in checklist</h4>
              <p>Add items to start packing</p>
            </div>
          ) : (
            <div className="stack-sm">
              {currentEvent.packingChecklist.map((item, idx) => (
                <div key={item.id} className="checklist-row stack-sm">
                  <div className="row between wrap">
                    <label className="checkbox-inline">
                      <input
                        type="checkbox"
                        checked={item.packed}
                        onChange={(e) => {
                          const next = currentEvent.packingChecklist.map((row) =>
                            row.id === item.id ? { ...row, packed: e.target.checked } : row,
                          );
                          void setChecklist(next);
                        }}
                      />
                      <strong>{item.name} × {item.quantity}</strong>
                    </label>
                    <div className="row wrap">
                      <button className="ghost icon-compact-btn" onClick={() => move(idx, -1)} disabled={idx === 0}>
                        ↑
                      </button>
                      <button className="ghost icon-compact-btn" onClick={() => move(idx, 1)} disabled={idx === currentEvent.packingChecklist.length - 1}>
                        ↓
                      </button>
                    </div>
                  </div>

                  <div className="row wrap">
                    <select
                      value={item.priority ?? 'optional'}
                      onChange={(e) => {
                        const next = currentEvent.packingChecklist.map((row) =>
                          row.id === item.id
                            ? {
                                ...row,
                                priority: e.target.value as typeof row.priority,
                              }
                            : row,
                        );
                        void setChecklist(next);
                      }}
                    >
                      <option value="must-have">Must-have</option>
                      <option value="nice-to-have">Nice-to-have</option>
                      <option value="optional">Optional</option>
                    </select>
                    <button
                      className="ghost danger"
                      onClick={() => {
                        const next = currentEvent.packingChecklist.filter((i) => i.id !== item.id);
                        void setChecklist(next);
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Missing Items Card (if any) */}
        {currentEvent.missingItems.length > 0 && (
          <div className="card stack-md">
            <h3>Missing Items ({currentEvent.missingItems.length})</h3>
            <p className="subtle">Items suggested by AI that are not in your catalog</p>
            <div className="stack-sm">
              {currentEvent.missingItems.map((item) => (
                <div key={item.id} className="checklist-row stack-sm">
                  <strong>{item.name}</strong>
                  <p className="subtle">{item.reason}</p>
                  <div className="row wrap">
                    <span className="pill">{item.priority}</span>
                    <span className="pill">{item.action}</span>
                    <select
                      value={item.resolvedStatus ?? 'unresolved'}
                      onChange={(e) => {
                        const next = currentEvent.missingItems.map((row) =>
                          row.id === item.id
                            ? {
                                ...row,
                                resolvedStatus: e.target.value as typeof row.resolvedStatus,
                              }
                            : row,
                        );
                        void setMissing(next);
                      }}
                    >
                      <option value="unresolved">Unresolved</option>
                      <option value="planned">Planned</option>
                      <option value="acquired">Acquired</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
