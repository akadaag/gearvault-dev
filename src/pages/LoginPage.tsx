import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { db } from '../db';

export function LoginPage() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  async function submit() {
    setError('');
    setStatus('');
    setLoading(true);
    try {
      if (mode === 'signin') {
        await signIn(email.trim(), password);
        setStatus('Signed in successfully.');
      } else {
        const message = await signUp(email.trim(), password);
        // Save display name from sign-up form
        const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');
        if (fullName) {
          await db.settings.update('app-settings', { displayName: fullName });
        }
        setStatus(message ?? 'Account created. You are now signed in.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Authentication error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="auth-shell">
      <div className="card stack-md auth-card">
        <h2>Welcome to PackShot</h2>
        <p className="subtle">Sign in to access your catalog, events, AI recommendations, and settings across devices.</p>

        <div className="row wrap">
          <button className={mode === 'signin' ? '' : 'ghost'} onClick={() => setMode('signin')}>
            Sign in
          </button>
          <button className={mode === 'signup' ? '' : 'ghost'} onClick={() => setMode('signup')}>
            Create account
          </button>
        </div>

        {mode === 'signup' && (
          <div className="row wrap" style={{ gap: '0.75rem' }}>
            <label className="stack-sm" style={{ flex: 1, minWidth: '120px' }}>
              <strong>First name</strong>
              <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="John" />
            </label>
            <label className="stack-sm" style={{ flex: 1, minWidth: '120px' }}>
              <strong>Last name</strong>
              <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Doe" />
            </label>
          </div>
        )}

        <label className="stack-sm">
          <strong>Email</strong>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </label>

        <label className="stack-sm">
          <strong>Password</strong>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" />
        </label>

        {error && <p className="error">{error}</p>}
        {status && <p className="success">{status}</p>}

        <button onClick={() => void submit()} disabled={loading || !email || password.length < 6}>
          {loading ? 'Please wait...' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </div>
    </section>
  );
}
