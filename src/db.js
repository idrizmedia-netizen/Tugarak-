import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDocs, getDoc, setDoc,
  query, where, orderBy, onSnapshot, serverTimestamp, arrayUnion
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
    free: { price: 0, discount: 0, features: ["1 ta guruh", "20 tagacha o'quvchi", "Asosiy hisobotlar"] },
    monthly: { price: 49000, discount: 0, features: ["Cheksiz guruh", "Cheksiz o'quvchi", "Excel eksport", "Bildirishnomalar"] },
    yearly: { price: 490000, discount: 15, features: ["Cheksiz guruh", "Cheksiz o'quvchi", "Excel eksport", "Bildirishnomalar", "Ustuvor yordam"] },
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
  await updateDoc(doc(db, 'users', uid), { selectedPlan: planKey });
}

/* ---------- admin bootstrap helper (run once manually, see README) ---------- */
export async function grantAdmin(uid) {
  await setDoc(doc(db, 'admins', uid), { grantedAt: serverTimestamp() });
}
