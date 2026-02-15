import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { 
  buildPatterns, 
  getProvider, 
  toEventFromPlan, 
  sendChatMessage,
  createChatMessage,
  createChatSession,
  saveChatSession,
  loadAllChatSessions,
  deleteChatSession,
  generateChatTitle,
  type AIPlan 
} from '../services/ai';
import { matchCatalogItem } from '../lib/catalogMatcher';
import { groupBySection, priorityLabel } from '../lib/packingHelpers';
import { classifyPendingItems } from '../lib/gearClassifier';
import {
  CatalogMatchReviewSheet,
  type ReviewItem,
} from '../components/CatalogMatchReviewSheet';
import type { GearItem, ChatSession } from '../types/models';
import { useAuth } from '../hooks/useAuth';

// ---------------------------------------------------------------------------
// Example prompts (from reference)
// ---------------------------------------------------------------------------
const EXAMPLE_PROMPTS = [
  'Wedding in a dark church with reception outdoors',
  'Corporate interview with 2 speakers, indoor office',
  'Outdoor portrait session at golden hour',
  'Music video shoot in an industrial warehouse',
  'Travel vlog in rainy weather, 5 days',
  'Product photography for e-commerce',
  'Real estate video tour, 3 properties',
];

const EXAMPLE_QUESTIONS = [
  'What lens should I use for portraits?',
  'How do I get better low-light video?',
  'Which camera is best for travel vlogs?',
  'What gear do I need for a podcast?',
];

