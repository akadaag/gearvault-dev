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

/** Chat bubble icon for AI circle button (Solar icon set, cleaned) */
const sparkleSvg = (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
    <path d="M8 9H16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M8 12.5H13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <path fill="currentColor" d="M1.25 10.5C1.25 10.9142 1.58579 11.25 2 11.25C2.41421 11.25 2.75 10.9142 2.75 10.5H1.25ZM3.07351 15.6264C2.915 15.2437 2.47627 15.062 2.09359 15.2205C1.71091 15.379 1.52918 15.8177 1.68769 16.2004L3.07351 15.6264ZM13.7321 21.7697L14.2742 20.8539L12.9833 20.0898L12.4412 21.0057L13.7321 21.7697ZM9.72579 20.8539L10.2679 21.7697L11.5587 21.0057L11.0166 20.0898L9.72579 20.8539ZM12.4412 21.0057C12.2485 21.3313 11.7515 21.3313 11.5587 21.0057L10.2679 21.7697C11.0415 23.0767 12.9585 23.0767 13.7321 21.7697L12.4412 21.0057ZM10.5 2.75H13.5V1.25H10.5V2.75ZM21.25 10.5V11.5H22.75V10.5H21.25ZM7.8025 18.2416C6.54706 18.2199 5.88923 18.1401 5.37359 17.9265L4.79957 19.3123C5.60454 19.6457 6.52138 19.7197 7.77666 19.7413L7.8025 18.2416ZM1.68769 16.2004C2.27128 17.6093 3.39066 18.7287 4.79957 19.3123L5.3736 17.9265C4.33223 17.4951 3.50486 16.6678 3.07351 15.6264L1.68769 16.2004ZM21.25 11.5C21.25 12.6751 21.2496 13.5189 21.2042 14.1847C21.1592 14.8438 21.0726 15.2736 20.9265 15.6264L22.3123 16.2004C22.5468 15.6344 22.6505 15.0223 22.7007 14.2868C22.7504 13.5581 22.75 12.6546 22.75 11.5H21.25ZM16.2233 19.7413C17.4786 19.7197 18.3955 19.6457 19.2004 19.3123L18.6264 17.9265C18.1108 18.1401 17.4529 18.2199 16.1975 18.2416L16.2233 19.7413ZM20.9265 15.6264C20.4951 16.6678 19.6678 17.4951 18.6264 17.9265L19.2004 19.3123C20.6093 18.7287 21.7287 17.6093 22.3123 16.2004L20.9265 15.6264ZM13.5 2.75C15.1512 2.75 16.337 2.75079 17.2619 2.83873C18.1757 2.92561 18.7571 3.09223 19.2206 3.37628L20.0044 2.09732C19.2655 1.64457 18.4274 1.44279 17.4039 1.34547C16.3915 1.24921 15.1222 1.25 13.5 1.25V2.75ZM22.75 10.5C22.75 8.87781 22.7508 7.6085 22.6545 6.59611C22.5572 5.57256 22.3554 4.73445 21.9027 3.99563L20.6237 4.77938C20.9078 5.24291 21.0744 5.82434 21.1613 6.73809C21.2492 7.663 21.25 8.84876 21.25 10.5H22.75ZM19.2206 3.37628C19.7925 3.72672 20.2733 4.20752 20.6237 4.77938L21.9027 3.99563C21.4286 3.22194 20.7781 2.57144 20.0044 2.09732L19.2206 3.37628ZM10.5 1.25C8.87781 1.25 7.6085 1.24921 6.59611 1.34547C5.57256 1.44279 4.73445 1.64457 3.99563 2.09732L4.77938 3.37628C5.24291 3.09223 5.82434 2.92561 6.73809 2.83873C7.663 2.75079 8.84876 2.75 10.5 2.75V1.25ZM2.75 10.5C2.75 8.84876 2.75079 7.663 2.83873 6.73809C2.92561 5.82434 3.09223 5.24291 3.37628 4.77938L2.09732 3.99563C1.64457 4.73445 1.44279 5.57256 1.34547 6.59611C1.24921 7.6085 1.25 8.87781 1.25 10.5H2.75ZM3.99563 2.09732C3.22194 2.57144 2.57144 3.22194 2.09732 3.99563L3.37628 4.77938C3.72672 4.20752 4.20752 3.72672 4.77938 3.37628L3.99563 2.09732ZM11.0166 20.0898C10.8136 19.7468 10.6354 19.4441 10.4621 19.2063C10.2795 18.9559 10.0702 18.7304 9.77986 18.5615L9.02572 19.8582C9.07313 19.8857 9.13772 19.936 9.24985 20.0898C9.37122 20.2564 9.50835 20.4865 9.72579 20.8539L11.0166 20.0898ZM7.77666 19.7413C8.21575 19.7489 8.49387 19.7545 8.70588 19.7779C8.90399 19.7999 8.98078 19.832 9.02572 19.8582L9.77986 18.5615C9.4871 18.3912 9.18246 18.3215 8.87097 18.287C8.57339 18.2541 8.21375 18.2487 7.8025 18.2416L7.77666 19.7413ZM14.2742 20.8539C14.4916 20.4865 14.6287 20.2564 14.7501 20.0898C14.8622 19.936 14.9268 19.8857 14.9742 19.8582L14.2201 18.5615C13.9298 18.7304 13.7204 18.9559 13.5379 19.2063C13.3646 19.4441 13.1864 19.7468 12.9833 20.0898L14.2742 20.8539ZM16.1975 18.2416C15.7862 18.2487 15.4266 18.2541 15.129 18.287C14.8175 18.3215 14.5129 18.3912 14.2201 18.5615L14.9742 19.8582C15.0192 19.832 15.096 19.7999 15.2941 19.7779C15.5061 19.7545 15.7842 19.7489 16.2233 19.7413L16.1975 18.2416Z"/>
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
