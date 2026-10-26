import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup, signInWithRedirect,
  getRedirectResult, signOut, sendPasswordResetEmail, sendEmailVerification, onAuthStateChanged
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { auth, db, googleProvider } from './firebase.js';

const LOCK_AFTER = 3;
const LOCK_SECONDS = 30;
const clip = (s, n) => String(s ?? '').trim().slice(0, n);

/* ---------- client-side login-attempt lockout ----------
   Eslatma: bu faqat brauzer darajasidagi qulflash (localStorage asosida),
   qo'shimcha himoya sifatida. Haqiqiy himoyani Firebase Auth'ning o'zi beradi
   (auth/too-many-requests). Kalit kichik harfga keltiriladi, shunda
   "A@x.uz" / "a@x.uz" yozib qulfni aylanib o'tib bo'lmaydi. */
const norm = (key) => String(key || '').trim().toLowerCase();
export function getLockInfo(key) {
  try {
    const raw = localStorage.getItem('lock:' + norm(key));
    if (!raw) return { locked: false };
    const data = JSON.parse(raw);
    const remaining = Math.ceil((Number(data?.until) - Date.now()) / 1000);
    if (remaining > 0) return { locked: true, remaining };
  } catch (e) { /* buzilgan yoki mavjud bo'lmagan localStorage — qulf yo'q deb hisoblanadi */ }
  return { locked: false };
}
export function registerFail(key) {
  const k = norm(key);
  let count = 1;
  try {
    count = (parseInt(localStorage.getItem('fails:' + k), 10) || 0) + 1;
    if (count >= LOCK_AFTER) {
      localStorage.setItem('lock:' + k, JSON.stringify({ until: Date.now() + LOCK_SECONDS * 1000 }));
      localStorage.removeItem('fails:' + k);
    } else {
      localStorage.setItem('fails:' + k, String(count));
    }
  } catch (e) { /* localStorage yo'q (masalan, private rejim) */ }
  return count;
}
export function clearFails(key) {
  try {
    localStorage.removeItem('fails:' + norm(key));
    localStorage.removeItem('lock:' + norm(key));
  } catch (e) { /* e'tiborsiz */ }
}

/* ---------- registration (email/password) ----------
   MUHIM: createUserWithEmailAndPassword tugashi bilan onAuthStateChanged darhol
   ishga tushadi, lekin foydalanuvchi hujjati (users/{uid}) hali yozilmagan bo'ladi.
   Shu sabab yangi o'qituvchi "bo'sh" panelni ko'rardi. watchAuth endi
   waitForRegistration() ni kutadi. */
let pendingRegistration = null;
export function waitForRegistration() {
  return pendingRegistration ? pendingRegistration.catch(() => {}) : Promise.resolve();
}
async function doRegister({ fullName, email, phone, password }) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
  try {
    await setDoc(doc(db, 'users', cred.user.uid), {
      role: 'teacher',
      fullName: clip(fullName, 100),
      email: cleanEmail,
      phone: clip(phone, 30),
      method: 'password',
      status: 'pending',
      contractAccepted: true,
      contractDate: serverTimestamp(),
      createdAt: serverTimestamp()
    });
  } catch (err) {
    // Profil yozilmasa, "yarim" hisob qolib ketmasin — o'chiramiz, foydalanuvchi qayta urinib ko'radi.
    try { await cred.user.delete(); } catch (e) { console.warn('Yarim hisobni o\u2019chirib bo\u2019lmadi:', e); }
    throw err;
  }
  // Email tasdiqlash xati (bloklamaydi: yuborilmasa ham ro'yxatdan o'tish davom etadi).
  try { await sendEmailVerification(cred.user); } catch (e) { console.warn('Tasdiqlash xati yuborilmadi:', e.code || e); }
  return cred.user;
}
export async function registerTeacher(args) {
  const run = doRegister(args);
  pendingRegistration = run;
  try { return await run; }
  finally { if (pendingRegistration === run) pendingRegistration = null; }
}

export async function loginTeacher(email, password) {
  const cred = await signInWithEmailAndPassword(auth, String(email || '').trim(), password);
  return cred.user;
}

