import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { db } from '../db';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { initializeUserData, syncNow } from '../services/sync';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isConfigured: boolean;
  syncMessage: string;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);
  const [syncingData, setSyncingData] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const configured = isSupabaseConfigured();

  useEffect(() => {
    if (!configured) {
      setBooting(false);
      return;
    }

    // On startup: refresh the session to ensure tokens are valid.
    // This handles: expired access token + valid refresh token → silently refreshed.
    // If refresh token is also dead → fails → clear session → user sees login.
    void supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        // Session exists in localStorage — refresh it to ensure tokens are valid
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError || !refreshData.session) {
          // Session refresh failed (both tokens likely expired) — clear it locally
          console.warn('[Auth] Session refresh failed on startup, clearing stale session');
          await supabase.auth.signOut({ scope: 'local' }); // clear local only, no server call
          setSession(null);
        } else {
          // Session refreshed successfully, proceed with fresh tokens
          setSession(refreshData.session);
        }
      } else {
        setSession(null);
      }
      setBooting(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => data.subscription.unsubscribe();
  }, [configured]);

  useEffect(() => {
    if (!configured || !session?.user) return;

    void (async () => {
      const settings = await db.settings.get('app-settings');
      if (settings?.syncEnabled === false) {
        setSyncMessage('Cloud sync is disabled in settings.');
        return;
      }

      setSyncingData(true);
      setSyncMessage('Syncing your cloud data...');
      try {
        const result = await initializeUserData(session.user.id);
        if (result.mode === 'pulled-cloud-to-local') {
          setSyncMessage('Cloud data loaded.');
        } else {
          setSyncMessage('Local data uploaded to cloud.');
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Could not initialize cloud sync.';
        setSyncMessage(message);
      } finally {
        setSyncingData(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured, session?.user?.id]);

  useEffect(() => {
    if (!configured || !session?.user) return;

    const runSync = async () => {
      if (!navigator.onLine) return;
      try {
        const settings = await db.settings.get('app-settings');
        if (settings?.syncEnabled === false) return;
        await syncNow(session.user.id);
        setSyncMessage(`Last sync: ${new Date().toLocaleTimeString()}`);
      } catch {
        // keep app usable even if temporary sync fails
      }
    };

    const interval = window.setInterval(() => {
      void runSync();
    }, 30_000);

    const onOnline = () => {
      void runSync();
    };

    window.addEventListener('online', onOnline);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('online', onOnline);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured, session?.user?.id]);

  // Refresh session when app comes back to foreground (e.g., after backgrounding on mobile)
  // This prevents "session expired" errors when user locks phone or switches apps.
  // We only refresh if the token is within 2 minutes of expiry to avoid triggering
  // unnecessary onAuthStateChange events (which previously caused a full re-sync + splash).
  useEffect(() => {
    if (!configured) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      void supabase.auth.getSession().then(({ data }) => {
        if (!data.session) return;
        try {
          const payload = JSON.parse(atob(data.session.access_token.split('.')[1]));
          const msUntilExpiry = payload.exp * 1000 - Date.now();
          if (msUntilExpiry < 120_000) {
            // Token expires in < 2 minutes — refresh proactively
            console.log('[Auth] Token near expiry, refreshing...');
            void supabase.auth.refreshSession().then(({ error }) => {
              if (error) console.warn('[Auth] Foreground refresh failed:', error);
              else console.log('[Auth] Foreground refresh successful');
            });
          }
          // Otherwise token is still valid — no refresh needed, no re-render triggered
        } catch {
          // Malformed token — ignore, let the next API call handle it
        }
      });
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [configured]);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function signUp(email: string, password: string) {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    if (!data.session) {
      return 'Check your email to confirm your account before logging in.';
    }
    return null;
  }

  async function signOut() {
    if (session?.user) {
      try {
        const settings = await db.settings.get('app-settings');
        if (settings?.syncEnabled !== false) {
          await syncNow(session.user.id);
        }
      } catch {
        // no-op
      }
    }
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setSyncMessage('');
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading: booting,           // splash only on cold boot — background syncs never unmount the UI
      isConfigured: configured,
      syncMessage,
      signIn,
      signUp,
      signOut,
    }),
    [session, booting, syncingData, configured, syncMessage],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}