type Mode = 'packing' | 'chat';
type Step = 'input' | 'review' | 'results';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function AIAssistantPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const catalog = useLiveQuery(() => db.gearItems.toArray(), [], [] as GearItem[]);
  const settings = useLiveQuery(() => db.settings.get('app-settings'), []);

  // Mode detection
  const [mode, setMode] = useState<Mode>('packing');
  const [input, setInput] = useState('');
  
  // Packing list state
  const [step, setStep] = useState<Step>('input');
  const [plan, setPlan] = useState<AIPlan | null>(null);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [selections, setSelections] = useState<Map<string, string>>(new Map());
  const [saving, setSaving] = useState(false);

  // Chat state
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [showChatDrawer, setShowChatDrawer] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Shared state
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState('');
  const [showExamples, setShowExamples] = useState(false);

  // ---------------------------------------------------------------------------
  // Load chat sessions on mount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    void loadAllChatSessions().then(setChatSessions);
  }, []);

  // ---------------------------------------------------------------------------
  // Auto-scroll chat to bottom
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (mode === 'chat' && currentSession) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [mode, currentSession?.messages.length]);

  // ---------------------------------------------------------------------------
  // Detect mode from input
  // ---------------------------------------------------------------------------
  function detectMode(text: string): Mode {
    const lower = text.toLowerCase().trim();
    
    // Check for question patterns
    if (text.includes('?')) return 'chat';
    if (/^(what|which|how|why|when|where|can|should|is|are|do|does)/i.test(lower)) return 'chat';
    if (/\b(recommend|suggest|advice|help|explain|tell me|compare)\b/i.test(lower)) return 'chat';
    
    // Default to packing list
    return 'packing';
  }

  // ---------------------------------------------------------------------------
  // Handle input submission
  // ---------------------------------------------------------------------------
  async function handleSubmit() {
    if (!input.trim() || loading) return;

    const detectedMode = detectMode(input);
    setMode(detectedMode);

    if (detectedMode === 'chat') {
      await handleChatSubmit();
    } else {
      await handlePackingSubmit();
    }
  }

  // ---------------------------------------------------------------------------
  // Chat: Send message
  // ---------------------------------------------------------------------------
  async function handleChatSubmit() {
    if (!input.trim() || loading) return;

    setLoading(true);
    setError('');
    setIsTyping(true);

    try {
      // Create or update session
      let session = currentSession;
      
      if (!session) {
        const title = generateChatTitle(input);
        session = createChatSession(title);
        setCurrentSession(session);
      }

      // Add user message
      const userMessage = createChatMessage('user', input);
      session.messages.push(userMessage);
      setCurrentSession({ ...session });
      setInput('');

      // Get AI response
      const response = await sendChatMessage(session.messages, catalog);

      // Add assistant message
      const assistantMessage = createChatMessage('assistant', response);
      session.messages.push(assistantMessage);
      session.updatedAt = new Date().toISOString();
      
      setCurrentSession({ ...session });
      
      // Save to database
      await saveChatSession(session);
      
      // Update sessions list
      const sessions = await loadAllChatSessions();
      setChatSessions(sessions);
      
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
      setIsTyping(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Packing: Generate plan
  // ---------------------------------------------------------------------------
  async function handlePackingSubmit() {
    if (!input.trim() || !settings || loading) return;

    setLoading(true);
    setLoadingMessage('Classifying gear items…');
    setError('');

    try {
      // First, classify any pending items
      await classifyPendingItems();
      
      setLoadingMessage('Generating your packing list…');
      
      const patterns = settings.aiLearningEnabled ? await buildPatterns() : [];
      const provider = await getProvider(settings);

      const rawPlan = await provider.generatePlan({
        eventDescription: input,
        catalog,
        patterns,
      });

      // ------------------------------------------------------------------
      // Safety guard: Ensure at least one video-first camera is PRIMARY for video events
      // (allows multiple primaries, which the AI may assign for co-equal cameras)
      // ------------------------------------------------------------------
      const isVideoEvent = /video|interview|corporate/i.test(rawPlan.eventType);
      if (isVideoEvent) {
        const cameraBodies = rawPlan.checklist.filter(item => item.section === 'Camera Bodies');
        
        // Check if at least one video_first camera is already marked as primary
        const hasVideoFirstPrimary = cameraBodies.some(item => {
          const matchedItem = catalog.find(c => c.id === item.gearItemId);
          return matchedItem?.inferredProfile === 'video_first' && item.role === 'primary';
        });
        
        // If not, promote the best video_first camera to primary
        if (!hasVideoFirstPrimary) {
          const videoFirstBody = cameraBodies.find(item => {
            const matchedItem = catalog.find(c => c.id === item.gearItemId);
            return matchedItem?.inferredProfile === 'video_first';
          });
          
          if (videoFirstBody) {
            videoFirstBody.role = 'primary';
          }
        }
      }

      // ------------------------------------------------------------------
      // Client-side catalog matcher
      // ------------------------------------------------------------------
      setLoadingMessage('Matching items to your catalog…');

      const itemsNeedingReview: ReviewItem[] = [];
      const resolvedChecklist: AIPlan['checklist'] = [];
      const lowConfidenceMissing: AIPlan['missingItems'] = [];

      for (const item of rawPlan.checklist) {
        const match = matchCatalogItem(item.name, item.gearItemId, catalog);

        if (match.confidence === 'high') {
          resolvedChecklist.push({
            ...item,
            gearItemId: match.bestMatch?.id ?? item.gearItemId,
          });
        } else if (match.confidence === 'medium') {
          // Queue for user review — placeholder stays gearItemId: null
          itemsNeedingReview.push({
            key: item.name,
            aiName: item.name,
            candidates: match.candidates ?? [],
            quantity: item.quantity,
            notes: item.notes,
            priority: item.priority,
            section: item.section,
          });
          resolvedChecklist.push({ ...item, gearItemId: null });
        } else {
          // Low confidence — move to missing items instead of keeping in checklist
          lowConfidenceMissing.push({
            name: item.name,
            reason: item.notes || 'Recommended for this event but not found in your catalog',
            priority: item.priority,
            action: 'rent', // default to rent for expensive gear
            category: item.section,
          });
        }
      }

      const processedPlan: AIPlan = {
        ...rawPlan,
        checklist: resolvedChecklist,
        missingItems: [...rawPlan.missingItems, ...lowConfidenceMissing],
      };
      setPlan(processedPlan);

      if (itemsNeedingReview.length > 0) {
        setReviewItems(itemsNeedingReview);
        setSelections(new Map());
        setReviewOpen(true);
        setStep('review');
      } else {
        setStep('results');
      }
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Apply user review selections → patch plan → show results
  // ---------------------------------------------------------------------------
  function handleReviewConfirm() {
    if (!plan) return;

    const additionalMissing: AIPlan['missingItems'] = [];

    const updatedChecklist = plan.checklist.map((item) => {
      const userChoice = selections.get(item.name);
      if (!userChoice) return item; // high/low confidence — no change

      if (userChoice === '__MISSING__') {
        additionalMissing.push({
          name: item.name,
          reason: 'Not found in your catalog (confirmed by you)',
          priority: item.priority,
          action: 'borrow',
        });
        return null; // remove from checklist
      }

      return { ...item, gearItemId: userChoice };
    });

    setPlan({
      ...plan,
      checklist: updatedChecklist.filter((i): i is NonNullable<typeof i> => i !== null),
      missingItems: [...plan.missingItems, ...additionalMissing],
    });

    setReviewOpen(false);
    setStep('results');
  }

  // ---------------------------------------------------------------------------
  // Persist event (explicit user action)
  // ---------------------------------------------------------------------------
  async function handleCreateEvent() {
    if (!plan || !settings || saving) return;

    setSaving(true);
    try {
      const patterns = settings.aiLearningEnabled ? await buildPatterns() : [];
      const event = toEventFromPlan(plan, {
        eventDescription: input,
        catalog,
        patterns,
      });

      await db.events.add(event);
      navigate(`/events/${event.id}`);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Chat: New conversation
  // ---------------------------------------------------------------------------
  function handleNewChat() {
    setCurrentSession(null);
    setInput('');
    setError('');
    setMode('packing'); // Reset to default mode
  }

  // ---------------------------------------------------------------------------
  // Chat: Load session
  // ---------------------------------------------------------------------------
  async function handleLoadSession(sessionId: string) {
    const sessions = await loadAllChatSessions();
    const session = sessions.find(s => s.id === sessionId);
    if (session) {
      setCurrentSession(session);
      setMode('chat');
      setShowChatDrawer(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Chat: Delete session
  // ---------------------------------------------------------------------------
  async function handleDeleteSession(sessionId: string) {
    await deleteChatSession(sessionId);
    const sessions = await loadAllChatSessions();
    setChatSessions(sessions);
    if (currentSession?.id === sessionId) {
      handleNewChat();
    }
  }

  // ---------------------------------------------------------------------------
  // Reset packing list
  // ---------------------------------------------------------------------------
  function handleReset() {
    setStep('input');
    setInput('');
    setPlan(null);
    setReviewItems([]);
    setSelections(new Map());
    setError('');
    setLoading(false);
    setMode('packing');
  }

  // ---------------------------------------------------------------------------
  // Derived stats for results header
  // ---------------------------------------------------------------------------
  const resultStats = useMemo(() => {
    if (!plan) return null;
    return {
      totalItems: plan.checklist.length,
      missingCount: plan.missingItems.length,
    };
  }, [plan]);

  // ---------------------------------------------------------------------------
  // Group checklist items by section (memoised)
  // ---------------------------------------------------------------------------
  const groupedItems = useMemo(() => {
    if (!plan) return {};
    return groupBySection(
      plan.checklist.map((i) => ({ ...i, section: i.section ?? 'Misc' })),
    );
  }, [plan]);

  // ---------------------------------------------------------------------------
  // Empty catalog guard
  // ---------------------------------------------------------------------------
  if (catalog.length === 0) {
    return (
      <section className="stack-lg">
        <div className="card stack-md" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem' }}>📷</div>
          <h3>Add gear first</h3>
          <p className="subtle">
            The AI needs your gear catalog to generate smart packing lists and answer questions.
          </p>
          <button onClick={() => navigate('/catalog')}>Go to Catalog</button>
        </div>
      </section>
    );
  }

  // ---------------------------------------------------------------------------
  // Auth guard
  // ---------------------------------------------------------------------------
  if (authLoading) {
    // Loading auth status
    return (
      <section className="stack-lg">
        <div className="card stack-md" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem' }}>🔄</div>
          <p className="subtle">Checking authentication...</p>
        </div>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="stack-lg">
        <div className="card stack-md" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem' }}>🔐</div>
          <h3>Authentication Required</h3>
          <p className="subtle">
            AI features require authentication to keep your data secure.
            Please log in to continue.
          </p>
          <button type="button" onClick={() => navigate('/login')}>Go to Login</button>
        </div>
      </section>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <section className="stack-lg">

      {/* ── CHAT MODE ──────────────────────────────────────────────── */}
      {mode === 'chat' && (
        <div className="card stack-md">
          <div className="page-header">
            <div className="page-title-section">
              <h2>{currentSession ? currentSession.title : 'AI Q&A Chat'}</h2>
              <p className="subtle">Ask questions about your gear</p>
            </div>
            <div className="row" style={{ gap: '0.5rem' }}>
              {currentSession && (
                <button type="button" className="ghost" onClick={handleNewChat}>
                  + New Chat
                </button>
              )}
              <button type="button" className="ghost" onClick={() => setShowChatDrawer(true)}>
                📁 History ({chatSessions.length})
              </button>
            </div>
          </div>

          {/* Chat messages */}
          {currentSession && currentSession.messages.length > 0 && (
            <div className="chat-messages">
              {currentSession.messages
                .filter(m => m.role !== 'system')
                .map((message) => (
                  <div
                    key={message.id}
                    className={`chat-bubble chat-bubble--${message.role}`}
                  >
                    <div className="chat-bubble__content">{message.content}</div>
                    <div className="chat-bubble__timestamp">
                      {new Date(message.timestamp).toLocaleTimeString([], { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </div>
                  </div>
                ))}
              {isTyping && (
                <div className="chat-bubble chat-bubble--assistant">
                  <div className="chat-typing">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          )}

          {/* Empty state */}
          {!currentSession && (
            <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
              <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>💬</div>
              <p className="subtle">Start a new conversation or load a previous chat</p>
              
              {showExamples && (
                <div className="stack-sm" style={{ marginTop: '1rem' }}>
                  <p className="subtle" style={{ fontSize: '0.85rem' }}>Example questions:</p>
                  {EXAMPLE_QUESTIONS.map((ex) => (
                    <button
                      type="button"
                      key={ex}
                      className="ghost example-prompt-btn"
                      onClick={() => {
                        setInput(ex);
                        setShowExamples(false);
                      }}
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Input */}
          <div className="stack-sm">
            {!currentSession && (
              <button
                type="button"
                className="ghost"
                style={{ fontSize: '0.85rem' }}
                onClick={() => setShowExamples((v) => !v)}
              >
                {showExamples ? '▲ Hide examples' : '▼ Show example questions'}
              </button>
            )}

            <textarea
              className="assistant-prompt"
              placeholder="Ask a question about your gear..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleSubmit();
                }
              }}
              disabled={loading}
              rows={3}
            />

            <div className="row between wrap">
              <span className="subtle">
                {currentSession 
                  ? `${currentSession.messages.filter(m => m.role !== 'system').length} messages`
                  : 'AI will answer based on your catalog'
                }
              </span>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={loading || !input.trim()}
            >
              {loading ? 'Thinking…' : 'Send'}
            </button>
            </div>

            {error && <p className="error">{error}</p>}
          </div>
        </div>
      )}

      {/* ── PACKING MODE: INPUT ────────────────────────────────────── */}
      {mode === 'packing' && step === 'input' && (
        <div className="card stack-md">
          <div className="page-header">
            <div className="page-title-section">
              <h2>AI Pack Assistant</h2>
              <p className="subtle">{catalog.length} items in your catalog</p>
            </div>
            <button type="button" className="ghost" onClick={() => setMode('chat')}>
              💬 Q&A Chat
            </button>
          </div>

          <textarea
            className="assistant-prompt"
            placeholder={'Describe your shoot…\n\nExample: "Wedding in a dark church, full-day coverage, hybrid photo/video, outdoor portraits in the afternoon"'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
            rows={5}
          />

          <div>
            <button
              type="button"
              className="ghost"
              style={{ fontSize: '0.85rem' }}
              onClick={() => setShowExamples((v) => !v)}
            >
              {showExamples ? '▲ Hide examples' : '▼ Show example prompts'}
            </button>

            {showExamples && (
              <div className="stack-sm" style={{ marginTop: '0.75rem' }}>
                {EXAMPLE_PROMPTS.map((ex) => (
                  <button
                    type="button"
                    key={ex}
                    className="ghost example-prompt-btn"
                    onClick={() => {
                      setInput(ex);
                      setShowExamples(false);
                    }}
                  >
                    {ex}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="row between wrap">
            <span className="subtle">AI will generate a smart packing checklist</span>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={loading || !input.trim()}
            >
              {loading ? loadingMessage || 'Thinking…' : '✦ Generate Checklist'}
            </button>
          </div>

          {error && <p className="error">{error}</p>}
        </div>
      )}

      {/* ── LOADING INDICATOR ─────────────────────────────────────── */}
      {loading && mode === 'packing' && (
        <div className="card stack-sm" style={{ textAlign: 'center', padding: '2rem' }}>
          <div className="ai-spinner">✦</div>
          <p className="subtle" style={{ marginTop: '0.75rem' }}>{loadingMessage}</p>
        </div>
      )}

      {/* ── PACKING MODE: RESULTS ──────────────────────────────────── */}
      {mode === 'packing' && step === 'results' && plan && !loading && (
        <div className="stack-lg">

          {/* Header */}
          <div className="ai-results-header card">
            <div className="row between wrap">
              <div>
                <h2 style={{ margin: 0 }}>{plan.eventTitle}</h2>
                <p className="subtle" style={{ margin: '0.25rem 0 0' }}>{plan.eventType}</p>
              </div>
              <button type="button" className="ghost" onClick={handleReset} style={{ fontSize: '0.85rem' }}>
                ← New prompt
              </button>
            </div>
            {resultStats && (
              <p className="subtle" style={{ fontSize: '0.8rem', marginTop: '0.5rem', marginBottom: 0 }}>
                {resultStats.totalItems} items from your catalog
                {resultStats.missingCount > 0 && (
                  <> · {resultStats.missingCount} suggested additions</>
                )}
              </p>
            )}
          </div>

          {/* Packing list by section */}
          {Object.entries(groupedItems).map(([section, items]) => (
            <div key={section} className="card stack-sm">
              <h4 className="section-heading">{section}</h4>
              <div className="stack-sm">
                {items.map((item) => {
                  const showRoleBadge = (section === 'Camera Bodies' || section === 'Audio') && 
                                        item.role && 
                                        item.role !== 'standard';
                  
                  return (
                    <div key={`${item.name}-${item.gearItemId ?? 'x'}`} className="ai-item-row">
                      <div className="row between wrap" style={{ gap: '0.5rem' }}>
                        <div style={{ flex: 1 }}>
                          <div className="row wrap" style={{ gap: '0.4rem', alignItems: 'center' }}>
                            <strong>{item.name}</strong>
                            {item.quantity > 1 && (
                              <span className="subtle">×{item.quantity}</span>
                            )}
                            {showRoleBadge && (
                              <span className={`pill-role ${item.role}`}>
                                {item.role}
                              </span>
                            )}
                            {item.gearItemId && (
                              <span className="pill pill--success" style={{ fontSize: '0.65rem' }}>✓ matched</span>
                            )}
                          </div>
                          {item.notes && (
                            <p className="subtle" style={{ fontSize: '0.78rem', marginTop: '0.2rem', marginBottom: 0 }}>
                              {item.notes}
                            </p>
                          )}
                        </div>
                        <span className={`pill priority-${item.priority}`}>
                          {priorityLabel(item.priority)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Missing items */}
          {plan.missingItems.length > 0 && (
            <div className="card stack-sm">
              <h4 className="section-heading section-heading--missing">
                ⚠ Consider buying / borrowing / renting
              </h4>
              <div className="stack-sm">
                {[...plan.missingItems]
                  .sort((a, b) => {
                    const r: Record<string, number> = { 'must-have': 0, 'nice-to-have': 1, optional: 2 };
                    return (r[a.priority] ?? 2) - (r[b.priority] ?? 2);
                  })
                  .map((item) => (
                    <div key={item.name} className="ai-missing-row">
                      <div className="row between wrap" style={{ gap: '0.5rem' }}>
                        <div style={{ flex: 1 }}>
                          <strong>{item.name}</strong>
                          <p className="subtle" style={{ fontSize: '0.78rem', marginTop: '0.2rem', marginBottom: 0 }}>
                            {item.reason}
                          </p>
                          {item.notes && (
                            <p className="subtle" style={{ fontSize: '0.75rem', marginTop: '0.15rem', marginBottom: 0 }}>
                              Est. cost: {item.notes}
                            </p>
                          )}
                        </div>
                        <div className="stack-sm" style={{ alignItems: 'flex-end', gap: '0.25rem' }}>
                          <span className={`pill priority-${item.priority}`}>
                            {priorityLabel(item.priority)}
                          </span>
                          <span className="pill pill--action">{item.action}</span>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Pro tips */}
          {plan.tips && plan.tips.length > 0 && (
            <div className="card stack-sm ai-tips">
              <h4 style={{ marginBottom: '0.5rem' }}>Pro Tips</h4>
              <ul style={{ paddingLeft: '1.2rem', margin: 0 }}>
                {plan.tips.map((tip, i) => (
                  <li key={i} className="subtle" style={{ fontSize: '0.85rem', marginBottom: '0.4rem' }}>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Create event CTA */}
          <div className="card stack-sm">
            <h4 style={{ marginBottom: '0.25rem' }}>Ready to pack?</h4>
            <p className="subtle" style={{ marginBottom: '1rem' }}>
              Create an event to save this as a checklist you can tick off while packing.
            </p>
              <button
                type="button"
                onClick={() => void handleCreateEvent()}
                disabled={saving}
                style={{ width: '100%' }}
              >
              {saving ? 'Creating event…' : 'Create Event & Checklist →'}
            </button>
          </div>

          {error && <p className="error">{error}</p>}
        </div>
      )}

      {/* ── CHAT DRAWER ──────────────────────────────────────────── */}
      {showChatDrawer && (
        <>
          <div className="sheet-overlay" onClick={() => setShowChatDrawer(false)} />
          <div className="chat-drawer">
            <div className="chat-drawer__header">
              <h3>Chat History</h3>
              <button type="button" className="ghost" onClick={() => setShowChatDrawer(false)}>
                ✕
              </button>
            </div>
            <div className="chat-drawer__content">
              {chatSessions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                  <p className="subtle">No chat history yet</p>
                </div>
              ) : (
                <div className="stack-sm">
                  {chatSessions.map((session) => (
                    <div key={session.id} className="chat-session-item">
                      <button
                        type="button"
                        className="chat-session-btn"
                        onClick={() => void handleLoadSession(session.id)}
                      >
                        <div>
                          <div className="chat-session-title">{session.title}</div>
                          <div className="chat-session-meta">
                            {session.messages.filter(m => m.role !== 'system').length} messages · {' '}
                            {new Date(session.updatedAt).toLocaleDateString()}
                          </div>
                        </div>
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => void handleDeleteSession(session.id)}
                        style={{ padding: '0.5rem' }}
                      >
                        🗑
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="chat-drawer__footer">
              <button type="button" onClick={handleNewChat} style={{ width: '100%' }}>
                + New Chat
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── REVIEW SHEET ──────────────────────────────────────────── */}
      <CatalogMatchReviewSheet
        open={reviewOpen}
        items={reviewItems}
        selections={selections}
        onSelect={(key, value) =>
          setSelections((prev) => new Map(prev).set(key, value))
        }
        onConfirm={handleReviewConfirm}
        onCancel={() => {
          setReviewOpen(false);
          setStep('results');
        }}
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function friendlyError(e: unknown): string {
  if (!(e instanceof Error)) return 'Something went wrong. Please try again.';
  if (e.message.includes('401')) return 'Invalid API key. Check Settings → AI Provider.';
  if (e.message.includes('429')) return 'Rate limit reached. Wait a moment and try again.';
  if (!navigator.onLine) return 'No internet connection. AI features require online access.';
  return e.message;
}
