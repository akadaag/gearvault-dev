import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, LayoutGroup } from 'framer-motion';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { fuzzyIncludes } from '../lib/search';
import type { GearItem, EventItem, ChatSession } from '../types/models';

// ── Spring config (matches FloatingNavBar) ───────────────────────────────────

const morphSpring = {
  type: 'spring' as const,
  stiffness: 500,
  damping: 32,
};

const morphTransition = {
  layout: morphSpring,
  opacity: { duration: 0.18 },
};

// ── Icons ────────────────────────────────────────────────────────────────────

const searchIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-4-4" />
  </svg>
);

const closeIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 6L6 18" />
    <path d="M6 6l12 12" />
  </svg>
);

// ── Result types ─────────────────────────────────────────────────────────────

interface SearchResult {
  id: string;
  type: 'gear' | 'event' | 'chat';
  name: string;
  sub: string;
  photo?: string;
  route: string;
}

// ── Component ────────────────────────────────────────────────────────────────

interface ToolbarSearchProps {
  /** Callback fired when the search pill opens/closes so parent can fade toolbar */
  onOpenChange?: (open: boolean) => void;
}

export function ToolbarSearch({ onOpenChange }: ToolbarSearchProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Dexie reactive data ────────────────────────────────────────────────────
  const gear = useLiveQuery(() => db.gearItems.toArray(), [], [] as GearItem[]);
  const events = useLiveQuery(() => db.events.toArray(), [], [] as EventItem[]);
  const chats = useLiveQuery(() => db.chatSessions.toArray(), [], [] as ChatSession[]);
  const categories = useLiveQuery(() => db.categories.toArray(), [], []);

  // ── Open / close ───────────────────────────────────────────────────────────

  function openSearch() {
    setOpen(true);
    onOpenChange?.(true);
    // Focus after morph animation starts
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    });
  }

  function closeSearch() {
    setOpen(false);
    setQuery('');
    onOpenChange?.(false);
    inputRef.current?.blur();
  }

  // ── Click-outside ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeSearch();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeSearch();
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ── Search logic ───────────────────────────────────────────────────────────

  const trimmed = query.trim();
  const results: SearchResult[] = [];

  if (trimmed.length > 0) {
    const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));

    // Gear items
    for (const item of gear) {
      const text = [item.name, item.brand, item.model, item.notes, item.tags.join(' '), categoryNameById.get(item.categoryId)].join(' ');
      if (fuzzyIncludes(text, trimmed)) {
        results.push({
          id: item.id,
          type: 'gear',
          name: item.name,
          sub: [item.brand, item.model].filter(Boolean).join(' ') || categoryNameById.get(item.categoryId) || '',
          photo: item.photo,
          route: `/catalog/item/${item.id}`,
        });
      }
    }

    // Events
    for (const ev of events) {
      const text = [ev.title, ev.type, ev.client, ev.location, ev.notes].join(' ');
      if (fuzzyIncludes(text, trimmed)) {
        results.push({
          id: ev.id,
          type: 'event',
          name: ev.title,
          sub: [ev.type, ev.client, ev.location].filter(Boolean).join(' \u00B7 '),
          route: `/events/${ev.id}`,
        });
      }
    }

    // Chat sessions
    for (const chat of chats) {
      const text = [chat.title, chat.draftInput].join(' ');
      if (fuzzyIncludes(text, trimmed)) {
        results.push({
          id: chat.id,
          type: 'chat',
          name: chat.title,
          sub: chat.type === 'event-draft' ? 'Event draft' : 'Q&A',
          route: `/assistant?history=1`,
        });
      }
    }
  }

  // Group results by type
  const gearResults = results.filter((r) => r.type === 'gear');
  const eventResults = results.filter((r) => r.type === 'event');
  const chatResults = results.filter((r) => r.type === 'chat');
  const hasResults = results.length > 0;

  function handleResultClick(route: string) {
    closeSearch();
    navigate(route);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="toolbar-search" ref={containerRef}>
      {/* Dark backdrop when search is open */}
      {open && (
        <div className="toolbar-search__backdrop" onClick={closeSearch} />
      )}

      <LayoutGroup>
        {!open ? (
          <motion.button
            className="toolbar-search__circle"
            layoutId="toolbar-search"
            type="button"
            aria-label="Search Packshot"
            onClick={openSearch}
            onPointerUp={(e) => e.currentTarget.blur()}
            transition={morphTransition}
          >
            {searchIcon}
          </motion.button>
        ) : (
          <motion.div
            className="toolbar-search__pill"
            layoutId="toolbar-search"
            transition={morphTransition}
          >
            <span className="toolbar-search__pill-icon">{searchIcon}</span>
            <input
              ref={inputRef}
              type="search"
              className="toolbar-search__input"
              placeholder="Search Packshot"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <button
              type="button"
              className="toolbar-search__close"
              aria-label="Close search"
              onClick={closeSearch}
            >
              {closeIcon}
            </button>
          </motion.div>
        )}
      </LayoutGroup>

      {/* Results dropdown */}
      {open && trimmed.length > 0 && (
        <div className="toolbar-search__results">
          {!hasResults ? (
            <p className="toolbar-search__empty">No results for &ldquo;{trimmed}&rdquo;</p>
          ) : (
            <>
              {gearResults.length > 0 && (
                <div className="toolbar-search__section">
                  <p className="toolbar-search__label">Gear</p>
                  {gearResults.slice(0, 5).map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      className="toolbar-search__item"
                      onClick={() => handleResultClick(r.route)}
                    >
                      <span className="toolbar-search__item-icon gear">
                        {r.photo ? (
                          <img src={r.photo} alt="" loading="lazy" decoding="async" />
                        ) : (
                          r.name.charAt(0).toUpperCase()
                        )}
                      </span>
                      <span className="toolbar-search__item-text">
                        <span className="name">{r.name}</span>
                        {r.sub && <span className="sub">{r.sub}</span>}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {eventResults.length > 0 && (
                <div className="toolbar-search__section">
                  <p className="toolbar-search__label">Events</p>
                  {eventResults.slice(0, 5).map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      className="toolbar-search__item"
                      onClick={() => handleResultClick(r.route)}
                    >
                      <span className="toolbar-search__item-icon event">
                        {r.name.charAt(0).toUpperCase()}
                      </span>
                      <span className="toolbar-search__item-text">
                        <span className="name">{r.name}</span>
                        {r.sub && <span className="sub">{r.sub}</span>}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {chatResults.length > 0 && (
                <div className="toolbar-search__section">
                  <p className="toolbar-search__label">Chats</p>
                  {chatResults.slice(0, 3).map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      className="toolbar-search__item"
                      onClick={() => handleResultClick(r.route)}
                    >
                      <span className="toolbar-search__item-icon chat">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                      </span>
                      <span className="toolbar-search__item-text">
                        <span className="name">{r.name}</span>
                        {r.sub && <span className="sub">{r.sub}</span>}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
