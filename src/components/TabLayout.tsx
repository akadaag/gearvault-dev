import { NavLink, Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ensureBaseData } from '../db';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const tabs = [
  { to: '/catalog', label: 'Catalog', icon: '📦' },
  { to: '/events', label: 'Events', icon: '📅' },
  { to: '/assistant', label: 'AI Assistant', icon: '✨' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
];

export function TabLayout() {
  useTheme();
  const { user, signOut, syncMessage } = useAuth();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(() =>
    window.matchMedia('(display-mode: standalone)').matches,
  );
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  useEffect(() => {
    void ensureBaseData();
  }, []);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const onInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  async function handleInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="topbar-title">
            <h1>GearVault</h1>
            <p className="subtle topbar-user">{user?.email}</p>
            {syncMessage && <p className="subtle topbar-sync">{syncMessage}</p>}
            <div className="topbar-actions">
              <span className={`status-chip ${isOnline ? 'online' : 'offline'}`}>
                <span className="status-dot" aria-hidden="true" />
                {isOnline ? 'Online' : 'Offline'}
              </span>
              {!isInstalled && deferredPrompt && (
                <button className="ghost" onClick={() => void handleInstall()}>
                  Install App
                </button>
              )}
              {isInstalled && <span className="pill">Installed</span>}
              <button className="ghost" onClick={() => void signOut()}>
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="content">
        <Outlet />
      </main>

      <nav className="tabs" aria-label="Main navigation">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) => (isActive ? 'tab active' : 'tab')}
            aria-label={tab.label}
          >
            <span role="img" aria-hidden="true" style={{ fontSize: '1.05rem' }}>
              {tab.icon}
            </span>
            <span>{tab.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}