import { initializeApp } from 'firebase/app';
import {
  getAuth, GoogleAuthProvider, setPersistence, browserLocalPersistence
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

setPersistence(auth, browserLocalPersistence).catch(() => {});

// .env faylida VITE_ADMIN_EMAILS=admin1@x.uz,admin2@x.uz shaklida ro'yxat beriladi.
// Bu faqat "tezkor" admin aniqlash uchun frontendda ishlatiladi — asosiy huquq
// tekshiruvi baribir Firestore xavfsizlik qoidalarida (firestore.rules) va
// admins/{uid} kolleksiyasida amalga oshiriladi.
export const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS || '')
  .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
