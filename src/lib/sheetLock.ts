let lockCount = 0;

export function lockSheetScroll() {
  if (typeof document === 'undefined') return;
  lockCount += 1;
  document.body.classList.add('sheet-open');
}

export function unlockSheetScroll() {
  if (typeof document === 'undefined') return;
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.body.classList.remove('sheet-open');
  }
}

export function resetSheetScrollLock() {
  if (typeof document === 'undefined') return;
  lockCount = 0;
  document.body.classList.remove('sheet-open');
}
