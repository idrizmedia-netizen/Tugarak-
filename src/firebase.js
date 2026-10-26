import { initializeApp } from 'firebase/app';
import {
  getAuth, GoogleAuthProvider, setPersistence, browserLocalPersistence
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

export const app = initializeApp(firebaseConfig);

/* App Check (reCAPTCHA v3): so'rovlar haqiqiy saytingizdan kelayotganini tasdiqlaydi — botlar va
   kalitni nusxalab olgan begona saytlar Firestore/Auth'ga murojaat qila olmaydi.
   Faqat VITE_RECAPTCHA_SITE_KEY berilganda yoqiladi; berilmasa hech narsa o'zgarmaydi.
   Firebase Console'da "Enforce" ni faqat kalit Vercel'ga qo'yilib, sayt qayta deploy qilingach yoqing. */
const recaptchaKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
if (recaptchaKey) {
  try {
    // Mahalliy ishlab chiqishda (npm run dev) debug token konsolga chiqadi — uni Console'da ro'yxatdan o'tkazing.
    if (import.meta.env.DEV) self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    initializeAppCheck(app, { provider: new ReCaptchaV3Provider(recaptchaKey), isTokenAutoRefreshEnabled: true });
  } catch (e) {
    console.warn('App Check yoqilmadi:', e);
  }
}
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

setPersistence(auth, browserLocalPersistence).catch(() => {});
