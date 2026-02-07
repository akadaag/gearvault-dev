import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
  const [searchParams, setSearchParams] = useSearchParams();
  const categories = useLiveQuery(() => db.categories.orderBy('sortOrder').toArray(), [], []);
  const gear = useLiveQuery(() => db.gearItems.toArray(), [], []);

  const query = searchParams.get('q')?.trim() ?? '';
  const selectedCategoryIds = (searchParams.get('cats') ?? '').split(',').filter(Boolean);
  const showFilterSheet = searchParams.get('filters') === '1';
  const [tagFilter, setTagFilter] = useState('');
  const [essentialOnly, setEssentialOnly] = useState(false);
  const [conditionFilter, setConditionFilter] = useState<'all' | Condition>('all');
  const [sortBy, setSortBy] = useState<'name' | 'brand' | 'newest' | 'value'>('name');
  const [draft, setDraft] = useState<GearDraft>(initialDraft);
  const [showAddItemForm, setShowAddItemForm] = useState(false);
  const [openCategoryMenuId, setOpenCategoryMenuId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (searchParams.get('add') !== '1') return;

    setShowAddItemForm(true);
    const params = new URLSearchParams(searchParams);
    params.delete('add');
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

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
      if (selectedCategoryIds.length > 0 && !selectedCategoryIds.includes(item.categoryId)) return false;
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
  }, [categories, conditionFilter, essentialOnly, gear, query, selectedCategoryIds, sortBy, tagFilter]);

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
    setShowAddItemForm(false);
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
    setOpenCategoryMenuId(null);
  }

  function updateSearchParams(mutator: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams);
    mutator(params);
    setSearchParams(params);
  }

  function toggleCategoryFilter(categoryId: string) {
    updateSearchParams((params) => {
      const current = (params.get('cats') ?? '').split(',').filter(Boolean);
      const next = current.includes(categoryId)
        ? current.filter((id) => id !== categoryId)
        : [...current, categoryId];

      if (next.length > 0) params.set('cats', next.join(','));
      else params.delete('cats');
    });
  }

  function closeFilterSheet() {
    updateSearchParams((params) => {
      params.delete('filters');
    });
  }

  function clearAllFilters() {
    updateSearchParams((params) => {
      params.delete('cats');
    });
    setTagFilter('');
    setConditionFilter('all');
    setEssentialOnly(false);
    setSortBy('name');
  }

  return (
    <section className="stack-lg">
      {showFilterSheet && (
        <>
          <button className="sheet-overlay" aria-label="Close filters" onClick={closeFilterSheet} />
          <aside className="filter-sheet card stack-md" aria-label="Catalog filters">
            <div className="row between">
              <h3>Filters</h3>
              <button className="ghost" onClick={closeFilterSheet}>Done</button>
            </div>

            <div className="stack-sm">
              <strong>Categories</strong>
              <div className="catalog-filter-checklist">
                {categories.map((category) => {
                  const checked = selectedCategoryIds.includes(category.id);
                  return (
                    <label className="checkbox-inline" key={category.id}>
                      <input type="checkbox" checked={checked} onChange={() => toggleCategoryFilter(category.id)} />
                      {category.name}
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="grid filters">
              <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} aria-label="Filter by tag">
                <option value="">All tags</option>
                {tags.map((tag) => (<option key={tag} value={tag}>{tag}</option>))}
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

            <button className="ghost" onClick={clearAllFilters}>Clear all filters</button>
          </aside>
        </>
      )}

      {showAddItemForm && (
        <div className="card stack-md catalog-add-form">
          <div className="row between wrap">
            <h3>Add Item</h3>
            <button className="ghost" onClick={() => setShowAddItemForm(false)}>Close</button>
          </div>
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
            <input type="number" min={1} placeholder="Quantity" value={draft.quantity} onChange={(e) => setDraft({ ...draft, quantity: Number(e.target.value || 1) })} />
          </div>
          <textarea placeholder="Notes" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
          <input placeholder="Tags (comma separated)" value={draft.tagsText} onChange={(e) => setDraft({ ...draft, tagsText: e.target.value })} />
          <textarea placeholder="Custom fields (key:value one per line)" value={draft.customFieldsText} onChange={(e) => setDraft({ ...draft, customFieldsText: e.target.value })} />
          <label className="form-file-label">Photo<input type="file" accept="image/*" onChange={(e) => void handlePhotoUpload(e.target.files?.[0])} /></label>
          <label className="checkbox-inline"><input type="checkbox" checked={draft.essential} onChange={(e) => setDraft({ ...draft, essential: e.target.checked })} /> Mark as essential</label>
          {error && <p className="error">{error}</p>}
          <button onClick={() => void addItem()}>Save item</button>
        </div>
      )}

      {gear.length === 0 && (
        <div className="card empty">
          <h3>No gear yet</h3>
          <p>Add your first item to get started</p>
        </div>
      )}

      {filtered.length === 0 && gear.length > 0 && (
        <div className="card empty">
          <h3>No results found</h3>
          <p>Try adjusting your filters or search query</p>
        </div>
      )}

      <div className="stack-md">
        {categories.map((category, idx) => {
          const items = grouped.get(category.id) ?? [];
          if (!items.length) return null;
          return (
            <article className="catalog-group stack-sm" key={category.id}>
              <div className="category-header-row">
                <button className="text-btn category-title-btn" onClick={() => void toggleCollapse(category)}>
                  {category.name} <span className="category-count-pill">{items.length}</span>
                </button>
                <div className="row">
                  <button className="ghost icon-compact-btn category-collapse-btn" aria-label={category.collapsed ? `Expand ${category.name}` : `Collapse ${category.name}`} onClick={() => void toggleCollapse(category)}>
                    {category.collapsed ? '▾' : '▴'}
                  </button>
                  <div className="category-actions">
                    <button className="ghost icon-compact-btn" aria-label={`Open actions for ${category.name}`} onClick={() => setOpenCategoryMenuId((prev) => (prev === category.id ? null : category.id))}>⋯</button>
                    {openCategoryMenuId === category.id && (
                      <div className="category-menu">
                        <button className="ghost" onClick={async () => { await reorderCategory(category.id, -1); setOpenCategoryMenuId(null); }} disabled={idx === 0}>Move up</button>
                        <button className="ghost" onClick={async () => { await reorderCategory(category.id, 1); setOpenCategoryMenuId(null); }} disabled={idx === categories.length - 1}>Move down</button>
                        <button className="ghost" onClick={async () => { await renameCategory(category); setOpenCategoryMenuId(null); }}>Rename</button>
                        {!category.isDefault && <button className="ghost danger" onClick={async () => { await deleteCategory(category); setOpenCategoryMenuId(null); }}>Delete</button>}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {!category.collapsed && (
                <div className="catalog-items-list">
                  {items.map((item) => (
                    <button key={item.id} className="gear-card catalog-item-card" onClick={() => navigate(`/catalog/item/${item.id}`)}>
                      <div className="catalog-item-avatar" aria-hidden="true">{item.name.charAt(0).toUpperCase()}</div>
                      <div className="catalog-item-main">
                        <strong className="catalog-item-title">{item.name}</strong>
                        {(item.brand || item.model) && (
                          <span className="subtle catalog-item-subtitle">{item.brand} {item.model}</span>
                        )}
                        <div className="row wrap catalog-item-meta-row">
                          <span className="pill">x{item.quantity}</span>
                          <span className="pill">{item.condition}</span>
                          {item.essential && <span className="pill">⭐ Essential</span>}
                        </div>
                      </div>
                      <span className="catalog-item-arrow" aria-hidden="true">›</span>
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
  text.split('\n').map((row) => row.trim()).filter(Boolean).forEach((row) => {
    const [k, ...rest] = row.split(':');
    if (k && rest.length) out[k.trim()] = rest.join(':').trim();
  });
  return Object.keys(out).length ? out : undefined;
}