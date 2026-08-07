import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup,
  signOut, sendPasswordResetEmail, onAuthStateChanged
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, googleProvider, ADMIN_EMAILS } from './firebase.js';

const LOCK_AFTER = 3;
const LOCK_SECONDS = 30;

/* ---------- client-side login-attempt lockout ----------
   Eslatma: bu faqat brauzer darajasidagi qulflash (localStorage asosida),
   qo'shimcha himoya sifatida. To'liq himoya uchun Firebase App Check yoki
   Cloud Functions orqali server tomonli cheklov qo'shish tavsiya etiladi. */
export function getLockInfo(key) {
  const raw = localStorage.getItem('lock:' + key);
  if (!raw) return { locked: false };
  const data = JSON.parse(raw);
  const remaining = Math.ceil((data.until - Date.now()) / 1000);
  if (remaining > 0) return { locked: true, remaining };
  return { locked: false };
}
export function registerFail(key) {
  const raw = localStorage.getItem('fails:' + key);
  const count = (raw ? parseInt(raw) : 0) + 1;
  if (count >= LOCK_AFTER) {
    localStorage.setItem('lock:' + key, JSON.stringify({ until: Date.now() + LOCK_SECONDS * 1000 }));
    localStorage.removeItem('fails:' + key);
  } else {
    localStorage.setItem('fails:' + key, String(count));
  }
  return count;
}
export function clearFails(key) {
  localStorage.removeItem('fails:' + key);
  localStorage.removeItem('lock:' + key);
}

/* ---------- registration (email/password) ---------- */
export async function registerTeacher({ fullName, email, phone, password }) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await setDoc(doc(db, 'users', cred.user.uid), {
    role: 'teacher',
    fullName, email, phone,
    method: 'password',
    status: 'pending',
    contractAccepted: true,
    contractDate: serverTimestamp(),
    createdAt: serverTimestamp()
  });
  return cred.user;
}

export async function loginTeacher(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function loginWithGoogle() {
  const cred = await signInWithPopup(auth, googleProvider);
  const ref = doc(db, 'users', cred.user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    // Google orqali birinchi marta kirgan foydalanuvchi uchun boshlang'ich hujjat.
    // Shartnomani hali qabul qilmagani uchun status 'incomplete' bo'ladi —
    // UI unga shartnomani ko'rsatib, keyin 'pending'ga o'tkazadi.
    await setDoc(ref, {
      role: 'teacher',
      fullName: cred.user.displayName || 'Google foydalanuvchi',
      email: cred.user.email,
      phone: '',
      method: 'google',
      status: 'incomplete',
      contractAccepted: false,
      contractDate: null,
      createdAt: serverTimestamp()
    });
  }
  return cred.user;
}

export async function completeGoogleRegistration(uid, { phone }) {
  await setDoc(doc(db, 'users', uid), {
    phone,
    status: 'pending',
    contractAccepted: true,
    contractDate: serverTimestamp()
  }, { merge: true });
}

export async function resetPassword(email) {
  await sendPasswordResetEmail(auth, email);
}

export async function logout() {
  await signOut(auth);
}

export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function isAdmin(uid, email) {
  if (email && ADMIN_EMAILS.includes(email.toLowerCase())) return true;
  const snap = await getDoc(doc(db, 'admins', uid));
  return snap.exists();
}

export async function getUserDoc(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}
