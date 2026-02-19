import { useEffect, useMemo, useRef, useState } from 'react';
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
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const optionsMenuRef = useRef<HTMLDivElement>(null);

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

  // Close options menu on outside click
  useEffect(() => {
    if (!showOptionsMenu) return;
    function handleOutsideClick(e: MouseEvent) {
      if (optionsMenuRef.current && !optionsMenuRef.current.contains(e.target as Node)) {
        setShowOptionsMenu(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showOptionsMenu]);

  const related = useMemo(
    () => allItems.filter((g) => item?.relatedItemIds?.includes(g.id)),
    [allItems, item],
  );

  if (!item) return <section className="gear-detail-page ios-theme"><div className="gear-detail-empty">Item not found.</div></section>;
  const currentItem = item;
  const editDraft = toDraft(currentItem);
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
      {/* ── Fixed Floating Buttons ── */}
      <div className="gear-detail-floating-bar">
        {/* Back pill */}
        <button className="gear-detail-back-pill" onClick={() => navigate('/catalog')} aria-label="Back to catalog">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Catalog
        </button>

        {/* Options circle */}
        <div className="gear-detail-options-wrap" ref={optionsMenuRef}>
          <button
            className="gear-detail-options-btn"
            onClick={() => setShowOptionsMenu(v => !v)}
            aria-label="More options"
            aria-expanded={showOptionsMenu}
          >
            <span className="gear-detail-options-dot" />
            <span className="gear-detail-options-dot" />
            <span className="gear-detail-options-dot" />
          </button>

          {showOptionsMenu && (
            <div className="gear-detail-options-menu" role="menu">
              <button
                className={`gear-detail-menu-item${isInAnyEvent ? ' active-event' : ''}`}
                role="menuitem"
                onClick={() => { setShowOptionsMenu(false); setShowAddToEvent(true); }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="m8.7 12.2 2.1 2.2 4.6-4.6" />
                </svg>
                Add to Event
              </button>
              <div className="gear-detail-menu-divider" />
              <button
                className="gear-detail-menu-item"
                role="menuitem"
                onClick={() => { setShowOptionsMenu(false); setDraft(editDraft); setShowEditSheet(true); }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <path d="M14 2v6h6" />
                  <path d="m9 16 4.4-4.4a1.5 1.5 0 0 1 2.1 2.1L11.1 18.1 8 19z" />
                </svg>
                Edit
              </button>
              <div className="gear-detail-menu-divider" />
              <button
                className={`gear-detail-menu-item${currentItem.essential ? ' active' : ''}`}
                role="menuitem"
                onClick={() => { setShowOptionsMenu(false); void toggleEssential(); }}
              >
                <svg viewBox="0 0 24 24" fill={currentItem.essential ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m12 2.4 2.95 5.98 6.6.96-4.77 4.65 1.12 6.58L12 17.47l-5.9 3.1 1.12-6.58-4.77-4.65 6.6-.96z" />
                </svg>
                {currentItem.essential ? 'Remove from Essentials' : 'Add to Essentials'}
              </button>
              <div className="gear-detail-menu-divider" />
              <button
                className="gear-detail-menu-item destructive"
                role="menuitem"
                onClick={() => { setShowOptionsMenu(false); void deleteItem(); }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 6h18" />
                  <path d="M8 6V4h8v2" />
                  <path d="M19 6l-1 14H6L5 6" />
                  <path d="M10 11v6M14 11v6" />
                </svg>
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

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
          <h1 className="gear-detail-name">{currentItem.name}</h1>
          <p className="gear-detail-subtitle">{[currentItem.brand, currentItem.model].filter(Boolean).join(' ') || 'No brand/model yet'}</p>
          <div className="gear-detail-inline-meta">
            <span>{categories.find((c) => c.id === currentItem.categoryId)?.name}</span>
            <span className="gear-detail-meta-dot">{'\u00B7'}</span>
            <span className={`gear-detail-condition-text condition-${currentItem.condition}`}>{currentItem.condition}</span>
            {currentItem.quantity > 1 && (
              <>
                <span className="gear-detail-meta-dot">{'\u00B7'}</span>
                <span>{'\u00D7'}{currentItem.quantity} units</span>
              </>
            )}
          </div>
        </div>

        {/* Quick Grid — Maintenance & Accessories */}
        <div className="gear-detail-quick-grid">
          <button type="button" className="gear-detail-quick-card" onClick={() => setShowMaintenanceSheet(true)}>
            <div className="gear-detail-quick-icon blue" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.7 6.3a4.5 4.5 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4.5 4.5 0 0 0 5.4-5.4l-2.4 2.4-2.2-2.2z" />
              </svg>
            </div>
            <div className="gear-detail-quick-info">
              <strong>Maintenance</strong>
              <p>{maintenanceSummary.last}</p>
            </div>
          </button>
          <div className="gear-detail-quick-card">
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

        {/* Price Card */}
        {currentItem.purchasePrice && (
          <div className="gear-detail-info-card">
            <div className="gear-detail-info-card-header">
              <div className="gear-detail-info-icon green" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="1" x2="12" y2="23" />
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              </div>
              <strong className="gear-detail-info-card-title">Purchase Price</strong>
            </div>
            <div className="gear-detail-info-card-divider" />
            <div className="gear-detail-info-card-row">
              <span className="gear-detail-info-row-label">{formatMoney(currentItem.purchasePrice.amount, currentItem.purchasePrice.currency)}</span>
            </div>
          </div>
        )}

        {/* Item Details Card (Notifiche style) */}
        {hasItemInfo && (
          <div className="gear-detail-info-card">
            <div className="gear-detail-info-card-header">
              <div className="gear-detail-info-icon blue" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
              </div>
              <strong className="gear-detail-info-card-title">Item Details</strong>
            </div>
            <div className="gear-detail-info-card-divider" />
            {currentItem.serialNumber && (
              <>
                <div className="gear-detail-info-card-row">
                  <span className="gear-detail-info-row-label">Serial Number</span>
                  <span className="gear-detail-info-row-value">{currentItem.serialNumber}</span>
                </div>
                {(currentItem.purchaseDate || currentItem.currentValue) && <div className="gear-detail-info-card-divider" />}
              </>
            )}
            {currentItem.purchaseDate && (
              <>
                <div className="gear-detail-info-card-row">
                  <span className="gear-detail-info-row-label">Purchase Date</span>
                  <span className="gear-detail-info-row-value">{new Date(currentItem.purchaseDate).toLocaleDateString()}</span>
                </div>
                {currentItem.currentValue && <div className="gear-detail-info-card-divider" />}
              </>
            )}
            {currentItem.currentValue && (
              <div className="gear-detail-info-card-row">
                <span className="gear-detail-info-row-label">Current Value</span>
                <span className="gear-detail-info-row-value">{formatMoney(currentItem.currentValue.amount, currentItem.currentValue.currency)}</span>
              </div>
            )}
          </div>
        )}

        {/* More Info Card (Impostazioni style) */}
        {(currentItem.notes || hasWarrantyInfo || related.length > 0) && (
          <div className="gear-detail-info-card">
            <div className="gear-detail-info-card-header">
              <div className="gear-detail-info-icon gray" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </div>
              <strong className="gear-detail-info-card-title">More Info</strong>
            </div>
            <div className="gear-detail-info-card-divider" />
            {currentItem.notes && (
              <>
                <div className="gear-detail-info-card-row">
                  <span className="gear-detail-info-row-label">Notes</span>
                  <span className="gear-detail-info-row-value">{currentItem.notes}</span>
                </div>
                {(hasWarrantyInfo || related.length > 0) && <div className="gear-detail-info-card-divider" />}
              </>
            )}
            {currentItem.warranty?.provider && (
              <>
                <div className="gear-detail-info-card-row">
                  <span className="gear-detail-info-row-label">Warranty Provider</span>
                  <span className="gear-detail-info-row-value">{currentItem.warranty.provider}</span>
                </div>
                {(currentItem.warranty?.expirationDate || currentItem.warranty?.notes || related.length > 0) && <div className="gear-detail-info-card-divider" />}
              </>
            )}
            {currentItem.warranty?.expirationDate && (
              <>
                <div className="gear-detail-info-card-row">
                  <span className="gear-detail-info-row-label">Warranty Expires</span>
                  <span className="gear-detail-info-row-value">{new Date(currentItem.warranty.expirationDate).toLocaleDateString()}</span>
                </div>
                {(currentItem.warranty?.notes || related.length > 0) && <div className="gear-detail-info-card-divider" />}
              </>
            )}
            {currentItem.warranty?.notes && (
              <>
                <div className="gear-detail-info-card-row">
                  <span className="gear-detail-info-row-label">Warranty Notes</span>
                  <span className="gear-detail-info-row-value">{currentItem.warranty.notes}</span>
                </div>
                {related.length > 0 && <div className="gear-detail-info-card-divider" />}
              </>
            )}
            {related.length > 0 && (
              <div className="gear-detail-info-card-row">
                <span className="gear-detail-info-row-label">Related Items</span>
                <span className="gear-detail-info-row-value">{related.map((r) => r.name).join(', ')}</span>
              </div>
            )}
          </div>
        )}

        <div className="gear-detail-bottom-spacer" />
      </div>

      {/* ── Sheets (already iOS styled — untouched) ── */}
      {showAddToEvent && (
        <>
          <div className={`ios-sheet-backdrop${closingAddEvent ? ' closing' : ''}`} onClick={dismissAddEvent} />
          <div className={`ios-sheet-modal${closingAddEvent ? ' closing' : ''}`} aria-label="Add to event packing list" onAnimationEnd={onAddEventAnimEnd}>
            <div className="ios-sheet-header ios-sheet-header--icon">
              <button className="ios-sheet-icon-btn ios-sheet-icon-btn--cancel" onClick={dismissAddEvent} aria-label="Cancel">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M2 2L16 16M16 2L2 16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>
              </button>
              <h3 className="ios-sheet-title">Add to Event</h3>
              <button className="ios-sheet-icon-btn ios-sheet-icon-btn--save" onClick={() => void addToEvent()} disabled={!eventTarget || selectedEventHasItem} aria-label="Add to event">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M2.5 9.5L7 14L15.5 4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
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
