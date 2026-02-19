import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { makeId } from '../lib/ids';
import { exportEventToPdf } from '../lib/pdf';
import { lockSheetScroll, unlockSheetScroll } from '../lib/sheetLock';
import { useSheetDismiss } from '../hooks/useSheetDismiss';
import { EventFormSheet } from '../components/EventFormSheet';
import { getDaysUntilEvent } from '../lib/eventHelpers';
import type { PackingChecklistItem } from '../types/models';
import { ContentEditableInput } from '../components/ContentEditableInput';

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

  // Dismiss animation hooks for inline sheets
  const { closing: closingShare, dismiss: dismissShare, onAnimationEnd: onAnimationEndShare } =
    useSheetDismiss(() => setShowShareSheet(false));
  const { closing: closingAdd, dismiss: dismissAdd, onAnimationEnd: onAnimationEndAdd } =
    useSheetDismiss(() => { setShowAddSheet(false); setSelectedCatalogItems(new Set()); setSearchQuery(''); });

  // Lock body scroll when any sheet is open
  useEffect(() => {
    if (showShareSheet || showAddSheet) {
      lockSheetScroll();
    } else {
      unlockSheetScroll();
    }
    return () => unlockSheetScroll();
  }, [showShareSheet, showAddSheet]);

  if (!event) {
    return (
      <div className="event-detail-page ios-theme">
        <div className="ev-detail-ios-empty">Event not found.</div>
      </div>
    );
  }
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
    if (!window.confirm('Are you sure you want to remove all items?')) return;
    try {
      await setChecklist([]);
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
    item.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <section className="event-detail-page ios-theme">

      {/* ── HEADER ── */}
      <header className="ev-detail-header">
        <button
          onClick={() => navigate('/events')}
          className="ev-detail-back-btn"
          aria-label="Back to events"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Events
        </button>
        <div className="ev-detail-header-actions">
          <button
            className="ev-detail-icon-btn"
            onClick={() => setShowShareSheet(true)}
            aria-label="Share & export event"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
          </button>
          <button
            className="ev-detail-icon-btn"
            onClick={() => setShowEditSheet(true)}
            aria-label="Edit event"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
          </button>
          <button
            className="ev-detail-icon-btn destructive"
            onClick={() => void deleteEvent()}
            aria-label="Delete event"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>
      </header>

      {/* ── SCROLL CONTENT ── */}
      <div className="ev-detail-content">

        {/* Title & Type */}
        <div className="ev-detail-hero">
          <h1 className="ev-detail-title">{currentEvent.title}</h1>
          <div className="ev-detail-type-row">
            <span className="ev-detail-type-badge">{currentEvent.type}</span>
            {daysInfo && (
              <span className={`ev-detail-days ${daysInfo.colorClass}`}>
                {daysInfo.text}
              </span>
            )}
          </div>

          {/* Metadata Row */}
          {(currentEvent.dateTime || currentEvent.location || currentEvent.client) && (
            <div className="ev-detail-meta-grid">
              {currentEvent.dateTime && (
                <div className="ev-detail-meta-item">
                  <div className="ev-detail-meta-icon red">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                  </div>
                  <div className="ev-detail-meta-text">
                    <strong>{formattedDate}</strong>
                    <span>{formattedTime}</span>
                  </div>
                </div>
              )}
              {currentEvent.location && (
                <button
                  className="ev-detail-meta-item ev-detail-meta-item-btn"
                  onClick={() => window.open(`https://maps.google.com/?q=${encodeURIComponent(currentEvent.location!)}`, '_blank')}
                  aria-label={`Location: ${currentEvent.location}`}
                >
                  <div className="ev-detail-meta-icon blue">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                  </div>
                  <div className="ev-detail-meta-text">
                    <strong>Location</strong>
                    <span>{currentEvent.location}</span>
                  </div>
                </button>
              )}
              {currentEvent.client && (
                <div className="ev-detail-meta-item">
                  <div className="ev-detail-meta-icon purple">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                  </div>
                  <div className="ev-detail-meta-text">
                    <strong>Client</strong>
                    <span>{currentEvent.client}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {currentEvent.notes && (
            <div className="ev-detail-notes">
              {currentEvent.notes}
            </div>
          )}
        </div>

        {/* Progress Card */}
        {total > 0 && (
          <div className="ev-detail-glass-card ev-detail-progress-section">
            <div className="ev-detail-progress-header">
              <span className="ev-detail-section-label">Packing Progress</span>
              <span className="ev-detail-progress-val">{packed} / {total}</span>
            </div>
            <div className="ev-detail-progress-track">
              <div
                className={`ev-detail-progress-fill${ratio === 100 ? ' complete' : ''}`}
                style={{ width: `${ratio}%` }}
              />
            </div>
          </div>
        )}

        {/* Checklist Section */}
        <div className="ev-detail-checklist-section">
          <div className="ev-detail-section-header">
            <h3>Packing Checklist</h3>
            <div className="ev-detail-section-actions">
              {total > 0 && (
                <button className="ev-detail-text-btn" onClick={() => void resetChecklist()}>Reset</button>
              )}
              <button className="ev-detail-add-btn" onClick={() => setShowAddSheet(true)} aria-label="Add item to packing list">
                <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3" fill="none"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              </button>
            </div>
          </div>

          {total === 0 ? (
            <div className="ev-detail-empty-state">
              <p>No items in the checklist</p>
              <button className="ev-detail-text-btn" onClick={() => setShowAddSheet(true)}>Add Items</button>
            </div>
          ) : (
            <div className="ev-detail-list-group">
              {currentEvent.packingChecklist.map((item) => (
                <div key={item.id} className="ev-detail-item-row">
                  <button
                    className={`ev-detail-check-circle${item.packed ? ' checked' : ''}`}
                    onClick={() => togglePacked(item.id, !item.packed)}
                    aria-label={item.packed ? 'Mark as unpacked' : 'Mark as packed'}
                  >
                    {item.packed && <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3" fill="none"><polyline points="20 6 9 17 4 12" /></svg>}
                  </button>
                  <div className="ev-detail-item-info">
                    <span className={`ev-detail-item-name${item.packed ? ' struck' : ''}`}>
                      {item.name}
                      {item.quantity > 1 && <span className="ev-detail-qty"> x{item.quantity}</span>}
                    </span>
                    {item.priority === 'must-have' && <span className="ev-detail-priority-dot" aria-label="Essential" />}
                  </div>
                  <button className="ev-detail-delete-row-btn" onClick={() => removeItem(item.id)} aria-label={`Remove ${item.name}`}>
                    <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Missing Items */}
        {currentEvent.missingItems.length > 0 && (
          <div className="ev-detail-missing-section">
            <div className="ev-detail-section-header">
              <h3>Missing Items ({currentEvent.missingItems.length})</h3>
            </div>
            <p className="ev-detail-missing-desc">Items suggested by AI that are not in your catalog</p>
            <div className="ev-detail-glass-card ev-detail-missing-list">
              {currentEvent.missingItems.map((item) => (
                <div key={item.id} className="ev-detail-missing-row">
                  <div className="ev-detail-missing-info">
                    <strong>{item.name}</strong>
                    <p>{item.reason}</p>
                    <div className="ev-detail-missing-pills">
                      <span className="ev-detail-missing-pill">{item.priority}</span>
                      <span className="ev-detail-missing-pill">{item.action}</span>
                    </div>
                  </div>
                  <select
                    className="ev-detail-missing-select"
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
              ))}
            </div>
          </div>
        )}

        <div className="ev-detail-bottom-spacer" />
      </div>

      {/* ── SHEETS ── */}
      {showEditSheet && (
        <EventFormSheet
          mode="edit"
          initialData={currentEvent}
          onClose={() => setShowEditSheet(false)}
        />
      )}

      {showShareSheet && (
        <>
          <div className={`ios-sheet-backdrop${closingShare ? ' closing' : ''}`} onClick={dismissShare} />
          <div className={`ios-sheet-modal${closingShare ? ' closing' : ''}`} aria-label="Share & export" onAnimationEnd={onAnimationEndShare}>
            <div className="ios-sheet-handle" />
            <div className="ios-sheet-header">
              <span />
              <h3 className="ios-sheet-title">Share &amp; Export</h3>
              <button className="ios-sheet-btn primary" onClick={dismissShare}>Done</button>
            </div>
            <div className="ios-sheet-content">
              <div className="ev-detail-share-options">
                <button className="ev-detail-share-btn" onClick={() => { exportEventToPdf(currentEvent); dismissShare(); }}>
                  <div className="ev-detail-share-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
                  </div>
                  <span>Export PDF</span>
                </button>
                <button className="ev-detail-share-btn" onClick={() => { exportEventJson(); dismissShare(); }}>
                  <div className="ev-detail-share-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7 7h10M7 12h10M7 17h6" /></svg>
                  </div>
                  <span>Export JSON</span>
                </button>
                <button className="ev-detail-share-btn" onClick={() => { window.print(); dismissShare(); }}>
                  <div className="ev-detail-share-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
                  </div>
                  <span>Print</span>
                </button>
                <button className="ev-detail-share-btn" disabled>
                  <div className="ev-detail-share-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></svg>
                  </div>
                  <span>Share Link</span>
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {showAddSheet && (
        <>
          <div className={`ios-sheet-backdrop${closingAdd ? ' closing' : ''}`} onClick={dismissAdd} />
          <div className={`ios-sheet-modal${closingAdd ? ' closing' : ''}`} aria-label="Add to packing list" onAnimationEnd={onAnimationEndAdd}>
            <div className="ios-sheet-handle" />
            <div className="ios-sheet-header">
              <button className="ios-sheet-btn secondary" onClick={dismissAdd}>Cancel</button>
              <h3 className="ios-sheet-title">Add Items</h3>
              <button className="ios-sheet-btn primary" onClick={addSelectedItems} disabled={selectedCatalogItems.size === 0}>
                Add{selectedCatalogItems.size > 0 ? ` (${selectedCatalogItems.size})` : ''}
              </button>
            </div>

            <div className="ios-sheet-content">
              <div className="ev-detail-search-container">
                <div className="ev-detail-search-bar">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                  <ContentEditableInput
                    placeholder="Search catalog..."
                    value={searchQuery}
                    onChange={setSearchQuery}
                    onFocus={() => document.documentElement.classList.add('keyboard-open')}
                    onBlur={() => document.documentElement.classList.remove('keyboard-open')}
                    aria-label="Search catalog"
                  />
                </div>
              </div>

              <div className="ev-detail-sheet-list">
                {filteredAvailableItems.length === 0 ? (
                  <div className="ev-detail-empty-state">
                    <p>{searchQuery ? 'No items found matching your search.' : 'All catalog items are already in this list.'}</p>
                  </div>
                ) : (
                  filteredAvailableItems.map((item) => (
                    <div key={item.id} className="ev-detail-item-row" onClick={() => toggleSelection(item.id)}>
                      <button
                        className={`ev-detail-check-circle${selectedCatalogItems.has(item.id) ? ' checked' : ''}`}
                        aria-label={selectedCatalogItems.has(item.id) ? 'Deselect item' : 'Select item'}
                      >
                        {selectedCatalogItems.has(item.id) && <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3" fill="none"><polyline points="20 6 9 17 4 12" /></svg>}
                      </button>
                      <div className="ev-detail-item-info">
                        <span className="ev-detail-item-name">{item.name}</span>
                        {item.brand && <span className="ev-detail-item-sub">{item.brand}</span>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}

    </section>
  );
}
