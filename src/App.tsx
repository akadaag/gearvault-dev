import { Navigate, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { TabLayout } from './components/TabLayout';
import { useAuth } from './hooks/useAuth';
import { AIAssistantPage } from './pages/AIAssistantPage';
import { CatalogPage } from './pages/CatalogPage';
import { EventDetailPage } from './pages/EventDetailPage';
import { EventsPage } from './pages/EventsPage';
import { GearItemDetailPage } from './pages/GearItemDetailPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { SettingsPage } from './pages/SettingsPage';

function App() {
  const { loading, user, isConfigured } = useAuth();

  if (loading) {
    return (
      <div className="splash-screen">
        <img src="/white-logo.webp" alt="" className="splash-logo" />
      </div>
    );
  }

  if (!isConfigured) {
    return (
      <main className="content">
        <div className="card stack-sm">
          <h2>Supabase setup required</h2>
          <p className="subtle">Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment to enable login and cloud sync.</p>
        </div>
      </main>
    );
  }

  return (
    <ErrorBoundary>
      <Routes>
        {!user ? (
          <>
            <Route path="/login" element={<LoginPage />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </>
        ) : (
          <Route element={<TabLayout />}>
            <Route path="/" element={<Navigate to="/home" replace />} />
            <Route path="/home" element={<HomePage />} />
            <Route path="/catalog" element={<CatalogPage />} />
            <Route path="/catalog/item/:id" element={<GearItemDetailPage />} />
            <Route path="/events" element={<EventsPage />} />
            <Route path="/events/:id" element={<EventDetailPage />} />
            <Route path="/assistant" element={<AIAssistantPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/home" replace />} />
          </Route>
        )}
      </Routes>
    </ErrorBoundary>
  );
}

export default App;
