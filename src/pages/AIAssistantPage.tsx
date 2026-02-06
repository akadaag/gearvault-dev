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
        <h2>AI Pack Assistant</h2>
        <p className="subtle">
          Describe the event. GearVault asks up to 3 concise follow-up questions, then builds a
          structured list.
        </p>
        <textarea
          placeholder="e.g. wedding in a dark church, hybrid coverage, long day"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <button onClick={() => void runQuestions()} disabled={loading || !description.trim()}>
          {loading ? 'Thinking…' : 'Start AI packing'}
        </button>
        {error && <p className="error">{error}</p>}
      </div>

      {questions.length > 0 && !plan && (
        <div className="card stack-md">
          <h3>Follow-up questions</h3>
          {questions.map((q) => (
            <label key={q}>
              {q}
              <input
                value={answers[q] ?? ''}
                onChange={(e) => setAnswers((prev) => ({ ...prev, [q]: e.target.value }))}
              />
            </label>
          ))}
          <button onClick={() => void generatePlan(answers)} disabled={loading}>
            Generate event + checklist
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
              Open generated event
            </button>
          </div>

          <h4>Checklist</h4>
          <ul className="stack-sm">
            {plan.checklist.map((item) => (
              <li key={`${item.name}-${item.gearItemId ?? 'x'}`} className="row between wrap checklist-row">
                <span>
                  {item.name} × {item.quantity} <small className="subtle">{item.priority}</small>
                </span>
                <span className="row">
                  <button
                    className="ghost"
                    onClick={() => void storeSuggestionFeedback(plan.eventType, item.name, true)}
                  >
                    Useful
                  </button>
                  <button
                    className="ghost"
                    onClick={() => void storeSuggestionFeedback(plan.eventType, item.name, false)}
                  >
                    Not useful
                  </button>
                </span>
              </li>
            ))}
          </ul>

          <h4>Missing / not in your catalog</h4>
          <ul className="stack-sm">
            {plan.missingItems.map((item) => (
              <li key={item.name} className="checklist-row">
                <strong>{item.name}</strong> — {item.reason}
                <div className="row wrap">
                  <span className="pill">{item.priority}</span>
                  <span className="pill">{item.action}</span>
                </div>
              </li>
            ))}
          </ul>

          <button
            onClick={() => {
              localStorage.setItem(
                'gearvault-final-packed-snapshot',
                JSON.stringify({ savedAt: new Date().toISOString(), plan }),
              );
            }}
          >
            Save final packed list snapshot
          </button>
        </div>
      )}

      <div className="card">
        <h4>Catalog JSON sent to AI</h4>
        <pre className="json-preview">{JSON.stringify(summaryCatalog, null, 2)}</pre>
      </div>
    </section>
  );
}
