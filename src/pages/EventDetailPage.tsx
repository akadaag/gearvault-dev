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

  const [showAddSheet, setShowAddSheet] = useState(false);
  const [showEditSheet, setShowEditSheet] = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [selectedCatalogItems, setSelectedCatalogItems] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  if (!event) return <div className="card">Event not found.</div>;
  const currentEvent = event;

  const packed = currentEvent.packingChecklist.filter((i) => i.packed).length;
  const total = currentEvent.packingChecklist.length;
  const ratio = total > 0 ? Math.round((packed / total) * 100) : 0;

  const daysInfo = currentEvent.dateTime ? getDaysUntilEvent(currentEvent.dateTime) : null;

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
    try {
      const next = currentEvent.packingChecklist.map((i) => ({ ...i, packed: false }));
      await setChecklist(next);
    } catch (error) {
      console.error('Failed to reset checklist:', error);
      alert('Failed to reset checklist. Please try again.');
    }
  }

  async function deleteEvent() {
    if (!window.confirm('Delete this event? This cannot be undone.')) return;
    await db.events.delete(currentEvent.id);
    navigate('/events');
  }


  function togglePacked(itemId: string, checked: boolean) {
    const next = currentEvent.packingChecklist.map((row) =>
      row.id === itemId ? { ...row, packed: checked } : row,
    );
    void setChecklist(next);
  }

  function removeItem(itemId: string) {
    const next = currentEvent.packingChecklist.filter((i) => i.id !== itemId);
    void setChecklist(next);
  }

  function toggleSelection(itemId: string) {
    const next = new Set(selectedCatalogItems);
    if (next.has(itemId)) {
      next.delete(itemId);
    } else {
      next.add(itemId);
    }
    setSelectedCatalogItems(next);
  }

  async function addSelectedItems() {
    try {
      const itemsToAdd: PackingChecklistItem[] = [];
      
      for (const catalogItemId of selectedCatalogItems) {
        const catalogItem = catalog.find((c) => c.id === catalogItemId);
        if (!catalogItem) continue;
        
        const priority: PackingChecklistItem['priority'] = catalogItem.essential ? 'must-have' : 'nice-to-have';
        itemsToAdd.push({
          id: makeId(),
          eventId: currentEvent.id,
          gearItemId: catalogItem.id,
          name: catalogItem.name,
          quantity: 1,
          packed: false,
          priority,
        });
      }
      
      if (itemsToAdd.length === 0) return;
      
      const next = [...currentEvent.packingChecklist, ...itemsToAdd];
      await setChecklist(next);
      
      // Reset selection and close sheet
      setSelectedCatalogItems(new Set());
      setSearchQuery('');
      setShowAddSheet(false);
    } catch (error) {
      console.error('Failed to add items:', error);
      alert('Failed to add items. Please try again.');
    }
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

  // Catalog items not yet in the checklist
  const availableCatalogItems = catalog.filter(
    (c) => !currentEvent.packingChecklist.some((p) => p.gearItemId === c.id),
  );

  // Filter by search query
  const filteredAvailableItems = availableCatalogItems.filter((item) =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

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

          {/* Share button */}
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
                onClick={() => { exportEventToPdf(currentEvent); setShowShareSheet(false); }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <path d="M14 2v6h6" />
                </svg>
                <span>Export PDF</span>
              </button>
              <button
                className="detail-share-action"
                onClick={() => { exportEventJson(); setShowShareSheet(false); }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M7 7h10M7 12h10M7 17h6" />
                </svg>
                <span>Export JSON</span>
              </button>
              <button
                className="detail-share-action"
                onClick={() => { window.print(); setShowShareSheet(false); }}
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

      {/* ── ADD ITEM SHEET ── */}
      {showAddSheet && (
        <>
          <button className="sheet-overlay" aria-label="Close add item sheet" onClick={() => setShowAddSheet(false)} />
          <aside className="filter-sheet card maintenance-add-sheet" aria-label="Add to packing list">
            <div className="maintenance-sheet-header">
              <h3>Add from catalog</h3>
              <button className="sheet-close-btn" onClick={() => setShowAddSheet(false)} aria-label="Close">✕</button>
            </div>
              <div className="maintenance-sheet-body stack-sm">
                {/* Search bar */}
                <div className="catalog-search-container">
                  <svg className="catalog-search-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    type="text"
                    className="catalog-search-input"
                    placeholder="Search gear..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

              {filteredAvailableItems.length === 0 ? (
                <p className="subtle" style={{ textAlign: 'center', padding: '1rem 0' }}>
                  {searchQuery ? 'No items found matching your search.' : 'All catalog items are already in this list.'}
                </p>
              ) : (
                <div className="catalog-select-scroll-area">
                  <div className="catalog-select-list">
                    {filteredAvailableItems.map((item) => (
                      <div key={item.id} className={`catalog-select-item${selectedCatalogItems.has(item.id) ? ' selected' : ''}`}>
                        <button
                          className={`catalog-select-circle${selectedCatalogItems.has(item.id) ? ' selected' : ''}`}
                          onClick={() => toggleSelection(item.id)}
                          aria-label={selectedCatalogItems.has(item.id) ? 'Deselect item' : 'Select item'}
                        >
                          {selectedCatalogItems.has(item.id) && (
                            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </button>
                        <div className="catalog-select-info">
                          <span className="catalog-select-name">{item.name}</span>
                          {item.brand && <span className="catalog-select-brand">{item.brand}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="maintenance-sheet-footer">
              <button
                onClick={addSelectedItems}
                disabled={selectedCatalogItems.size === 0}
              >
                Add {selectedCatalogItems.size} Item{selectedCatalogItems.size !== 1 ? 's' : ''}
              </button>
            </div>
          </aside>
        </>
      )}

      {/* ── HERO SECTION ── */}
      <div className="detail-event-hero">
        <div className="detail-event-title-row">
          <h1 className="detail-event-title">{currentEvent.title}</h1>
          {daysInfo && (
            <span className={`pill event-days ${daysInfo.colorClass}`}>
              {daysInfo.text}
            </span>
          )}
        </div>

        <span className="detail-event-type">{currentEvent.type}</span>

        {(currentEvent.dateTime || currentEvent.location || currentEvent.client) && (
          <div className="detail-event-meta-row">
            {currentEvent.dateTime && (
              <>
                <span className="pill detail-event-meta-pill">{formattedDate}</span>
                <span className="pill detail-event-meta-pill">{formattedTime}</span>
              </>
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

      {/* ── CONTENT ── */}
      <div className="detail-event-body">

        {/* Notes — read-only, only when present */}
        {currentEvent.notes && (
          <div className="card detail-event-notes-card">
            {currentEvent.notes}
          </div>
        )}

        {/* Packing Progress — only when items exist */}
        {total > 0 && (
          <div className="card detail-progress-card">
            <div className="row between wrap">
              <span className="detail-progress-label">
                <span className={`detail-progress-label-circle${ratio === 100 ? ' complete' : ''}`}>
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="detail-progress-label-icon">
                    <polyline points="20 6 9 17 4 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                Packing Progress
              </span>
              <span className="detail-progress-text">
                {packed}/{total}
              </span>
            </div>
            <div className="progress-track">
              <span style={{ width: `${ratio}%` }} className={ratio === 100 ? 'complete' : ''} />
            </div>
          </div>
        )}

        {/* ── CHECKLIST HEADER (outside any card) ── */}
        <div className="detail-checklist-header">
          <h3>Packing Checklist</h3>
          <div className="row" style={{ gap: '0.5rem' }}>
             {total > 0 && (
               <button
                 className="pill detail-event-action-pill"
                 onClick={() => void resetChecklist()}
                 aria-label="Reset packing list"
               >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="detail-event-action-icon">
                  <path d="M1 4v6h6" />
                  <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                </svg>
                Reset
              </button>
            )}
            <button
              className="pill detail-event-action-pill detail-event-add-pill"
              onClick={() => setShowAddSheet(true)}
              aria-label="Add item to packing list"
            >
              + Add
            </button>
          </div>
        </div>

        {/* Empty state */}
        {total === 0 && (
          <div className="card detail-checklist-empty">
            No items in the checklist
          </div>
        )}

        {/* Checklist items — each a compact single-line card */}
        {total > 0 && (
          <div className="stack-sm">
            {currentEvent.packingChecklist.map((item) => (
              <div key={item.id} className="detail-checklist-item">
                {/* Circle checkbox */}
                <button
                  className={`detail-checklist-circle${item.packed ? ' packed' : ''}`}
                  onClick={() => togglePacked(item.id, !item.packed)}
                  aria-label={item.packed ? 'Mark as unpacked' : 'Mark as packed'}
                >
                  {item.packed && (
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>

                {/* Item name */}
                <span className="detail-checklist-name">{item.name}</span>

                {/* Remove button */}
                <button
                  className="detail-checklist-remove"
                  onClick={() => removeItem(item.id)}
                  aria-label={`Remove ${item.name}`}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Missing Items (AI-suggested) */}
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
                            ? { ...row, resolvedStatus: e.target.value as typeof row.resolvedStatus }
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
