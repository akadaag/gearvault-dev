import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { makeId } from '../lib/ids';
import { fuzzyIncludes } from '../lib/search';
import { gearItemSchema } from '../lib/validators';
import type { Category, Condition, GearItem } from '../types/models';

interface GearDraft {
  name: string;
  categoryId: string;
  brand: string;
  model: string;
  serialNumber: string;
  purchaseDate: string;
  purchasePrice: string;
  currentValue: string;
  notes: string;
  customFieldsText: string;
  condition: Condition;
  quantity: number;
  tagsText: string;
  essential: boolean;
  photo: string;
}

const initialDraft: GearDraft = {
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

export function CatalogPage() {
  const navigate = useNavigate();
  const categories = useLiveQuery(() => db.categories.orderBy('sortOrder').toArray(), [], []);
  const gear = useLiveQuery(() => db.gearItems.toArray(), [], []);

  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('');
  const [essentialOnly, setEssentialOnly] = useState(false);
  const [conditionFilter, setConditionFilter] = useState<'all' | Condition>('all');
  const [sortBy, setSortBy] = useState<'name' | 'brand' | 'newest' | 'value'>('name');
  const [draft, setDraft] = useState<GearDraft>(initialDraft);
  const [error, setError] = useState('');

  const tags = useMemo(() => {
    const set = new Set<string>();
    for (const item of gear) item.tags.forEach((t) => set.add(t));
    return Array.from(set).sort();
  }, [gear]);

  const filtered = useMemo(() => {
    const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));
    const items = [...gear].filter((item) => {
      const text = [
        item.name,
        item.brand,
        item.model,
        item.notes,
        item.tags.join(' '),
        categoryNameById.get(item.categoryId),
      ].join(' ');
      if (!fuzzyIncludes(text, query)) return false;
      if (categoryFilter !== 'all' && item.categoryId !== categoryFilter) return false;
      if (tagFilter && !item.tags.includes(tagFilter)) return false;
      if (essentialOnly && !item.essential) return false;
      if (conditionFilter !== 'all' && item.condition !== conditionFilter) return false;
      return true;
    });

    items.sort((a, b) => {
      if (sortBy === 'brand') return (a.brand ?? '').localeCompare(b.brand ?? '');
      if (sortBy === 'newest') return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      if (sortBy === 'value') return (b.currentValue?.amount ?? 0) - (a.currentValue?.amount ?? 0);
      return a.name.localeCompare(b.name);
    });

    return items;
  }, [categories, categoryFilter, conditionFilter, essentialOnly, gear, query, sortBy, tagFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, GearItem[]>();
    for (const category of categories) map.set(category.id, []);
    for (const item of filtered) {
      if (!map.has(item.categoryId)) map.set(item.categoryId, []);
      map.get(item.categoryId)?.push(item);
    }
    return map;
  }, [categories, filtered]);

  async function handlePhotoUpload(file: File | undefined) {
    if (!file) return;
    if (file.size > 1_800_000) {
      setError('Photo too large. Keep under 1.8MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setDraft((prev) => ({ ...prev, photo: String(reader.result ?? '') }));
    };
    reader.readAsDataURL(file);
  }

  async function addItem() {
    setError('');
    const valid = gearItemSchema.safeParse({
      name: draft.name,
      categoryId: draft.categoryId,
      quantity: draft.quantity,
      condition: draft.condition,
    });

    if (!valid.success) {
      setError(valid.error.issues[0]?.message ?? 'Invalid input');
      return;
    }

    const now = new Date().toISOString();
    const item: GearItem = {
      id: makeId(),
      name: draft.name.trim(),
      categoryId: draft.categoryId,
      brand: draft.brand || undefined,
      model: draft.model || undefined,
      serialNumber: draft.serialNumber || undefined,
      purchaseDate: draft.purchaseDate || undefined,
      purchasePrice: parseMoney(draft.purchasePrice),
      currentValue: parseMoney(draft.currentValue),
      notes: draft.notes || undefined,
      customFields: parseCustomFields(draft.customFieldsText),
      condition: draft.condition,
      quantity: draft.quantity,
      photo: draft.photo || undefined,
      tags: draft.tagsText.split(',').map((t) => t.trim()).filter(Boolean),
      essential: draft.essential,
      relatedItemIds: [],
      maintenanceHistory: [],
      warranty: {},
      createdAt: now,
      updatedAt: now,
    };

    await db.gearItems.add(item);
    setDraft(initialDraft);
  }

  async function addCategory() {
    const name = window.prompt('New category name');
    if (!name?.trim()) return;
    const highest = categories.at(-1)?.sortOrder ?? 0;
    await db.categories.add({
      id: makeId(),
      name: name.trim(),
      isDefault: false,
      sortOrder: highest + 1,
      collapsed: false,
    });
  }

  async function renameCategory(category: Category) {
    const name = window.prompt('Rename category', category.name);
    if (!name?.trim()) return;
    await db.categories.update(category.id, { name: name.trim() });
  }

  async function deleteCategory(category: Category) {
    const fallback = categories.find((c) => c.id !== category.id);
    if (!fallback) return;
    if (!window.confirm(`Delete category "${category.name}"? Items move to "${fallback.name}".`)) return;

    const affected = await db.gearItems.where('categoryId').equals(category.id).toArray();
    await db.transaction('rw', db.categories, db.gearItems, async () => {
      for (const item of affected) {
        await db.gearItems.update(item.id, { categoryId: fallback.id, updatedAt: new Date().toISOString() });
      }
      await db.categories.delete(category.id);
    });
  }

  async function reorderCategory(categoryId: string, direction: -1 | 1) {
    const idx = categories.findIndex((c) => c.id === categoryId);
    const target = categories[idx + direction];
    const current = categories[idx];
    if (!target || !current) return;

    await db.transaction('rw', db.categories, async () => {
      await db.categories.update(current.id, { sortOrder: target.sortOrder });
      await db.categories.update(target.id, { sortOrder: current.sortOrder });
    });
  }

  async function toggleCollapse(category: Category) {
    await db.categories.update(category.id, { collapsed: !category.collapsed });
  }

  return (
    <section className="stack-lg">
      <div className="card">
        <div className="row between wrap">
          <h2>Catalog</h2>
          <button onClick={() => void addCategory()}>+ Category</button>
        </div>
        <div className="grid filters">
          <input aria-label="Search gear" placeholder="Search gear" value={query} onChange={(e) => setQuery(e.target.value)} />
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} aria-label="Filter by category">
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} aria-label="Filter by tag">
            <option value="">All tags</option>
            {tags.map((tag) => (
              <option key={tag} value={tag}>{tag}</option>
            ))}
          </select>
          <select value={conditionFilter} onChange={(e) => setConditionFilter(e.target.value as 'all' | Condition)} aria-label="Condition filter">
            <option value="all">All conditions</option>
            <option value="new">New</option>
            <option value="good">Good</option>
            <option value="worn">Worn</option>
          </select>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as 'name' | 'brand' | 'newest' | 'value')} aria-label="Sorting">
            <option value="name">Sort: Name</option>
            <option value="brand">Sort: Brand</option>
            <option value="newest">Sort: Newest</option>
            <option value="value">Sort: Value</option>
          </select>
          <label className="checkbox-inline"><input type="checkbox" checked={essentialOnly} onChange={(e) => setEssentialOnly(e.target.checked)} /> Essential only</label>
        </div>
      </div>

      <div className="card stack-md">
        <h3>Add Item</h3>
        <div className="grid two">
          <input placeholder="Name*" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <select value={draft.categoryId} onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}>
            <option value="">Category*</option>
            {categories.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
          </select>
          <input placeholder="Brand" value={draft.brand} onChange={(e) => setDraft({ ...draft, brand: e.target.value })} />
          <input placeholder="Model" value={draft.model} onChange={(e) => setDraft({ ...draft, model: e.target.value })} />
          <input placeholder="Serial number" value={draft.serialNumber} onChange={(e) => setDraft({ ...draft, serialNumber: e.target.value })} />
          <input type="date" value={draft.purchaseDate} onChange={(e) => setDraft({ ...draft, purchaseDate: e.target.value })} />
          <input type="number" placeholder="Purchase price" value={draft.purchasePrice} onChange={(e) => setDraft({ ...draft, purchasePrice: e.target.value })} />
          <input type="number" placeholder="Current value" value={draft.currentValue} onChange={(e) => setDraft({ ...draft, currentValue: e.target.value })} />
          <select value={draft.condition} onChange={(e) => setDraft({ ...draft, condition: e.target.value as Condition })}>
            <option value="new">New</option><option value="good">Good</option><option value="worn">Worn</option>
          </select>
          <input type="number" min={1} value={draft.quantity} onChange={(e) => setDraft({ ...draft, quantity: Number(e.target.value || 1) })} />
        </div>
        <textarea placeholder="Notes" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
        <input placeholder="Tags (comma separated)" value={draft.tagsText} onChange={(e) => setDraft({ ...draft, tagsText: e.target.value })} />
        <textarea placeholder="Custom fields (key:value one per line)" value={draft.customFieldsText} onChange={(e) => setDraft({ ...draft, customFieldsText: e.target.value })} />
        <label>Photo<input type="file" accept="image/*" onChange={(e) => void handlePhotoUpload(e.target.files?.[0])} /></label>
        <label className="checkbox-inline"><input type="checkbox" checked={draft.essential} onChange={(e) => setDraft({ ...draft, essential: e.target.checked })} /> Mark as essential</label>
        {error && <p className="error">{error}</p>}
        <button onClick={() => void addItem()}>Save item</button>
      </div>

      <div className="stack-md">
        {gear.length === 0 && <div className="card empty">No gear yet—add your first item.</div>}
        {categories.map((category, idx) => {
          const items = grouped.get(category.id) ?? [];
          if (!items.length && query) return null;
          return (
            <article className="card" key={category.id}>
              <div className="row between wrap">
                <button className="text-btn" onClick={() => void toggleCollapse(category)}>
                  {category.collapsed ? '▸' : '▾'} {category.name} ({items.length})
                </button>
                <div className="row">
                  <button className="ghost" onClick={() => void reorderCategory(category.id, -1)} disabled={idx === 0}>↑</button>
                  <button className="ghost" onClick={() => void reorderCategory(category.id, 1)} disabled={idx === categories.length - 1}>↓</button>
                  <button className="ghost" onClick={() => void renameCategory(category)}>Rename</button>
                  {!category.isDefault && <button className="ghost danger" onClick={() => void deleteCategory(category)}>Delete</button>}
                </div>
              </div>
              {!category.collapsed && (
                <div className="grid cards">
                  {items.map((item) => (
                    <button key={item.id} className="gear-card" onClick={() => navigate(`/catalog/item/${item.id}`)}>
                      <strong>{item.name}</strong>
                      <span>{item.brand} {item.model}</span>
                      <span className="subtle">Qty {item.quantity} • {item.condition}</span>
                      {item.essential && <span className="pill">Essential</span>}
                    </button>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function parseMoney(raw: string) {
  const amount = Number(raw);
  if (!raw || Number.isNaN(amount)) return undefined;
  return { amount, currency: 'EUR' };
}

function parseCustomFields(text: string) {
  const out: Record<string, string> = {};
  text
    .split('\n')
    .map((row) => row.trim())
    .filter(Boolean)
    .forEach((row) => {
      const [k, ...rest] = row.split(':');
      if (k && rest.length) out[k.trim()] = rest.join(':').trim();
    });
  return Object.keys(out).length ? out : undefined;
}
