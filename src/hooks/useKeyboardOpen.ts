import { useEffect, useState } from 'react';

/**
 * Returns true when the virtual keyboard is open (i.e. when the `keyboard-open`
 * class is present on <html>).  Uses a MutationObserver so it stays in sync
 * without polling.
 */
export function useKeyboardOpen(): boolean {
  const [isOpen, setIsOpen] = useState(
    () => document.documentElement.classList.contains('keyboard-open'),
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsOpen(document.documentElement.classList.contains('keyboard-open'));
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  return isOpen;
}
