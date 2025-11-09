// firebase/firebaseConfig.ts

import { Platform } from 'react-native';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, initializeFirestore, CACHE_SIZE_UNLIMITED } from 'firebase/firestore';

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
} else {
  app = getApps()[0];
}

// Initialize Auth based on platform
let auth;
if (Platform.OS === 'web') {
  // Web: Use default auth
  const { getAuth } = require('firebase/auth');
  auth = getAuth(app);
} else {
  // Native: Use AsyncStorage persistence
  const { initializeAuth, getAuth, getReactNativePersistence } = require('firebase/auth');
  const AsyncStorage = require('@react-native-async-storage/async-storage').default;

  // Always use initializeAuth for React Native to ensure AsyncStorage persistence
  // This ensures auth state persists between sessions
  try {
    // Try to initialize auth with AsyncStorage persistence
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
}

// Initialize Firestore with improved settings
let db;
try {
  // Try to get existing instance first
  db = getFirestore(app);
} catch (error) {
  // If not initialized, initialize with custom settings optimized for React Native
  const firestoreSettings: any = {
    cacheSizeBytes: CACHE_SIZE_UNLIMITED,
    ignoreUndefinedProperties: true,
  };

  // Platform-specific optimizations
  if (Platform.OS === 'web') {
    // Web: Disable experimental long polling to prevent WebChannel errors
    firestoreSettings.experimentalForceLongPolling = false;
    firestoreSettings.experimentalAutoDetectLongPolling = true;
  } else {
    // React Native: Enable long polling for better mobile network handling
    // This helps with unstable network connections
    firestoreSettings.experimentalForceLongPolling = true;
  }

  db = initializeFirestore(app, firestoreSettings);
}

export { app, auth, db };