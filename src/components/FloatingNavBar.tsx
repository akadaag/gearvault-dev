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

/** Chat bubble icon for AI circle button */
const sparkleSvg = (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
    <path d="M8 9H16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M8 12.5H13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M13.0867 21.3877L13.7321 21.7697L13.0867 21.3877ZM13.6288 20.4718L12.9833 20.0898L13.6288 20.4718ZM10.3712 20.4718L9.72579 20.8539H9.72579L10.3712 20.4718ZM10.9133 21.3877L11.5587 21.0057L10.9133 21.3877ZM1.25 10.5C1.25 10.9142 1.58579 11.25 2 11.25C2.41421 11.25 2.75 10.9142 2.75 10.5H1.25ZM7.78958 18.9915L7.77666 19.7413L7.78958 18.9915ZM5.08658 18.6194L4.79957 19.3123H4.79957L5.08658 18.6194ZM21.6194 15.9134L22.3123 16.2004V16.2004L21.6194 15.9134ZM16.2104 18.9915L16.1975 18.2416L16.2104 18.9915ZM18.9134 18.6194L19.2004 19.3123H19.2004L18.9134 18.6194ZM10.5 2.75H13.5V1.25H10.5V2.75ZM21.25 10.5V11.5H22.75V10.5H21.25ZM14.2742 20.8539L13.7321 21.7697L15.0229 22.5338L15.565 21.6179L14.2742 20.8539ZM12.4412 21.0057C12.2485 21.3313 11.7515 21.3313 11.5587 21.0057L10.2679 21.7697C11.0415 23.0767 12.9585 23.0767 13.7321 21.7697L12.4412 21.0057ZM10.2679 21.7697L10.9133 21.3877L9.62244 20.6237L8.97697 21.0057L10.2679 21.7697ZM11.0166 20.0898L10.3712 20.4718L11.0622 21.6359L11.7076 21.2538L11.0166 20.0898ZM13.6288 20.4718L12.9833 20.0898L12.2924 21.2538L12.9378 21.6359L13.6288 20.4718ZM15.565 21.6179L14.2742 20.8539L13.5832 22.0179L14.874 22.7819L15.565 21.6179ZM13.5 2.75C17.6944 2.75 21.25 6.05851 21.25 10.5H22.75C22.75 5.18979 18.6136 1.25 13.5 1.25V2.75ZM10.5 1.25C5.38642 1.25 1.25 5.18979 1.25 10.5H2.75C2.75 6.05851 6.30558 2.75 10.5 2.75V1.25ZM1.25 10.5V10.5H2.75V10.5H1.25ZM7.77666 19.7413C6.54706 19.7199 5.88923 19.6401 5.37359 19.4265L4.79957 20.8123C5.60454 21.1457 6.52138 21.2197 7.8025 21.2413L7.77666 19.7413ZM1.68769 16.2004C2.27128 17.6093 3.39066 18.7287 4.79957 19.3123L5.3736 17.9265C4.33223 17.4951 3.50486 16.6678 3.07351 15.6264L1.68769 16.2004ZM21.25 11.5C21.25 12.6751 21.2496 13.5189 21.2042 14.1847C21.1592 14.8438 21.0726 15.2736 20.9265 15.6264L22.3123 16.2004C22.5468 15.6344 22.6505 15.0223 22.7007 14.2868C22.7504 13.5581 22.75 12.6546 22.75 11.5H21.25ZM16.2233 19.7413C17.4786 19.7199 18.3955 19.6457 19.2004 19.3123L18.6264 17.9265C18.1108 18.1401 17.4529 18.2199 16.1975 18.2416L16.2233 19.7413ZM20.9265 15.6264C20.4951 16.6678 19.6678 17.4951 18.6264 17.9265L19.2004 19.3123C20.6093 18.7287 21.7287 17.6093 22.3123 16.2004L20.9265 15.6264ZM13.5 1.25C12.5189 1.25 11.6815 1.25 11.0166 1.25V2.75C11.6546 2.75 12.4984 2.75 13.5 2.75V1.25ZM11.0166 1.25C10.0355 1.25 9.22876 1.25 8.5 1.25V2.75C9.22124 2.75 10.0355 2.75 11.0166 2.75V1.25ZM8.5 1.25C5.02665 1.25 2.27 3.77335 1.68769 6.96261L3.07351 7.53661C3.50486 5.33218 5.33218 3.50486 8.5 3.50486V1.25ZM10.9133 21.3877L10.3712 20.4718L9.08033 21.2358L9.62244 22.1517L10.9133 21.3877ZM11.5587 21.0057L10.9133 21.3877L11.5587 21.0057ZM7.8025 21.2413C8.97524 21.2619 9.1554 21.2619 9.40279 21.0483L8.39957 19.8783C8.39957 19.8783 8.4027 19.8783 7.77666 19.7413L7.8025 21.2413Z" fill="currentColor"/>
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
