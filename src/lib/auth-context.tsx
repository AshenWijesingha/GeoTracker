'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously,
  signOut,
  updateProfile,
  AuthError,
} from 'firebase/auth';
import { auth } from './firebase';
import { createOrUpdateUser } from './firebase-services';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  signInAsGuest: () => Promise<void>;
  logout: () => Promise<void>;
  error: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Helper function to get user-friendly error messages
function getFirebaseErrorMessage(error: unknown): string {
  if (error instanceof Error && 'code' in error) {
    const authError = error as AuthError;
    switch (authError.code) {
      case 'auth/configuration-not-found':
        return '⚠️ Firebase Authentication is not properly configured. Please enable Authentication in Firebase Console and enable Email/Password and Anonymous sign-in methods.';
      case 'auth/operation-not-allowed':
        return '⚠️ This sign-in method is not enabled. Please enable Email/Password or Anonymous authentication in Firebase Console.';
      case 'auth/invalid-api-key':
        return '⚠️ Invalid Firebase API key. Please check your Firebase configuration.';
      case 'auth/app-not-authorized':
        return '⚠️ This app is not authorized to use Firebase Authentication. Please check your Firebase project settings.';
      case 'auth/network-request-failed':
        return '⚠️ Network error. Please check your internet connection and try again.';
      default:
        return authError.message;
    }
  }
  return error instanceof Error ? error.message : 'An unknown error occurred';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        setUser(user);
        setLoading(false);
      }, (error) => {
        console.error('Auth state change error:', error);
        setError(getFirebaseErrorMessage(error));
        setLoading(false);
      });

      return () => unsubscribe();
    } catch (error) {
      console.error('Auth initialization error:', error);
      setError(getFirebaseErrorMessage(error));
      setLoading(false);
    }
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      setError(null);
      const result = await signInWithEmailAndPassword(auth, email, password);
      // Update user record in Firestore
      await createOrUpdateUser(result.user.uid, email, result.user.displayName || undefined);
    } catch (err) {
      const errorMessage = getFirebaseErrorMessage(err);
      setError(errorMessage);
      console.error('Sign in error:', err);
      throw err;
    }
  };

  const signUp = async (email: string, password: string, displayName?: string) => {
    try {
      setError(null);
      const result = await createUserWithEmailAndPassword(auth, email, password);
      
      if (displayName) {
        await updateProfile(result.user, { displayName });
      }
      
      // Create user record in Firestore
      await createOrUpdateUser(result.user.uid, email, displayName);
    } catch (err) {
      const errorMessage = getFirebaseErrorMessage(err);
      setError(errorMessage);
      console.error('Sign up error:', err);
      throw err;
    }
  };

  const signInAsGuest = async () => {
    try {
      setError(null);
      const result = await signInAnonymously(auth);
      // Create anonymous user record with UID-based identifier
      const guestEmail = `guest_${result.user.uid}@anonymous.local`;
      await createOrUpdateUser(result.user.uid, guestEmail, 'Guest User');
    } catch (err) {
      const errorMessage = getFirebaseErrorMessage(err);
      setError(errorMessage);
      console.error('Guest sign in error:', err);
      throw err;
    }
  };

  const logout = async () => {
    try {
      setError(null);
      await signOut(auth);
    } catch (err) {
      const errorMessage = getFirebaseErrorMessage(err);
      setError(errorMessage);
      console.error('Logout error:', err);
      throw err;
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signInAsGuest, logout, error }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
