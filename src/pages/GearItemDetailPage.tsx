import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { formatMoney } from '../lib/format';
import { makeId } from '../lib/ids';
import { GearItemFormSheet, type GearFormDraft } from '../components/GearItemFormSheet';
import { MaintenanceSheet } from '../components/MaintenanceSheet';
import { lockSheetScroll, unlockSheetScroll } from '../lib/sheetLock';
import { useSheetDismiss } from '../hooks/useSheetDismiss';
import { compressedImageToDataUrl, removeGearPhotoByUrl, uploadCompressedGearPhoto } from '../lib/gearPhotos';
import { useAuth } from '../hooks/useAuth';
import { classificationQueue } from '../lib/gearClassifier';
import type { GearItem, MaintenanceEntry } from '../types/models';

const emptyDraft: GearFormDraft = {
  name: '',
  categoryId: '',
  brand: '',
  model: '',
  serialNumber: '',
  purchaseDate: '',
  purchasePrice: '',
  currentValue: '',
  notes: '',
  customFieldsText: '',
  condition: 'good',
  quantity: 1,
  tagsText: '',
  essential: false,
  photo: '',
  photoPreview: '',
  photoFile: null,
  removePhoto: false,
};

export function GearItemDetailPage() {
  const { user, isConfigured } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const item = useLiveQuery(() => (id ? db.gearItems.get(id) : undefined), [id]);
  const categories = useLiveQuery(() => db.categories.toArray(), [], []);
  const events = useLiveQuery(() => db.events.toArray(), [], []);
  const allItems = useLiveQuery(() => db.gearItems.toArray(), [], []);
  const [eventTarget, setEventTarget] = useState('');
  const [showAddToEvent, setShowAddToEvent] = useState(false);
  const [showEditSheet, setShowEditSheet] = useState(false);
  const [showMaintenanceSheet, setShowMaintenanceSheet] = useState(false);
  const [showImageViewer, setShowImageViewer] = useState(false);
  const [editError, setEditError] = useState('');
  const [essentialNotice, setEssentialNotice] = useState('');
  const [draft, setDraft] = useState<GearFormDraft>(emptyDraft);

  // Closing animation for add-to-event sheet
  const { closing: closingAddEvent, dismiss: dismissAddEvent, onAnimationEnd: onAddEventAnimEnd } = useSheetDismiss(() => setShowAddToEvent(false));

  useEffect(() => {
    if (!showAddToEvent) return;
    lockSheetScroll();
    return () => unlockSheetScroll();
  }, [showAddToEvent]);

  useEffect(() => {
    if (!showImageViewer) return;
    lockSheetScroll();

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowImageViewer(false);
      }
    };

    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('keydown', handleEsc);
      unlockSheetScroll();
    };
  }, [showImageViewer]);

  useEffect(() => {
    if (!essentialNotice) return;
    const timeoutId = window.setTimeout(() => setEssentialNotice(''), 2200);
    return () => window.clearTimeout(timeoutId);
  }, [essentialNotice]);

  const related = useMemo(
    () => allItems.filter((g) => item?.relatedItemIds?.includes(g.id)),
    [allItems, item],
  );

  if (!item) return <section className="gear-detail-page ios-theme"><div className="gear-detail-empty">Item not found.</div></section>;
  const currentItem = item;
  const editDraft = toDraft(currentItem);
  const maintenanceCount = currentItem.maintenanceHistory?.length ?? 0;
  const accessoriesCount = currentItem.relatedItemIds?.length ?? 0;
  const isInAnyEvent = events.some((ev) => ev.packingChecklist.some((entry) => entry.gearItemId === currentItem.id));
  const selectedEventHasItem = Boolean(
    eventTarget
    && events.find((ev) => ev.id === eventTarget)?.packingChecklist.some((entry) => entry.gearItemId === currentItem.id),
  );
  const hasItemInfo = Boolean(currentItem.serialNumber || currentItem.purchaseDate || currentItem.currentValue);
  const hasWarrantyInfo = Boolean(currentItem.warranty?.provider || currentItem.warranty?.expirationDate || currentItem.warranty?.notes);
  const maintenanceSummary = getMaintenanceSummary(currentItem);

  async function save(patch: Partial<GearItem>) {
    await db.gearItems.update(currentItem.id, { ...patch, updatedAt: new Date().toISOString() });
  }

  async function saveMaintenanceEntry(entry: MaintenanceEntry) {
    await save({
      maintenanceHistory: [...(currentItem.maintenanceHistory ?? []), entry],
    });
  }

  async function updateMaintenanceEntry(entry: MaintenanceEntry) {
    await save({
      maintenanceHistory: (currentItem.maintenanceHistory ?? []).map((existing) => (
        existing.id === entry.id ? { ...existing, ...entry } : existing
      )),
    });
  }

  async function deleteMaintenanceEntry(entryId: string) {
    await save({
      maintenanceHistory: (currentItem.maintenanceHistory ?? []).filter((existing) => existing.id !== entryId),
    });
  }

  async function saveEdit() {
    if (!draft.name.trim()) {
      setEditError('Name is required');
      return;
    }
    if (!draft.categoryId) {
      setEditError('Category is required');
      return;
    }

    let photo: string | undefined = currentItem.photo;

    try {
      if (draft.removePhoto) {
        if (user && isConfigured) {
          await removeGearPhotoByUrl(currentItem.photo);
        }
        photo = undefined;
      } else if (draft.photoFile) {
        if (user && isConfigured) {
          const uploaded = await uploadCompressedGearPhoto({
            file: draft.photoFile,
            userId: user.id,
            itemId: currentItem.id,
          });
          await removeGearPhotoByUrl(currentItem.photo);
          photo = uploaded.url;
        } else {
          photo = await compressedImageToDataUrl(draft.photoFile);
        }
      }
    } catch (photoError: unknown) {
      setEditError(photoError instanceof Error ? photoError.message : 'Could not process photo.');
      return;
    }

    await save({
      name: draft.name.trim(),
      categoryId: draft.categoryId,
      brand: draft.brand.trim() || undefined,
      model: draft.model.trim() || undefined,
      serialNumber: draft.serialNumber.trim() || undefined,
      purchaseDate: draft.purchaseDate || undefined,
      purchasePrice: parseMoney(draft.purchasePrice),
      currentValue: parseMoney(draft.currentValue),
      notes: draft.notes.trim() || undefined,
      customFields: parseCustomFields(draft.customFieldsText),
      condition: draft.condition,
      quantity: Math.max(1, Number(draft.quantity) || 1),
      tags: draft.tagsText.split(',').map((t) => t.trim()).filter(Boolean),
      essential: draft.essential,
      photo,
    });

    // If name/brand/model changed, re-classify
    const nameChanged = draft.name.trim() !== currentItem.name;
    const brandChanged = (draft.brand.trim() || undefined) !== currentItem.brand;
    const modelChanged = (draft.model.trim() || undefined) !== currentItem.model;
    
    if (nameChanged || brandChanged || modelChanged) {
      // Reset classification status to allow re-classification
      await db.gearItems.update(currentItem.id, { classificationStatus: undefined });
      
      const updated = await db.gearItems.get(currentItem.id);
      if (updated) {
        classificationQueue.enqueue(updated);
      }
    }

    setShowEditSheet(false);
    setEditError('');
  }

  async function deleteItem() {
    if (!window.confirm(`Delete ${currentItem.name}?`)) return;
    if (user && isConfigured) {
      await removeGearPhotoByUrl(currentItem.photo);
    }
    await db.gearItems.delete(currentItem.id);
    navigate('/catalog');
  }

  async function addToEvent() {
    if (!eventTarget) return;
    const event = await db.events.get(eventTarget);
    if (!event) return;

    const alreadyLinked = event.packingChecklist.some((entry) => entry.gearItemId === currentItem.id);
    if (alreadyLinked) {
      setShowAddToEvent(false);
      setEventTarget('');
      return;
    }

    event.packingChecklist.push({
      id: makeId(),
      eventId: event.id,
      gearItemId: currentItem.id,
      name: currentItem.name,
      quantity: 1,
      packed: false,
      priority: currentItem.essential ? 'must-have' : 'nice-to-have',
      categoryName: categories.find((c) => c.id === currentItem.categoryId)?.name,
    });

    await db.events.update(event.id, {
      packingChecklist: event.packingChecklist,
      updatedAt: new Date().toISOString(),
    });

    setShowAddToEvent(false);
    setEventTarget('');
  }

  async function toggleEssential() {
    const nextEssential = !currentItem.essential;
    await save({ essential: nextEssential });
    setEssentialNotice(nextEssential ? 'Added to essentials' : 'Removed from essentials');
  }

  return (
    <section className="gear-detail-page ios-theme">
      {/* ── Header ── */}
      <header className="gear-detail-header">
        <button className="gear-detail-back-btn" onClick={() => navigate('/catalog')} aria-label="Back to catalog">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Catalog
        </button>
        <div className="gear-detail-header-actions">
          <button
            className={`gear-detail-icon-btn${isInAnyEvent ? ' active' : ''}`}
            onClick={() => setShowAddToEvent(true)}
            aria-label="Add to event packing list"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="m8.7 12.2 2.1 2.2 4.6-4.6" />
            </svg>
          </button>
          <button
            className="gear-detail-icon-btn"
            onClick={() => { setDraft(editDraft); setShowEditSheet(true); }}
            aria-label="Edit"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6" />
              <path d="m9 16 4.4-4.4a1.5 1.5 0 0 1 2.1 2.1L11.1 18.1 8 19z" />
            </svg>
          </button>
          <button className="gear-detail-icon-btn destructive" onClick={() => void deleteItem()} aria-label="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 6h18" />
              <path d="M8 6V4h8v2" />
              <path d="M19 6l-1 14H6L5 6" />
              <path d="M10 11v6M14 11v6" />
            </svg>
          </button>
        </div>
      </header>

      {/* ── Scrollable Content ── */}
      <div className="gear-detail-content">
        {/* Hero Photo */}
        <div className="gear-detail-hero">
          {currentItem.photo ? (
            <img
              src={currentItem.photo}
              alt={currentItem.name}
              className="gear-detail-hero-img"
              onClick={() => setShowImageViewer(true)}
            />
          ) : (
            <div className="gear-detail-hero-placeholder" aria-hidden="true">
              {currentItem.name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        {/* Image Viewer Overlay */}
        {showImageViewer && currentItem.photo && (
          <div
            className="image-viewer-overlay"
            role="button"
            tabIndex={0}
            aria-label="Close image preview"
            onClick={() => setShowImageViewer(false)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                setShowImageViewer(false);
              }
            }}
          >
            <img
              src={currentItem.photo}
              alt={currentItem.name}
              className="image-viewer-image"
              onClick={(event) => event.stopPropagation()}
            />
          </div>
        )}

        {/* Title Block */}
        <div className="gear-detail-title-block">
          <div className="gear-detail-title-row">
            <h1 className="gear-detail-name">{currentItem.name}</h1>
            <button
              type="button"
              className={`gear-detail-essential-btn${currentItem.essential ? ' is-active' : ''}`}
              onClick={() => void toggleEssential()}
              onPointerUp={(e) => e.currentTarget.blur()}
              aria-label={currentItem.essential ? 'Remove from essentials' : 'Add to essentials'}
              aria-pressed={currentItem.essential}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m12 2.4 2.95 5.98 6.6.96-4.77 4.65 1.12 6.58L12 17.47l-5.9 3.1 1.12-6.58-4.77-4.65 6.6-.96z" />
              </svg>
            </button>
          </div>
          <p className="gear-detail-subtitle">{[currentItem.brand, currentItem.model].filter(Boolean).join(' ') || 'No brand/model yet'}</p>
          <div className="gear-detail-badges">
            <span className="gear-detail-badge">{categories.find((c) => c.id === currentItem.categoryId)?.name}</span>
            <span className={`gear-detail-badge condition-${currentItem.condition}`}>{currentItem.condition}</span>
            {currentItem.quantity > 1 && <span className="gear-detail-badge">{'\u00D7'}{currentItem.quantity} units</span>}
          </div>
        </div>

        {/* Price Card */}
        {currentItem.purchasePrice && (
          <div className="gear-detail-glass-card gear-detail-price-card">
            <div className="gear-detail-price-icon" aria-hidden="true">$</div>
            <div>
              <p className="gear-detail-price-label">Purchase Price</p>
              <p className="gear-detail-price-value">{formatMoney(currentItem.purchasePrice.amount, currentItem.purchasePrice.currency)}</p>
            </div>
          </div>
        )}

        {/* Quick Grid */}
        <div className="gear-detail-quick-grid">
          <button type="button" className="gear-detail-glass-card gear-detail-quick-card" onClick={() => setShowMaintenanceSheet(true)}>
            <div className="gear-detail-quick-icon blue" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.7 6.3a4.5 4.5 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4.5 4.5 0 0 0 5.4-5.4l-2.4 2.4-2.2-2.2z" />
              </svg>
            </div>
            <div className="gear-detail-quick-info">
              <strong>Maintenance</strong>
              <p>{maintenanceCount} records</p>
              <p>{maintenanceSummary.last}</p>
              {maintenanceSummary.type && <p>{maintenanceSummary.type}</p>}
            </div>
          </button>
          <div className="gear-detail-glass-card gear-detail-quick-card">
            <div className="gear-detail-quick-icon purple" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.6 13.4 8.5 15.5a3 3 0 1 1-4.2-4.2l3.2-3.2a3 3 0 0 1 4.2 0" />
                <path d="m13.4 10.6 2.1-2.1a3 3 0 0 1 4.2 4.2l-3.2 3.2a3 3 0 0 1-4.2 0" />
                <path d="m9 15 6-6" />
              </svg>
            </div>
            <div className="gear-detail-quick-info">
              <strong>Accessories</strong>
              <p>{accessoriesCount} linked</p>
            </div>
          </div>
        </div>

        {/* Item Information */}
        {hasItemInfo && (
          <div>
            <h3 className="gear-detail-section-header">Item Information</h3>
            <div className="gear-detail-glass-card" style={{ padding: 0 }}>
              <div className="gear-detail-field-grid">
                {currentItem.serialNumber && (
                  <div className="gear-detail-field">
                    <p className="gear-detail-field-label">Serial Number</p>
                    <p className="gear-detail-field-value">{currentItem.serialNumber}</p>
                  </div>
                )}
                {currentItem.purchaseDate && (
                  <div className="gear-detail-field">
                    <p className="gear-detail-field-label">Purchase Date</p>
                    <p className="gear-detail-field-value">{new Date(currentItem.purchaseDate).toLocaleDateString()}</p>
                  </div>
                )}
                {currentItem.currentValue && (
                  <div className="gear-detail-field">
                    <p className="gear-detail-field-label">Current Value</p>
                    <p className="gear-detail-field-value">{formatMoney(currentItem.currentValue.amount, currentItem.currentValue.currency)}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Notes */}
        {currentItem.notes && (
          <div>
            <h3 className="gear-detail-section-header">Notes</h3>
            <div className="gear-detail-glass-card">
              <p className="gear-detail-notes-text">{currentItem.notes}</p>
            </div>
          </div>
        )}

        {/* Tags */}
        {currentItem.tags.length > 0 && (
          <div>
            <h3 className="gear-detail-section-header">Tags</h3>
            <div className="gear-detail-pills">
              {currentItem.tags.map((tag) => (
                <span key={tag} className="gear-detail-pill">{tag}</span>
              ))}
            </div>
          </div>
        )}

        {/* Warranty */}
        {hasWarrantyInfo && (
          <div>
            <h3 className="gear-detail-section-header">Warranty</h3>
            <div className="gear-detail-glass-card" style={{ padding: 0 }}>
              <div className="gear-detail-field-grid">
                {currentItem.warranty?.provider && (
                  <div className="gear-detail-field">
                    <p className="gear-detail-field-label">Provider</p>
                    <p className="gear-detail-field-value">{currentItem.warranty.provider}</p>
                  </div>
                )}
                {currentItem.warranty?.expirationDate && (
                  <div className="gear-detail-field">
                    <p className="gear-detail-field-label">Expires</p>
                    <p className="gear-detail-field-value">{new Date(currentItem.warranty.expirationDate).toLocaleDateString()}</p>
                  </div>
                )}
                {currentItem.warranty?.notes && (
                  <div className="gear-detail-field full-width">
                    <p className="gear-detail-field-label">Warranty Notes</p>
                    <p className="gear-detail-field-value">{currentItem.warranty.notes}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Related Items */}
        {related.length > 0 && (
          <div>
            <h3 className="gear-detail-section-header">Related Items</h3>
            <div className="gear-detail-pills">
              {related.map((r) => (
                <span key={r.id} className="gear-detail-pill related">{r.name}</span>
              ))}
            </div>
          </div>
        )}

        <div className="gear-detail-bottom-spacer" />
      </div>

      {/* ── Sheets (already iOS styled — untouched) ── */}
      {showAddToEvent && (
        <>
          <div className={`ios-sheet-backdrop${closingAddEvent ? ' closing' : ''}`} onClick={dismissAddEvent} />
          <div className={`ios-sheet-modal${closingAddEvent ? ' closing' : ''}`} aria-label="Add to event packing list" onAnimationEnd={onAddEventAnimEnd}>
            <div className="ios-sheet-handle" />
            <div className="ios-sheet-header">
              <button className="ios-sheet-btn secondary" onClick={dismissAddEvent}>Cancel</button>
              <h3 className="ios-sheet-title">Add to Event</h3>
              <button
                className="ios-sheet-btn primary"
                onClick={() => void addToEvent()}
                disabled={!eventTarget || selectedEventHasItem}
              >
                Add
              </button>
            </div>

            <div className="ios-sheet-content">
              <p className="ios-form-group-title">Select Event</p>
              <div className="ios-form-group">
                <label className="ios-form-row">
                  <span className="ios-form-label">Event</span>
                  <select
                    className="ios-form-input"
                    value={eventTarget}
                    onChange={(e) => setEventTarget(e.target.value)}
                  >
                    <option value="">Select an event</option>
                    {events.map((ev) => (
                      <option key={ev.id} value={ev.id}>{ev.title}</option>
                    ))}
                  </select>
                </label>
              </div>
              {selectedEventHasItem && (
                <p style={{ fontSize: '15px', color: 'var(--ios-text-secondary)', textAlign: 'center', marginTop: '8px' }}>
                  Item already added to this event.
                </p>
              )}
            </div>
          </div>
        </>
      )}

      <GearItemFormSheet
        open={showEditSheet}
        title="Edit Gear"
        submitLabel="Save Changes"
        categories={categories}
        draft={draft}
        error={editError}
        onDraftChange={(nextDraft) => {
          setEditError('');
          setDraft(nextDraft);
        }}
        onErrorChange={setEditError}
        onClose={() => {
          setShowEditSheet(false);
          setEditError('');
          setDraft(editDraft);
        }}
        onSubmit={() => void saveEdit()}
      />

      <MaintenanceSheet
        open={showMaintenanceSheet}
        itemName={currentItem.name}
        history={currentItem.maintenanceHistory ?? []}
        onClose={() => setShowMaintenanceSheet(false)}
        onSaveEntry={saveMaintenanceEntry}
        onUpdateEntry={updateMaintenanceEntry}
        onDeleteEntry={deleteMaintenanceEntry}
      />

      {essentialNotice && (
        <div className="gear-detail-toast" role="status" aria-live="polite">
          {essentialNotice}
        </div>
      )}
    </section>
  );
}

function getMaintenanceSummary(item: GearItem) {
  const latest = [...(item.maintenanceHistory ?? [])].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  )[0];

  if (!latest) return { last: 'No maintenance', type: undefined as string | undefined };

  const dateText = new Date(latest.date).toLocaleDateString();
  return { last: `Last: ${dateText}`, type: latest.type };
}

function parseMoney(raw: string) {
  const amount = Number(raw);
  if (!raw || Number.isNaN(amount)) return undefined;
  return { amount, currency: 'EUR' };
}

function toDraft(item: GearItem): GearFormDraft {
  return {
    name: item.name,
    categoryId: item.categoryId,
    brand: item.brand ?? '',
    model: item.model ?? '',
    serialNumber: item.serialNumber ?? '',
    purchaseDate: item.purchaseDate ?? '',
    purchasePrice: item.purchasePrice?.amount?.toString() ?? '',
    currentValue: item.currentValue?.amount?.toString() ?? '',
    notes: item.notes ?? '',
    customFieldsText: Object.entries(item.customFields ?? {}).map(([k, v]) => `${k}: ${v}`).join('\n'),
    condition: item.condition,
    quantity: item.quantity,
    tagsText: (item.tags ?? []).join(', '),
    essential: item.essential,
    photo: item.photo ?? '',
    photoPreview: '',
    photoFile: null,
    removePhoto: false,
  };
}

function parseCustomFields(text: string) {
  const out: Record<string, string> = {};
  text.split('\n').map((row) => row.trim()).filter(Boolean).forEach((row) => {
    const [k, ...rest] = row.split(':');
    if (k && rest.length) out[k.trim()] = rest.join(':').trim();
  });
  return Object.keys(out).length ? out : undefined;
}
