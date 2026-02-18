import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { AnimatePresence, motion } from 'framer-motion';
import { db } from '../db';
import { useAuth } from '../hooks/useAuth';

const settingsGearIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a2 2 0 0 1-4 0v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a2 2 0 0 1 0-4h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1 1 0 0 0 1.1.2h0a1 1 0 0 0 .6-.9V4a2 2 0 0 1 4 0v.2a1 1 0 0 0 .6.9h0a1 1 0 0 0 1.1-.2l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a1 1 0 0 0-.2 1.1v0a1 1 0 0 0 .9.6H20a2 2 0 0 1 0 4h-.2a1 1 0 0 0-.9.6z" />
  </svg>
);

const exportIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const signOutIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

export function ProfileMenu() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const settings = useLiveQuery(() => db.settings.get('app-settings'));
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const firstName = settings?.displayName?.split(' ')[0] ?? '';
  const initial = firstName ? firstName.charAt(0).toUpperCase() : 'G';
  const displayName = settings?.displayName ?? 'User';
  const email = user?.email ?? '';

  // Click outside handler
  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent | TouchEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [open]);

  async function handleExport() {
    const bundle = {
      version: 1,
      exportedAt: new Date().toISOString(),
      data: {
        gearItems: await db.gearItems.toArray(),
        categories: await db.categories.toArray(),
        events: await db.events.toArray(),
        settings: await db.settings.toArray(),
        aiFeedback: await db.aiFeedback.toArray(),
      },
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `packshot-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setOpen(false);
  }

  async function handleSignOut() {
    setOpen(false);
    await signOut();
  }

  return (
    <div className="profile-menu" ref={menuRef}>
      <button
        className="profile-menu__avatar-btn"
        type="button"
        aria-label="Profile menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onPointerUp={(e) => e.currentTarget.blur()}
      >
        <div className="profile-menu__avatar">{initial}</div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="profile-menu__dropdown"
            initial={{ opacity: 0, scale: 0.92, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: -8 }}
            transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
          >
            {/* User info header */}
            <div className="profile-menu__user-info">
              <div className="profile-menu__user-avatar">{initial}</div>
              <div className="profile-menu__user-details">
                <span className="profile-menu__user-name">{displayName}</span>
                {email && <span className="profile-menu__user-email">{email}</span>}
              </div>
            </div>

            <div className="profile-menu__divider" />

            {/* Menu items */}
            <button
              className="profile-menu__item"
              onClick={() => {
                navigate('/settings');
                setOpen(false);
              }}
            >
              <span className="profile-menu__item-icon">{settingsGearIcon}</span>
              <span>Settings</span>
            </button>

            <button className="profile-menu__item" onClick={handleExport}>
              <span className="profile-menu__item-icon">{exportIcon}</span>
              <span>Export Data</span>
            </button>

            <div className="profile-menu__divider" />

            <button className="profile-menu__item profile-menu__item--danger" onClick={handleSignOut}>
              <span className="profile-menu__item-icon">{signOutIcon}</span>
              <span>Sign Out</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
