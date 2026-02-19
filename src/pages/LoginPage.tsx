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
    <section className="ios-auth-shell">
      <h1 className="ios-auth-app-name">GearVault</h1>
      <p className="ios-auth-tagline">Sign in to sync your catalog, events &amp; AI features.</p>

      <div className="ios-auth-card">
        {/* Segmented control */}
        <div className="ios-auth-segmented">
          <button
            className={`ios-auth-segment${mode === 'signin' ? ' active' : ''}`}
            onClick={() => setMode('signin')}
          >
            Sign In
          </button>
          <button
            className={`ios-auth-segment${mode === 'signup' ? ' active' : ''}`}
            onClick={() => setMode('signup')}
          >
            Create Account
          </button>
        </div>

        {/* Name fields (sign-up only) */}
        {mode === 'signup' && (
          <div className="ios-auth-name-row">
            <div className="ios-auth-field">
              <label className="ios-auth-field-label">First Name</label>
              <input
                className="ios-auth-field-input"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="John"
                onFocus={() => document.documentElement.classList.add('keyboard-open')}
                onBlur={() => document.documentElement.classList.remove('keyboard-open')}
              />
            </div>
            <div className="ios-auth-field">
              <label className="ios-auth-field-label">Last Name</label>
              <input
                className="ios-auth-field-input"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Doe"
                onFocus={() => document.documentElement.classList.add('keyboard-open')}
                onBlur={() => document.documentElement.classList.remove('keyboard-open')}
              />
            </div>
          </div>
        )}

        {/* Email */}
        <div className="ios-auth-field">
          <label className="ios-auth-field-label">Email</label>
          <input
            className="ios-auth-field-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            onFocus={() => document.documentElement.classList.add('keyboard-open')}
            onBlur={() => document.documentElement.classList.remove('keyboard-open')}
          />
        </div>

        {/* Password */}
        <div className="ios-auth-field">
          <label className="ios-auth-field-label">Password</label>
          <input
            className="ios-auth-field-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
            onFocus={() => document.documentElement.classList.add('keyboard-open')}
            onBlur={() => document.documentElement.classList.remove('keyboard-open')}
          />
        </div>

        {/* Error / success */}
        {error && <p className="ios-auth-error">{error}</p>}
        {status && <p className="ios-auth-success">{status}</p>}

        {/* Submit */}
        <button
          className="ios-auth-submit"
          onClick={() => void submit()}
          disabled={loading || !email || password.length < 6}
        >
          {loading ? 'Please wait...' : mode === 'signin' ? 'Sign In' : 'Create Account'}
        </button>
      </div>
    </section>
  );
}
