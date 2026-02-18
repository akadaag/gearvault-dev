import { useEffect } from 'react';
import { lockSheetScroll, unlockSheetScroll } from '../lib/sheetLock';
import { useSheetDismiss } from '../hooks/useSheetDismiss';
import type { GearItem } from '../types/models';

export interface ReviewItem {
  /** Unique key for this review item (use the AI-suggested name) */
  key: string;
  /** Name as the AI described it */
  aiName: string;
  /** Up to 3 candidate catalog items to choose from */
  candidates: GearItem[];
  /** Original checklist fields — carried through after review */
  quantity: number;
  notes?: string;
  priority: 'must-have' | 'nice-to-have' | 'optional';
  section?: string;
}

interface Props {
  items: ReviewItem[];
  /** Map of key → chosen catalogItemId or '__MISSING__' */
  selections: Map<string, string>;
  onSelect: (key: string, catalogItemId: string | '__MISSING__') => void;
  onConfirm: () => void;
  onCancel: () => void;
  open: boolean;
}

export function CatalogMatchReviewSheet({
  items,
  selections,
  onSelect,
  onConfirm,
  onCancel,
  open,
}: Props) {
  // Sheet scroll lock
  useEffect(() => {
    if (!open) return;
    lockSheetScroll();
    return () => unlockSheetScroll();
  }, [open]);

  const { closing, dismiss, onAnimationEnd } = useSheetDismiss(onCancel);

  if (!open) return null;

  const allResolved = items.every((item) => selections.has(item.key));

  return (
    <>
      {/* Backdrop */}
      <div className={`ios-sheet-backdrop${closing ? ' closing' : ''}`} onClick={dismiss} />

      {/* Slide-down-from-top sheet */}
      <div className={`ios-sheet-modal ios-sheet-modal--top${closing ? ' closing' : ''}`} aria-label="Quick confirmation review" onAnimationEnd={onAnimationEnd}>
        <div className="ios-sheet-handle" />
        <div className="ios-sheet-header">
          <button className="ios-sheet-btn secondary" onClick={dismiss}>Cancel</button>
          <h3 className="ios-sheet-title">Quick Confirmation</h3>
          <button className="ios-sheet-btn primary" onClick={onConfirm} disabled={!allResolved}>
            Confirm
          </button>
        </div>

        <div className="ios-sheet-content">
          <p style={{ fontSize: '15px', color: 'var(--ios-text-secondary)', marginBottom: '16px', textAlign: 'center' }}>
            {items.length === 1
              ? '1 item needs your input — the AI wasn\'t 100% sure about the match.'
              : `${items.length} items need your input — the AI wasn't 100% sure about the matches.`}
          </p>

          {/* Review cards */}
          <div className="stack-md">
            {items.map((item) => (
              <div key={item.key} className="review-card stack-sm">
                {/* AI suggestion header */}
                <div className="row between wrap">
                  <div>
                    <span className="review-ai-label">AI suggested</span>
                    <strong className="review-item-name">{item.aiName}</strong>
                  </div>
                  <span className={`pill priority-${item.priority}`}>
                    {item.priority}
                  </span>
                </div>

                {/* Candidates */}
                <p style={{ fontSize: '13px', color: 'var(--ios-text-secondary)' }}>
                  Pick the closest match from your catalog:
                </p>

                <div className="stack-sm">
                  {item.candidates.map((candidate) => {
                    const isSelected = selections.get(item.key) === candidate.id;
                    return (
                      <label
                        key={candidate.id}
                        className={`radio-option${isSelected ? ' radio-option--selected' : ''}`}
                      >
                        <input
                          type="radio"
                          name={`match-${item.key}`}
                          value={candidate.id}
                          checked={isSelected}
                          onChange={() => onSelect(item.key, candidate.id)}
                        />
                        <div className="radio-option-body">
                          <span className="radio-option-name">{candidate.name}</span>
                          {(candidate.brand || candidate.model) && (
                            <span className="radio-option-meta" style={{ fontSize: '13px', color: 'var(--ios-text-secondary)' }}>
                              {[candidate.brand, candidate.model].filter(Boolean).join(' · ')}
                            </span>
                          )}
                        </div>
                      </label>
                    );
                  })}

                  {/* Not in catalog option */}
                  <label
                    className={`radio-option radio-option--missing${
                      selections.get(item.key) === '__MISSING__' ? ' radio-option--selected' : ''
                    }`}
                  >
                    <input
                      type="radio"
                      name={`match-${item.key}`}
                      value="__MISSING__"
                      checked={selections.get(item.key) === '__MISSING__'}
                      onChange={() => onSelect(item.key, '__MISSING__')}
                    />
                    <div className="radio-option-body">
                      <span className="radio-option-name">Not in my catalog</span>
                      <span className="radio-option-meta" style={{ fontSize: '13px', color: 'var(--ios-text-secondary)' }}>
                        Will be added to missing items
                      </span>
                    </div>
                  </label>
                </div>
              </div>
            ))}
          </div>

          {/* Batch quick-actions */}
          <div className="row wrap" style={{ gap: '0.5rem', marginTop: '16px' }}>
            <button
              className="ghost"
              onClick={() => {
                items.forEach((item) => {
                  if (!selections.has(item.key) && item.candidates[0]) {
                    onSelect(item.key, item.candidates[0].id);
                  }
                });
              }}
            >
              Accept all top suggestions
            </button>
            <button
              className="ghost"
              onClick={() => {
                items.forEach((item) => onSelect(item.key, '__MISSING__'));
              }}
            >
              Mark all as missing
            </button>
          </div>

          {/* Remaining count */}
          {!allResolved && (
            <p style={{ fontSize: '13px', color: 'var(--ios-text-secondary)', textAlign: 'center', marginTop: '12px' }}>
              {items.length - selections.size} remaining
            </p>
          )}
        </div>
      </div>
    </>
  );
}
