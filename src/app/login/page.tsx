'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { getFirebaseErrorMessage } from '@/lib/firebase-errors';
import styles from './page.module.css';

type Mode = 'signin' | 'signup' | 'reset';

export default function LoginPage() {
  const router = useRouter();
  const { user, loading: authLoading, signIn, signUp, signInAsGuest, resetPassword, error: authError } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [logoFailed, setLogoFailed] = useState(false);

  const isSignUp = mode === 'signup';
  const isReset = mode === 'reset';

  // Already signed in (session restored from IndexedDB) → skip the form.
  useEffect(() => {
    if (!authLoading && user) router.replace('/dashboard');
  }, [authLoading, user, router]);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setNotice(null);
    setPassword('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      if (isReset) {
        try {
          await resetPassword(email);
        } catch (err) {
          // Don't reveal whether an address is registered: for "no such user"
          // show the same confirmation as success. Surface only real problems
          // (invalid email, network, rate limiting).
          const code = (err as { code?: string })?.code;
          if (code && code !== 'auth/user-not-found') throw err;
        }
        setNotice(`If an account exists for ${email}, a password reset link is on its way. Check your inbox and spam folder.`);
        return;
      }

      if (isSignUp) {
        await signUp(email, password, displayName);
      } else {
        await signIn(email, password);
      }
      router.push('/dashboard');
    } catch (err) {
      setError(getFirebaseErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGuestAccess = async () => {
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      await signInAsGuest();
      router.push('/dashboard');
    } catch (err) {
      setError(getFirebaseErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const title = isReset ? 'Reset Password' : isSignUp ? 'Create Account' : 'Access Command Center';

  return (
    <div className={styles.loginBg}>
      <div className={styles.container}>
        <div className={styles.logo}>
          {logoFailed ? (
            <span>🎯</span>
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src="https://res.cloudinary.com/dkj22lm1g/image/upload/v1770788944/GeoTracker_fbqxq1.webp"
              alt="GeoTracker Logo"
              width={80}
              height={80}
              className={styles.logoImage}
              onError={() => setLogoFailed(true)}
            />
          )}
        </div>
        <h1>GeoTracker</h1>
        <p className={styles.subtitle}>Advanced geolocation surveillance system</p>

        {isReset ? (
          <div className={styles.infoBox}>
            <p>🔑 <strong>Password Recovery</strong></p>
            <p>Enter your account email and we&apos;ll send you a secure link to set a new password.</p>
          </div>
        ) : (
          <div className={styles.infoBox}>
            <p>🔐 <strong>Firebase Secured</strong></p>
            <p>All tracking data is stored securely in the cloud with real-time sync.</p>
          </div>
        )}

        {(error || authError) && <div className={styles.errorBox}>⚠️ {error || authError}</div>}
        {notice && <div className={styles.successBox}>✓ {notice}</div>}

        <form onSubmit={handleSubmit} action="#" className={styles.form}>
          {isSignUp && (
            <div className={styles.inputGroup}>
              <label htmlFor="displayName">Display Name</label>
              <input
                type="text"
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Agent Codename"
                className={styles.input}
              />
            </div>
          )}

          <div className={styles.inputGroup}>
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="agent@command.center"
              required
              autoComplete="email"
              className={styles.input}
            />
          </div>

          {!isReset && (
            <div className={styles.inputGroup}>
              <div className={styles.labelRow}>
                <label htmlFor="password">Password</label>
                {mode === 'signin' && (
                  <button type="button" className={styles.linkBtn} onClick={() => switchMode('reset')}>
                    Forgot password?
                  </button>
                )}
              </div>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                className={styles.input}
              />
            </div>
          )}

          <button type="submit" className={`btn ${styles.loginBtn}`} disabled={loading}>
            {loading
              ? 'Processing...'
              : isReset
                ? 'Send Reset Link'
                : isSignUp
                  ? 'Create Account'
                  : 'Access Command Center'}
          </button>
        </form>

        {isReset ? (
          <button onClick={() => switchMode('signin')} className={styles.toggleBtn}>
            ← Back to Sign In
          </button>
        ) : (
          <>
            <div className={styles.divider}>
              <span>or</span>
            </div>

            <button onClick={handleGuestAccess} className={`btn ${styles.guestBtn}`} disabled={loading}>
              👤 Continue as Guest
            </button>

            <button onClick={() => switchMode(isSignUp ? 'signin' : 'signup')} className={styles.toggleBtn}>
              {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
            </button>
          </>
        )}

        <span className="sr-only" aria-live="polite">
          {title}
        </span>
      </div>
    </div>
  );
}
