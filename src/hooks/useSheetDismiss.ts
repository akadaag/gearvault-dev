import { useCallback, useRef, useState } from 'react';

/**
 * Hook that manages the "closing" animation state for iOS bottom sheets.
 *
 * Usage:
 *   const { closing, dismiss, onAnimationEnd } = useSheetDismiss(onClose);
 *
 *   <div className={`ios-sheet-backdrop${closing ? ' closing' : ''}`} onClick={dismiss} />
 *   <div
 *     className={`ios-sheet-modal${closing ? ' closing' : ''}`}
 *     onAnimationEnd={onAnimationEnd}
 *   >
 *
 * @param onClose  The real close callback (unmount / set state false / remove URL param)
 * @param duration Safety-timeout in ms (default 300). If onAnimationEnd never fires
 *                 (e.g. element detached), the sheet still closes after this delay.
 */
export function useSheetDismiss(onClose: () => void, duration = 300) {
  const [closing, setClosing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (closing) return; // already dismissing
    setClosing(true);
    // Safety fallback: if animationend doesn't fire, force close
    timerRef.current = setTimeout(() => {
      setClosing(false);
      onClose();
    }, duration);
  }, [closing, onClose, duration]);

  const onAnimationEnd = useCallback(() => {
    if (!closing) return;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setClosing(false);
    onClose();
  }, [closing, onClose]);

  return { closing, dismiss, onAnimationEnd } as const;
}
