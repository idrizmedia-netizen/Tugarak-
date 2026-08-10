import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDocs, getDoc, setDoc,
  query, where, orderBy, onSnapshot, serverTimestamp, arrayUnion, Timestamp
} from 'firebase/firestore';
import { db } from './firebase.js';

/* ---------- users (teachers) ---------- */
export function watchAllTeachers(callback) {
  const q = query(collection(db, 'users'), where('role', '==', 'teacher'));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}
export async function setTeacherStatus(uid, status) {
  await updateDoc(doc(db, 'users', uid), { status, decidedAt: serverTimestamp() });
}
export async function rejectTeacher(uid, reason) {
  await updateDoc(doc(db, 'users', uid), { status: 'rejected', rejectionReason: reason || '', decidedAt: serverTimestamp() });
}
export async function resubmitApplication(uid, { resubmitReason, proofDoc }) {
  const data = {
    status: 'pending',
    resubmitReason: resubmitReason || '',
    rejectionReason: '',
    resubmittedAt: serverTimestamp()
  };
  if (proofDoc) data.proofDocs = arrayUnion(proofDoc);
  await updateDoc(doc(db, 'users', uid), data);
}
export async function updateTeacherProfile(uid, { fullName, phone }) {
  await updateDoc(doc(db, 'users', uid), { fullName, phone });
}

/* ---------- groups ---------- */
export function watchMyGroups(teacherId, callback) {
  const q = query(collection(db, 'groups'), where('teacherId', '==', teacherId));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}
export async function createGroup(teacherId, name, subject) {
  const ref = await addDoc(collection(db, 'groups'), {
    teacherId, name, subject, createdAt: serverTimestamp()
  });
  return ref.id;
}
export async function updateGroup(groupId, { name, subject }) {
  await updateDoc(doc(db, 'groups', groupId), { name, subject });
}
export async function deleteGroup(groupId) {
  // Guruhga tegishli barcha o'quvchilarni ham o'chiramiz.
  const q = query(collection(db, 'students'), where('groupId', '==', groupId));
  const snap = await getDocs(q);
  await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
  await deleteDoc(doc(db, 'groups', groupId));
}

/* ---------- students ---------- */
export function watchGroupStudents(groupId, callback) {
  const q = query(collection(db, 'students'), where('groupId', '==', groupId));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}
// Eslatma: rasm Firebase Storage'ga emas, siqilgan base64 shaklda
// to'g'ridan-to'g'ri Firestore hujjatiga saqlanadi (Spark/bepul reja bilan
// mos ishlashi uchun). Bitta hujjat 1MB dan oshmasligi kerak, shuning uchun
// rasm src/main.js'da yuklashdan oldin kichraytiriladi va siqiladi.
export async function addStudent(teacherId, groupId, { fullName, className, photo, fromPhoto }) {
  const ref = await addDoc(collection(db, 'students'), {
    teacherId, groupId, fullName, className: className || '',
    photo: photo || null, fromPhoto: !!fromPhoto,
    grades: [], createdAt: serverTimestamp()
  });
  return ref.id;
}
export async function deleteStudent(studentId) {
  await deleteDoc(doc(db, 'students', studentId));
}
export async function addGrade(studentId, subject, value, period) {
  await updateDoc(doc(db, 'students', studentId), {
    grades: arrayUnion({ subject, value, date: Date.now(), period: period || null })
  });
}

/* ---------- bildirishnomalar (admin -> hammaga) ---------- */
export function watchNotifications(callback) {
  const q = query(collection(db, 'notifications'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}
export async function createNotification(title, message) {
  await addDoc(collection(db, 'notifications'), { title, message, createdAt: serverTimestamp() });
}

/* ---------- obuna sozlamalari (admin boshqaradi, hamma o'qiy oladi) ---------- */
const DEFAULT_PLANS = {
  enabled: false,
  plans: {
    free: { price: 0, discount: 0, maxGroups: 1, maxStudents: 20, features: ["1 ta guruh", "20 tagacha o'quvchi", "Asosiy hisobotlar"] },
    monthly: { price: 49000, discount: 0, maxGroups: 0, maxStudents: 0, features: ["Cheksiz guruh", "Cheksiz o'quvchi", "Excel eksport", "Bildirishnomalar"] },
    yearly: { price: 490000, discount: 15, maxGroups: 0, maxStudents: 0, features: ["Cheksiz guruh", "Cheksiz o'quvchi", "Excel eksport", "Bildirishnomalar", "Ustuvor yordam"] },
  }
};
export function watchSubscriptionSettings(callback) {
  return onSnapshot(doc(db, 'settings', 'subscription'), snap => {
    callback(snap.exists() ? snap.data() : DEFAULT_PLANS);
  });
}
export async function saveSubscriptionSettings(data) {
  await setDoc(doc(db, 'settings', 'subscription'), data, { merge: true });
}
export async function chooseSubscriptionPlan(uid, planKey) {
  await updateDoc(doc(db, 'users', uid), { selectedPlan: planKey, planContacted: false, planChosenAt: serverTimestamp() });
}
export async function markPlanContacted(uid) {
  await updateDoc(doc(db, 'users', uid), { planContacted: true });
}
export async function activateSubscription(uid, planKey) {
  const now = Date.now();
  let expiresAt = null;
  if (planKey === 'monthly') expiresAt = Timestamp.fromMillis(now + 30 * 24 * 60 * 60 * 1000);
  else if (planKey === 'yearly') expiresAt = Timestamp.fromMillis(now + 365 * 24 * 60 * 60 * 1000);
  await updateDoc(doc(db, 'users', uid), {
    plan: planKey,
    planActivatedAt: serverTimestamp(),
    planExpiresAt: expiresAt,
    planContacted: true,
  });
}

/* ---------- admin bootstrap helper (run once manually, see README) ---------- */
export async function grantAdmin(uid) {
  await setDoc(doc(db, 'admins', uid), { grantedAt: serverTimestamp() });
}

/* ---------- reklama (admin -> hammaga, sidebar'da chiqadi) ---------- */
const DEFAULT_AD = { enabled: false, title: '', text: '', link: '', image: null };
export function watchAd(callback) {
  return onSnapshot(doc(db, 'settings', 'ad'), snap => {
    callback(snap.exists() ? snap.data() : DEFAULT_AD);
  });
}
export async function saveAd(data) {
  await setDoc(doc(db, 'settings', 'ad'), data, { merge: true });
}

/* ---------- ish reja / dars ishlanmasi hujjatlari (guruhga bog'liq) ---------- */
export function watchGroupDocs(groupId, callback) {
  const q = query(collection(db, 'groupDocs'), where('groupId', '==', groupId));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}
export async function addGroupDoc(teacherId, groupId, { title, category, fileName, fileData }) {
  const ref = await addDoc(collection(db, 'groupDocs'), {
    teacherId, groupId, title, category, fileName, fileData, createdAt: serverTimestamp()
  });
  return ref.id;
}
export async function deleteGroupDoc(docId) {
  await deleteDoc(doc(db, 'groupDocs', docId));
}
