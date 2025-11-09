// firebase/firebaseConfig.web.ts
// (File này CHỈ dành cho Web)

import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth'; // Chỉ import 'getAuth' của web
import {
  getFirestore,
  initializeFirestore,
  CACHE_SIZE_UNLIMITED,
  persistentLocalCache,
  persistentMultipleTabManager
} from 'firebase/firestore';

// --- CẤU HÌNH ---
const firebaseConfig = {
    apiKey: process.env.EXPO_PUBLIC_API_KEY,
    authDomain: process.env.EXPO_PUBLIC_AUTH_DOMAIN,
    projectId: process.env.EXPO_PUBLIC_PROJECT_ID,
    storageBucket: process.env.EXPO_PUBLIC_STORAGE_BUCKET,
    messagingSenderId: process.env.EXPO_PUBLIC_MESSAGING_SENDER_ID,
    appId: process.env.EXPO_PUBLIC_APP_ID,
    measurementId: process.env.EXPO_PUBLIC_MEASUREMENT_ID
};

if (!firebaseConfig.apiKey) {
    throw new Error("Cấu hình Firebase (EXPO_PUBLIC_API_KEY) bị thiếu. Hãy kiểm tra file .env");
}

// --- KHỞI TẠO VÀ EXPORT (Web) ---
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Initialize Firestore with improved settings for web
let db;
try {
  // Try to get existing instance first
  db = getFirestore(app);
} catch (error) {
  // If not initialized, initialize with custom settings to reduce WebChannel errors
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  });
}

// Chỉ dùng logic của Web
const auth = getAuth(app);

export { auth, db };
