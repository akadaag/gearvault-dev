import { useEffect } from 'react';
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

  return (
    <>
      <div className={`ios-sheet-backdrop${closing ? ' closing' : ''}`} onClick={dismiss} />
      <div className={`ios-sheet-modal${closing ? ' closing' : ''}`} aria-label={title} onAnimationEnd={onAnimationEnd}>
        <div className="ios-sheet-handle" />
        <div className="ios-sheet-header">
          <button className="ios-sheet-btn secondary" onClick={dismiss}>Cancel</button>
          <h3 className="ios-sheet-title">{title}</h3>
          <button className="ios-sheet-btn primary" onClick={onSubmit}>{submitLabel}</button>
        </div>

        <div className="ios-sheet-content">
          {/* Photo Section */}
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

          {/* Details Group */}
          <div className="ios-form-group-title">Details</div>
          <div className="ios-form-group">
            <div className="ios-form-row">
              <span className="ios-form-label">Name *</span>
              <input
                className="ios-form-input"
                placeholder="Item name"
                value={draft.name}
                onChange={(e) => update('name', e.target.value)}
              />
            </div>
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
            <div className="ios-form-row">
              <span className="ios-form-label">Brand</span>
              <input
                className="ios-form-input"
                placeholder="Brand"
                value={draft.brand}
                onChange={(e) => update('brand', e.target.value)}
              />
            </div>
            <div className="ios-form-row">
              <span className="ios-form-label">Model</span>
              <input
                className="ios-form-input"
                placeholder="Model"
                value={draft.model}
                onChange={(e) => update('model', e.target.value)}
              />
            </div>
            <div className="ios-form-row">
              <span className="ios-form-label">Serial</span>
              <input
                className="ios-form-input"
                placeholder="Optional"
                value={draft.serialNumber}
                onChange={(e) => update('serialNumber', e.target.value)}
              />
            </div>
          </div>

          {/* Status Group */}
          <div className="ios-form-group-title">Status</div>
          <div className="ios-form-group">
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
            <div className="ios-form-row">
              <span className="ios-form-label">Quantity</span>
              <input
                type="number"
                className="ios-form-input"
                min={1}
                value={draft.quantity}
                onChange={(e) => update('quantity', Number(e.target.value || 1))}
              />
            </div>
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

          {/* Value Group */}
          <div className="ios-form-group-title">Value</div>
          <div className="ios-form-group">
            <div className="ios-form-row">
              <span className="ios-form-label">Purchase Price</span>
              <input
                type="number"
                className="ios-form-input"
                placeholder="0.00"
                value={draft.purchasePrice}
                onChange={(e) => update('purchasePrice', e.target.value)}
              />
            </div>
            <div className="ios-form-row">
              <span className="ios-form-label">Current Value</span>
              <input
                type="number"
                className="ios-form-input"
                placeholder="0.00"
                value={draft.currentValue}
                onChange={(e) => update('currentValue', e.target.value)}
              />
            </div>
            <div className="ios-form-row">
              <span className="ios-form-label">Purchase Date</span>
              <input
                type="date"
                className="ios-form-input"
                value={draft.purchaseDate}
                onChange={(e) => update('purchaseDate', e.target.value)}
              />
            </div>
          </div>

          {/* Additional Group */}
          <div className="ios-form-group-title">Additional</div>
          <div className="ios-form-group">
            <div className="ios-form-row">
              <span className="ios-form-label">Tags</span>
              <input
                className="ios-form-input"
                placeholder="camera, main"
                value={draft.tagsText}
                onChange={(e) => update('tagsText', e.target.value)}
              />
            </div>
            <div className="ios-form-row textarea-row">
              <span className="ios-form-label">Notes</span>
              <textarea
                className="ios-form-textarea"
                rows={3}
                placeholder="Add notes..."
                value={draft.notes}
                onChange={(e) => update('notes', e.target.value)}
              />
            </div>
            <div className="ios-form-row textarea-row">
              <span className="ios-form-label">Custom Fields (key:value)</span>
              <textarea
                className="ios-form-textarea"
                rows={2}
                placeholder="Insurance: Covered"
                value={draft.customFieldsText}
                onChange={(e) => update('customFieldsText', e.target.value)}
              />
            </div>
          </div>

          {error && <p className="ios-sheet-error">{error}</p>}
        </div>
      </div>
    </>
  );
}
