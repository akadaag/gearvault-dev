import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { GearItemFormSheet, type GearFormDraft } from '../components/GearItemFormSheet';
import { MaintenanceSheet } from '../components/MaintenanceSheet';
import { formatMoney } from '../lib/format';
import { makeId } from '../lib/ids';
import { fuzzyIncludes } from '../lib/search';
import { gearItemSchema } from '../lib/validators';
import { lockSheetScroll, unlockSheetScroll } from '../lib/sheetLock';
import { compressedImageToDataUrl, uploadCompressedGearPhoto } from '../lib/gearPhotos';
import { useAuth } from '../hooks/useAuth';
import type { Category, Condition, GearItem, MaintenanceEntry } from '../types/models';

const initialDraft: GearFormDraft = {
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

export function CatalogPage() {
  const { user, isConfigured } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const categories = useLiveQuery(() => db.categories.orderBy('sortOrder').toArray(), [], []);
  const gear = useLiveQuery(() => db.gearItems.toArray(), [], []);

  const query = searchParams.get('q')?.trim() ?? '';
  const quickFilter = searchParams.get('qf') ?? 'all';
  const selectedCategoryIds = (searchParams.get('cats') ?? '').split(',').filter(Boolean);
  const showFilterSheet = searchParams.get('filters') === '1';
  const [tagFilter, setTagFilter] = useState('');
  const [essentialOnly, setEssentialOnly] = useState(false);
  const [conditionFilter, setConditionFilter] = useState<'all' | Condition>('all');
  const [sortBy, setSortBy] = useState<'name' | 'brand' | 'newest' | 'value'>('name');
  const [draft, setDraft] = useState<GearFormDraft>(initialDraft);
  const [showAddItemForm, setShowAddItemForm] = useState(false);
  const [error, setError] = useState('');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [maintenanceSheetItemId, setMaintenanceSheetItemId] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get('add') !== '1') return;

    setShowAddItemForm(true);
    const params = new URLSearchParams(searchParams);
    params.delete('add');
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const anySheetOpen = showFilterSheet || showAddItemForm || Boolean(selectedItemId) || Boolean(maintenanceSheetItemId);
    if (!anySheetOpen) return;
    lockSheetScroll();
    return () => unlockSheetScroll();
  }, [showFilterSheet, showAddItemForm, selectedItemId, maintenanceSheetItemId]);

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
      if (quickFilter === 'essential' && !item.essential) return false;
      if (quickFilter === 'maintenance' && !isNeedsMaintenance(item)) return false;
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
  }, [categories, conditionFilter, essentialOnly, gear, query, quickFilter, selectedCategoryIds, sortBy, tagFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, GearItem[]>();
    for (const category of categories) map.set(category.id, []);
    for (const item of filtered) {
      if (!map.has(item.categoryId)) map.set(item.categoryId, []);
      map.get(item.categoryId)?.push(item);
    }
    return map;
  }, [categories, filtered]);

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
    const itemId = makeId();
    let photo: string | undefined = draft.photo || undefined;

    try {
      if (draft.removePhoto) {
        photo = undefined;
      } else if (draft.photoFile) {
        if (user && isConfigured) {
          const uploaded = await uploadCompressedGearPhoto({
            file: draft.photoFile,
            userId: user.id,
            itemId,
          });
          photo = uploaded.url;
        } else {
          photo = await compressedImageToDataUrl(draft.photoFile);
        }
      }
    } catch (uploadError: unknown) {
      setError(uploadError instanceof Error ? uploadError.message : 'Could not process photo.');
      return;
    }

    const item: GearItem = {
      id: itemId,
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
      photo,
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

  async function toggleCollapse(category: Category) {
    await db.categories.update(category.id, { collapsed: !category.collapsed });
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

  async function saveMaintenanceEntry(itemId: string, entry: MaintenanceEntry) {
    const target = gear.find((g) => g.id === itemId);
    if (!target) return;

    await db.gearItems.update(itemId, {
      maintenanceHistory: [...(target.maintenanceHistory ?? []), entry],
      updatedAt: new Date().toISOString(),
    });
  }

  async function updateMaintenanceEntry(itemId: string, entry: MaintenanceEntry) {
    const target = gear.find((g) => g.id === itemId);
    if (!target) return;

    await db.gearItems.update(itemId, {
      maintenanceHistory: (target.maintenanceHistory ?? []).map((existing) => (
        existing.id === entry.id ? { ...existing, ...entry } : existing
      )),
      updatedAt: new Date().toISOString(),
    });
  }

  async function deleteMaintenanceEntry(itemId: string, entryId: string) {
    const target = gear.find((g) => g.id === itemId);
    if (!target) return;

    await db.gearItems.update(itemId, {
      maintenanceHistory: (target.maintenanceHistory ?? []).filter((existing) => existing.id !== entryId),
      updatedAt: new Date().toISOString(),
    });
  }

  return (
    <>
      <section className="stack-lg catalog-page">
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
        {categories.map((category) => {
          const items = grouped.get(category.id) ?? [];
          if (!items.length) return null;
          return (
            <article className="catalog-group stack-sm" key={category.id}>
              <div className="category-header-row">
                <button className="text-btn category-title-btn" onClick={() => void toggleCollapse(category)}>
                  {category.name} <span className="category-count-pill">{items.length}</span>
                </button>
                <button
                  className={`category-toggle-btn${category.collapsed ? ' is-collapsed' : ''}`}
                  aria-label={category.collapsed ? `Expand ${category.name}` : `Collapse ${category.name}`}
                  onClick={() => void toggleCollapse(category)}
                >
                  <span className="catalog-item-arrow" aria-hidden="true">›</span>
                </button>
              </div>
              {!category.collapsed && (
                <div className="catalog-items-surface">
                  <div className="catalog-items-list">
                  {items.map((item) => (
                    <button key={item.id} className="catalog-item-row" onClick={() => setSelectedItemId(item.id)}>
                      <div className="catalog-item-icon-wrapper">
                        {item.photo ? (
                          <img src={item.photo} alt={item.name} className="catalog-item-icon-img" />
                        ) : (
                          <div className="catalog-item-icon" aria-hidden="true">{item.name.charAt(0).toUpperCase()}</div>
                        )}
                      </div>
                      <div className="catalog-item-main">
                        <strong className="catalog-item-title">{item.name}</strong>
                        {(item.brand || item.model) && (
                          <span className="subtle catalog-item-subtitle">{item.brand} {item.model}</span>
                        )}
                        <div className="row wrap catalog-item-meta-row">
                          <span className="pill">x{item.quantity}</span>
                          <span className={`pill pill-condition pill-condition-${item.condition}`}>{item.condition}</span>
                          {item.essential && <span className="pill essential">Essential</span>}
                        </div>
                      </div>
                      <div className="catalog-item-arrow" aria-hidden="true">›</div>
                    </button>
                  ))}
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
      </section>

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

      <GearItemFormSheet
        open={showAddItemForm}
        title="Add Gear"
        submitLabel="Save Item"
        categories={categories}
        draft={draft}
        error={error}
        onDraftChange={(nextDraft) => {
          setError('');
          setDraft(nextDraft);
        }}
        onErrorChange={setError}
        onClose={() => {
          setShowAddItemForm(false);
          setError('');
        }}
        onSubmit={() => void addItem()}
      />

      {selectedItemId && (() => {
        const item = gear.find((g) => g.id === selectedItemId);
        if (!item) return null;
        
        const category = categories.find((c) => c.id === item.categoryId);
        const maintenanceSummary = getMaintenanceSummary(item);

        return (
          <>
            <button className="sheet-overlay" aria-label="Close item details" onClick={() => setSelectedItemId(null)} />
            <aside className="item-detail-sheet card" aria-label="Item details">
              <div className="detail-sheet-header">
                {item.photo ? (
                  <img src={item.photo} alt={item.name} className="detail-photo" />
                ) : (
                  <div className="detail-photo detail-photo-placeholder" aria-label="No photo available">
                    <span className="detail-photo-initial">{item.name.charAt(0).toUpperCase()}</span>
                  </div>
                )}
                <div className="detail-header-content">
                  <h2>{item.name}</h2>
                  <p className="subtle detail-subtitle">{[item.brand, item.model].filter(Boolean).join(' ') || 'No brand/model yet'}</p>
                  <div className="row wrap detail-badges">
                    {category && <span className="pill">{category.name}</span>}
                    <span className={`pill pill-condition pill-condition-${item.condition}`}>{item.condition}</span>
                    <span className="pill">×{item.quantity} units</span>
                    {item.essential && <span className="pill essential">Essential</span>}
                  </div>
                </div>
                <button className="sheet-close-btn" onClick={() => setSelectedItemId(null)} aria-label="Close">✕</button>
              </div>

              {item.purchasePrice && (
                <section className="detail-preview-card detail-sheet-preview-card">
                  <div className="detail-preview-icon" aria-hidden="true">$</div>
                  <div>
                    <span className="detail-label">Purchase Price</span>
                    <p className="detail-preview-value">{formatMoney(item.purchasePrice.amount, item.purchasePrice.currency)}</p>
                  </div>
                </section>
              )}

              <div className="detail-quick-grid" style={{ overflowY: 'auto', minHeight: 0 }}>
                <button
                  type="button"
                  className="detail-quick-card detail-quick-card-btn"
                  onClick={() => setMaintenanceSheetItemId(item.id)}
                >
                  <div className="detail-quick-icon blue" aria-hidden="true">
                    <svg viewBox="0 0 24 24" focusable="false">
                      <path d="M14.7 6.3a4.5 4.5 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4.5 4.5 0 0 0 5.4-5.4l-2.4 2.4-2.2-2.2z" />
                    </svg>
                  </div>
                  <div>
                    <strong>Maintenance</strong>
                    <p className="subtle">{item.maintenanceHistory?.length ?? 0} records</p>
                    <p className="subtle detail-quick-summary">{maintenanceSummary.last}</p>
                    {maintenanceSummary.type && (
                      <p className="subtle detail-quick-summary">{maintenanceSummary.type}</p>
                    )}
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
                    <p className="subtle">{item.relatedItemIds?.length ?? 0} linked</p>
                  </div>
                </article>
              </div>

              <div className="detail-actions">
                <button onClick={() => navigate(`/catalog/item/${item.id}`)} className="ghost">
                  More Details
                </button>
              </div>
            </aside>
          </>
        );
      })()}

      {maintenanceSheetItemId && (() => {
        const selected = gear.find((g) => g.id === maintenanceSheetItemId);
        if (!selected) return null;

        return (
          <MaintenanceSheet
            open={Boolean(selected)}
            itemName={selected.name}
            history={selected.maintenanceHistory ?? []}
            onClose={() => setMaintenanceSheetItemId(null)}
            onSaveEntry={(entry) => saveMaintenanceEntry(selected.id, entry)}
            onUpdateEntry={(entry) => updateMaintenanceEntry(selected.id, entry)}
            onDeleteEntry={(entryId) => deleteMaintenanceEntry(selected.id, entryId)}
          />
        );
      })()}
    </>
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

function parseCustomFields(text: string) {
  const out: Record<string, string> = {};
  text.split('\n').map((row) => row.trim()).filter(Boolean).forEach((row) => {
    const [k, ...rest] = row.split(':');
    if (k && rest.length) out[k.trim()] = rest.join(':').trim();
  });
  return Object.keys(out).length ? out : undefined;
}

function isNeedsMaintenance(item: GearItem) {
  if (item.condition === 'worn') return true;
  const latest = [...(item.maintenanceHistory ?? [])].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  )[0];
  if (!latest) return true;
  const daysSinceLast = (Date.now() - new Date(latest.date).getTime()) / (1000 * 60 * 60 * 24);
  return daysSinceLast > 180;
}