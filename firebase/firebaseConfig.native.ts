// firebase/firebaseConfig.native.ts

import { initializeApp, getApps } from 'firebase/app';
import { initializeAuth, getAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore, initializeFirestore, CACHE_SIZE_UNLIMITED } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
apiKey: process.env.EXPO_PUBLIC_API_KEY,
authDomain: process.env.EXPO_PUBLIC_AUTH_DOMAIN,
projectId: process.env.EXPO_PUBLIC_PROJECT_ID,
storageBucket: process.env.EXPO_PUBLIC_STORAGE_BUCKET,
messagingSenderId: process.env.EXPO_PUBLIC_MESSAGING_SENDER_ID,
appId: process.env.EXPO_PUBLIC_APP_ID,
measurementId: process.env.EXPO_PUBLIC_MEASUREMENT_ID,
};

// Validate Firebase configuration
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.error('Firebase configuration is missing required fields. Please check your .env file.');
  console.error('Required: EXPO_PUBLIC_API_KEY, EXPO_PUBLIC_PROJECT_ID');
}

// Initialize Firebase App (check if already initialized)
let app;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

// Initialize Auth with AsyncStorage persistence for React Native
// This ensures auth state persists between sessions
let auth;
try {
  // Always try to initialize with AsyncStorage persistence first
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage)
  });
} catch (error: any) {
  // If auth is already initialized (e.g., during hot reload), get the existing instance
  // The existing instance should already have AsyncStorage persistence from the first initialization
  if (error.code === 'auth/already-initialized') {
    auth = getAuth(app);
  } else {
    throw error;
  }
}

// Initialize Firestore with React Native optimizations
// IMPORTANT: Must call initializeFirestore BEFORE getFirestore
// Otherwise, getFirestore will auto-initialize with default settings
let db;
try {
  // Always try to initialize with custom settings FIRST
  db = initializeFirestore(app, {
    cacheSizeBytes: CACHE_SIZE_UNLIMITED,
    // Enable long polling for better mobile network handling
    // This helps with unstable network connections on mobile devices
    experimentalForceLongPolling: true,
    // Ignore undefined properties
    ignoreUndefinedProperties: true,
  });
} catch (error: any) {
  // If already initialized (e.g., during hot reload), get existing instance
  db = getFirestore(app);
}

export { app, auth, db };