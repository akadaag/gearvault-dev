import { useMemo, useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';

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

  // ── Event Card Rail: active index + scroll-snap ────────────────────────────
  const railRef = useRef<HTMLDivElement>(null);
  const [activeCardIndex, setActiveCardIndex] = useState(0);

  // Dot indicator: track scroll position
  useEffect(() => {
    const rail = railRef.current;
    if (!rail || upcomingEvents.length <= 1) return;

    function handleScroll() {
      if (!rail) return;
      const scrollLeft = rail.scrollLeft;
      const cardWidth = rail.firstElementChild
        ? (rail.firstElementChild as HTMLElement).offsetWidth
        : 1;
      const gap = 14;
      const idx = Math.round(scrollLeft / (cardWidth + gap));
      setActiveCardIndex(Math.max(0, Math.min(idx, upcomingEvents.length - 1)));
    }

    rail.addEventListener('scroll', handleScroll, { passive: true });
    return () => rail.removeEventListener('scroll', handleScroll);
  }, [upcomingEvents.length]);

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
        {upcomingEvents.length > 0 ? (
          <>
            <div
              className={`home-event-rail${upcomingEvents.length === 1 ? ' home-event-rail--single' : ''}`}
              ref={railRef}
            >
              {upcomingEvents.map((event) => {
                const { urgencyClass, label: urgencyLabel } = getEventUrgency(event.dateTime!);
                const total = event.packingChecklist.length;
                const packed = event.packingChecklist.filter((i) => i.packed).length;
                const progress = total > 0 ? Math.round((packed / total) * 100) : 0;

                return (
                  <div
                    key={event.id}
                    className="home-event-card"
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
              })}
            </div>

            {/* Dot indicators */}
            {upcomingEvents.length > 1 && (
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

        {/* ── Quick Actions (2x2 grid) ────────────────────────────────── */}
        <div className="home-actions-grid">
          <button
            className="home-action-tile"
            onClick={() => navigate('/catalog?add=1')}
          >
            <div className="home-action-tile__icon home-action-tile__icon--blue">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
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
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
