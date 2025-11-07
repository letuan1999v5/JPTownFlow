// firebase/firebaseConfig.ts

import { Platform } from 'react-native';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

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

  try {
    auth = getAuth(app);
  } catch (error) {
    auth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage)
    });
  }
}

// Initialize Firestore
const db = getFirestore(app);

export { app, auth, db };