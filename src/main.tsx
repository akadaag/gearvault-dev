import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { AuthProvider } from './hooks/useAuth';
import './index.css';

const updateSW = registerSW({
  immediate: true,
  onRegistered() {
    console.info('GearVault service worker registered');
  },
  onNeedRefresh() {
    // Notify user that an update is available
    if (confirm('A new version of GearVault is available. Update now?')) {
      updateSW(true);
    }
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
