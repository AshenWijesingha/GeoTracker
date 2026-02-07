// Firebase configuration and initialization
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// Firebase configuration
// These values are safe to expose in client-side code as Firebase security rules protect the data
const firebaseConfig = {
  apiKey: "AIzaSyDIHDGN0nAx1CpLCurSQj3TYlR1AwZmu6g",
  authDomain: "geotracker-865d3.firebaseapp.com",
  projectId: "geotracker-865d3",
  storageBucket: "geotracker-865d3.firebasestorage.app",
  messagingSenderId: "881736898997",
  appId: "1:881736898997:web:038371eeb1f9e1a54ce1fc",
  measurementId: "G-TTHVMZNDX4"
};

// Initialize Firebase (singleton pattern to prevent multiple initializations)
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Firestore
export const db = getFirestore(app);

// Initialize Auth
export const auth = getAuth(app);

export default app;
