import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { formatMoney } from '../lib/format';
import { makeId } from '../lib/ids';
import type { GearItem } from '../types/models';

export function GearItemDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const item = useLiveQuery(() => (id ? db.gearItems.get(id) : undefined), [id]);
  const categories = useLiveQuery(() => db.categories.toArray(), [], []);
  const events = useLiveQuery(() => db.events.toArray(), [], []);
  const allItems = useLiveQuery(() => db.gearItems.toArray(), [], []);
  const [eventTarget, setEventTarget] = useState('');
  const [showAddToEvent, setShowAddToEvent] = useState(false);

  const related = useMemo(
    () => allItems.filter((g) => item?.relatedItemIds?.includes(g.id)),
    [allItems, item],
  );

  if (!item) return <div className="card">Item not found.</div>;
  const currentItem = item;

  async function save(patch: Partial<GearItem>) {
    await db.gearItems.update(currentItem.id, { ...patch, updatedAt: new Date().toISOString() });
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
    <section className="detail-page">
      <div className="detail-page-header">
        <button onClick={() => navigate('/catalog')} className="ghost icon-compact-btn" aria-label="Back">←</button>
        {currentItem.photo && <img src={currentItem.photo} alt={currentItem.name} className="detail-page-photo" />}
        <div className="detail-page-header-content">
          <h2>{currentItem.name}</h2>
          <div className="row wrap detail-badges">
            <span className="pill">{categories.find((c) => c.id === currentItem.categoryId)?.name}</span>
            <span className="pill">x{currentItem.quantity}</span>
            <span className="pill">{currentItem.condition}</span>
            {currentItem.essential && <span className="pill essential">Essential</span>}
          </div>
        </div>
        <button className="danger icon-compact-btn" onClick={() => void deleteItem()} aria-label="Delete">🗑</button>
      </div>

      <div className="detail-page-section">
        <h3>Basic Information</h3>
        <div className="detail-grid">
          <div className="detail-field">
            <label className="detail-label">Name</label>
            <input value={currentItem.name} onChange={(e) => void save({ name: e.target.value })} className="detail-input" />
          </div>
          <div className="detail-field">
            <label className="detail-label">Category</label>
            <select value={currentItem.categoryId} onChange={(e) => void save({ categoryId: e.target.value })} className="detail-input">
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="detail-field">
            <label className="detail-label">Brand</label>
            <input value={currentItem.brand ?? ''} onChange={(e) => void save({ brand: e.target.value })} placeholder="Optional" className="detail-input" />
          </div>
          <div className="detail-field">
            <label className="detail-label">Model</label>
            <input value={currentItem.model ?? ''} onChange={(e) => void save({ model: e.target.value })} placeholder="Optional" className="detail-input" />
          </div>
          <div className="detail-field">
            <label className="detail-label">Quantity</label>
            <input type="number" min={1} value={currentItem.quantity} onChange={(e) => void save({ quantity: Number(e.target.value || 1) })} className="detail-input" />
          </div>
          <div className="detail-field">
            <label className="detail-label">Condition</label>
            <select value={currentItem.condition} onChange={(e) => void save({ condition: e.target.value as GearItem['condition'] })} className="detail-input">
              <option value="new">New</option>
              <option value="good">Good</option>
              <option value="worn">Worn</option>
            </select>
          </div>
        </div>
        <div className="detail-field detail-field-full">
          <label className="detail-label">Notes</label>
          <textarea value={currentItem.notes ?? ''} onChange={(e) => void save({ notes: e.target.value })} placeholder="Add notes..." className="detail-textarea" rows={3} />
        </div>
        <label className="checkbox-inline">
          <input type="checkbox" checked={currentItem.essential} onChange={(e) => void save({ essential: e.target.checked })} />
          <span>Mark as essential</span>
        </label>
      </div>

      {(currentItem.purchasePrice || currentItem.currentValue) && (
        <div className="detail-page-section">
          <h3>Financial</h3>
          <div className="detail-grid">
            {currentItem.purchasePrice && (
              <div className="detail-field">
                <span className="detail-label">Purchase Price</span>
                <span className="detail-value">{formatMoney(currentItem.purchasePrice.amount, currentItem.purchasePrice.currency)}</span>
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
    </section>
  );
}