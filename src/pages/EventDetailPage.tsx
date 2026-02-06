import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { makeId } from '../lib/ids';
import { exportEventToPdf } from '../lib/pdf';
import type { PackingChecklistItem } from '../types/models';

export function EventDetailPage() {
  const { id } = useParams();
  const event = useLiveQuery(() => (id ? db.events.get(id) : undefined), [id]);
  const catalog = useLiveQuery(() => db.gearItems.toArray(), [], []);
  const [newItemName, setNewItemName] = useState('');
  const [catalogItemId, setCatalogItemId] = useState('');

  if (!event) return <div className="card">Event not found.</div>;
  const currentEvent = event;

  const packed = currentEvent.packingChecklist.filter((i) => i.packed).length;

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
    <section className="stack-lg">
      <div className="card stack-md">
        <div className="row between wrap">
          <h2>{currentEvent.title}</h2>
          <div className="row wrap">
            <button onClick={() => exportEventToPdf(currentEvent)}>Export PDF</button>
            <button className="ghost" onClick={exportEventJson}>
              Export JSON
            </button>
            <button className="ghost" onClick={() => window.print()}>
              Print
            </button>
            <button onClick={() => void resetChecklist()}>Reset checklist</button>
          </div>
        </div>
        <p className="subtle">
          {currentEvent.type} • {currentEvent.location ?? 'No location'} • {currentEvent.client ?? 'No client'} • {packed}/
          {currentEvent.packingChecklist.length} packed
        </p>
        <textarea
          value={currentEvent.notes ?? ''}
          onChange={async (e) => {
            await db.events.update(currentEvent.id, { notes: e.target.value, updatedAt: new Date().toISOString() });
          }}
        />
      </div>

      <div className="card stack-md">
        <h3>Packing checklist</h3>
        <div className="row wrap">
          <select value={catalogItemId} onChange={(e) => setCatalogItemId(e.target.value)}>
            <option value="">Add catalog item...</option>
            {catalog.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <button onClick={() => void addCatalogItem()}>Add from catalog</button>
          <input
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            placeholder="Custom checklist item"
          />
          <button onClick={() => void addManualItem()}>Add manual item</button>
        </div>

        <ul className="stack-sm">
          {currentEvent.packingChecklist.map((item, idx) => (
            <li key={item.id} className="row between wrap checklist-row">
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
                {item.name} × {item.quantity}
              </label>
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
                  <option value="must-have">must-have</option>
                  <option value="nice-to-have">nice-to-have</option>
                  <option value="optional">optional</option>
                </select>
                <button className="ghost" onClick={() => move(idx, -1)}>
                  ↑
                </button>
                <button className="ghost" onClick={() => move(idx, 1)}>
                  ↓
                </button>
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
            </li>
          ))}
        </ul>
      </div>

      <div className="card stack-md">
        <h3>Missing items</h3>
        <ul className="stack-sm">
          {currentEvent.missingItems.map((item) => (
            <li key={item.id} className="row between wrap checklist-row">
              <div>
                <strong>{item.name}</strong>
                <p className="subtle">{item.reason}</p>
              </div>
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
                  <option value="unresolved">unresolved</option>
                  <option value="planned">planned</option>
                  <option value="acquired">acquired</option>
                </select>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
