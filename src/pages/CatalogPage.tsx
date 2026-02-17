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
import { classificationQueue } from '../lib/gearClassifier';
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
    
    // Enqueue for AI classification
    classificationQueue.enqueue(item);
    
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
      <section className="catalog-page ios-theme">
        {/* iOS-style inline header */}
        <header className="ios-catalog-header">
          <div className="ios-catalog-header-top">
            <h1 className="ios-catalog-title">Catalog</h1>
            <button
              className="ios-catalog-add-btn"
              onClick={() => updateSearchParams((p) => p.set('add', '1'))}
              aria-label="Add Item"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>

          <div className="ios-catalog-search-row">
            <div className="ios-catalog-search-bar">
              <svg className="ios-catalog-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Search"
                value={query}
                onChange={(e) => updateSearchParams((p) => {
                  if (e.target.value) p.set('q', e.target.value);
                  else p.delete('q');
                })}
              />
              {query && (
                <button
                  className="ios-catalog-search-clear"
                  onClick={() => updateSearchParams((p) => p.delete('q'))}
                  aria-label="Clear search"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="12" r="10" opacity="0.25" />
                    <path d="M15 9l-6 6M9 9l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
                  </svg>
                </button>
              )}
            </div>
            <button
              className={`ios-catalog-filter-btn${showFilterSheet || tagFilter || conditionFilter !== 'all' || essentialOnly || selectedCategoryIds.length > 0 ? ' active' : ''}`}
              onClick={() => updateSearchParams((p) => p.set('filters', '1'))}
              aria-label="Filters"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="21" x2="4" y2="14" />
                <line x1="4" y1="10" x2="4" y2="3" />
                <line x1="12" y1="21" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12" y2="3" />
                <line x1="20" y1="21" x2="20" y2="16" />
                <line x1="20" y1="12" x2="20" y2="3" />
                <line x1="1" y1="14" x2="7" y2="14" />
                <line x1="9" y1="8" x2="15" y2="8" />
                <line x1="17" y1="16" x2="23" y2="16" />
              </svg>
            </button>
          </div>

          <div className="ios-catalog-item-count">{filtered.length} item{filtered.length !== 1 ? 's' : ''}</div>
        </header>

        {/* Scrollable content area */}
        <div className="ios-catalog-scroll">
          {gear.length === 0 ? (
            <div className="ios-catalog-empty">
              <div className="ios-catalog-empty-icon" aria-hidden="true">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </div>
              <h3>No Gear Yet</h3>
              <p>Tap + to add your first item</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="ios-catalog-empty">
              <p>No matches found</p>
              <button className="ios-catalog-text-btn" onClick={clearAllFilters}>Clear Filters</button>
            </div>
          ) : (
            <div className="ios-catalog-groups">
              {categories.map((category) => {
                const items = grouped.get(category.id) ?? [];
                if (!items.length) return null;

                return (
                  <div className="ios-list-group" key={category.id}>
                    <button
                      type="button"
                      className="ios-catalog-group-header"
                      onClick={() => void toggleCollapse(category)}
                      aria-expanded={!category.collapsed}
                    >
                      <span className="ios-catalog-group-label">{category.name}</span>
                      <span className="ios-catalog-group-count">{items.length}</span>
                      <span className={`ios-catalog-chevron${category.collapsed ? ' collapsed' : ''}`} aria-hidden="true">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </span>
                    </button>

                    {!category.collapsed && items.map((item) => (
                      <button
                        key={item.id}
                        className="ios-list-item"
                        onClick={() => setSelectedItemId(item.id)}
                      >
                        <div className="ios-list-icon">
                          {item.photo ? (
                            <img src={item.photo} alt={item.name} />
                          ) : (
                            item.name.charAt(0).toUpperCase()
                          )}
                        </div>
                        <div className="ios-list-content">
                          <span className="ios-list-title">
                            {item.name}
                            {item.essential && (
                              <svg className="ios-catalog-star" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-label="Essential">
                                <path d="m12 2.4 2.95 5.98 6.6.96-4.77 4.65 1.12 6.58L12 17.47l-5.9 3.1 1.12-6.58-4.77-4.65 6.6-.96z" />
                              </svg>
                            )}
                          </span>
                          <span className="ios-list-sub">
                            {[item.brand, item.model].filter(Boolean).join(' ') || category.name}
                            {item.quantity > 1 && ` \u00B7 x${item.quantity}`}
                          </span>
                        </div>
                        <div className="ios-list-action">
                          {item.currentValue && (
                            <span className="ios-catalog-value">
                              {formatMoney(item.currentValue.amount, item.currentValue.currency)}
                            </span>
                          )}
                          <span className="ios-arrow" aria-hidden="true">&#8250;</span>
                        </div>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ── Filter Sheet ───────────────────────────────────────────────── */}
      {showFilterSheet && (
        <>
          <button className="sheet-overlay" aria-label="Close filters" onClick={closeFilterSheet} />
          <aside className="filter-sheet card stack-md" aria-label="Catalog filters">
            <div className="ios-catalog-sheet-header">
              <button className="ios-catalog-sheet-action" onClick={clearAllFilters}>Reset</button>
              <h3>Filters</h3>
              <button className="ios-catalog-sheet-action primary" onClick={closeFilterSheet}>Done</button>
            </div>

            <div className="stack-sm">
              <strong className="ios-catalog-filter-label">Categories</strong>
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

            <div className="ios-catalog-filter-grid">
              <label className="ios-catalog-filter-field">
                <span>Tag</span>
                <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} aria-label="Filter by tag">
                  <option value="">All tags</option>
                  {tags.map((tag) => (<option key={tag} value={tag}>{tag}</option>))}
                </select>
              </label>
              <label className="ios-catalog-filter-field">
                <span>Condition</span>
                <select value={conditionFilter} onChange={(e) => setConditionFilter(e.target.value as 'all' | Condition)} aria-label="Condition filter">
                  <option value="all">All conditions</option>
                  <option value="new">New</option>
                  <option value="good">Good</option>
                  <option value="worn">Worn</option>
                </select>
              </label>
              <label className="ios-catalog-filter-field">
                <span>Sort</span>
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value as 'name' | 'brand' | 'newest' | 'value')} aria-label="Sorting">
                  <option value="name">Name</option>
                  <option value="brand">Brand</option>
                  <option value="newest">Newest</option>
                  <option value="value">Value</option>
                </select>
              </label>
              <label className="checkbox-inline ios-catalog-filter-check">
                <input type="checkbox" checked={essentialOnly} onChange={(e) => setEssentialOnly(e.target.checked)} />
                <span>Essential only</span>
              </label>
            </div>
          </aside>
        </>
      )}

      {/* ── Add Gear Form Sheet ────────────────────────────────────────── */}
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

      {/* ── Item Detail Sheet ──────────────────────────────────────────── */}
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
                {item.essential ? (
                  <svg className="detail-sheet-essential-star" viewBox="0 0 24 24" aria-label="Essential" focusable="false">
                    <path d="m12 2.4 2.95 5.98 6.6.96-4.77 4.65 1.12 6.58L12 17.47l-5.9 3.1 1.12-6.58-4.77-4.65 6.6-.96z" />
                  </svg>
                ) : (
                  <span className="detail-sheet-star-placeholder" />
                )}
                <div className="detail-header-content">
                  <h2>{item.name}</h2>
                  <p className="subtle detail-subtitle">{[item.brand, item.model].filter(Boolean).join(' ') || 'No brand/model yet'}</p>
                </div>
                <div className="detail-badges">
                  {category && <span className="pill">{category.name}</span>}
                  <span className={`pill pill-condition pill-condition-${item.condition}`}>{item.condition}</span>
                  <span className="pill">{'\u00D7'}{item.quantity} units</span>
                </div>
                <button className="sheet-close-btn" onClick={() => setSelectedItemId(null)} aria-label="Close">{'\u2715'}</button>
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

      {/* ── Maintenance Sheet ──────────────────────────────────────────── */}
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