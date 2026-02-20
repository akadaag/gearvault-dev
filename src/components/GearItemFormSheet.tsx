import { useEffect, useRef, useState } from 'react';
import type { Category, Condition } from '../types/models';
import { lockSheetScroll, unlockSheetScroll } from '../lib/sheetLock';
import { useSheetDismiss } from '../hooks/useSheetDismiss';
import { compressImageForAI, compressImageUrlForAI } from '../lib/gearPhotos';
import { recognizeGearFromPhotos } from '../services/ai';
import { AuthExpiredError } from '../lib/edgeFunctionClient';

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
  isAuthenticated?: boolean;
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
  isAuthenticated,
  onDraftChange,
  onErrorChange,
  onClose,
  onSubmit,
}: GearItemFormSheetProps) {
  const [mode, setMode] = useState<FormMode>('quick');
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState('');
  const [extraPhotos, setExtraPhotos] = useState<string[]>([]); // extra angle data URLs for AI only
  const scanFileRef = useRef<HTMLInputElement>(null);
  const extraFileRef = useRef<HTMLInputElement>(null);
  const canSubmit = draft.name.trim().length > 0 && Boolean(draft.categoryId) && !scanning;

  useEffect(() => {
    if (!open) return;
    lockSheetScroll();
    return () => unlockSheetScroll();
  }, [open]);

  // Reset scan state when sheet closes
  useEffect(() => {
    if (!open) {
      setScanning(false);
      setScanMessage('');
      setExtraPhotos([]);
    }
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
    setExtraPhotos([]);
    onErrorChange('');
  }

  // ---------------------------------------------------------------------------
  // Scan with AI
  // ---------------------------------------------------------------------------

  function handleScanClick() {
    // If there's already a photo, scan that one directly
    if (draft.photoPreview || draft.photo) {
      void scanExistingPhoto();
    } else {
      // No photo yet — open file picker, then scan
      scanFileRef.current?.click();
    }
  }

  async function handleScanFileSelected(file: File | undefined) {
    if (!file) return;
    if (file.size > 15_000_000) {
      onErrorChange('Photo too large. Keep under 15MB.');
      return;
    }

    // Set as item photo first (same behavior as Add Photo)
    const reader = new FileReader();
    reader.onload = async () => {
      const preview = String(reader.result ?? '');
      onDraftChange({
        ...draft,
        photoFile: file,
        photoPreview: preview,
        removePhoto: false,
      });
      onErrorChange('');

      // Now compress for AI and run recognition
      await runRecognition(file);
    };
    reader.readAsDataURL(file);
  }

  async function scanExistingPhoto() {
    setScanning(true);
    setScanMessage('Identifying gear...');
    onErrorChange('');

    try {
      const photoDataUrls: string[] = [];

      // Compress existing photo for AI
      if (draft.photoFile) {
        photoDataUrls.push(await compressImageForAI(draft.photoFile));
      } else if (draft.photoPreview || draft.photo) {
        photoDataUrls.push(await compressImageUrlForAI(draft.photoPreview || draft.photo));
      }

      // Add any extra angle photos
      photoDataUrls.push(...extraPhotos);

      if (photoDataUrls.length === 0) {
        onErrorChange('No photo available to scan.');
        return;
      }

      const result = await recognizeGearFromPhotos(photoDataUrls, categories);
      applyRecognitionResult(result);
    } catch (e) {
      handleScanError(e);
    } finally {
      setScanning(false);
      setScanMessage('');
    }
  }

  async function runRecognition(file: File) {
    setScanning(true);
    setScanMessage('Identifying gear...');
    onErrorChange('');

    try {
      const photoDataUrls: string[] = [];
      photoDataUrls.push(await compressImageForAI(file));

      // Include extra angle photos if any
      photoDataUrls.push(...extraPhotos);

      const result = await recognizeGearFromPhotos(photoDataUrls, categories);
      applyRecognitionResult(result);
    } catch (e) {
      handleScanError(e);
    } finally {
      setScanning(false);
      setScanMessage('');
    }
  }

  function applyRecognitionResult(result: Awaited<ReturnType<typeof recognizeGearFromPhotos>>) {
    if (result.confidence === 'none') {
      onErrorChange("This doesn't look like photo/video gear. Try a different photo.");
      return;
    }

    // Fill only empty fields — don't overwrite what the user already typed
    const updates: Partial<GearFormDraft> = {};

    if (!draft.name.trim() && result.item_name) {
      updates.name = result.item_name;
    }
    if (!draft.brand.trim() && result.brand) {
      updates.brand = result.brand;
    }
    if (!draft.model.trim() && result.model) {
      updates.model = result.model;
    }
    if (!draft.categoryId && result.categoryId) {
      updates.categoryId = result.categoryId;
    }
    if (!draft.tagsText.trim() && result.tags && result.tags.length > 0) {
      updates.tagsText = result.tags.join(', ');
    }
    if (!draft.notes.trim() && result.notes) {
      updates.notes = result.notes;
    }

    onDraftChange({ ...draft, ...updates });

    // Show confidence feedback
    if (result.confidence === 'low') {
      setScanMessage('AI wasn\'t very confident — please verify the fields.');
      setTimeout(() => setScanMessage(''), 4000);
    } else {
      setScanMessage('');
    }

    // Clear extra photos after successful scan
    setExtraPhotos([]);
    onErrorChange('');
  }

  function handleScanError(e: unknown) {
    if (e instanceof AuthExpiredError) {
      onErrorChange('Please sign in to use AI scan.');
    } else if (e instanceof Error) {
      onErrorChange(e.message);
    } else {
      onErrorChange('Could not identify this item. Please try again.');
    }
  }

  // ---------------------------------------------------------------------------
  // Extra angle photos (for better recognition)
  // ---------------------------------------------------------------------------

  function handleExtraPhotoSelected(file: File | undefined) {
    if (!file || extraPhotos.length >= 2) return; // max 2 extra (3 total)
    if (file.size > 15_000_000) {
      onErrorChange('Photo too large. Keep under 15MB.');
      return;
    }

    void (async () => {
      try {
        const dataUrl = await compressImageForAI(file);
        setExtraPhotos((prev) => [...prev, dataUrl]);
      } catch {
        onErrorChange('Could not process additional photo.');
      }
    })();
  }

  function removeExtraPhoto(index: number) {
    setExtraPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  const kbHandlers = {
    onFocus: () => document.documentElement.classList.add('keyboard-open'),
    onBlur: () => document.documentElement.classList.remove('keyboard-open'),
  };

  const hasPhoto = Boolean(draft.photoPreview || draft.photo);

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
          <button className="ios-sheet-icon-btn ios-sheet-icon-btn--save" onClick={onSubmit} aria-label={submitLabel} disabled={!canSubmit}>
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
          <label className="ios-photo-upload-area ios-photo-upload-area--form">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handlePhotoUpload(e.target.files?.[0])}
            />
            {hasPhoto ? (
              <div className="ios-detail-hero-photo-wrap">
                <img
                  src={draft.photoPreview || draft.photo}
                  alt="Selected"
                  className="ios-detail-img"
                />
                {scanning && (
                  <div className="ios-scan-overlay">
                    <div className="ai-spinner">&#10022;</div>
                  </div>
                )}
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
                  &#10005;
                </button>
              </div>
            ) : (
              <div className="ios-detail-placeholder">
                <span aria-hidden="true">&#128247;</span>
              </div>
            )}
          </label>

          {/* Photo Action Buttons — side by side, same pill style */}
          <div className="ios-photo-actions">
            <label className="ios-form-pill ios-form-pill--photo-btn">
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  handlePhotoUpload(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              {hasPhoto ? 'Edit Photo' : 'Add Photo'}
            </label>

            <button
              type="button"
              className="ios-form-pill ios-form-pill--photo-btn ios-form-pill--scan-btn"
              onClick={(e) => {
                e.preventDefault();
                handleScanClick();
              }}
              disabled={scanning || isAuthenticated === false}
              title={isAuthenticated === false ? 'Sign in to use AI scan' : undefined}
            >
              {scanning ? (
                <span className="ai-spinner-small">&#10022;</span>
              ) : (
                <svg className="ios-scan-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3L14.5 8.5L12 14M4 3L1.5 8.5L4 14"/>
                  <circle cx="8" cy="8.5" r="2.5"/>
                </svg>
              )}
              {' '}Scan with AI
            </button>
            {/* Hidden file input for scan (when no photo exists) */}
            <input
              ref={scanFileRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                void handleScanFileSelected(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>

          {/* Scan feedback message */}
          {scanMessage && !error && (
            <p className="ios-scan-message">{scanMessage}</p>
          )}

          {/* Extra angle photos for better recognition */}
          {hasPhoto && !scanning && (
            <div className="ios-extra-photos">
              {extraPhotos.length < 2 && (
                <>
                  <button
                    type="button"
                    className="ios-extra-photo-add"
                    onClick={(e) => {
                      e.preventDefault();
                      extraFileRef.current?.click();
                    }}
                  >
                    + Add angle for better scan
                  </button>
                  <input
                    ref={extraFileRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      handleExtraPhotoSelected(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </>
              )}
              {extraPhotos.length > 0 && (
                <div className="ios-extra-photo-thumbs">
                  {extraPhotos.map((url, i) => (
                    <div key={i} className="ios-extra-photo-thumb">
                      <img src={url} alt={`Angle ${i + 2}`} />
                      <button
                        type="button"
                        className="ios-photo-remove-btn ios-photo-remove-btn--small"
                        aria-label="Remove extra photo"
                        onClick={() => removeExtraPhoto(i)}
                      >
                        &#10005;
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Group 1 — Name / Brand / Model */}
          <div className="ios-pill-group">
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
          </div>

          {/* Group 2 — Category + Essential */}
          <div className="ios-pill-group">
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

            <div className="ios-form-pill ios-form-pill--toggle">
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
          </div>

          {/* Full Details only fields */}
          {mode === 'full' && (
            <>
              {/* Group 3 — Condition / Quantity */}
              <div className="ios-pill-group">
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
              </div>

              {/* Group 4 — Value */}
              <div className="ios-pill-group">
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
              </div>

              {/* Group 5 — Serial + Tags */}
              <div className="ios-pill-group">
                <div className="ios-form-pill">
                  <input
                    className="ios-pill-input"
                    placeholder="Serial Number"
                    value={draft.serialNumber}
                    onChange={(e) => update('serialNumber', e.target.value)}
                    {...kbHandlers}
                  />
                </div>

                <div className="ios-form-pill">
                  <input
                    className="ios-pill-input"
                    placeholder="Tags (comma-separated)"
                    value={draft.tagsText}
                    onChange={(e) => update('tagsText', e.target.value)}
                    {...kbHandlers}
                  />
                </div>
              </div>
            </>
          )}

          {/* Group 6 — Notes (always visible) */}
          <div className="ios-pill-group">
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
          </div>{/* end ios-pill-group notes */}

          {error && <p className="ios-sheet-error">{error}</p>}
        </div>
      </div>
    </>
  );
}
