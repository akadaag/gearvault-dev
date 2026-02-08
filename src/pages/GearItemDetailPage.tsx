import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { formatMoney } from '../lib/format';
import { makeId } from '../lib/ids';
import { GearItemFormSheet, type GearFormDraft } from '../components/GearItemFormSheet';
import { MaintenanceSheet } from '../components/MaintenanceSheet';
import { lockSheetScroll, unlockSheetScroll } from '../lib/sheetLock';
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
};

export function GearItemDetailPage() {
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
  const [editError, setEditError] = useState('');
  const [draft, setDraft] = useState<GearFormDraft>(emptyDraft);

  useEffect(() => {
    if (!showAddToEvent) return;
    lockSheetScroll();
    return () => unlockSheetScroll();
  }, [showAddToEvent]);

  const related = useMemo(
    () => allItems.filter((g) => item?.relatedItemIds?.includes(g.id)),
    [allItems, item],
  );

  if (!item) return <div className="card">Item not found.</div>;
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

  async function saveEdit() {
    if (!draft.name.trim()) {
      setEditError('Name is required');
      return;
    }
    if (!draft.categoryId) {
      setEditError('Category is required');
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
      photo: draft.photo || undefined,
    });

    setShowEditSheet(false);
    setEditError('');
  }

  async function deleteItem() {
    if (!window.confirm(`Delete ${currentItem.name}?`)) return;
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

  return (
    <section className="detail-page detail-page-immersive">
      <div className="detail-page-topbar">
        <button onClick={() => navigate('/catalog')} className="detail-back-link" aria-label="Back to catalog">‹ Catalog</button>
        <div className="row detail-topbar-actions">
          <button
            className={`detail-topbar-icon-btn detail-event-btn ${isInAnyEvent ? 'active' : ''}`}
            onClick={() => setShowAddToEvent(true)}
            aria-label="Add to event packing list"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <circle cx="12" cy="12" r="9" />
              <path d="m8.7 12.2 2.1 2.2 4.6-4.6" />
            </svg>
          </button>
          <button
            className="detail-topbar-icon-btn"
            onClick={() => {
              setDraft(editDraft);
              setShowEditSheet(true);
            }}
            aria-label="Edit"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6" />
              <path d="m9 16 4.4-4.4a1.5 1.5 0 0 1 2.1 2.1L11.1 18.1 8 19z" />
            </svg>
          </button>
          <button className="detail-topbar-icon-btn detail-delete-btn" onClick={() => void deleteItem()} aria-label="Delete">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M3 6h18" />
              <path d="M8 6V4h8v2" />
              <path d="M19 6l-1 14H6L5 6" />
              <path d="M10 11v6M14 11v6" />
            </svg>
          </button>
        </div>
      </div>

      <div className="detail-hero-card detail-hero-fullbleed">
        {currentItem.photo ? (
          <img src={currentItem.photo} alt={currentItem.name} className="detail-hero-photo" />
        ) : (
          <div className="detail-hero-photo detail-hero-placeholder" aria-hidden="true">
            {currentItem.name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      <section className="detail-page-section detail-page-main-info detail-title-block">
        <h2>{currentItem.name}</h2>
        <p className="subtle detail-main-subtitle">{[currentItem.brand, currentItem.model].filter(Boolean).join(' ') || 'No brand/model yet'}</p>
        <div className="row wrap detail-badges">
          <span className="pill">{categories.find((c) => c.id === currentItem.categoryId)?.name}</span>
          <span className="pill">{currentItem.condition}</span>
          <span className="pill">×{currentItem.quantity} units</span>
          {currentItem.essential && <span className="pill essential">Essential</span>}
        </div>
      </section>

      {currentItem.purchasePrice && (
        <section className="detail-preview-card detail-page-section">
          <div className="detail-preview-icon" aria-hidden="true">$</div>
          <div>
            <span className="detail-label">Purchase Price</span>
            <p className="detail-preview-value">{formatMoney(currentItem.purchasePrice.amount, currentItem.purchasePrice.currency)}</p>
          </div>
        </section>
      )}

      <section className="detail-quick-grid">
        <button type="button" className="detail-quick-card detail-quick-card-btn" onClick={() => setShowMaintenanceSheet(true)}>
          <div className="detail-quick-icon blue" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M14.7 6.3a4.5 4.5 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4.5 4.5 0 0 0 5.4-5.4l-2.4 2.4-2.2-2.2z" />
            </svg>
          </div>
          <div>
            <strong>Maintenance</strong>
            <p className="subtle">{maintenanceCount} records</p>
            <p className="subtle detail-quick-summary">{maintenanceSummary.last}</p>
            {maintenanceSummary.type && <p className="subtle detail-quick-summary">{maintenanceSummary.type}</p>}
          </div>
        </button>
        <article className="detail-quick-card">
          <div className="detail-quick-icon purple" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M10.6 13.4 8.5 15.5a3 3 0 1 1-4.2-4.2l3.2-3.2a3 3 0 0 1 4.2 0" />
              <path d="m13.4 10.6 2.1-2.1a3 3 0 0 1 4.2 4.2l-3.2 3.2a3 3 0 0 1-4.2 0" />
              <path d="m9 15 6-6" />
            </svg>
          </div>
          <div>
            <strong>Accessories</strong>
            <p className="subtle">{accessoriesCount} linked</p>
          </div>
        </article>
      </section>

      {hasItemInfo && (
        <div className="detail-page-section">
          <h3>Item Information</h3>
          <div className="detail-grid">
            {currentItem.serialNumber && (
              <div className="detail-field">
                <span className="detail-label">Serial Number</span>
                <span className="detail-value">{currentItem.serialNumber}</span>
              </div>
            )}
            {currentItem.purchaseDate && (
              <div className="detail-field">
                <span className="detail-label">Purchase Date</span>
                <span className="detail-value">{new Date(currentItem.purchaseDate).toLocaleDateString()}</span>
              </div>
            )}
            {currentItem.currentValue && (
              <div className="detail-field">
                <span className="detail-label">Current Value</span>
                <span className="detail-value">{formatMoney(currentItem.currentValue.amount, currentItem.currentValue.currency)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {currentItem.notes && (
        <div className="detail-page-section">
          <h3>Notes</h3>
          <p className="detail-notes">{currentItem.notes}</p>
        </div>
      )}

      {currentItem.tags.length > 0 && (
        <div className="detail-page-section">
          <h3>Tags</h3>
          <div className="row wrap">
            {currentItem.tags.map((tag) => (
              <span key={tag} className="pill">{tag}</span>
            ))}
          </div>
        </div>
      )}

      {hasWarrantyInfo && (
        <div className="detail-page-section">
          <h3>Warranty</h3>
          <div className="detail-grid">
            {currentItem.warranty?.provider && (
              <div className="detail-field">
                <span className="detail-label">Provider</span>
                <span className="detail-value">{currentItem.warranty.provider}</span>
              </div>
            )}
            {currentItem.warranty?.expirationDate && (
              <div className="detail-field">
                <span className="detail-label">Expires</span>
                <span className="detail-value">{new Date(currentItem.warranty.expirationDate).toLocaleDateString()}</span>
              </div>
            )}
            {currentItem.warranty?.notes && (
              <div className="detail-field detail-field-full">
                <span className="detail-label">Warranty Notes</span>
                <span className="detail-value">{currentItem.warranty.notes}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {related.length > 0 && (
        <div className="detail-page-section">
          <h3>Related Items</h3>
          <div className="row wrap">
            {related.map((r) => (
              <span key={r.id} className="pill">{r.name}</span>
            ))}
          </div>
        </div>
      )}

      {showAddToEvent && (
        <>
          <button className="sheet-overlay" aria-label="Close add to event" onClick={() => setShowAddToEvent(false)} />
          <aside className="filter-sheet card event-add-sheet" aria-label="Add to event packing list">
            <div className="event-add-sheet-header">
              <h3>Add to Event</h3>
              <button className="sheet-close-btn" onClick={() => setShowAddToEvent(false)} aria-label="Close">✕</button>
            </div>

            <div className="event-add-sheet-body stack-sm">
              <label className="gear-field-block">
                <span>Select Event</span>
                <select value={eventTarget} onChange={(e) => setEventTarget(e.target.value)}>
                  <option value="">Select an event</option>
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>{ev.title}</option>
                  ))}
                </select>
              </label>
              {selectedEventHasItem && <p className="subtle">Item already added to this event.</p>}
            </div>

            <div className="event-add-sheet-footer">
              <button onClick={() => void addToEvent()} disabled={!eventTarget || selectedEventHasItem}>Add to Packing List</button>
            </div>
          </aside>
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
      />
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