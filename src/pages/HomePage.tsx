import { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { EventItem } from '../types/models';

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

// Gap between cards in the rail (must match CSS)
const CARD_GAP = 14;

interface DisplayCard {
  event: EventItem;
  colorIdx: number;
  isClone: boolean;
  key: string;
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

  // ── Display cards: real events + clones for infinite carousel ──────────────
  const displayCards = useMemo(() => {
    if (upcomingEvents.length === 0) return [];
    if (upcomingEvents.length === 1) {
      return [{
        event: upcomingEvents[0],
        colorIdx: 0,
        isClone: false,
        key: upcomingEvents[0].id!,
      }] as DisplayCard[];
    }

    // 2+ events: clone last before first, clone first after last
    const lastIdx = upcomingEvents.length - 1;
    const cards: DisplayCard[] = [];

    // Clone of last event (placed before first)
    cards.push({
      event: upcomingEvents[lastIdx],
      colorIdx: lastIdx % CARD_COLORS.length,
      isClone: true,
      key: `clone-start-${upcomingEvents[lastIdx].id}`,
    });

    // All real events
    upcomingEvents.forEach((ev, idx) => {
      cards.push({
        event: ev,
        colorIdx: idx % CARD_COLORS.length,
        isClone: false,
        key: ev.id!,
      });
    });

    // Clone of first event (placed after last)
    cards.push({
      event: upcomingEvents[0],
      colorIdx: 0,
      isClone: true,
      key: `clone-end-${upcomingEvents[0].id}`,
    });

    return cards;
  }, [upcomingEvents]);

  // ── Event Card Rail: active index + scroll-snap + scale animation ──────────
  const railRef = useRef<HTMLDivElement>(null);
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const rafRef = useRef<number>(0);
  const isJumping = useRef(false);

  const eventCount = upcomingEvents.length;
  const isMulti = eventCount >= 2;

  // Detect dark mode for card colors
  const isDark = document.documentElement.classList.contains('dark');

  // Get card step (width + gap) for scroll position math
  const getStep = useCallback(() => {
    const rail = railRef.current;
    if (!rail || !rail.firstElementChild) return 1;
    return (rail.firstElementChild as HTMLElement).offsetWidth + CARD_GAP;
  }, []);

  // Smooth scale animation on scroll — reads DOM, no state updates
  const updateCardScales = useCallback(() => {
    const rail = railRef.current;
    if (!rail || eventCount <= 1) return;

    const railRect = rail.getBoundingClientRect();
    const railCenter = railRect.left + railRect.width / 2;

    cardRefs.current.forEach((card) => {
      if (!card) return;
      const cardRect = card.getBoundingClientRect();
      const cardCenter = cardRect.left + cardRect.width / 2;
      const distance = Math.abs(railCenter - cardCenter);
      const maxDistance = railRect.width * 0.6;
      const ratio = Math.min(distance / maxDistance, 1);
      // Scale: centered = 1, edges = 0.9
      const scale = 1 - ratio * 0.1;
      card.style.transform = `scale(${scale})`;
    });
  }, [eventCount]);

  // Map display index → real event index (for dot indicators)
  const displayIdxToRealIdx = useCallback(
    (displayIdx: number) => {
      if (!isMulti) return 0;
      if (displayIdx <= 0) return eventCount - 1; // clone of last → last real
      if (displayIdx > eventCount) return 0; // clone of first → first real
      return displayIdx - 1; // offset by 1 due to leading clone
    },
    [isMulti, eventCount]
  );

  // Scroll to a specific display index (instant, no animation)
  const scrollToDisplayIdx = useCallback(
    (displayIdx: number) => {
      const rail = railRef.current;
      if (!rail) return;
      const step = getStep();
      rail.scrollTo({ left: displayIdx * step, behavior: 'instant' });
    },
    [getStep]
  );

  // rAF-throttled scroll handler + scrollend for clone jumps
  useEffect(() => {
    const rail = railRef.current;
    if (!rail || eventCount <= 1) return;

    // --- Continuous scroll: update scales + dot indicator ---
    function handleScroll() {
      if (isJumping.current) return;

      // Cancel any pending rAF
      if (rafRef.current) cancelAnimationFrame(rafRef.current);

      rafRef.current = requestAnimationFrame(() => {
        if (!rail || isJumping.current) return;

        const scrollLeft = rail.scrollLeft;
        const step = getStep();
        const displayIdx = Math.round(scrollLeft / step);
        const realIdx = displayIdxToRealIdx(displayIdx);

        // Only update state if changed
        setActiveCardIndex((prev) => (prev !== realIdx ? realIdx : prev));

        // Update scales visually
        updateCardScales();
      });
    }

    // --- Scroll-end: detect if resting on a clone → jump to real ---
    // Uses native scrollend (fires once after scroll-snap finishes)
    function handleScrollEnd() {
      if (!rail || !isMulti || isJumping.current) return;

      const scrollLeft = rail.scrollLeft;
      const step = getStep();
      const displayIdx = Math.round(scrollLeft / step);

      let targetIdx: number | null = null;
      if (displayIdx <= 0) {
        targetIdx = eventCount; // clone-of-last → real last card
      } else if (displayIdx > eventCount) {
        targetIdx = 1; // clone-of-first → real first card
      }

      if (targetIdx !== null) {
        isJumping.current = true;
        // Disable scroll-snap so the browser doesn't fight our jump
        rail.style.scrollSnapType = 'none';
        rail.scrollTo({ left: targetIdx * step, behavior: 'instant' });

        // Double-rAF: let the position settle, then re-enable snap
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            rail.style.scrollSnapType = 'x mandatory';
            updateCardScales();
            isJumping.current = false;
          });
        });
      }
    }

    rail.addEventListener('scroll', handleScroll, { passive: true });
    rail.addEventListener('scrollend', handleScrollEnd);

    // Initial position: scroll to display index 1 (first real card)
    if (isMulti) {
      // Defer to ensure DOM is laid out
      requestAnimationFrame(() => {
        isJumping.current = true;
        rail.style.scrollSnapType = 'none';
        scrollToDisplayIdx(1);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            rail.style.scrollSnapType = 'x mandatory';
            updateCardScales();
            isJumping.current = false;
          });
        });
      });
    } else {
      requestAnimationFrame(updateCardScales);
    }

    return () => {
      rail.removeEventListener('scroll', handleScroll);
      rail.removeEventListener('scrollend', handleScrollEnd);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [eventCount, isMulti, updateCardScales, getStep, displayIdxToRealIdx, scrollToDisplayIdx]);

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

  // ── Render helper for a single event card ──────────────────────────────────
  function renderEventCard(dc: DisplayCard, refIdx: number) {
    const { event, colorIdx, key } = dc;
    const { urgencyClass, label: urgencyLabel } = getEventUrgency(event.dateTime!);
    const total = event.packingChecklist.length;
    const packed = event.packingChecklist.filter((i) => i.packed).length;
    const progress = total > 0 ? Math.round((packed / total) * 100) : 0;
    const bg = isDark ? CARD_COLORS_DARK[colorIdx] : CARD_COLORS[colorIdx];

    return (
      <div
        key={key}
        className="home-event-card"
        ref={(el) => { cardRefs.current[refIdx] = el; }}
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

        {/* ── Event Card Rail ─────────────────────────────────────────── */}
        {displayCards.length > 0 ? (
          <>
            <div
              className={`home-event-rail${eventCount === 1 ? ' home-event-rail--single' : ''}`}
              ref={railRef}
            >
              {displayCards.map((dc, idx) => renderEventCard(dc, idx))}
            </div>

            {/* Dot indicators — only count real events */}
            {eventCount > 1 && (
              <div className="home-event-dots">
                {upcomingEvents.map((_, idx) => (
                  <span
                    key={idx}
                    className={`home-event-dot${idx === activeCardIndex ? ' active' : ''}`}
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
