import { useEffect } from 'react';
import type { Category, Condition } from '../types/models';
import { lockSheetScroll, unlockSheetScroll } from '../lib/sheetLock';

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

  if (!open) return null;

  function update<K extends keyof GearFormDraft>(key: K, value: GearFormDraft[K]) {
    onDraftChange({ ...draft, [key]: value });
  }

  function handlePhotoUpload(file: File | undefined) {
    if (!file) return;
    if (file.size > 1_800_000) {
      onErrorChange('Photo too large. Keep under 1.8MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      update('photo', String(reader.result ?? ''));
    };
    reader.readAsDataURL(file);
  }

  return (
    <>
      <button className="sheet-overlay" aria-label={`Close ${title}`} onClick={onClose} />
      <aside className="filter-sheet card gear-form-sheet" aria-label={title}>
        <div className="gear-form-header">
          <h3>{title}</h3>
          <button className="sheet-close-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="gear-form-stack">
          <div className="gear-photo-upload-wrap">
            <label className="gear-photo-upload-tile">
              <input type="file" accept="image/*" onChange={(e) => handlePhotoUpload(e.target.files?.[0])} />
              {draft.photo ? (
                <img src={draft.photo} alt="Selected" className="gear-photo-preview" />
              ) : (
                <>
                  <span className="gear-photo-icon" aria-hidden="true">📷</span>
                  <span>Add Photo</span>
                </>
              )}
            </label>
          </div>

          <label className="gear-field-block">
            <span>Name *</span>
            <input placeholder="Sony FX30" value={draft.name} onChange={(e) => update('name', e.target.value)} />
          </label>

          <label className="gear-field-block">
            <span>Category *</span>
            <select value={draft.categoryId} onChange={(e) => update('categoryId', e.target.value)}>
              <option value="">Select category</option>
              {categories.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
          </label>

          <div className="gear-form-two-col">
            <label className="gear-field-block">
              <span>Brand</span>
              <input placeholder="Sony" value={draft.brand} onChange={(e) => update('brand', e.target.value)} />
            </label>
            <label className="gear-field-block">
              <span>Model</span>
              <input placeholder="FX30" value={draft.model} onChange={(e) => update('model', e.target.value)} />
            </label>
          </div>

          <label className="gear-field-block">
            <span>Serial Number</span>
            <input placeholder="Optional" value={draft.serialNumber} onChange={(e) => update('serialNumber', e.target.value)} />
          </label>

          <div className="gear-form-two-col">
            <label className="gear-field-block">
              <span>Condition</span>
              <select value={draft.condition} onChange={(e) => update('condition', e.target.value as Condition)}>
                <option value="new">New</option>
                <option value="good">Good</option>
                <option value="worn">Worn</option>
              </select>
            </label>
            <label className="gear-field-block">
              <span>Quantity</span>
              <input type="number" min={1} value={draft.quantity} onChange={(e) => update('quantity', Number(e.target.value || 1))} />
            </label>
          </div>

          <div className="gear-form-two-col">
            <label className="gear-field-block">
              <span>Purchase Price</span>
              <input type="number" placeholder="EUR" value={draft.purchasePrice} onChange={(e) => update('purchasePrice', e.target.value)} />
            </label>
            <label className="gear-field-block">
              <span>Current Value</span>
              <input type="number" placeholder="EUR" value={draft.currentValue} onChange={(e) => update('currentValue', e.target.value)} />
            </label>
          </div>

          <label className="gear-field-block">
            <span>Purchase Date</span>
            <input type="date" value={draft.purchaseDate} onChange={(e) => update('purchaseDate', e.target.value)} />
          </label>

          <label className="gear-field-block">
            <span>Tags</span>
            <input placeholder="camera, main, b-cam" value={draft.tagsText} onChange={(e) => update('tagsText', e.target.value)} />
          </label>

          <label className="gear-field-block">
            <span>Notes</span>
            <textarea rows={3} placeholder="Add notes" value={draft.notes} onChange={(e) => update('notes', e.target.value)} />
          </label>

          <label className="gear-field-block">
            <span>Custom Fields (key:value)</span>
            <textarea rows={2} placeholder="Insurance: Covered" value={draft.customFieldsText} onChange={(e) => update('customFieldsText', e.target.value)} />
          </label>

          <label className="checkbox-inline gear-checkbox-row">
            <input type="checkbox" checked={draft.essential} onChange={(e) => update('essential', e.target.checked)} />
            <span>Mark as essential</span>
          </label>

          {error && <p className="error">{error}</p>}
        </div>

        <div className="gear-form-footer">
          <button onClick={onSubmit}>{submitLabel}</button>
        </div>
      </aside>
    </>
  );
}
