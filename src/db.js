import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDocs, getDoc,
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
export async function addGrade(studentId, subject, value) {
  await updateDoc(doc(db, 'students', studentId), {
    grades: arrayUnion({ subject, value, date: Date.now() })
  });
}

/* ---------- admin bootstrap helper (run once manually, see README) ---------- */
export async function grantAdmin(uid) {
  const { setDoc } = await import('firebase/firestore');
  await setDoc(doc(db, 'admins', uid), { grantedAt: serverTimestamp() });
}
