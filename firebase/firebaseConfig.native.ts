// firebase/firebaseConfig.native.ts

import { initializeApp, getApps } from 'firebase/app';
import { initializeAuth, getAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore, initializeFirestore, CACHE_SIZE_UNLIMITED } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

console.log('[Firebase] Loading firebaseConfig.NATIVE.ts for React Native');

const firebaseConfig = {
apiKey: process.env.EXPO_PUBLIC_API_KEY,
authDomain: process.env.EXPO_PUBLIC_AUTH_DOMAIN,
projectId: process.env.EXPO_PUBLIC_PROJECT_ID,
storageBucket: process.env.EXPO_PUBLIC_STORAGE_BUCKET,
messagingSenderId: process.env.EXPO_PUBLIC_MESSAGING_SENDER_ID,
appId: process.env.EXPO_PUBLIC_APP_ID,
measurementId: process.env.EXPO_PUBLIC_MEASUREMENT_ID,
};

// Initialize Firebase App (check if already initialized)
let app;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
  console.log('[Firebase] Initialized new Firebase app');
} else {
  app = getApps()[0];
  console.log('[Firebase] Using existing Firebase app');
}

// Initialize Auth with AsyncStorage persistence
let auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage)
  });
  console.log('[Firebase] Initialized Auth with AsyncStorage persistence');
} catch (error: any) {
  if (error.code === 'auth/already-initialized') {
    auth = getAuth(app);
    console.log('[Firebase] Auth already initialized, getting existing instance');
  } else {
    console.error('[Firebase] Error initializing auth:', error);
    throw error;
  }
}

// Initialize Firestore with React Native optimizations
// CRITICAL: Must call initializeFirestore BEFORE getFirestore to set custom settings
let db;
try {
  db = initializeFirestore(app, {
    cacheSizeBytes: CACHE_SIZE_UNLIMITED,
    ignoreUndefinedProperties: true,
  });
  console.log('[Firebase] Initialized Firestore with custom settings for React Native');
} catch (error: any) {
  // If already initialized (e.g., during hot reload), get existing instance
  db = getFirestore(app);
  console.log('[Firebase] Firestore already initialized, using existing instance');
}

export { app, auth, db };