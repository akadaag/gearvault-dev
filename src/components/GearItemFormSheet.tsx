import { useEffect, useState } from 'react';
import type { Category, Condition } from '../types/models';
import { lockSheetScroll, unlockSheetScroll } from '../lib/sheetLock';
import { useSheetDismiss } from '../hooks/useSheetDismiss';

export interface GearFormDraft {
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
  photoPreview: string;
  photoFile: File | null;
  removePhoto: boolean;
}

interface GearItemFormSheetProps {
  open: boolean;
  title: string;
  submitLabel: string;
  categories: Category[];
  draft: GearFormDraft;
  error: string;
  onDraftChange: (draft: GearFormDraft) => void;
  onErrorChange: (message: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

type FormMode = 'quick' | 'full';

export function GearItemFormSheet({
  open,
  title,
  submitLabel,
  categories,
  draft,
  error,
  onDraftChange,
  onErrorChange,
  onClose,
  onSubmit,
}: GearItemFormSheetProps) {
  const [mode, setMode] = useState<FormMode>('quick');

  useEffect(() => {
    if (!open) return;
    lockSheetScroll();
    return () => unlockSheetScroll();
  }, [open]);

  const { closing, dismiss, onAnimationEnd } = useSheetDismiss(onClose);

  if (!open) return null;

  function update<K extends keyof GearFormDraft>(key: K, value: GearFormDraft[K]) {
    onDraftChange({ ...draft, [key]: value });
  }

  function handlePhotoUpload(file: File | undefined) {
    if (!file) return;
    if (file.size > 15_000_000) {
      onErrorChange('Photo too large. Keep under 15MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      onDraftChange({
        ...draft,
        photoFile: file,
        photoPreview: String(reader.result ?? ''),
        removePhoto: false,
      });
      onErrorChange('');
    };
    reader.readAsDataURL(file);
  }

  function clearPhoto() {
    onDraftChange({
      ...draft,
      photo: '',
      photoPreview: '',
      photoFile: null,
      removePhoto: true,
    });
    onErrorChange('');
  }

  const kbHandlers = {
    onFocus: () => document.documentElement.classList.add('keyboard-open'),
    onBlur: () => document.documentElement.classList.remove('keyboard-open'),
  };

  return (
    <>
      <div className={`ios-sheet-backdrop${closing ? ' closing' : ''}`} onClick={dismiss} />
      <div
        className={`ios-sheet-modal ios-sheet-modal--form${closing ? ' closing' : ''}`}
        aria-label={title}
        onAnimationEnd={onAnimationEnd}
      >
        <div className="ios-sheet-handle" />

        {/* Header */}
        <div className="ios-sheet-header ios-sheet-header--icon">
          <button className="ios-sheet-icon-btn ios-sheet-icon-btn--cancel" onClick={dismiss} aria-label="Cancel">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M2 2L16 16M16 2L2 16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
            </svg>
          </button>
          <h3 className="ios-sheet-title">{title}</h3>
          <button className="ios-sheet-icon-btn ios-sheet-icon-btn--save" onClick={onSubmit} aria-label={submitLabel}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M2.5 9.5L7 14L15.5 4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>

        {/* Segmented Control */}
        <div className="ios-sheet-segment-wrap">
          <div className="ios-sheet-segment">
            <button
              className={`ios-sheet-segment-btn${mode === 'quick' ? ' active' : ''}`}
              onClick={() => setMode('quick')}
            >
              Quick Add
            </button>
            <button
              className={`ios-sheet-segment-btn${mode === 'full' ? ' active' : ''}`}
              onClick={() => setMode('full')}
            >
              Full Details
            </button>
          </div>
        </div>

        <div className="ios-sheet-content ios-sheet-content--form">

          {/* Photo */}
          <div className="ios-detail-hero">
            <label className="ios-photo-upload-area">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handlePhotoUpload(e.target.files?.[0])}
              />
              {draft.photoPreview || draft.photo ? (
                <div className="ios-detail-hero-photo-wrap">
                  <img
                    src={draft.photoPreview || draft.photo}
                    alt="Selected"
                    className="ios-detail-img"
                  />
                  <button
                    type="button"
                    className="ios-photo-remove-btn"
                    aria-label="Remove photo"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      clearPhoto();
                    }}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div className="ios-detail-placeholder">
                  <span aria-hidden="true">📷</span>
                </div>
              )}
              <span className="ios-photo-upload-label">
                {draft.photoPreview || draft.photo ? 'Edit Photo' : 'Add Photo'}
              </span>
            </label>
          </div>

          {/* Pill 1 — Name / Brand / Model */}
          <div className="ios-form-pill">
            <input
              className="ios-pill-input"
              placeholder="Item Name *"
              value={draft.name}
              onChange={(e) => update('name', e.target.value)}
              {...kbHandlers}
            />
            <div className="ios-pill-divider" />
            <input
              className="ios-pill-input"
              placeholder="Brand"
              value={draft.brand}
              onChange={(e) => update('brand', e.target.value)}
              {...kbHandlers}
            />
            <div className="ios-pill-divider" />
            <input
              className="ios-pill-input"
              placeholder="Model"
              value={draft.model}
              onChange={(e) => update('model', e.target.value)}
              {...kbHandlers}
            />
          </div>

          {/* Pill 2 — Category (always visible) */}
          <div className="ios-form-pill">
            <label className="ios-form-row">
              <span className="ios-form-label">Category *</span>
              <select
                className="ios-form-input"
                value={draft.categoryId}
                onChange={(e) => update('categoryId', e.target.value)}
              >
                <option value="">Select</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
          </div>

          {/* Pill 3 — Essential (always visible in quick) */}
          <div className="ios-form-pill">
            <label className="ios-form-row">
              <span className="ios-form-label">Essential</span>
              <input
                type="checkbox"
                className="ios-switch"
                checked={draft.essential}
                onChange={(e) => update('essential', e.target.checked)}
              />
            </label>
          </div>

          {/* Full Details only fields */}
          {mode === 'full' && (
            <>
              {/* Pill 4 — Condition / Quantity */}
              <div className="ios-form-pill">
                <label className="ios-form-row">
                  <span className="ios-form-label">Condition</span>
                  <select
                    className="ios-form-input"
                    value={draft.condition}
                    onChange={(e) => update('condition', e.target.value as Condition)}
                  >
                    <option value="new">New</option>
                    <option value="good">Good</option>
                    <option value="worn">Worn</option>
                  </select>
                </label>
                <div className="ios-pill-divider" />
                <div className="ios-form-row">
                  <span className="ios-form-label">Quantity</span>
                  <input
                    type="number"
                    className="ios-form-input"
                    min={1}
                    value={draft.quantity}
                    onChange={(e) => update('quantity', Number(e.target.value || 1))}
                    {...kbHandlers}
                  />
                </div>
              </div>

              {/* Pill 5 — Value */}
              <div className="ios-form-pill">
                <input
                  type="number"
                  className="ios-pill-input"
                  placeholder="Purchase Price"
                  value={draft.purchasePrice}
                  onChange={(e) => update('purchasePrice', e.target.value)}
                  {...kbHandlers}
                />
                <div className="ios-pill-divider" />
                <input
                  type="number"
                  className="ios-pill-input"
                  placeholder="Current Value"
                  value={draft.currentValue}
                  onChange={(e) => update('currentValue', e.target.value)}
                  {...kbHandlers}
                />
                <div className="ios-pill-divider" />
                <div className="ios-form-row">
                  <span className="ios-form-label">Purchase Date</span>
                  <input
                    type="date"
                    className="ios-form-input"
                    value={draft.purchaseDate}
                    onChange={(e) => update('purchaseDate', e.target.value)}
                    {...kbHandlers}
                  />
                </div>
              </div>

              {/* Pill 6 — Serial Number */}
              <div className="ios-form-pill">
                <input
                  className="ios-pill-input"
                  placeholder="Serial Number"
                  value={draft.serialNumber}
                  onChange={(e) => update('serialNumber', e.target.value)}
                  {...kbHandlers}
                />
              </div>

              {/* Pill 7 — Tags */}
              <div className="ios-form-pill">
                <input
                  className="ios-pill-input"
                  placeholder="Tags (comma-separated)"
                  value={draft.tagsText}
                  onChange={(e) => update('tagsText', e.target.value)}
                  {...kbHandlers}
                />
              </div>
            </>
          )}

          {/* Pill — Notes (always visible) */}
          <div className="ios-form-pill ios-form-pill--notes">
            <textarea
              className="ios-pill-textarea"
              rows={4}
              placeholder="Notes"
              value={draft.notes}
              onChange={(e) => update('notes', e.target.value)}
              {...kbHandlers}
            />
            {mode === 'full' && (
              <>
                <div className="ios-pill-divider" />
                <textarea
                  className="ios-pill-textarea"
                  rows={2}
                  placeholder="Custom Fields (key:value, e.g. Insurance: Covered)"
                  value={draft.customFieldsText}
                  onChange={(e) => update('customFieldsText', e.target.value)}
                  {...kbHandlers}
                />
              </>
            )}
          </div>

          {error && <p className="ios-sheet-error">{error}</p>}
        </div>
      </div>
    </>
  );
}
