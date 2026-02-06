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
    <section className="stack-lg">
      <div className="card stack-md">
        <div className="page-header">
          <div className="page-title-section">
            <h2>{currentItem.name}</h2>
            <div className="row wrap">
              <span className="pill">{categories.find((c) => c.id === currentItem.categoryId)?.name}</span>
              {currentItem.essential && <span className="pill">⭐ Essential</span>}
            </div>
          </div>
          <div className="page-actions">
            <button onClick={() => navigate('/catalog')} className="ghost">← Back</button>
            <button className="danger" onClick={() => void deleteItem()}>
              Delete
            </button>
          </div>
        </div>

        {currentItem.photo && <img src={currentItem.photo} alt={currentItem.name} className="photo" />}
      </div>

      <div className="card stack-md">
        <h3>Basic Information</h3>
        <div className="grid two">
          <label className="stack-sm">
            <strong>Name</strong>
            <input value={currentItem.name} onChange={(e) => void save({ name: e.target.value })} />
          </label>
          <label className="stack-sm">
            <strong>Category</strong>
            <select value={currentItem.categoryId} onChange={(e) => void save({ categoryId: e.target.value })}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="stack-sm">
            <strong>Brand</strong>
            <input value={currentItem.brand ?? ''} onChange={(e) => void save({ brand: e.target.value })} placeholder="Optional" />
          </label>
          <label className="stack-sm">
            <strong>Model</strong>
            <input value={currentItem.model ?? ''} onChange={(e) => void save({ model: e.target.value })} placeholder="Optional" />
          </label>
          <label className="stack-sm">
            <strong>Quantity</strong>
            <input
              type="number"
              min={1}
              value={currentItem.quantity}
              onChange={(e) => void save({ quantity: Number(e.target.value || 1) })}
            />
          </label>
          <label className="stack-sm">
            <strong>Condition</strong>
            <select
              value={currentItem.condition}
              onChange={(e) => void save({ condition: e.target.value as GearItem['condition'] })}
            >
              <option value="new">New</option>
              <option value="good">Good</option>
              <option value="worn">Worn</option>
            </select>
          </label>
        </div>

        <label className="stack-sm">
          <strong>Notes</strong>
          <textarea value={currentItem.notes ?? ''} onChange={(e) => void save({ notes: e.target.value })} placeholder="Add notes about this item..." />
        </label>

        <label className="checkbox-inline">
          <input type="checkbox" checked={currentItem.essential} onChange={(e) => void save({ essential: e.target.checked })} />
          <span>Mark as essential</span>
        </label>
      </div>

      <div className="card stack-md">
        <h3>Financial</h3>
        <div className="row wrap">
          {currentItem.purchasePrice && (
            <span className="pill">
              Purchase: {formatMoney(currentItem.purchasePrice.amount, currentItem.purchasePrice.currency)}
            </span>
          )}
          {currentItem.currentValue && (
            <span className="pill">
              Current: {formatMoney(currentItem.currentValue.amount, currentItem.currentValue.currency)}
            </span>
          )}
        </div>
      </div>

      <div className="card stack-md">
        <div className="row between wrap">
          <h3>Maintenance History</h3>
          <button
            className="ghost"
            onClick={() =>
              void save({
                maintenanceHistory: [
                  ...(currentItem.maintenanceHistory ?? []),
                  { id: makeId(), date: new Date().toISOString().slice(0, 10), note: 'Routine check' },
                ],
              })
            }
          >
            + Add Entry
          </button>
        </div>
        {(currentItem.maintenanceHistory ?? []).length === 0 ? (
          <p className="subtle">No maintenance records yet</p>
        ) : (
          <div className="stack-sm">
            {(currentItem.maintenanceHistory ?? []).map((m) => (
              <div key={m.id} className="checklist-row">
                <strong>{new Date(m.date).toLocaleDateString()}</strong>
                <p>{m.note}</p>
                {m.cost && <span className="pill">Cost: €{m.cost}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card stack-md">
        <h3>Warranty</h3>
        <div className="grid two">
          <label className="stack-sm">
            <strong>Provider</strong>
            <input
              value={currentItem.warranty?.provider ?? ''}
              onChange={(e) => void save({ warranty: { ...currentItem.warranty, provider: e.target.value } })}
              placeholder="Warranty provider"
            />
          </label>
          <label className="stack-sm">
            <strong>Expires</strong>
            <input
              type="date"
              value={currentItem.warranty?.expirationDate ?? ''}
              onChange={(e) =>
                void save({ warranty: { ...currentItem.warranty, expirationDate: e.target.value } })
              }
            />
          </label>
        </div>
        <label className="stack-sm">
          <strong>Warranty Notes</strong>
          <textarea
            value={currentItem.warranty?.notes ?? ''}
            onChange={(e) => void save({ warranty: { ...currentItem.warranty, notes: e.target.value } })}
            placeholder="Add warranty details..."
          />
        </label>
      </div>

      <div className="card stack-md">
        <h3>Related Items</h3>
        {related.length === 0 ? (
          <p className="subtle">No related items linked</p>
        ) : (
          <div className="row wrap">
            {related.map((r) => (
              <span key={r.id} className="pill">
                {r.name}
              </span>
            ))}
          </div>
        )}
        <label className="stack-sm">
          <strong>Link Related Item</strong>
          <select
            onChange={(e) => {
              const value = e.target.value;
              if (!value) return;
              const next = new Set(currentItem.relatedItemIds ?? []);
              next.add(value);
              void save({ relatedItemIds: Array.from(next) });
            }}
          >
            <option value="">Choose item to link</option>
            {allItems
              .filter((g) => g.id !== currentItem.id && !related.some((r) => r.id === g.id))
              .map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
          </select>
        </label>
      </div>

      <div className="card stack-md">
        <h3>Add to Event</h3>
        {showAddToEvent ? (
          <div className="stack-sm">
            <select value={eventTarget} onChange={(e) => setEventTarget(e.target.value)}>
              <option value="">Select an event</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.title}
                </option>
              ))}
            </select>
            <div className="row wrap">
              <button onClick={() => void addToEvent()} disabled={!eventTarget}>Add to Event</button>
              <button className="ghost" onClick={() => setShowAddToEvent(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <button className="ghost" onClick={() => setShowAddToEvent(true)}>
            Add to Event Packing List
          </button>
        )}
      </div>
    </section>
  );
}