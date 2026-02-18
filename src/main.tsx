import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { AuthProvider } from './hooks/useAuth';
import './index.css';

// Register service worker with autoUpdate strategy
registerSW({
  immediate: true,
  onRegistered() {
    console.info('PackShot service worker registered');
  },
  onNeedRefresh() {
    console.info('[PWA] New version detected, auto-updating...');
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
