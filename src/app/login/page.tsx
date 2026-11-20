'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { getFirebaseErrorMessage } from '@/lib/firebase-errors';
import { AlertCircle, ArrowLeft, CheckCircle2, MapPinned, ShieldCheck, Siren, Smartphone, UserRound } from 'lucide-react';
import Brand from '@/components/ui/Brand';
import ThemeToggle from '@/components/ui/ThemeToggle';
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

  const title = isReset ? 'Reset your password' : isSignUp ? 'Create your account' : 'Welcome back';
  const subtitle = isReset
    ? "Enter your email and we'll send you a link to choose a new password."
    : isSignUp
      ? 'Start seeing the people and devices you care about on one map.'
      : 'Sign in to see your trackers.';

  return (
    <div className={styles.page}>
      <aside className={styles.aside} aria-hidden="true">
        <Brand size={32} />
        <div className={styles.pitch}>
          <h2>Know where your people and things are.</h2>
          <p>Private, consent-based location sharing with live maps, SOS alerts and battery warnings.</p>
          <ul className={styles.features}>
            <li>
              <MapPinned size={18} /> Live map of everyone who shares with you
            </li>
            <li>
              <ShieldCheck size={18} /> Sharing only starts after the other person agrees
            </li>
            <li>
              <Siren size={18} /> SOS and low-battery alerts on your screen
            </li>
            <li>
              <Smartphone size={18} /> Works in any browser, plus an Android app
            </li>
          </ul>
        </div>
        <p className={styles.asideFoot}>GeoTracker · Personal location sharing</p>
      </aside>

      <main className={styles.main}>
        <div className={styles.panel}>
          <div className={styles.mobileBrand}>
            <Brand size={30} />
          </div>

          <h1 className={styles.title}>{title}</h1>
          <p className={styles.subtitle}>{subtitle}</p>

          {(error || authError) && (
            <div className="status error" role="alert">
              <AlertCircle size={16} aria-hidden="true" />
              <span>{error || authError}</span>
            </div>
          )}
          {notice && (
            <div className="status success" role="status">
              <CheckCircle2 size={16} aria-hidden="true" />
              <span>{notice}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} action="#" className={styles.form}>
            {isSignUp && (
              <div className="field">
                <label htmlFor="displayName">Your name</label>
                <input
                  type="text"
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Alex"
                  autoComplete="name"
                  className="input"
                />
              </div>
            )}

            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
                className="input"
              />
            </div>

            {!isReset && (
              <div className="field">
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
                  placeholder={isSignUp ? 'At least 6 characters' : ''}
                  required
                  minLength={6}
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  className="input"
                />
              </div>
            )}

            <button type="submit" className="btn btn-lg btn-block" disabled={loading}>
              {loading ? 'Please wait…' : isReset ? 'Send reset link' : isSignUp ? 'Create account' : 'Sign in'}
            </button>
          </form>

          {isReset ? (
            <button onClick={() => switchMode('signin')} className={`btn btn-ghost btn-block ${styles.back}`}>
              <ArrowLeft size={16} aria-hidden="true" /> Back to sign in
            </button>
          ) : (
            <>
              <div className={styles.divider}>
                <span>or</span>
              </div>

              <button onClick={handleGuestAccess} className="btn btn-secondary btn-lg btn-block" disabled={loading}>
                <UserRound size={16} aria-hidden="true" /> Continue as guest
              </button>

              <p className={styles.switch}>
                {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
                <button onClick={() => switchMode(isSignUp ? 'signin' : 'signup')} className={styles.linkBtn}>
                  {isSignUp ? 'Sign in' : 'Create one'}
                </button>
              </p>
            </>
          )}

          <div className={styles.footer}>
            <Link href="/download" className={styles.appLink}>
              <Smartphone size={14} aria-hidden="true" /> Get the Android app
            </Link>
            <ThemeToggle />
          </div>

          <span className="sr-only" aria-live="polite">
            {title}
          </span>
        </div>
      </main>
    </div>
  );
}
