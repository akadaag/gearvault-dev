import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { useScrollDirection } from '../hooks/useScrollDirection';
import { ContentEditableInput, type ContentEditableInputHandle } from '../components/ContentEditableInput';
import { useAIAssistant } from '../contexts/AIAssistantContext';

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

/** Sparkle icon for AI circle & decorative pill element */
const sparkleSvg = (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M12 4l1.8 4.2L18 10l-4.2 1.8L12 16l-1.8-4.2L6 10l4.2-1.8L12 4z" />
    <path d="M6.5 4.8l0.8 1.8 1.8 0.8-1.8 0.8-0.8 1.8-0.8-1.8-1.8-0.8 1.8-0.8 0.8-1.8z" />
    <path d="M18 14.5l0.7 1.5 1.5 0.7-1.5 0.7-0.7 1.5-0.7-1.5-1.5-0.7 1.5-0.7 0.7-1.5z" />
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

const aiMorphTransition = {
  layout: morphSpring,
  opacity: { duration: 0.2 },
};

// ── Component ────────────────────────────────────────────────────────────────

export function FloatingNavBar({ items }: FloatingNavBarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const scrollHidden = useScrollDirection(10, '.page-scroll-area', location.pathname);

  const {
    input,
    setInput,
    loading,
    error,
    setError,
    pendingPhotoPreview,
    pendingPhotoDataUrl,
    handlePhotoSelected,
    clearPhoto,
    photoInputRef,
    submit,
  } = useAIAssistant();

  const [inputFocused, setInputFocused] = useState(false);
  const inputRef = useRef<ContentEditableInputHandle>(null);

  // ── Previous route tracking ────────────────────────────────────────────────
  // Remember which page the user was on before navigating to /assistant
  const previousRouteRef = useRef(
    location.pathname === '/assistant' ? '/home' : location.pathname,
  );

  useEffect(() => {
    if (location.pathname !== '/assistant') {
      previousRouteRef.current = location.pathname;
    }
  }, [location.pathname]);

  // Resolve the tab item that corresponds to the previous route
  const previousItem = items.find((item) =>
    item.match ? item.match(previousRouteRef.current) : isPathActive(previousRouteRef.current, item.to),
  );

  // ── AI expanded state ──────────────────────────────────────────────────────
  // Driven by internal toggle, synced with route
  const [aiExpanded, setAiExpanded] = useState(location.pathname === '/assistant');

  const isAssistantRoute = location.pathname === '/assistant';

  // Sync: navigating TO /assistant auto-expands
  useEffect(() => {
    if (isAssistantRoute) {
      setAiExpanded(true);
    }
  }, [isAssistantRoute]);

  // Sync: navigating AWAY from /assistant auto-collapses
  useEffect(() => {
    if (!isAssistantRoute) {
      setAiExpanded(false);
    }
  }, [isAssistantRoute]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  function openAI() {
    navigate('/assistant');
    // Route change will trigger setAiExpanded(true) via useEffect
  }

  function collapseAI() {
    setAiExpanded(false);
    setInputFocused(false);
    inputRef.current?.blur();
    // Clear error when collapsing
    setError('');
    // Navigate back to the page the user came from
    if (isAssistantRoute) {
      navigate(previousRouteRef.current);
    }
  }

  // ── Derived state ──────────────────────────────────────────────────────────
  // Disable scroll-hide when on assistant route
  const shouldHideOnScroll = scrollHidden && !isAssistantRoute;

  // Left side visibility
  const showNavPill = !aiExpanded;
  const showNavCircle = aiExpanded && !inputFocused;
  // Nav circle should hide on scroll (only when AI expanded but not typing)
  const navCircleHidden = showNavCircle && scrollHidden && !isAssistantRoute;

  // CSS class for keyboard handling
  const aiActiveClass = isAssistantRoute && aiExpanded ? ' floating-nav--ai-active' : '';

  // No tab highlighted when on /assistant with AI collapsed
  const suppressActiveTab = isAssistantRoute && !aiExpanded;

  return (
    <>
      <AnimatePresence>
        <motion.div
          className={`floating-nav${shouldHideOnScroll && !inputFocused ? ' floating-nav--hidden' : ''}${aiActiveClass}`}
          initial={false}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <LayoutGroup>
            {/* Photo preview — floats above the nav bar when AI expanded */}
            <AnimatePresence>
              {aiExpanded && pendingPhotoPreview && (
                <motion.div
                  className="floating-nav__photo-preview"
                  initial={{ opacity: 0, y: 10, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.9 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                >
                  <img src={pendingPhotoPreview} alt="Attached" />
                  <button
                    type="button"
                    className="floating-nav__photo-remove"
                    onClick={clearPhoto}
                    aria-label="Remove photo"
                  >
                    &#10005;
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Error display — floats above nav bar */}
            <AnimatePresence>
              {aiExpanded && error && (
                <motion.p
                  className="floating-nav__error"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  transition={{ duration: 0.2 }}
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            <div className="floating-nav__row">
              {/* ── Left: Nav Pill ↔ Nav Circle ↔ Placeholder ──────── */}
              {showNavPill ? (
                <motion.div
                  className="floating-nav__pill"
                  layoutId="nav-morph"
                  transition={navMorphTransition}
                  style={{ overflow: 'hidden' }}
                >
                  {items.map((item) => {
                    const active = !suppressActiveTab && (
                      item.match
                        ? item.match(location.pathname)
                        : isPathActive(location.pathname, item.to)
                    );
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
                  aria-label={previousItem?.label ?? 'Navigation'}
                  onClick={collapseAI}
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
                    {previousItem?.icon ?? items[0]?.icon}
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

              {/* ── Right: AI Circle ↔ AI Input Pill ───────────────── */}
              {!aiExpanded ? (
                <motion.button
                  className="floating-nav__ai-circle"
                  layoutId="ai-morph"
                  type="button"
                  aria-label="AI Assistant"
                  onClick={openAI}
                  onPointerUp={(e) => e.currentTarget.blur()}
                  transition={aiMorphTransition}
                >
                  <span className="floating-nav__ai-icon">{sparkleSvg}</span>
                </motion.button>
              ) : (
                <motion.div
                  className="floating-nav__ai-pill"
                  layoutId="ai-morph"
                  transition={aiMorphTransition}
                >
                  {/* Photo attachment button (+ icon) */}
                  <button
                    type="button"
                    className="floating-nav__ai-photo-btn"
                    onClick={() => photoInputRef.current?.click()}
                    disabled={loading}
                    aria-label="Attach photo"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </button>

                  {/* Text input */}
                  <ContentEditableInput
                    ref={inputRef}
                    className="floating-nav__ai-input"
                    placeholder={pendingPhotoDataUrl ? 'Ask about this photo...' : 'Describe your shoot or ask...'}
                    value={input}
                    onChange={setInput}
                    multiline
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void submit();
                      }
                    }}
                    onFocus={() => {
                      setInputFocused(true);
                      document.documentElement.classList.add('keyboard-open');
                    }}
                    onBlur={() => {
                      setInputFocused(false);
                      document.documentElement.classList.remove('keyboard-open');
                    }}
                    disabled={loading}
                    aria-label="AI assistant input"
                  />

                  {/* Send button */}
                  <button
                    className="floating-nav__ai-send-btn"
                    type="button"
                    onClick={() => void submit()}
                    disabled={loading || (!input.trim() && !pendingPhotoDataUrl)}
                    aria-label="Send message"
                  >
                    {loading ? (
                      <span className="ai-spinner-small">&#10022;</span>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 19V5M5 12l7-7 7 7" />
                      </svg>
                    )}
                  </button>

                  {/* Hidden file input */}
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      void handlePhotoSelected(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </motion.div>
              )}

              {/* ── X Close Circle (only when input focused / keyboard open) ── */}
              <AnimatePresence>
                {aiExpanded && inputFocused && (
                  <motion.button
                    className="floating-nav__close-circle"
                    type="button"
                    aria-label="Close AI input"
                    onClick={collapseAI}
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
