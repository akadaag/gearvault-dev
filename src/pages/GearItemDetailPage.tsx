import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { formatMoney } from '../lib/format';
import { makeId } from '../lib/ids';
import { GearItemFormSheet, type GearFormDraft } from '../components/GearItemFormSheet';
import type { GearItem } from '../types/models';

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
  const [editError, setEditError] = useState('');
  const [draft, setDraft] = useState<GearFormDraft>(emptyDraft);

  const related = useMemo(
    () => allItems.filter((g) => item?.relatedItemIds?.includes(g.id)),
    [allItems, item],
  );

  if (!item) return <div className="card">Item not found.</div>;
  const currentItem = item;
  const editDraft = toDraft(currentItem);

  async function save(patch: Partial<GearItem>) {
    await db.gearItems.update(currentItem.id, { ...patch, updatedAt: new Date().toISOString() });
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
        <div className="row">
          <button
            className="detail-topbar-icon-btn"
            onClick={() => {
              setDraft(editDraft);
              setShowEditSheet(true);
            }}
            aria-label="Edit"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </button>
          <button className="detail-topbar-icon-btn danger" onClick={() => void deleteItem()} aria-label="Delete">
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
        <article className="detail-quick-card">
          <div className="detail-quick-icon blue" aria-hidden="true">🔧</div>
          <div>
            <strong>Maintenance</strong>
            <p className="subtle">{currentItem.maintenanceHistory?.length ?? 0} records</p>
          </div>
        </article>
        <article className="detail-quick-card">
          <div className="detail-quick-icon purple" aria-hidden="true">🔗</div>
          <div>
            <strong>Accessories</strong>
            <p className="subtle">{currentItem.relatedItemIds?.length ?? 0} linked</p>
          </div>
        </article>
      </section>

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
          <div className="detail-field">
            <span className="detail-label">Last Updated</span>
            <span className="detail-value">{new Date(currentItem.updatedAt).toLocaleDateString()}</span>
          </div>
        </div>
      </div>

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

      <div className="detail-page-section">
        <div className="row between">
          <h3>Maintenance History</h3>
          <button className="ghost" onClick={() => void save({ maintenanceHistory: [...(currentItem.maintenanceHistory ?? []), { id: makeId(), date: new Date().toISOString().slice(0, 10), note: 'Routine check' }] })}>+ Add</button>
        </div>
        {(currentItem.maintenanceHistory ?? []).length === 0 ? (
          <p className="subtle">No maintenance records yet</p>
        ) : (
          <div className="detail-grid">
            {(currentItem.maintenanceHistory ?? []).map((m) => (
              <div key={m.id} className="detail-field">
                <span className="detail-label">{new Date(m.date).toLocaleDateString()}</span>
                <span className="detail-value">{m.note}</span>
                {m.cost && <span className="pill">€{m.cost}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="detail-page-section">
        <h3>Warranty</h3>
        <div className="detail-grid">
          <div className="detail-field">
            <label className="detail-label">Provider</label>
            <input value={currentItem.warranty?.provider ?? ''} onChange={(e) => void save({ warranty: { ...currentItem.warranty, provider: e.target.value } })} placeholder="Provider" className="detail-input" />
          </div>
          <div className="detail-field">
            <label className="detail-label">Expires</label>
            <input type="date" value={currentItem.warranty?.expirationDate ?? ''} onChange={(e) => void save({ warranty: { ...currentItem.warranty, expirationDate: e.target.value } })} className="detail-input" />
          </div>
        </div>
        <div className="detail-field detail-field-full">
          <label className="detail-label">Warranty Notes</label>
          <textarea value={currentItem.warranty?.notes ?? ''} onChange={(e) => void save({ warranty: { ...currentItem.warranty, notes: e.target.value } })} placeholder="Add warranty details..." className="detail-textarea" rows={2} />
        </div>
      </div>

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

      <div className="detail-page-section">
        <h3>Add to Event</h3>
        {showAddToEvent ? (
          <div className="detail-grid">
            <div className="detail-field detail-field-full">
              <select value={eventTarget} onChange={(e) => setEventTarget(e.target.value)} className="detail-input">
                <option value="">Select an event</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>{ev.title}</option>
                ))}
              </select>
            </div>
            <button onClick={() => void addToEvent()} disabled={!eventTarget}>Add to Event</button>
            <button className="ghost" onClick={() => setShowAddToEvent(false)}>Cancel</button>
          </div>
        ) : (
          <button className="ghost" onClick={() => setShowAddToEvent(true)}>Add to Event Packing List</button>
        )}
      </div>

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
    </section>
  );
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