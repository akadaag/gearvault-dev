import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';

export function useTheme() {
  const settings = useLiveQuery(() => db.settings.get('app-settings'), []);

  useEffect(() => {
    const root = document.documentElement;
    const preference = settings?.theme ?? 'system';
    const isDark =
      preference === 'dark' ||
      (preference === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    root.classList.toggle('dark', isDark);
    root.classList.toggle('light', !isDark);
  }, [settings?.theme]);
}
