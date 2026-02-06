import { Navigate, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { TabLayout } from './components/TabLayout';
import { AIAssistantPage } from './pages/AIAssistantPage';
import { CatalogPage } from './pages/CatalogPage';
import { EventDetailPage } from './pages/EventDetailPage';
import { EventsPage } from './pages/EventsPage';
import { GearItemDetailPage } from './pages/GearItemDetailPage';
import { SettingsPage } from './pages/SettingsPage';

function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route element={<TabLayout />}>
          <Route path="/" element={<Navigate to="/catalog" replace />} />
          <Route path="/catalog" element={<CatalogPage />} />
          <Route path="/catalog/item/:id" element={<GearItemDetailPage />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/events/:id" element={<EventDetailPage />} />
          <Route path="/assistant" element={<AIAssistantPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}

export default App;
