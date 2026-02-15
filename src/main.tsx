import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { AuthProvider } from './hooks/useAuth';
import './index.css';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
void registerSW({
  immediate: true,
  onRegistered() {
    console.info('GearVault service worker registered');
  },
  onNeedRefresh() {
    // New version available — accept silently, activates on next navigation/reload.
    // IMPORTANT: Do NOT use confirm() here — in PWA standalone mode on mobile,
    // synchronous dialogs can trigger blank screens or apparent page reloads.
    // Do NOT call updateSW(true) either — it forces an immediate reload, which is
    // jarring mid-session. The new SW will activate naturally on next app launch.
    console.info('[PWA] New version available, will activate on next app launch.');
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
);
