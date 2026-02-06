import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import {
  buildPatterns,
  getProvider,
  storeSuggestionFeedback,
  toEventFromPlan,
  type AIPlan,
} from '../services/ai';

export function AIAssistantPage() {
  const navigate = useNavigate();
  const catalog = useLiveQuery(() => db.gearItems.toArray(), [], []);
  const settings = useLiveQuery(() => db.settings.get('app-settings'), []);

  const [description, setDescription] = useState('');
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [plan, setPlan] = useState<AIPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const summaryCatalog = useMemo(
    () => catalog.map((g) => ({ name: g.name, essential: g.essential, quantity: g.quantity })),
    [catalog],
  );

  async function runQuestions() {
    if (!description.trim() || !settings) return;
    setLoading(true);
    setError('');
    try {
      const patterns = settings.aiLearningEnabled ? await buildPatterns() : [];
      const provider = await getProvider(settings);
      const followups = await provider.getFollowUpQuestions({
        eventDescription: description,
        followUpAnswers: {},
        catalog,
        patterns,
      });
      setQuestions(followups);
      if (followups.length === 0) {
        await generatePlan({});
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI error');
    } finally {
      setLoading(false);
    }
  }

  async function generatePlan(answerMap: Record<string, string>) {
    if (!settings) return;
    setLoading(true);
    setError('');
    try {
      const patterns = settings.aiLearningEnabled ? await buildPatterns() : [];
      const provider = await getProvider(settings);
      const result = await provider.generatePlan({
        eventDescription: description,
        followUpAnswers: answerMap,
        catalog,
        patterns,
      });
      setPlan(result);

      const event = toEventFromPlan(result, {
        eventDescription: description,
        followUpAnswers: answerMap,
        catalog,
        patterns,
      });
      await db.events.add(event);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI generation failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="stack-lg">
      <div className="card stack-md">
        <div className="page-header">
          <div className="page-title-section">
            <h2>AI Pack Assistant</h2>
            <p className="subtle">{catalog.length} items in your catalog</p>
          </div>
        </div>

        <textarea
          className="assistant-prompt"
          placeholder="Describe your event in detail...&#10;&#10;Example: 'Wedding in a dark church, full day coverage from 10am-10pm, hybrid photo/video, need backup equipment, outdoor portraits in the afternoon'"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <div className="row between wrap">
          <span className="subtle">AI will generate a smart packing checklist</span>
          <button onClick={() => void runQuestions()} disabled={loading || !description.trim()}>
            {loading ? 'Thinking…' : 'Generate Checklist'}
          </button>
        </div>

        {error && <p className="error">{error}</p>}
      </div>

      {questions.length > 0 && !plan && (
        <div className="card stack-md">
          <h3>Follow-up Questions</h3>
          <p className="subtle">Answer these to get a more tailored checklist</p>
          {questions.map((q) => (
            <label key={q} className="stack-sm">
              <strong>{q}</strong>
              <input
                value={answers[q] ?? ''}
                onChange={(e) => setAnswers((prev) => ({ ...prev, [q]: e.target.value }))}
              />
            </label>
          ))}
          <button onClick={() => void generatePlan(answers)} disabled={loading}>
            {loading ? 'Generating…' : 'Generate Event & Checklist'}
          </button>
        </div>
      )}

      {plan && (
        <div className="card stack-md">
          <div className="row between wrap">
            <h3>{plan.eventTitle}</h3>
            <button
              onClick={async () => {
                const latest = await db.events.orderBy('createdAt').last();
                if (latest) navigate(`/events/${latest.id}`);
              }}
            >
              Open Event
            </button>
          </div>

          <div className="stack-sm">
            <h4>Recommended Items ({plan.checklist.length})</h4>
            <div className="stack-sm">
              {plan.checklist.map((item) => (
                <div key={`${item.name}-${item.gearItemId ?? 'x'}`} className="checklist-row">
                  <div className="row between wrap">
                    <div className="stack-sm" style={{ flex: 1 }}>
                      <strong>{item.name} × {item.quantity}</strong>
                      <span className="pill">{item.priority}</span>
                    </div>
                    <div className="row">
                      <button
                        className="ghost"
                        onClick={() => void storeSuggestionFeedback(plan.eventType, item.name, true)}
                      >
                        👍 Useful
                      </button>
                      <button
                        className="ghost"
                        onClick={() => void storeSuggestionFeedback(plan.eventType, item.name, false)}
                      >
                        👎 Not useful
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {plan.missingItems.length > 0 && (
            <div className="stack-sm">
              <h4>Missing from Catalog ({plan.missingItems.length})</h4>
              <div className="stack-sm">
                {plan.missingItems.map((item) => (
                  <div key={item.name} className="checklist-row stack-sm">
                    <strong>{item.name}</strong>
                    <p className="subtle">{item.reason}</p>
                    <div className="row wrap">
                      <span className="pill">{item.priority}</span>
                      <span className="pill">{item.action}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            className="ghost"
            onClick={() => {
              localStorage.setItem(
                'gearvault-final-packed-snapshot',
                JSON.stringify({ savedAt: new Date().toISOString(), plan }),
              );
            }}
          >
            Save Snapshot to Local Storage
          </button>
        </div>
      )}

      <div className="card stack-sm">
        <h4>Catalog Summary</h4>
        <p className="subtle">This is the data sent to AI for generating checklists</p>
        <pre className="json-preview">{JSON.stringify(summaryCatalog, null, 2)}</pre>
      </div>
    </section>
  );
}