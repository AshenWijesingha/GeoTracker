'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { getFirebaseErrorMessage } from '@/lib/firebase-errors';
import styles from './page.module.css';

export default function LoginPage() {
  const router = useRouter();
  const { user, loading: authLoading, signIn, signUp, signInAsGuest, error: authError } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logoFailed, setLogoFailed] = useState(false);

  // Already signed in (session restored from IndexedDB) → skip the form.
  useEffect(() => {
    if (!authLoading && user) router.replace('/dashboard');
  }, [authLoading, user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
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

    try {
      await signInAsGuest();
      router.push('/dashboard');
    } catch (err) {
      setError(getFirebaseErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

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
        <p className={styles.subtitle}>
          Advanced geolocation surveillance system
        </p>

        <div className={styles.infoBox}>
          <p>🔐 <strong>Firebase Secured</strong></p>
          <p>All tracking data is stored securely in the cloud with real-time sync.</p>
        </div>

        {(error || authError) && (
          <div className={styles.errorBox}>
            ⚠️ {error || authError}
          </div>
        )}

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
              className={styles.input}
            />
          </div>
          
          <div className={styles.inputGroup}>
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
              className={styles.input}
            />
          </div>

          <button 
            type="submit"
            className={`btn ${styles.loginBtn}`}
            disabled={loading}
          >
            {loading ? 'Processing...' : (isSignUp ? 'Create Account' : 'Access Command Center')}
          </button>
        </form>

        <div className={styles.divider}>
          <span>or</span>
        </div>

        <button 
          onClick={handleGuestAccess}
          className={`btn ${styles.guestBtn}`}
          disabled={loading}
        >
          👤 Continue as Guest
        </button>

        <button 
          onClick={() => setIsSignUp(!isSignUp)}
          className={styles.toggleBtn}
        >
          {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
        </button>
      </div>
    </div>
  );
}
