// Firebase configuration and initialization
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache,
  Firestore,
} from 'firebase/firestore';
import { getAuth, Auth } from 'firebase/auth';

// Firebase configuration
// These values are safe to expose in client-side code as Firebase security rules protect the data
// They can be overridden using environment variables
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyALuk1ujZBLTWMCJJ6ebT9DdH9CtYwVJ6I",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "geotrackerpro-e3149.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "geotrackerpro-e3149",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "geotrackerpro-e3149.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "948578635618",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:948578635618:web:803ddf06141f602dd7a63b",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-23B0643XX7"
};

// Validate Firebase configuration
function validateFirebaseConfig() {
  const requiredFields = ['apiKey', 'authDomain', 'projectId'] as const;
  const missingFields = requiredFields.filter(field => !firebaseConfig[field]);
  
  if (missingFields.length > 0) {
    console.error('❌ Firebase configuration error: Missing required fields:', missingFields.join(', '));
    return false;
  }
  
  return true;
}

// Initialize Firebase with error handling
let app: FirebaseApp;
let db: Firestore;
let auth: Auth;

try {
  if (!validateFirebaseConfig()) {
    throw new Error('Invalid Firebase configuration');
  }
  
  // Initialize Firebase (singleton pattern to prevent multiple initializations)
  app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  
  // Initialize Firestore.
  // In the browser we enable the IndexedDB-backed persistent cache: reads are
  // served from cache instantly, and writes made while offline (e.g. location
  // fixes on a phone that loses signal) are queued and synced automatically
  // when the connection returns. During static pre-rendering we use memory.
  try {
    db = initializeFirestore(app, {
      localCache:
        typeof window !== 'undefined' && typeof indexedDB !== 'undefined'
          ? persistentLocalCache({ tabManager: persistentMultipleTabManager() })
          : memoryLocalCache(),
      ignoreUndefinedProperties: true,
    });
  } catch {
    // initializeFirestore throws if it was already called (hot reload).
    db = getFirestore(app);
  }
  
  // Initialize Auth
  auth = getAuth(app);
  
  if (process.env.NODE_ENV !== 'production') {
    console.log('✅ Firebase initialized:', firebaseConfig.projectId);
  }
} catch (error) {
  console.error('❌ Firebase initialization error:', error);
  console.error('');
  console.error('🔧 FIREBASE SETUP REQUIRED:');
  console.error('Please ensure Firebase Authentication is enabled in your Firebase Console:');
  console.error(`1. Visit: https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication`);
  console.error('2. Click "Get Started" if Authentication is not enabled');
  console.error('3. Enable "Email/Password" sign-in method');
  console.error('4. Enable "Anonymous" sign-in method');
  console.error('');
  console.error('📚 For more details, see: https://firebase.google.com/docs/auth/web/start');
  console.error('');
  
  throw new Error(`Firebase initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
}

export { db, auth };
export default app;
