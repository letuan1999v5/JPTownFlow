// firebase/firebaseConfig.native.ts

import { initializeApp, getApps } from 'firebase/app';
import { initializeAuth, getAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
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

// Initialize Firebase App (check if already initialized)
let app;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

// Initialize Auth (check if already initialized)
let auth;
try {
  auth = getAuth(app);
} catch (error) {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage)
  });
}

// Initialize Firestore
const db = getFirestore(app);

export { app, auth, db };