/* ---------- Google orqali kirish ---------- */
/** Telegram, Instagram, Facebook va boshqa ichki brauzerlar Google kirishini bloklaydi. */
export function isInAppBrowser() {
  const ua = navigator.userAgent || '';
  return /Telegram|FBAN|FBAV|Instagram|Line\/|MicroMessenger|; wv\)|WebView/i.test(ua);
}
export function isGoogleUser(user) {
  return !!user?.providerData?.some(p => p.providerId === 'google.com');
}
export async function loginWithGoogle() {
  if (isInAppBrowser()) {
    const e = new Error('in-app-browser');
    e.code = 'app/in-app-browser';
    throw e;
  }
  try {
    const cred = await signInWithPopup(auth, googleProvider);
    return cred.user;
  } catch (err) {
    if (err.code === 'auth/popup-blocked' || err.code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(auth, googleProvider);
      return null; // sahifa qayta yuklanadi
    }
    throw err;
  }
}
/** Sahifa yuklanganda chaqiriladi: redirect orqali kirish xatosini ushlab beradi. */
export async function handleRedirectResult() {
  const res = await getRedirectResult(auth);
  return res?.user || null;
}
/** Google orqali birinchi marta kirgan o'qituvchi uchun boshlang'ich hujjat (status: incomplete).
 *  Faqat watchAuth ichidan (admin emasligi tekshirilgandan keyin) chaqiriladi. */
export async function ensureGoogleUserDoc(user) {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return { id: snap.id, ...snap.data() };
  await setDoc(ref, {
    role: 'teacher',
    fullName: clip(user.displayName || 'Google foydalanuvchi', 100) || 'Google foydalanuvchi',
    email: String(user.email || '').toLowerCase(),
    phone: '',
    method: 'google',
    status: 'incomplete',
    contractAccepted: false,
    contractDate: null,
    createdAt: serverTimestamp()
  });
  return getUserDoc(user.uid);
}

export async function completeGoogleRegistration(uid, { phone }) {
  await updateDoc(doc(db, 'users', uid), {
    phone: clip(phone, 30),
    status: 'pending',
    contractAccepted: true,
    contractDate: serverTimestamp()
  });
}

export async function resetPassword(email) {
  await sendPasswordResetEmail(auth, String(email || '').trim());
}

export async function logout() {
  await signOut(auth);
}

/** Tasdiqlash xatini qayta yuboradi (Firebase tez-tez so'rovlarni o'zi cheklaydi: auth/too-many-requests). */
export async function resendVerificationEmail() {
  const u = auth.currentUser;
  if (!u) throw Object.assign(new Error('no user'), { code: 'app/invalid' });
  await sendEmailVerification(u);
}
/** Foydalanuvchini serverdan qayta o'qiydi va ID tokenni yangilaydi (qoidalar token'dagi email_verified bilan solishtiradi). */
export async function refreshEmailVerified() {
  const u = auth.currentUser;
  if (!u) return false;
  await u.reload();
  await u.getIdToken(true);
  return !!u.emailVerified;
}
/** users/{uid}.emailVerified ni haqiqiy holatga keltiradi — admin ariza ko'rayotganda shuni ko'radi.
 *  Qoidalar bu maydon token'dagi email_verified ga TENG bo'lishini tekshiradi, shuning uchun soxtalashtirib bo'lmaydi. */
export async function syncEmailVerifiedFlag(user, udoc) {
  if (!user || !udoc) return;
  if (udoc.emailVerified === !!user.emailVerified) return;
  await updateDoc(doc(db, 'users', user.uid), { emailVerified: !!user.emailVerified });
}

export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

/** Admin huquqi FAQAT Firestore'dagi admins/{uid} hujjatidan aniqlanadi (qoidalar ham shuni tekshiradi).
 *  Eski VITE_ADMIN_EMAILS tekshiruvi olib tashlandi: u email orqali soxta "admin paneli"ni
 *  ko'rsatishga imkon berardi va admin emailini hamma ko'ra oladigan bundle'ga chiqarib yuborardi. */
export async function isAdmin(uid) {
  try {
    const snap = await getDoc(doc(db, 'admins', uid));
    return snap.exists();
  } catch (e) {
    console.warn('admins hujjatini o\u2019qib bo\u2019lmadi:', e.code || e);
    return false;
  }
}

/** O'qituvchi profilini real vaqtda kuzatadi: admin tasdiqlaganda yoki obunani faollashtirganda
 *  sahifani qayta yuklash shart bo'lmaydi. */
export function watchUserDoc(uid, callback) {
  return onSnapshot(doc(db, 'users', uid),
    snap => callback(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    err => console.warn('users hujjatini kuzatishda xato:', err.code || err));
}

export async function getUserDoc(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}
