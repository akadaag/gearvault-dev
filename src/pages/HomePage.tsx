import { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import type { UIEvent } from 'react';
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
const PEEK_WIDTH = 28; // how much of neighboring cards is visible
const CARD_GAP = 6;
const SWIPE_THRESHOLD = 50; // min px to trigger card change
const SWIPE_VELOCITY_THRESHOLD = 0.3; // px/ms

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
  // activeIndex can grow unbounded (negative or positive) for infinite looping.
  // We use wrapIndex(activeIndex, eventCount) to map to actual event data.
  const [activeIndex, setActiveIndex] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  // Phase: 'idle' | 'dragging' | 'snapping'
  const [phase, setPhase] = useState<'idle' | 'dragging' | 'snapping'>('idle');
  const dragOffsetRef = useRef(0);
  const phaseRef = useRef<'idle' | 'dragging' | 'snapping'>('idle');
  // Direction pending during snap: which way activeIndex should shift when snap completes
  const snapDirectionRef = useRef(0);
  const isSnapPendingRef = useRef(false);
  const railRef = useRef<HTMLDivElement>(null);
  const touchRef = useRef<{
    startX: number;
    startY: number;
    startTime: number;
    moved: boolean;
    locked: boolean;
    cancelled: boolean;
  } | null>(null);
  // Detect dark mode for card colors
  const isDark = document.documentElement.classList.contains('dark');

  // Calculate card width from container width
  const getCardWidth = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return 300;
    return rail.offsetWidth - 2 * PEEK_WIDTH - 2 * CARD_GAP;
  }, []);

  // Step = card width + gap
  const getStep = useCallback(() => {
    return getCardWidth() + CARD_GAP;
  }, [getCardWidth]);

  useEffect(() => {
    dragOffsetRef.current = dragOffset;
  }, [dragOffset]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    if (eventCount <= 0) {
      setActiveIndex(0);
      setDragOffset(0);
      setPhase('idle');
      snapDirectionRef.current = 0;
      isSnapPendingRef.current = false;
      return;
    }
    setActiveIndex((prev) => wrapIndex(prev, eventCount));
  }, [eventCount]);

  // ── Touch handlers for swipe ────────────────────────────────────────────────
  // Snap completion is driven by transitionend (not timeout) to avoid races.
  useEffect(() => {
    const rail = railRef.current;
    if (!rail || eventCount <= 1) return;

    const step = getStep();

    function handleTouchStart(e: TouchEvent) {
      if (isSnapPendingRef.current || phaseRef.current === 'snapping') return;

      const touch = e.touches[0];
      touchRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        startTime: Date.now(),
        moved: false,
        locked: false,
        cancelled: false,
      };
      setPhase('dragging');
    }

    function handleTouchMove(e: TouchEvent) {
      const info = touchRef.current;
      if (!info || info.cancelled) return;

      const touch = e.touches[0];
      const dx = touch.clientX - info.startX;
      const dy = touch.clientY - info.startY;

      if (!info.locked && !info.moved) {
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        if (absDx < 8 && absDy < 8) return;

        if (absDy > absDx * 1.2) {
          info.cancelled = true;
          dragOffsetRef.current = 0;
          setDragOffset(0);
          setPhase('idle');
          return;
        }
        info.locked = true;
      }

      if (info.cancelled) return;

      e.preventDefault();
      info.moved = true;
      dragOffsetRef.current = dx;
      setDragOffset(dx);
    }

    function handleTouchEnd() {
      const info = touchRef.current;
      const currentDrag = dragOffsetRef.current;

      if (!info || info.cancelled) {
        touchRef.current = null;
        dragOffsetRef.current = 0;
        setDragOffset(0);
        setPhase('idle');
        return;
      }

      const elapsed = Math.max(Date.now() - info.startTime, 1);
      const velocity = Math.abs(currentDrag) / elapsed;

      let direction = 0;
      if (Math.abs(currentDrag) > SWIPE_THRESHOLD || velocity > SWIPE_VELOCITY_THRESHOLD) {
        direction = currentDrag > 0 ? -1 : 1;
      }

      touchRef.current = null;
      setPhase('snapping');
      snapDirectionRef.current = direction;
      isSnapPendingRef.current = true;

      if (direction !== 0) {
        const target = direction > 0 ? -step : step;
        dragOffsetRef.current = target;
        setDragOffset(target);
      } else {
        dragOffsetRef.current = 0;
        setDragOffset(0);
      }
    }

    function handleTransitionEnd(e: TransitionEvent) {
      if (!isSnapPendingRef.current) return;
      if (!(e.target instanceof HTMLElement)) return;
      if (!e.target.classList.contains('home-event-card')) return;
      if (e.target.dataset.offset !== '0') return;
      if (e.propertyName !== 'transform') return;

      isSnapPendingRef.current = false;
      const dir = snapDirectionRef.current;
      if (dir !== 0) {
        setActiveIndex((prev) => prev + dir);
      }
      snapDirectionRef.current = 0;
      dragOffsetRef.current = 0;
      setDragOffset(0);
      setPhase('idle');
    }

    function handleTouchCancel() {
      touchRef.current = null;
      if (phaseRef.current !== 'snapping') {
        dragOffsetRef.current = 0;
        setDragOffset(0);
        setPhase('idle');
      }
    }

    rail.addEventListener('touchstart', handleTouchStart, { passive: true });
    rail.addEventListener('touchmove', handleTouchMove, { passive: false });
    rail.addEventListener('touchend', handleTouchEnd, { passive: true });
    rail.addEventListener('touchcancel', handleTouchCancel, { passive: true });
    rail.addEventListener('transitionend', handleTransitionEnd);

    return () => {
      rail.removeEventListener('touchstart', handleTouchStart);
      rail.removeEventListener('touchmove', handleTouchMove);
      rail.removeEventListener('touchend', handleTouchEnd);
      rail.removeEventListener('touchcancel', handleTouchCancel);
      rail.removeEventListener('transitionend', handleTransitionEnd);
    };
  }, [eventCount, getStep]);

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

  // ── Compute card positions ─────────────────────────────────────────────────
  const step = getStep();
  const cardWidth = getCardWidth();
  const isSnapping = phase === 'snapping';

  // Center offset: position where the active card's left edge should be
  const centerOffset = PEEK_WIDTH + CARD_GAP;

  // Which offsets to render: enough to cover the viewport
  const visibleOffsets = eventCount >= 3 ? [-2, -1, 0, 1, 2] :
                         eventCount === 2 ? [-1, 0, 1] : [0];

  // ── Render card at a given offset from activeIndex ─────────────────────────
  function renderCard(offset: number) {
    const realIdx = wrapIndex(activeIndex + offset, eventCount);
    const event = upcomingEvents[realIdx];
    const { urgencyClass, label: urgencyLabel } = getEventUrgency(event.dateTime!);
    const total = event.packingChecklist.length;
    const packed = event.packingChecklist.filter((i) => i.packed).length;
    const progress = total > 0 ? Math.round((packed / total) * 100) : 0;
    const colorIndex = realIdx % CARD_COLORS.length;
    const bg = isDark ? CARD_COLORS_DARK[colorIndex] : CARD_COLORS[colorIndex];

    // Position: offset * step from center + drag
    const x = centerOffset + offset * step + dragOffset;

    // Scale: center card = 1, neighbors shrink
    const distFromCenter = Math.abs(offset * step + dragOffset) / step;
    const scale = 1 - Math.min(distFromCenter, 1) * 0.08;
    const zIndex = 20 - Math.round(Math.min(distFromCenter, 2) * 10);

    return (
      <div
        key={`pos-${offset}`}
        data-offset={offset}
        className="home-event-card"
        style={{
          background: bg,
          position: 'absolute',
          left: 0,
          top: 0,
          width: `${cardWidth}px`,
          transform: `translateX(${x}px) scale(${scale})`,
          transition: isSnapping ? 'transform 0.32s cubic-bezier(0.25, 1, 0.5, 1)' : 'none',
          zIndex,
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
  }

  // ── Scroll-driven title crossfade ────────────────────────────────────────
  const largeTitleRef = useRef<HTMLDivElement>(null);
  const glassTitleRef = useRef<HTMLHeadingElement>(null);
  const handleScroll = (e: UIEvent<HTMLDivElement>) => {
    const progress = Math.min(1, Math.max(0, (e.currentTarget.scrollTop - 10) / 40));
    if (largeTitleRef.current) largeTitleRef.current.style.opacity = String(1 - progress);
    if (glassTitleRef.current) glassTitleRef.current.style.opacity = String(progress);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <section className="home-page ios-theme">
      {/* ── Floating Header (matches Catalog/Events pattern) ─────────── */}
      <header className="ios-home-header">
        {/* Left: large title — fades out on scroll */}
        <div
          ref={largeTitleRef}
          className="ios-home-header-left"
          style={{ opacity: 1, pointerEvents: 'none' }}
        >
          <div className="home-ios-date">{today}</div>
          <h1 className="ios-home-title" style={{ margin: 0 }}>
            {greeting}
            {firstName ? `, ${firstName}` : ''}
          </h1>
        </div>

        {/* Center title — fades in on scroll */}
        <h2
          ref={glassTitleRef}
          className="ios-home-glass-title"
          style={{ opacity: 0, pointerEvents: 'none' }}
        >
          Home
        </h2>
      </header>

      {/* ── Scrollable Content ────────────────────────────────────────── */}
      <div className="home-ios-content page-scroll-area" onScroll={handleScroll}>
        <div style={{ height: 'calc(env(safe-area-inset-top) + 70px)' }} />

        {/* ── Event Card Carousel ─────────────────────────────────────── */}
        {upcomingEvents.length > 0 ? (
          <>
            <div
              className={`home-event-rail${eventCount === 1 ? ' home-event-rail--single' : ''}`}
              ref={railRef}
            >
              {eventCount > 1 ? (
                visibleOffsets.map((offset) => renderCard(offset))
              ) : (
                // Single card — static, centered
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

            {/* Dot indicators */}
            {eventCount > 1 && (
              <div className="home-event-dots">
                {upcomingEvents.map((_, idx) => {
                  // During snap animation, show the target index dot
                  const dotIdx = phase === 'snapping'
                    ? wrapIndex(activeIndex + snapDirectionRef.current, eventCount)
                    : wrapIndex(activeIndex, eventCount);
                  return (
                    <span
                      key={idx}
                      className={`home-event-dot${dotIdx === idx ? ' active' : ''}`}
                    />
                  );
                })}
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
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M15 12L12 12M12 12L9 12M12 12L12 9M12 12L12 15" />
                  <path d="M22 12C22 16.714 22 19.0711 20.5355 20.5355C19.0711 22 16.714 22 12 22C7.28595 22 4.92893 22 3.46447 20.5355C2 19.0711 2 16.714 2 12C2 7.28595 2 4.92893 3.46447 3.46447C4.92893 2 7.28595 2 12 2C16.714 2 19.0711 2 20.5355 3.46447C21.5093 4.43821 21.8356 5.80655 21.9449 8" />
                </svg>
              </div>
              <span className="home-action-tile__label">Add Item</span>
            </button>

            <button
              className="home-action-tile"
              onClick={() => navigate('/events?add=1')}
            >
              <div className="home-action-tile__icon home-action-tile__icon--orange">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M16 14.0455V11.5488C16 9.40445 16 8.3323 15.4142 7.66615C14.8284 7 13.8856 7 12 7C10.1144 7 9.17157 7 8.58579 7.66615C8 8.3323 8 9.40445 8 11.5488V14.0455C8 15.5937 8 16.3679 8.32627 16.7062C8.48187 16.8675 8.67829 16.9688 8.88752 16.9958C9.32623 17.0522 9.83855 16.5425 10.8632 15.5229C11.3161 15.0722 11.5426 14.8469 11.8046 14.7875C11.9336 14.7583 12.0664 14.7583 12.1954 14.7875C12.4574 14.8469 12.6839 15.0722 13.1368 15.5229C14.1615 16.5425 14.6738 17.0522 15.1125 16.9958C15.3217 16.9688 15.5181 16.8675 15.6737 16.7062C16 16.3679 16 15.5937 16 14.0455Z" strokeWidth="1.5" />
                  <path d="M7 3.33782C8.47087 2.48697 10.1786 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 10.1786 2.48697 8.47087 3.33782 7" />
                </svg>
              </div>
              <span className="home-action-tile__label">New Event</span>
            </button>

            <button
              className="home-action-tile"
              onClick={() => navigate('/assistant')}
            >
              <div className="home-action-tile__icon home-action-tile__icon--purple">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M10.5026 5.01692L9.96661 3.65785C9.62068 2.78072 8.37933 2.78072 8.03339 3.65784L6.96137 6.37599C6.85576 6.64378 6.64378 6.85575 6.37599 6.96137L3.65785 8.03339C2.78072 8.37932 2.78072 9.62067 3.65784 9.96661L6.37599 11.0386C6.64378 11.1442 6.85575 11.3562 6.96137 11.624L8.03339 14.3422C8.37932 15.2193 9.62067 15.2193 9.96661 14.3422L11.0386 11.624C11.1442 11.3562 11.3562 11.1442 11.624 11.0386L14.3422 9.96661C15.2193 9.62068 15.2193 8.37933 14.3422 8.03339L12.9831 7.49738" />
                  <path d="M16.4885 13.3481C16.6715 12.884 17.3285 12.884 17.5115 13.3481L18.3121 15.3781C18.368 15.5198 18.4802 15.632 18.6219 15.6879L20.6519 16.4885C21.116 16.6715 21.116 17.3285 20.6519 17.5115L18.6219 18.3121C18.4802 18.368 18.368 18.4802 18.3121 18.6219L17.5115 20.6519C17.3285 21.116 16.6715 21.116 16.4885 20.6519L15.6879 18.6219C15.632 18.4802 15.5198 18.368 15.3781 18.3121L13.3481 17.5115C12.884 17.3285 12.884 16.6715 13.3481 16.4885L15.3781 15.6879C15.5198 15.632 15.632 15.5198 15.6879 15.3781L16.4885 13.3481Z" strokeWidth="1.5" />
                </svg>
              </div>
              <span className="home-action-tile__label">Ask AI</span>
            </button>

            <button
              className="home-action-tile"
              onClick={() => navigate('/events?calendar=1')}
            >
              <div className="home-action-tile__icon home-action-tile__icon--green">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M22 14V12C22 8.22876 22 6.34315 20.8284 5.17157C19.6569 4 17.7712 4 14 4M14 22H10C6.22876 22 4.34315 22 3.17157 20.8284C2 19.6569 2 17.7712 2 14V12C2 8.22876 2 6.34315 3.17157 5.17157C4.34315 4 6.22876 4 10 4" />
                  <path d="M7 4V2.5" />
                  <path d="M17 4V2.5" />
                  <circle cx="18" cy="18" r="3" />
                  <path d="M20.5 20.5L22 22" />
                  <path d="M21.5 9H16.625H10.75M2 9H5.875" />
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

      </div>
    </section>
  );
}
