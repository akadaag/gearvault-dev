import { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';

// Color palette for event cards — cycles through by index
const CARD_COLORS = [
  'linear-gradient(145deg, #3a3d56, #2b2d42)',   // slate blue-grey
  'linear-gradient(145deg, #2d4a5e, #1a3344)',   // deep teal
  'linear-gradient(145deg, #4a3560, #2e1f42)',   // warm purple
  'linear-gradient(145deg, #2d4a3a, #1a3328)',   // forest green
  'linear-gradient(145deg, #4a3a2d, #332818)',   // warm brown
  'linear-gradient(145deg, #3a2d4a, #241844)',   // indigo
];

const CARD_COLORS_DARK = [
  'linear-gradient(145deg, #2a2c3e, #1c1d2e)',
  'linear-gradient(145deg, #1e3a4a, #122630)',
  'linear-gradient(145deg, #3a2550, #221535)',
  'linear-gradient(145deg, #1e3a28, #12261a)',
  'linear-gradient(145deg, #3a2a1e, #261a10)',
  'linear-gradient(145deg, #2a1e3a, #1a1030)',
];

// Card sizing constants
const CARD_GAP = 14;
const PEEK_WIDTH = 24; // how much of neighboring cards is visible
const SWIPE_THRESHOLD = 50; // min px to trigger card change
const SWIPE_VELOCITY_THRESHOLD = 0.3; // px/ms to trigger card change even if distance is small

/** Wraps index into [0, length) range */
function wrapIndex(i: number, length: number): number {
  return ((i % length) + length) % length;
}

export function HomePage() {
  const navigate = useNavigate();
  const settings = useLiveQuery(() => db.settings.get('app-settings'));
  const gearItems = useLiveQuery(() => db.gearItems.toArray(), []);
  const events = useLiveQuery(() => db.events.toArray(), []);
  const categories = useLiveQuery(() => db.categories.toArray(), []);

  // ── Greeting & Time ────────────────────────────────────────────────────────
  const hour = new Date().getHours();
  let greeting = 'Good morning';
  if (hour >= 12 && hour < 17) greeting = 'Good afternoon';
  else if (hour >= 17 && hour < 21) greeting = 'Good evening';
  else if (hour >= 21 || hour < 5) greeting = 'Good night';

  const firstName = settings?.displayName?.split(' ')[0] ?? '';

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  // ── Upcoming Events ────────────────────────────────────────────────────────
  const now = new Date();
  const upcomingEvents = useMemo(
    () =>
      events
        ?.filter((e) => e.dateTime && new Date(e.dateTime) >= now)
        .sort(
          (a, b) =>
            new Date(a.dateTime!).getTime() - new Date(b.dateTime!).getTime()
        ) ?? [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events]
  );

  const eventCount = upcomingEvents.length;

  // ── Infinite Carousel State ─────────────────────────────────────────────────
  const [activeIndex, setActiveIndex] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const railRef = useRef<HTMLDivElement>(null);
  const touchRef = useRef<{
    startX: number;
    startY: number;
    startTime: number;
    moved: boolean;
    locked: boolean; // true = horizontal lock, false = not yet determined
    cancelled: boolean; // true = vertical scroll detected, abort carousel drag
  } | null>(null);

  // Detect dark mode for card colors
  const isDark = document.documentElement.classList.contains('dark');

  // Calculate card width from container width
  const getCardWidth = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return 300;
    // Card takes full width minus 2x peek and 2x gap
    return rail.offsetWidth - 2 * PEEK_WIDTH - 2 * CARD_GAP;
  }, []);

  // Step = card width + gap
  const getStep = useCallback(() => {
    return getCardWidth() + CARD_GAP;
  }, [getCardWidth]);

  // Navigate to a new index with animation
  const goToIndex = useCallback((newIndex: number) => {
    setIsAnimating(true);
    setActiveIndex(newIndex);
    setDragOffset(0);
    // Remove animation flag after transition completes
    setTimeout(() => setIsAnimating(false), 320);
  }, []);

  // ── Touch handlers for swipe ────────────────────────────────────────────────
  useEffect(() => {
    const rail = railRef.current;
    if (!rail || eventCount <= 1) return;

    function handleTouchStart(e: TouchEvent) {
      if (isAnimating) return;
      const touch = e.touches[0];
      touchRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        startTime: Date.now(),
        moved: false,
        locked: false,
        cancelled: false,
      };
    }

    function handleTouchMove(e: TouchEvent) {
      const info = touchRef.current;
      if (!info || info.cancelled) return;

      const touch = e.touches[0];
      const dx = touch.clientX - info.startX;
      const dy = touch.clientY - info.startY;

      // Determine scroll direction lock if not yet decided
      if (!info.locked && !info.moved) {
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        // Need at least 8px of movement to decide direction
        if (absDx < 8 && absDy < 8) return;

        if (absDy > absDx * 1.2) {
          // Vertical scroll — cancel carousel drag
          info.cancelled = true;
          setDragOffset(0);
          return;
        }
        info.locked = true;
      }

      if (info.cancelled) return;

      // Horizontal drag — prevent vertical scroll
      e.preventDefault();
      info.moved = true;
      setDragOffset(dx);
    }

    function handleTouchEnd(_e: TouchEvent) {
      const info = touchRef.current;
      if (!info || info.cancelled) {
        touchRef.current = null;
        setDragOffset(0);
        return;
      }

      const elapsed = Date.now() - info.startTime;
      const velocity = Math.abs(dragOffset) / elapsed;

      let direction = 0; // -1 = prev, 0 = stay, 1 = next
      if (Math.abs(dragOffset) > SWIPE_THRESHOLD || velocity > SWIPE_VELOCITY_THRESHOLD) {
        direction = dragOffset > 0 ? -1 : 1;
      }

      touchRef.current = null;

      if (direction !== 0) {
        goToIndex(activeIndex + direction);
      } else {
        // Snap back
        setIsAnimating(true);
        setDragOffset(0);
        setTimeout(() => setIsAnimating(false), 320);
      }
    }

    rail.addEventListener('touchstart', handleTouchStart, { passive: true });
    rail.addEventListener('touchmove', handleTouchMove, { passive: false });
    rail.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      rail.removeEventListener('touchstart', handleTouchStart);
      rail.removeEventListener('touchmove', handleTouchMove);
      rail.removeEventListener('touchend', handleTouchEnd);
    };
  }, [eventCount, isAnimating, dragOffset, activeIndex, goToIndex]);

  // ── Build visible cards (prev, current, next) ──────────────────────────────
  // We render enough cards to fill the viewport: the active card centered,
  // plus neighbors on both sides. For infinite loop we render 5 positions
  // (-2, -1, 0, +1, +2) to ensure smooth peek during fast swipes.
  const visiblePositions = eventCount >= 3 ? [-2, -1, 0, 1, 2] : 
                           eventCount === 2 ? [-1, 0, 1] : [0];

  // ── Essential Items ────────────────────────────────────────────────────────
  const essentialItems = gearItems?.filter((item) => item.essential) ?? [];
  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    categories?.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [categories]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  function getEventUrgency(dateTime: string) {
    const eventDate = new Date(dateTime);
    const daysUntil = Math.ceil(
      (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    let urgencyClass = 'later';
    if (daysUntil <= 2) urgencyClass = 'urgent';
    else if (daysUntil <= 7) urgencyClass = 'soon';

    let label = `In ${daysUntil} days`;
    if (daysUntil === 0) label = 'Today';
    else if (daysUntil === 1) label = 'Tomorrow';

    return { daysUntil, urgencyClass, label };
  }

  // Handle card tap — only navigate if not swiping
  function handleCardClick(eventId: string) {
    if (touchRef.current?.moved) return;
    navigate(`/events/${eventId}`);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <section className="home-page ios-theme">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="home-ios-header">
        <div className="home-ios-date">{today}</div>
        <div className="home-ios-title-row">
          <h1 className="home-ios-title">
            {greeting}
            {firstName ? `, ${firstName}` : ''}
          </h1>
        </div>
      </header>

      {/* ── Scrollable Content ────────────────────────────────────────── */}
      <div className="home-ios-content page-scroll-area">

        {/* ── Event Card Carousel ─────────────────────────────────────── */}
        {upcomingEvents.length > 0 ? (
          <>
            <div
              className={`home-event-rail${eventCount === 1 ? ' home-event-rail--single' : ''}`}
              ref={railRef}
            >
              <div
                className="home-event-track"
                style={{
                  transform: `translateX(${-activeIndex * getStep() + dragOffset}px)`,
                  transition: isAnimating ? 'transform 0.32s cubic-bezier(0.25, 1, 0.5, 1)' : 'none',
                }}
              >
                {eventCount > 1 ? (
                  visiblePositions.map((offset) => {
                    const realIdx = wrapIndex(activeIndex + offset, eventCount);
                    const event = upcomingEvents[realIdx];
                    const { urgencyClass, label: urgencyLabel } = getEventUrgency(event.dateTime!);
                    const total = event.packingChecklist.length;
                    const packed = event.packingChecklist.filter((i) => i.packed).length;
                    const progress = total > 0 ? Math.round((packed / total) * 100) : 0;
                    const colorIndex = realIdx % CARD_COLORS.length;
                    const bg = isDark ? CARD_COLORS_DARK[colorIndex] : CARD_COLORS[colorIndex];

                    // Position in track: each card at (activeIndex + offset) * step
                    const position = (activeIndex + offset) * getStep();

                    // Scale: center card = 1, neighbors = 0.92
                    const distFromCenter = Math.abs(offset * getStep() + dragOffset) / getStep();
                    const scale = 1 - Math.min(distFromCenter, 1) * 0.08;

                    return (
                      <div
                        key={`${offset}-${realIdx}`}
                        className="home-event-card"
                        style={{
                          background: bg,
                          position: 'absolute',
                          left: 0,
                          top: 0,
                          width: `${getCardWidth()}px`,
                          transform: `translateX(${position + PEEK_WIDTH + CARD_GAP}px) scale(${scale})`,
                        }}
                        onClick={() => handleCardClick(event.id)}
                      >
                        <div className="home-event-card__top">
                          <span className="home-event-card__label">Upcoming Event</span>
                          <span className={`home-event-card__badge ${urgencyClass}`}>
                            {urgencyLabel}
                          </span>
                        </div>

                        <h3 className="home-event-card__title">{event.title}</h3>

                        <p className="home-event-card__date">
                          {new Date(event.dateTime!).toLocaleDateString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </p>

                        <div className="home-event-card__bottom">
                          <span className="home-event-card__meta">
                            {[event.client, event.location].filter(Boolean).join(' \u00B7 ') || event.type}
                          </span>
                          {total > 0 && (
                            <span className="home-event-card__packing">
                              {packed}/{total} packed
                            </span>
                          )}
                        </div>

                        {total > 0 && (
                          <div className="home-event-card__progress">
                            <div
                              className="home-event-card__progress-fill"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  // Single card — no carousel mechanics
                  (() => {
                    const event = upcomingEvents[0];
                    const { urgencyClass, label: urgencyLabel } = getEventUrgency(event.dateTime!);
                    const total = event.packingChecklist.length;
                    const packed = event.packingChecklist.filter((i) => i.packed).length;
                    const progress = total > 0 ? Math.round((packed / total) * 100) : 0;
                    const bg = isDark ? CARD_COLORS_DARK[0] : CARD_COLORS[0];

                    return (
                      <div
                        className="home-event-card"
                        style={{ background: bg }}
                        onClick={() => navigate(`/events/${event.id}`)}
                      >
                        <div className="home-event-card__top">
                          <span className="home-event-card__label">Upcoming Event</span>
                          <span className={`home-event-card__badge ${urgencyClass}`}>
                            {urgencyLabel}
                          </span>
                        </div>
                        <h3 className="home-event-card__title">{event.title}</h3>
                        <p className="home-event-card__date">
                          {new Date(event.dateTime!).toLocaleDateString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </p>
                        <div className="home-event-card__bottom">
                          <span className="home-event-card__meta">
                            {[event.client, event.location].filter(Boolean).join(' \u00B7 ') || event.type}
                          </span>
                          {total > 0 && (
                            <span className="home-event-card__packing">
                              {packed}/{total} packed
                            </span>
                          )}
                        </div>
                        {total > 0 && (
                          <div className="home-event-card__progress">
                            <div
                              className="home-event-card__progress-fill"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })()
                )}
              </div>
            </div>

            {/* Dot indicators */}
            {eventCount > 1 && (
              <div className="home-event-dots">
                {upcomingEvents.map((_, idx) => (
                  <span
                    key={idx}
                    className={`home-event-dot${wrapIndex(activeIndex, eventCount) === idx ? ' active' : ''}`}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="home-event-card home-event-card--empty">
            <p className="home-event-card__empty-text">No upcoming events</p>
            <button
              className="home-event-card__empty-cta"
              onClick={() => navigate('/events?add=1')}
            >
              Plan an Event
            </button>
          </div>
        )}

        {/* ── Quick Actions ───────────────────────────────────────────── */}
        <div className="home-ios-section home-ios-section--actions">
          <div className="home-section-header">
            <h3 className="home-section-title">Quick Actions</h3>
          </div>
          <div className="home-actions-grid">
            <button
              className="home-action-tile"
              onClick={() => navigate('/catalog?add=1')}
            >
              <div className="home-action-tile__icon home-action-tile__icon--blue">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </div>
              <span className="home-action-tile__label">Add Item</span>
            </button>

            <button
              className="home-action-tile"
              onClick={() => navigate('/events?add=1')}
            >
              <div className="home-action-tile__icon home-action-tile__icon--orange">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </div>
              <span className="home-action-tile__label">New Event</span>
            </button>

            <button
              className="home-action-tile"
              onClick={() => navigate('/assistant')}
            >
              <div className="home-action-tile__icon home-action-tile__icon--purple">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 4l1.8 4.2L18 10l-4.2 1.8L12 16l-1.8-4.2L6 10l4.2-1.8L12 4z" />
                  <path d="M6.5 4.8l0.8 1.8 1.8 0.8-1.8 0.8-0.8 1.8-0.8-1.8-1.8-0.8 1.8-0.8 0.8-1.8z" />
                </svg>
              </div>
              <span className="home-action-tile__label">Ask AI</span>
            </button>

            <button
              className="home-action-tile"
              onClick={() => navigate('/events?calendar=1')}
            >
              <div className="home-action-tile__icon home-action-tile__icon--green">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                  <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
                </svg>
              </div>
              <span className="home-action-tile__label">Calendar</span>
            </button>
          </div>
        </div>

        {/* ── Essential Items List ─────────────────────────────────────── */}
        {essentialItems.length > 0 && (
          <div className="home-ios-section">
            <div className="home-section-header">
              <h3 className="home-section-title">Essentials</h3>
              <button
                className="home-text-btn"
                onClick={() => navigate('/catalog?qf=essential')}
              >
                View All
              </button>
            </div>
            <div className="home-essentials-list">
              {essentialItems.slice(0, 8).map((item) => (
                <button
                  key={item.id}
                  className="home-essentials-row"
                  onClick={() => navigate(`/catalog/item/${item.id}`)}
                >
                  <div className="home-essentials-row__thumb">
                    {item.photo ? (
                      <img src={item.photo} alt={item.name} loading="lazy" decoding="async" />
                    ) : (
                      <span className="home-essentials-row__letter">
                        {item.name.charAt(0)}
                      </span>
                    )}
                  </div>
                  <div className="home-essentials-row__info">
                    <span className="home-essentials-row__name">{item.name}</span>
                    <span className="home-essentials-row__sub">
                      {[item.brand, categoryNameById.get(item.categoryId)].filter(Boolean).join(' \u00B7 ')}
                    </span>
                  </div>
                  <span className="home-essentials-row__qty">
                    {item.quantity > 1 ? `x${item.quantity}` : ''}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="home-ios-bottom-spacer" />
      </div>
    </section>
  );
}
