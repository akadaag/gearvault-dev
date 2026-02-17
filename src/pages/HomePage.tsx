import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { formatMoney } from '../lib/format';

export function HomePage() {
  const navigate = useNavigate();
  const settings = useLiveQuery(() => db.settings.get('app-settings'));
  const gearItems = useLiveQuery(() => db.gearItems.toArray(), []);
  const events = useLiveQuery(() => db.events.toArray(), []);
  const categories = useLiveQuery(() => db.categories.toArray(), []);
  
  const [showNamePrompt, setShowNamePrompt] = useState(true);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);

  // Time of day greeting
  const hour = new Date().getHours();
  let greeting = 'Good morning';
  if (hour >= 12 && hour < 17) greeting = 'Good afternoon';
  else if (hour >= 17 && hour < 21) greeting = 'Good evening';
  else if (hour >= 21 || hour < 5) greeting = 'Good night';

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric'
  });

  // Stats
  const totalItems = gearItems?.length ?? 0;
  const totalValue = gearItems?.reduce((sum, item) => {
    return sum + (item.purchasePrice?.amount ?? 0);
  }, 0) ?? 0;
  const totalCategories = categories?.length ?? 0;

  // Next upcoming event
  const now = new Date();
  const upcomingEvents = events
    ?.filter(e => e.dateTime && new Date(e.dateTime) >= now)
    .sort((a, b) => new Date(a.dateTime!).getTime() - new Date(b.dateTime!).getTime()) ?? [];
  const nextEvent = upcomingEvents[0];

  // Calculate packing progress for next event
  let packingProgress = 0;
  let packedCount = 0;
  let totalCount = 0;
  if (nextEvent) {
    totalCount = nextEvent.packingChecklist.length;
    packedCount = nextEvent.packingChecklist.filter(item => item.packed).length;
    packingProgress = totalCount > 0 ? Math.round((packedCount / totalCount) * 100) : 0;
  }

  // Days until next event
  let daysUntil = 0;
  let urgencyClass = '';
  if (nextEvent?.dateTime) {
    const eventDate = new Date(nextEvent.dateTime);
    daysUntil = Math.ceil((eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntil <= 2) urgencyClass = 'urgent';
    else if (daysUntil <= 7) urgencyClass = 'soon';
    else urgencyClass = 'later';
  }

  // Essential items
  const essentialItems = gearItems?.filter(item => item.essential) ?? [];

  // Recently added items
  const recentItems = gearItems
    ?.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 4) ?? [];

  // Packing alerts (events with incomplete packing)
  const packingAlerts = upcomingEvents
    .map(event => {
      const total = event.packingChecklist.length;
      const packed = event.packingChecklist.filter(item => item.packed).length;
      const missing = total - packed;
      const eventDate = new Date(event.dateTime!);
      const days = Math.ceil((eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return { event, missing, days, total, packed };
    })
    .filter(alert => alert.missing > 0 && alert.days <= 14)
    .sort((a, b) => a.days - b.days);

  async function handleSaveName() {
    if (!nameInput.trim()) return;
    setSavingName(true);
    try {
      await db.settings.update('app-settings', { displayName: nameInput.trim() });
      setShowNamePrompt(false);
    } catch (error) {
      console.error('Failed to save name:', error);
    } finally {
      setSavingName(false);
    }
  }

  function getCategoryIcon(categoryId: string) {
    const category = categories?.find(c => c.id === categoryId);
    const name = category?.name ?? '';
    // Simple icon mapping
    if (name.toLowerCase().includes('camera')) return '📷';
    if (name.toLowerCase().includes('lens')) return '🔭';
    if (name.toLowerCase().includes('light')) return '💡';
    if (name.toLowerCase().includes('audio') || name.toLowerCase().includes('mic')) return '🎤';
    if (name.toLowerCase().includes('support') || name.toLowerCase().includes('tripod')) return '📐';
    if (name.toLowerCase().includes('power') || name.toLowerCase().includes('batter')) return '🔋';
    return '📦';
  }

  return (
    <section className="home-page">
      {/* Welcome Header */}
      <div className="home-header">
        <h1 className="home-title">Home</h1>
        <p className="home-greeting">
          {greeting}{settings?.displayName ? `, ${settings.displayName}` : ''}
        </p>
        <p className="home-date">{today}</p>
      </div>

      {/* Name Prompt (first-run) */}
      {showNamePrompt && !settings?.displayName && (
        <div className="home-name-prompt card">
          <p className="home-name-prompt-label">What should we call you?</p>
          <div className="home-name-prompt-input-row">
            <input
              type="text"
              placeholder="Your name"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSaveName();
              }}
              disabled={savingName}
            />
            <button onClick={() => void handleSaveName()} disabled={savingName || !nameInput.trim()}>
              {savingName ? 'Saving...' : 'Save'}
            </button>
            <button className="ghost" onClick={() => setShowNamePrompt(false)}>
              Skip
            </button>
          </div>
        </div>
      )}

      {/* Next Event Card */}
      {nextEvent ? (
        <div
          className="home-next-event card"
          onClick={() => navigate(`/events/${nextEvent.id}`)}
        >
          <div className="home-next-event-header">
            <h2 className="home-next-event-title">{nextEvent.title}</h2>
            <span className="pill">{nextEvent.type}</span>
          </div>
          
          <div className="home-next-event-meta">
            {nextEvent.dateTime && (
              <span>
                {new Date(nextEvent.dateTime).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit'
                })}
              </span>
            )}
            {nextEvent.location && <span>• {nextEvent.location}</span>}
          </div>

          <div className={`home-next-event-countdown ${urgencyClass}`}>
            {daysUntil === 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : `${daysUntil} days away`}
          </div>

          <div className="home-next-event-progress">
            <div className="home-progress-bar">
              <div className="home-progress-fill" style={{ width: `${packingProgress}%` }} />
            </div>
            <p className="home-progress-label">
              {packedCount}/{totalCount} items packed ({packingProgress}%)
            </p>
          </div>
        </div>
      ) : (
        <div className="home-next-event card empty">
          <p>No upcoming events</p>
          <button onClick={() => navigate('/events?add=1')}>Plan a shoot</button>
        </div>
      )}

      {/* Quick Actions */}
      <div className="home-quick-actions">
        <button className="home-action-card" onClick={() => navigate('/catalog?add=1')}>
          <div className="home-action-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </div>
          <span className="home-action-label">Add Gear</span>
        </button>

        <button className="home-action-card" onClick={() => navigate('/events?add=1')}>
          <div className="home-action-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
              <line x1="12" y1="14" x2="12" y2="18" />
              <line x1="10" y1="16" x2="14" y2="16" />
            </svg>
          </div>
          <span className="home-action-label">New Event</span>
        </button>

        <button className="home-action-card" onClick={() => navigate('/assistant')}>
          <div className="home-action-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 3 L14.5 8.5 L20 9.5 L16 13.5 L17 19 L12 16.5 L7 19 L8 13.5 L4 9.5 L9.5 8.5 Z" />
            </svg>
          </div>
          <span className="home-action-label">Ask AI</span>
        </button>
      </div>

      {/* Essentials Quick Access */}
      {essentialItems.length > 0 && (
        <div className="home-section">
          <div className="home-section-header">
            <h3>
              <span style={{ color: 'var(--warning)' }}>⭐</span> Essentials
            </h3>
            <button className="text-btn" onClick={() => navigate('/catalog?qf=essential')}>
              See All
            </button>
          </div>
          <div className="home-essentials-scroll">
            {essentialItems.map(item => (
              <div
                key={item.id}
                className="home-essential-card"
                onClick={() => navigate(`/catalog/item/${item.id}`)}
              >
                {item.photo ? (
                  <img src={item.photo} alt={item.name} className="home-essential-photo" />
                ) : (
                  <div className="home-essential-photo-placeholder">
                    {getCategoryIcon(item.categoryId)}
                  </div>
                )}
                <p className="home-essential-name">{item.name}</p>
                <p className="home-essential-category">
                  {categories?.find(c => c.id === item.categoryId)?.name ?? 'Gear'}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Packing Alerts */}
      {packingAlerts.length > 0 && (
        <div className="home-section">
          <div className="home-section-header">
            <h3>Packing Alerts</h3>
          </div>
          <div className="stack-sm">
            {packingAlerts.map(alert => (
              <div
                key={alert.event.id}
                className="home-alert-card card"
                onClick={() => navigate(`/events/${alert.event.id}`)}
              >
                <div className="home-alert-content">
                  <div>
                    <p className="home-alert-title">{alert.event.title}</p>
                    <p className="home-alert-meta subtle">
                      {alert.event.dateTime && new Date(alert.event.dateTime).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric'
                      })} • {alert.days === 0 ? 'Today' : alert.days === 1 ? 'Tomorrow' : `${alert.days} days`}
                    </p>
                  </div>
                  <div className={`home-alert-badge ${alert.days <= 2 ? 'urgent' : 'warning'}`}>
                    {alert.missing} item{alert.missing !== 1 ? 's' : ''} needed
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gear Overview */}
      <div className="home-gear-overview">
        <div className="home-stat-card card" onClick={() => navigate('/catalog')}>
          <p className="home-stat-value">{totalItems}</p>
          <p className="home-stat-label">Items</p>
        </div>
        <div className="home-stat-card card" onClick={() => navigate('/catalog')}>
          <p className="home-stat-value">
            {formatMoney(totalValue, settings?.defaultCurrency ?? 'EUR')}
          </p>
          <p className="home-stat-label">Total Value</p>
        </div>
        <div className="home-stat-card card" onClick={() => navigate('/catalog')}>
          <p className="home-stat-value">{totalCategories}</p>
          <p className="home-stat-label">Categories</p>
        </div>
      </div>

      {/* Recently Added */}
      {recentItems.length > 0 && (
        <div className="home-section">
          <div className="home-section-header">
            <h3>Recently Added</h3>
            <button className="text-btn" onClick={() => navigate('/catalog')}>
              View All
            </button>
          </div>
          <div className="stack-sm">
            {recentItems.map(item => (
              <div
                key={item.id}
                className="home-recent-item card"
                onClick={() => navigate(`/catalog/item/${item.id}`)}
              >
                <div className="home-recent-item-content">
                  {item.photo ? (
                    <img src={item.photo} alt={item.name} className="home-recent-photo" />
                  ) : (
                    <div className="home-recent-photo-placeholder">
                      {getCategoryIcon(item.categoryId)}
                    </div>
                  )}
                  <div className="home-recent-info">
                    <p className="home-recent-name">{item.name}</p>
                    <p className="home-recent-meta subtle">
                      {categories?.find(c => c.id === item.categoryId)?.name ?? 'Gear'} •{' '}
                      {new Date(item.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric'
                      })}
                    </p>
                  </div>
                </div>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
