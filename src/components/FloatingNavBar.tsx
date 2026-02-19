import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { useScrollDirection } from '../hooks/useScrollDirection';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';

// ── Types ────────────────────────────────────────────────────────────────────

export type FloatingNavItem = {
  to: string;
  label: string;
  icon: ReactNode;
  match?: (pathname: string) => boolean;
};

type FloatingNavBarProps = {
  items: FloatingNavItem[];
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function isPathActive(pathname: string, to: string) {
  return pathname === to || pathname.startsWith(`${to}/`);
}

// ── Icons ────────────────────────────────────────────────────────────────────

const searchSvg = (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-4-4" />
  </svg>
);

const clearSvg = (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="10" opacity="0.25" fill="currentColor" stroke="none" />
    <path d="M15 9l-6 6M9 9l6 6" />
  </svg>
);

const closeSvg = (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

// ── Layout morph transitions ─────────────────────────────────────────────────

const morphSpring = {
  type: 'spring' as const,
  stiffness: 500,
  damping: 32,
};

const navMorphTransition = {
  layout: morphSpring,
  opacity: { duration: 0.15 },
};

const searchMorphTransition = {
  layout: morphSpring,
  opacity: { duration: 0.2 },
};

// ── Component ────────────────────────────────────────────────────────────────

export function FloatingNavBar({ items }: FloatingNavBarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const scrollHidden = useScrollDirection(10, '.page-scroll-area', location.pathname);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ── Data for global search ─────────────────────────────────────────────────
  const gearItems = useLiveQuery(() => db.gearItems.toArray(), [], []);
  const events = useLiveQuery(() => db.events.toArray(), [], []);

  // ── Search results ─────────────────────────────────────────────────────────
  const q = searchQuery.trim().toLowerCase();

  const matchedGear = q
    ? gearItems
        .filter((item) => {
          const text = [item.name, item.brand, item.model].filter(Boolean).join(' ').toLowerCase();
          return text.includes(q);
        })
        .slice(0, 5)
    : [];

  const matchedEvents = q
    ? events
        .filter((e) => {
          const text = [e.title, e.type, e.location].filter(Boolean).join(' ').toLowerCase();
          return text.includes(q);
        })
        .slice(0, 5)
    : [];

  const settingsSections = [
    { label: 'Account', path: '/settings', keywords: 'account name email display profile' },
    { label: 'Categories', path: '/settings', keywords: 'categories gear type' },
    { label: 'Appearance', path: '/settings', keywords: 'appearance theme dark light mode' },
    { label: 'Data', path: '/settings', keywords: 'data export import backup' },
  ];
  const matchedSettings = q ? settingsSections.filter((s) => s.keywords.includes(q)) : [];

  const hasResults = matchedGear.length > 0 || matchedEvents.length > 0 || matchedSettings.length > 0;
  const showDropdown = searchOpen && q.length > 0;

  // ── Active tab ─────────────────────────────────────────────────────────────
  const activeItem = items.find((item) =>
    item.match ? item.match(location.pathname) : isPathActive(location.pathname, item.to),
  );

  // ── Click outside to close search ──────────────────────────────────────────
  useEffect(() => {
    if (!searchOpen) return;
    function handleOutside(e: MouseEvent | TouchEvent) {
      const target = e.target as Node;
      if (dropdownRef.current?.contains(target)) return;
      const navEl = document.querySelector('.floating-nav');
      if (navEl?.contains(target)) return;
      setSearchOpen(false);
      setSearchQuery('');
      setInputFocused(false);
    }
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [searchOpen]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  function openSearch() {
    setSearchOpen(true);
    setSearchQuery('');
    // Don't auto-focus — let the user tap the input to trigger the keyboard state
  }

  function closeSearch() {
    setSearchOpen(false);
    setSearchQuery('');
    setInputFocused(false);
    inputRef.current?.blur();
  }

  function navigateFromSearch(path: string) {
    navigate(path);
    closeSearch();
  }

  // ── Derived state ──────────────────────────────────────────────────────────
  // In search mode (not typing), the nav circle should hide on scroll
  const navCircleHidden = searchOpen && !inputFocused && scrollHidden;
  // When the input is focused (keyboard open), hide the nav circle entirely
  const showNavCircle = searchOpen && !inputFocused;
  const showCloseCircle = searchOpen && inputFocused;

  return (
    <>
      <AnimatePresence>
        <motion.div
          className={`floating-nav${scrollHidden && !inputFocused ? ' floating-nav--hidden' : ''}`}
          initial={false}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <LayoutGroup>
            <div className="floating-nav__row">
              {/* ── Left: Nav Pill ↔ Nav Circle ────────────────────── */}
              {!searchOpen ? (
                <motion.div
                  className="floating-nav__pill"
                  layoutId="nav-morph"
                  transition={navMorphTransition}
                  style={{ overflow: 'hidden' }}
                >
                  {items.map((item) => {
                    const active = item.match
                      ? item.match(location.pathname)
                      : isPathActive(location.pathname, item.to);
                    return (
                      <button
                        key={item.to}
                        type="button"
                        className={`floating-nav__tab${active ? ' is-active' : ''}`}
                        onClick={() => navigate(item.to)}
                        onPointerUp={(e) => e.currentTarget.blur()}
                        aria-label={item.label}
                        aria-current={active ? 'page' : undefined}
                      >
                        <span className="floating-nav__tab-icon" aria-hidden="true">
                          {item.icon}
                        </span>
                        <span className="floating-nav__tab-label">{item.label}</span>
                      </button>
                    );
                  })}
                </motion.div>
              ) : showNavCircle ? (
                <motion.button
                  className={`floating-nav__nav-circle${navCircleHidden ? ' is-hidden' : ''}`}
                  layoutId="nav-morph"
                  type="button"
                  aria-label={activeItem?.label ?? 'Navigation'}
                  onClick={closeSearch}
                  onPointerUp={(e) => e.currentTarget.blur()}
                  animate={{
                    opacity: navCircleHidden ? 0 : 1,
                    y: navCircleHidden ? 20 : 0,
                    scale: navCircleHidden ? 0.8 : 1,
                  }}
                  transition={{
                    layout: morphSpring,
                    opacity: { duration: 0.25, ease: [0.32, 0.72, 0, 1] },
                    y: { duration: 0.25, ease: [0.32, 0.72, 0, 1] },
                    scale: { duration: 0.25, ease: [0.32, 0.72, 0, 1] },
                  }}
                >
                  <span className="floating-nav__nav-circle-icon" aria-hidden="true">
                    {activeItem?.icon ?? items[0]?.icon}
                  </span>
                </motion.button>
              ) : (
                /* Input focused — nav circle is gone, layoutId orphaned to avoid glitch */
                <motion.div
                  layoutId="nav-morph"
                  style={{ width: 0, height: 0, overflow: 'hidden', opacity: 0, marginRight: '-10px' }}
                  transition={{ layout: morphSpring }}
                />
              )}

              {/* ── Right: Search Circle ↔ Search Pill ─────────────── */}
              {!searchOpen ? (
                <motion.button
                  className="floating-nav__search-circle"
                  layoutId="search-morph"
                  type="button"
                  aria-label="Search"
                  onClick={openSearch}
                  onPointerUp={(e) => e.currentTarget.blur()}
                  transition={searchMorphTransition}
                >
                  <span className="floating-nav__search-icon">{searchSvg}</span>
                </motion.button>
              ) : (
                <motion.div
                  className="floating-nav__search-pill"
                  layoutId="search-morph"
                  ref={dropdownRef}
                  transition={searchMorphTransition}
                >
                  <div className="floating-nav__search-input-wrap">
                    <span className="floating-nav__search-pill-icon">{searchSvg}</span>
                    <input
                      ref={inputRef}
                      className="floating-nav__search-input"
                      type="text"
                      placeholder="Search gear, events, settings..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onFocus={() => setInputFocused(true)}
                      onBlur={() => setInputFocused(false)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') closeSearch();
                      }}
                    />
                    {searchQuery && (
                      <button
                        className="floating-nav__search-clear"
                        type="button"
                        aria-label="Clear search"
                        onClick={() => setSearchQuery('')}
                      >
                        {clearSvg}
                      </button>
                    )}
                  </div>

                  {/* Search Results Dropdown */}
                  <AnimatePresence>
                    {showDropdown && (
                      <motion.div
                        className="floating-nav__search-results"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        transition={{ duration: 0.18 }}
                      >
                        {!hasResults && (
                          <div className="floating-nav__search-empty">No results found</div>
                        )}

                        {matchedGear.length > 0 && (
                          <div className="floating-nav__search-section">
                            <div className="floating-nav__search-label">Gear</div>
                            {matchedGear.map((item) => (
                              <button
                                key={item.id}
                                className="floating-nav__search-item"
                                onClick={() => navigateFromSearch(`/catalog/item/${item.id}`)}
                              >
                                <div className="floating-nav__search-item-icon gear">
                                  {item.photo ? <img src={item.photo} alt="" /> : item.name.charAt(0)}
                                </div>
                                <div className="floating-nav__search-item-text">
                                  <span className="name">{item.name}</span>
                                  <span className="sub">
                                    {item.brand} {item.model}
                                  </span>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}

                        {matchedEvents.length > 0 && (
                          <div className="floating-nav__search-section">
                            <div className="floating-nav__search-label">Events</div>
                            {matchedEvents.map((event) => (
                              <button
                                key={event.id}
                                className="floating-nav__search-item"
                                onClick={() => navigateFromSearch(`/events/${event.id}`)}
                              >
                                <div className="floating-nav__search-item-icon event">
                                  {event.title.charAt(0)}
                                </div>
                                <div className="floating-nav__search-item-text">
                                  <span className="name">{event.title}</span>
                                  <span className="sub">{event.type}</span>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}

                        {matchedSettings.length > 0 && (
                          <div className="floating-nav__search-section">
                            <div className="floating-nav__search-label">Settings</div>
                            {matchedSettings.map((section) => (
                              <button
                                key={section.label}
                                className="floating-nav__search-item"
                                onClick={() => navigateFromSearch(section.path)}
                              >
                                <div className="floating-nav__search-item-icon settings">
                                  <svg viewBox="0 0 24 24" width="18" height="18">
                                    <circle cx="12" cy="12" r="3" />
                                    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
                                  </svg>
                                </div>
                                <div className="floating-nav__search-item-text">
                                  <span className="name">{section.label}</span>
                                  <span className="sub">Settings</span>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}

              {/* ── X Close Circle (only when input focused / keyboard open) ── */}
              <AnimatePresence>
                {showCloseCircle && (
                  <motion.button
                    className="floating-nav__close-circle"
                    type="button"
                    aria-label="Close search"
                    onClick={closeSearch}
                    onPointerUp={(e) => e.currentTarget.blur()}
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.6 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  >
                    <span className="floating-nav__close-icon">{closeSvg}</span>
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </LayoutGroup>
        </motion.div>
      </AnimatePresence>
    </>
  );
}
