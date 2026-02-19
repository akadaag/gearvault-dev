import { useEffect, useRef, useState } from 'react';

/**
 * Detects scroll direction on a CSS-selector-matched element (default: '.content').
 * Returns `hidden` when the user scrolls down past the threshold,
 * and resets when scrolling up.
 *
 * Uses the inner scroll container rather than window.scrollY because
 * html/body/app-shell all have overflow:hidden — window.scrollY is always 0.
 *
 * Respects the `keyboard-open` class on <html> to avoid hiding
 * elements when the virtual keyboard is visible.
 */
export function useScrollDirection(threshold = 10, selector = '.content') {
  const [hidden, setHidden] = useState(false);
  const lastScrollTop = useRef(0);

  useEffect(() => {
    const el = document.querySelector(selector);
    if (!el) return;

    function handleScroll() {
      if (document.documentElement.classList.contains('keyboard-open')) return;

      const currentScrollTop = (el as Element).scrollTop;
      const delta = currentScrollTop - lastScrollTop.current;

      if (delta > threshold && !hidden) {
        setHidden(true);
      } else if (delta < -threshold && hidden) {
        setHidden(false);
      }

      lastScrollTop.current = currentScrollTop;
    }

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [hidden, threshold, selector]);

  return hidden;
}
