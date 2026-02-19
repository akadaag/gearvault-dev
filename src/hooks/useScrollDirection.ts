import { useEffect, useRef, useState } from 'react';

/**
 * Detects scroll direction on a CSS-selector-matched element.
 * Returns `hidden` when the user scrolls down past the threshold,
 * and resets when scrolling up.
 *
 * Uses an inner scroll container (`.page-scroll-area` by default) rather
 * than window.scrollY because html/body/app-shell all have overflow:hidden —
 * window.scrollY is always 0. Each page's real scroll container carries
 * the `page-scroll-area` class.
 *
 * Pass `routeKey` (e.g. location.pathname) to force the hook to
 * re-attach when the user navigates between pages and the DOM element
 * changes.
 *
 * Respects the `keyboard-open` class on <html> to avoid hiding
 * elements when the virtual keyboard is visible.
 */
export function useScrollDirection(
  threshold = 10,
  selector = '.page-scroll-area',
  routeKey = '',
) {
  const [hidden, setHidden] = useState(false);
  const lastScrollTop = useRef(0);

  useEffect(() => {
    // Reset hidden state on route change so navbar is always visible on new page
    setHidden(false);
    lastScrollTop.current = 0;

    const el = document.querySelector(selector);
    if (!el) return;

    function handleScroll() {
      if (document.documentElement.classList.contains('keyboard-open')) return;

      const currentScrollTop = (el as Element).scrollTop;
      const delta = currentScrollTop - lastScrollTop.current;

      if (delta > threshold) {
        setHidden(true);
      } else if (delta < -threshold) {
        setHidden(false);
      }

      lastScrollTop.current = currentScrollTop;
    }

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threshold, selector, routeKey]);

  return hidden;
}
