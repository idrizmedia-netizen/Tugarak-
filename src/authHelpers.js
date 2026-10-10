// src/authHelpers.js
// Eslatma: `auth` ni o'zingizdagi src/firebase.js dan import qilinadi (export const auth = getAuth(app)).
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  sendEmailVerification,
} from 'firebase/auth';
import { auth } from './firebase.js';

/** Telegram, Instagram, Facebook va boshqa ichki brauzerlarni aniqlaydi (Google ularda kirishni bloklaydi). */
export function isInAppBrowser() {
  const ua = navigator.userAgent || '';
  return /Telegram|FBAN|FBAV|Instagram|Line\/|MicroMessenger|; wv\)|WebView/i.test(ua);
}

/** Google orqali kirish: avval popup, ishlamasa redirect. */
export async function googleSignIn() {
  if (isInAppBrowser()) {
    const e = new Error('in-app-browser');
    e.code = 'app/in-app-browser';
    throw e;
  }
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    return await signInWithPopup(auth, provider);
  } catch (err) {
    if (
      err.code === 'auth/popup-blocked' ||
      err.code === 'auth/operation-not-supported-in-this-environment'
    ) {
      await signInWithRedirect(auth, provider);
      return null; // sahifa qayta yuklanadi, natijani handleRedirectResult() oladi
    }
    throw err;
  }
}

/** Sahifa yuklanganda bir marta chaqiring (redirect natijasini olish uchun). */
export async function handleRedirectResult() {
  try {
    return await getRedirectResult(auth);
  } catch (err) {
    console.error('Redirect natijasi xato:', err);
    throw err;
  }
}

/** Email/parol bilan ro'yxatdan o'tgandan keyin tasdiqlash xatini yuborish. */
export async function sendVerification(user) {
  await sendEmailVerification(user);
}

/** Firebase xato kodlarini tushunarli o'zbekcha xabarga aylantiradi. */
export function authErrorMessage(err) {
  const code = err?.code || '';
  const map = {
    'app/in-app-browser':
      "Telegram ichida Google orqali kirish ishlamaydi. Havolani Chrome yoki Safari brauzerida oching (⋮ → «Brauzerda ochish»).",
    'auth/invalid-email': "Email manzili noto'g'ri yozilgan.",
    'auth/user-not-found': "Email yoki parol noto'g'ri.",
    'auth/wrong-password': "Email yoki parol noto'g'ri.",
    'auth/invalid-credential': "Email yoki parol noto'g'ri.",
    'auth/email-already-in-use': "Bu email allaqachon ro'yxatdan o'tgan.",
    'auth/weak-password': "Parol juda oddiy. Kamida 8 ta belgi kiriting.",
    'auth/too-many-requests': "Juda ko'p urinish bo'ldi. Birozdan keyin qayta urinib ko'ring.",
    'auth/network-request-failed': "Internet aloqasi yo'q. Ulanishni tekshiring.",
    'auth/popup-closed-by-user': 'Kirish oynasi yopildi.',
    'auth/cancelled-popup-request': 'Kirish bekor qilindi.',
    'auth/unauthorized-domain':
      "Bu domen Firebase'da ruxsat etilmagan. Administrator Authorized domains ga qo'shishi kerak.",
    'auth/user-disabled': "Bu hisob o'chirib qo'yilgan.",
  };
  return map[code] || "Kutilmagan xato yuz berdi. Qayta urinib ko'ring.";
}
