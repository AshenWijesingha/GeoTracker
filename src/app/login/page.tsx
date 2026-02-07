'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthError } from 'firebase/auth';
import { useAuth } from '@/lib/auth-context';
import styles from './page.module.css';

// Get user-friendly error message from Firebase auth error codes
function getAuthErrorMessage(error: unknown): string {
  if (error instanceof Error && 'code' in error) {
    const authError = error as AuthError;
    switch (authError.code) {
      case 'auth/configuration-not-found':
        return 'Firebase Authentication is not configured. Please enable Authentication in Firebase Console.';
      case 'auth/operation-not-allowed':
        return 'This sign-in method is not enabled. Please enable it in Firebase Console (Authentication > Sign-in method).';
      case 'auth/user-not-found':
        return 'No account found with this email address.';
      case 'auth/wrong-password':
        return 'Incorrect password. Please try again.';
      case 'auth/invalid-credential':
        return 'Invalid email or password. Please check your credentials.';
      case 'auth/email-already-in-use':
        return 'An account with this email already exists.';
      case 'auth/weak-password':
        return 'Password must be at least 6 characters.';
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      case 'auth/too-many-requests':
        return 'Too many failed attempts. Please try again later.';
      case 'auth/network-request-failed':
        return 'Network error. Please check your connection.';
      case 'auth/invalid-api-key':
        return 'Invalid Firebase API key. Please check Firebase configuration.';
      case 'auth/app-not-authorized':
        return 'This app is not authorized to use Firebase Authentication.';
      default:
        return authError.message || 'Authentication failed. Please try again.';
    }
  }
  return error instanceof Error ? error.message : 'Authentication failed. Please try again.';
}

export default function LoginPage() {
  const router = useRouter();
  const { signIn, signUp, signInAsGuest, error: authError } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setError(getAuthErrorMessage(err));
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
      setError(getAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.loginBg}>
      <div className={styles.container}>
        <div className={styles.logo}>🎯</div>
        <h1>Cyber Tracker</h1>
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

        <form onSubmit={handleSubmit} className={styles.form}>
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
