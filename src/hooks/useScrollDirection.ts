import { useEffect, useRef, useState } from 'react';

/**
 * Detects scroll direction on the window (or a provided element).
 * Returns `hidden` when the user scrolls down past the threshold,
 * and resets when scrolling up.
 *
 * Respects the `keyboard-open` class on <html> to avoid hiding
 * elements when the virtual keyboard is visible.
 */
export function useScrollDirection(threshold = 10) {
  const [hidden, setHidden] = useState(false);
  const lastScrollTop = useRef(0);

  useEffect(() => {
    function handleScroll() {
      if (document.documentElement.classList.contains('keyboard-open')) return;

      const currentScrollTop = window.scrollY;
      const delta = currentScrollTop - lastScrollTop.current;

      if (delta > threshold && !hidden) {
        setHidden(true);
      } else if (delta < -threshold && hidden) {
        setHidden(false);
      }

      lastScrollTop.current = currentScrollTop;
    }

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [hidden, threshold]);

  return hidden;
}
