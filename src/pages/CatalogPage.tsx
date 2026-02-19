import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { GearItemFormSheet, type GearFormDraft } from '../components/GearItemFormSheet';
import { formatMoney } from '../lib/format';
import { makeId } from '../lib/ids';
import { fuzzyIncludes } from '../lib/search';
import { gearItemSchema } from '../lib/validators';
import { lockSheetScroll, unlockSheetScroll } from '../lib/sheetLock';
import { useSheetDismiss } from '../hooks/useSheetDismiss';
import { compressedImageToDataUrl, uploadCompressedGearPhoto } from '../lib/gearPhotos';
import { useAuth } from '../hooks/useAuth';
import { classificationQueue } from '../lib/gearClassifier';
import type { Category, Condition, GearItem } from '../types/models';

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

  // Closing animation for filter sheet
  const { closing: closingFilter, dismiss: dismissFilter, onAnimationEnd: onFilterAnimEnd } = useSheetDismiss(() => {
    updateSearchParams((params) => { params.delete('filters'); });
  });

  useEffect(() => {
    if (searchParams.get('add') !== '1') return;

    setShowAddItemForm(true);
    const params = new URLSearchParams(searchParams);
    params.delete('add');
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const anySheetOpen = showFilterSheet || showAddItemForm;
    if (!anySheetOpen) return;
    lockSheetScroll();
    return () => unlockSheetScroll();
  }, [showFilterSheet, showAddItemForm]);

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

  // closeFilterSheet replaced by dismissFilter for animated close

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
    <>
      <section className="catalog-page ios-theme">
        {/* iOS-style inline header */}
        <header className="ios-catalog-header">
          <div className="ios-catalog-header-top">
            <h1 className="ios-catalog-title">Catalog</h1>
            <div className="ios-catalog-header-actions">
              <div className="ios-catalog-toolbar" role="group" aria-label="Catalog actions">
                <button
                  className={`ios-catalog-toolbar-btn${showFilterSheet || tagFilter || conditionFilter !== 'all' || essentialOnly || selectedCategoryIds.length > 0 ? ' active' : ''}`}
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
                <button
                  className="ios-catalog-toolbar-btn"
                  onClick={() => updateSearchParams((p) => p.set('add', '1'))}
                  aria-label="Add Item"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <div className="ios-catalog-item-count">{filtered.length} item{filtered.length !== 1 ? 's' : ''}</div>
        </header>

        {/* Scrollable content area */}
        <div className="ios-catalog-scroll page-scroll-area">
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
                  <section className="ios-catalog-group-block" key={category.id}>
                    <button
                      type="button"
                      className="ios-catalog-group-header"
                      onClick={() => void toggleCollapse(category)}
                      aria-expanded={!category.collapsed}
                      aria-controls={`catalog-group-${category.id}`}
                    >
                      <span className="ios-catalog-group-label">{category.name}</span>
                      <span className={`ios-catalog-chevron${category.collapsed ? ' collapsed' : ''}`} aria-hidden="true">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </span>
                    </button>

                    <div
                      id={`catalog-group-${category.id}`}
                      className={`ios-list-group ios-catalog-group-panel${category.collapsed ? ' collapsed' : ''}`}
                    >
                      {items.map((item) => (
                        <button
                          key={item.id}
                          className="ios-list-item"
                          onClick={() => navigate(`/catalog/item/${item.id}`)}
                          tabIndex={category.collapsed ? -1 : undefined}
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
                            {item.essential && (
                              <svg className="ios-catalog-star ios-catalog-star--action" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-label="Essential">
                                <path d="m12 2.4 2.95 5.98 6.6.96-4.77 4.65 1.12 6.58L12 17.47l-5.9 3.1 1.12-6.58-4.77-4.65 6.6-.96z" />
                              </svg>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ── Filter Sheet ───────────────────────────────────────────────── */}
      {showFilterSheet && (
        <>
          <div className={`ios-sheet-backdrop${closingFilter ? ' closing' : ''}`} onClick={dismissFilter} />
          <div className={`ios-sheet-modal${closingFilter ? ' closing' : ''}`} aria-label="Catalog filters" onAnimationEnd={onFilterAnimEnd}>
            <div className="ios-sheet-header ios-sheet-header--icon">
              <button className="ios-sheet-pill-btn" onClick={clearAllFilters}>Reset</button>
              <h3 className="ios-sheet-title">Filters</h3>
              <button className="ios-sheet-pill-btn" onClick={dismissFilter}>Done</button>
            </div>

            <div className="ios-sheet-content">
              <div className="ios-form-group-title">View Options</div>
              <div className="ios-form-group">
                <label className="ios-form-row">
                  <span className="ios-form-label">Sort By</span>
                  <select
                    className="ios-form-input"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as 'name' | 'brand' | 'newest' | 'value')}
                    aria-label="Sorting"
                  >
                    <option value="name">Name</option>
                    <option value="brand">Brand</option>
                    <option value="newest">Newest</option>
                    <option value="value">Value</option>
                  </select>
                </label>
                <label className="ios-form-row">
                  <span className="ios-form-label">Tag</span>
                  <select
                    className="ios-form-input"
                    value={tagFilter}
                    onChange={(e) => setTagFilter(e.target.value)}
                    aria-label="Filter by tag"
                  >
                    <option value="">All tags</option>
                    {tags.map((tag) => (<option key={tag} value={tag}>{tag}</option>))}
                  </select>
                </label>
                <label className="ios-form-row">
                  <span className="ios-form-label">Condition</span>
                  <select
                    className="ios-form-input"
                    value={conditionFilter}
                    onChange={(e) => setConditionFilter(e.target.value as 'all' | Condition)}
                    aria-label="Condition filter"
                  >
                    <option value="all">Any</option>
                    <option value="new">New</option>
                    <option value="good">Good</option>
                    <option value="worn">Worn</option>
                  </select>
                </label>
                <label className="ios-form-row">
                  <span className="ios-form-label">Essential Only</span>
                  <input
                    type="checkbox"
                    className="ios-switch"
                    checked={essentialOnly}
                    onChange={(e) => setEssentialOnly(e.target.checked)}
                  />
                </label>
              </div>

              <div className="ios-form-group-title">Categories</div>
              <div className="ios-form-group">
                {categories.map((category) => {
                  const checked = selectedCategoryIds.includes(category.id);
                  return (
                    <label className="ios-form-row" key={category.id}>
                      <span className="ios-form-label">{category.name}</span>
                      <input
                        type="checkbox"
                        className="ios-switch"
                        checked={checked}
                        onChange={() => toggleCategoryFilter(category.id)}
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
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

    </>
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

function isNeedsMaintenance(item: GearItem) {
  if (item.condition === 'worn') return true;
  const latest = [...(item.maintenanceHistory ?? [])].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  )[0];
  if (!latest) return true;
  const daysSinceLast = (Date.now() - new Date(latest.date).getTime()) / (1000 * 60 * 60 * 24);
  return daysSinceLast > 180;
}
