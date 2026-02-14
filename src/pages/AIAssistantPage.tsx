import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { buildPatterns, getProvider, toEventFromPlan, type AIPlan } from '../services/ai';
import { matchCatalogItem } from '../lib/catalogMatcher';
import { groupBySection, priorityLabel } from '../lib/packingHelpers';
import { classifyPendingItems } from '../lib/gearClassifier';
import {
  CatalogMatchReviewSheet,
  type ReviewItem,
} from '../components/CatalogMatchReviewSheet';
import type { GearItem } from '../types/models';

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

type Step = 'input' | 'questions' | 'review' | 'results';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function AIAssistantPage() {
  const navigate = useNavigate();
  const catalog = useLiveQuery(() => db.gearItems.toArray(), [], [] as GearItem[]);
  const settings = useLiveQuery(() => db.settings.get('app-settings'), []);

  // Step control
  const [step, setStep] = useState<Step>('input');

  // Input
  const [prompt, setPrompt] = useState('');
  const [showExamples, setShowExamples] = useState(false);

  // Follow-up questions
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  // Generated plan (raw from AI + matcher applied)
  const [plan, setPlan] = useState<AIPlan | null>(null);

  // Review sheet state
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [selections, setSelections] = useState<Map<string, string>>(new Map());

  // Save / loading state
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState('');

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
  // STEP 1: Ask for follow-up questions
  // ---------------------------------------------------------------------------
  async function handleGenerate() {
    if (!prompt.trim() || !settings || loading) return;

    setLoading(true);
    setLoadingMessage('Analysing your event…');
    setError('');

    try {
      const patterns = settings.aiLearningEnabled ? await buildPatterns() : [];
      const provider = await getProvider(settings);

      const followups = await provider.getFollowUpQuestions({
        eventDescription: prompt,
        followUpAnswers: {},
        catalog,
        patterns,
      });

      if (followups.length > 0) {
        setQuestions(followups);
        setAnswers({});
        setStep('questions');
      } else {
        // Enough info — go straight to plan generation
        await runGeneratePlan({});
      }
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // STEP 2: Generate plan (after questions answered, or directly)
  // ---------------------------------------------------------------------------
  async function runGeneratePlan(answerMap: Record<string, string>) {
    if (!settings) return;

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
        eventDescription: prompt,
        followUpAnswers: answerMap,
        catalog,
        patterns,
      });

      // ------------------------------------------------------------------
      // Safety guard: Ensure video-first camera is PRIMARY for video events
      // ------------------------------------------------------------------
      const isVideoEvent = /video|interview|corporate/i.test(rawPlan.eventType);
      if (isVideoEvent) {
        const cameraBodies = rawPlan.checklist.filter(item => item.section === 'Camera Bodies');
        const videoFirstBody = cameraBodies.find(item => {
          const matchedItem = catalog.find(c => c.id === item.gearItemId);
          return matchedItem?.inferredProfile === 'video_first';
        });
        
        if (videoFirstBody && videoFirstBody.role !== 'primary') {
          // Find current primary and swap roles
          const currentPrimary = cameraBodies.find(item => item.role === 'primary');
          if (currentPrimary) {
            currentPrimary.role = videoFirstBody.role || 'standard';
          }
          videoFirstBody.role = 'primary';
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
  // STEP 3: Apply user review selections → patch plan → show results
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
  // STEP 4: Persist event (explicit user action)
  // ---------------------------------------------------------------------------
  async function handleCreateEvent() {
    if (!plan || !settings || saving) return;

    setSaving(true);
    try {
      const patterns = settings.aiLearningEnabled ? await buildPatterns() : [];
      const event = toEventFromPlan(plan, {
        eventDescription: prompt,
        followUpAnswers: answers,
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
  // Reset
  // ---------------------------------------------------------------------------
  function handleReset() {
    setStep('input');
    setPrompt('');
    setQuestions([]);
    setAnswers({});
    setPlan(null);
    setReviewItems([]);
    setSelections(new Map());
    setError('');
    setLoading(false);
  }

  // ---------------------------------------------------------------------------
  // Group checklist items by section (memoised)
  // Must be above the early return so hooks are called in consistent order.
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
            The AI needs your gear catalog to generate smart packing lists.
          </p>
          <button onClick={() => navigate('/catalog')}>Go to Catalog</button>
        </div>
      </section>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <section className="stack-lg">

      {/* ── INPUT + QUESTIONS ─────────────────────────────────────── */}
      {(step === 'input' || step === 'questions') && (
        <div className="card stack-md">
          <div className="page-header">
            <div className="page-title-section">
              <h2>AI Pack Assistant</h2>
              <p className="subtle">{catalog.length} items in your catalog</p>
            </div>
          </div>

          {step === 'input' && (
            <>
              <textarea
                className="assistant-prompt"
                placeholder={'Describe your shoot…\n\nExample: "Wedding in a dark church, full-day coverage, hybrid photo/video, outdoor portraits in the afternoon"'}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={loading}
              />

              <div>
                <button
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
                        key={ex}
                        className="ghost example-prompt-btn"
                        onClick={() => {
                          setPrompt(ex);
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
                  onClick={() => void handleGenerate()}
                  disabled={loading || !prompt.trim()}
                >
                  {loading ? loadingMessage || 'Thinking…' : '✦ Generate Checklist'}
                </button>
              </div>

              {error && <p className="error">{error}</p>}
            </>
          )}

          {step === 'questions' && (
            <>
              <p className="subtle">
                A few quick questions to improve accuracy:
              </p>

              {questions.map((q) => (
                <label key={q} className="stack-sm">
                  <strong>{q}</strong>
                  <input
                    value={answers[q] ?? ''}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [q]: e.target.value }))}
                    placeholder="Your answer…"
                  />
                </label>
              ))}

              <div className="row between wrap">
                <button className="ghost" onClick={handleReset} disabled={loading}>
                  ← Back
                </button>
                <button
                  onClick={() => void runGeneratePlan(answers)}
                  disabled={loading}
                >
                  {loading ? loadingMessage || 'Generating…' : 'Generate Packing List →'}
                </button>
              </div>

              {error && <p className="error">{error}</p>}
            </>
          )}
        </div>
      )}

      {/* ── LOADING INDICATOR ─────────────────────────────────────── */}
      {loading && (
        <div className="card stack-sm" style={{ textAlign: 'center', padding: '2rem' }}>
          <div className="ai-spinner">✦</div>
          <p className="subtle" style={{ marginTop: '0.75rem' }}>{loadingMessage}</p>
        </div>
      )}

      {/* ── RESULTS ───────────────────────────────────────────────── */}
      {step === 'results' && plan && !loading && (
        <div className="stack-lg">

          {/* Header */}
          <div className="ai-results-header card">
            <div className="row between wrap">
              <div>
                <h2 style={{ margin: 0 }}>{plan.eventTitle}</h2>
                <p className="subtle" style={{ margin: '0.25rem 0 0' }}>{plan.eventType}</p>
              </div>
              <button className="ghost" onClick={handleReset} style={{ fontSize: '0.85rem' }}>
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
