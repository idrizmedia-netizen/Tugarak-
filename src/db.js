import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDocs, getDoc, setDoc,
  query, where, orderBy, limit, writeBatch, onSnapshot as _onSnapshot, serverTimestamp, arrayUnion, arrayRemove, deleteField, Timestamp
} from 'firebase/firestore';
import { db } from './firebase.js';

// Barcha real-vaqt tinglovchilar uchun xato ishlovchisi. Xato ishlovchisi bo'lmasa,
// permission-denied kabi xatolar "Uncaught" bo'lib qoladi va Firestore SDK'ning
// ichki holatini buzib (INTERNAL ASSERTION FAILED), keyingi so'rovlarni ham to'xtatadi.
function onSnapshot(ref, next, onError) {
  return _onSnapshot(ref, next, err => {
    console.warn('Firestore tinglovchi xatosi:', err.code, err.message);
    if (onError) onError(err);
  });
}

/* ---------- yordamchilar: kiritilgan ma'lumotni tozalash va tekshirish ---------- */
const clip = (s, n) => String(s ?? '').trim().slice(0, n);
function invalid(msg) { const e = new Error(msg || 'invalid'); e.code = 'app/invalid'; return e; }
const isImageData = (s) => typeof s === 'string' && /^data:image\/(png|jpe?g|webp|gif);base64,/.test(s);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
async function deleteRefsInChunks(refs) {
  for (let i = 0; i < refs.length; i += 400) {
    const chunk = refs.slice(i, i + 400);
    try {
      const batch = writeBatch(db);
      chunk.forEach(r => batch.delete(r));
      await batch.commit();
    } catch (e) {
      // Bitta yozuv ruxsat xatosi bersa ham qolganlarini o'chirishda davom etamiz.
      await Promise.allSettled(chunk.map(r => deleteDoc(r)));
    }
  }
}

/* ---------- hamkor qidiruvi uchun ochiq "katalog" ----------
   Avval har qanday kirgan foydalanuvchi BARCHA tasdiqlangan o'qituvchilarning email va
   telefonini ro'yxat qilib o'qiy olardi. Endi users hujjatlari yopiq; hamkor qo'shish uchun
   faqat aniq email bo'yicha teacherDirectory/{email} hujjati o'qiladi (ro'yxat qilib bo'lmaydi). */
const directoryKey = (email) => encodeURIComponent(String(email || '').trim().toLowerCase());
export async function syncTeacherDirectory(teachers) {
  const list = teachers.filter(tc => tc.email && tc.id);
  for (let i = 0; i < list.length; i += 400) {
    const batch = writeBatch(db);
    list.slice(i, i + 400).forEach(tc => {
      batch.set(doc(db, 'teacherDirectory', directoryKey(tc.email)), {
        uid: tc.id, fullName: clip(tc.fullName, 100), email: String(tc.email).trim().toLowerCase()
      });
    });
    await batch.commit();
  }
}

/* ---------- users (teachers) ---------- */
export function watchAllTeachers(callback) {
  const q = query(collection(db, 'users'), where('role', '==', 'teacher'));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}
export async function setTeacherStatus(uid, status, teacher) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'users', uid), { status, decidedAt: serverTimestamp() });
  if (status === 'approved' && teacher?.email) {
    batch.set(doc(db, 'teacherDirectory', directoryKey(teacher.email)), {
      uid, fullName: clip(teacher.fullName, 100), email: String(teacher.email).trim().toLowerCase()
    });
  }
  await batch.commit();
}
export async function rejectTeacher(uid, reason) {
  await updateDoc(doc(db, 'users', uid), { status: 'rejected', rejectionReason: clip(reason, 500), decidedAt: serverTimestamp() });
}
export async function resubmitApplication(uid, { resubmitReason, proofDoc }) {
  const data = {
    status: 'pending',
    resubmitReason: clip(resubmitReason, 500),
    rejectionReason: '',
    resubmittedAt: serverTimestamp()
  };
  if (proofDoc) {
    if (!isImageData(proofDoc) || proofDoc.length > 250000) throw invalid('proof');
    data.proofDocs = arrayUnion(proofDoc);
  }
  await updateDoc(doc(db, 'users', uid), data);
}
export async function updateTeacherProfile(uid, { fullName, phone }) {
  const name = clip(fullName, 100);
  if (!name) throw invalid('name');
  await updateDoc(doc(db, 'users', uid), { fullName: name, phone: clip(phone, 30) });
}

/* ---------- groups ---------- */
// Guruhlarni ikki xil so'rov orqali olamiz: (1) o'zim yaratgan guruhlar,
// (2) boshqa o'qituvchi meni hamkor sifatida qo'shgan guruhlar. Ikkalasini
// birlashtirib beramiz — shunda hamkor o'qituvchi ham guruhni o'z ro'yxatida ko'radi.
export function watchMyGroups(teacherId, callback) {
  let owned = [], shared = [];
  const emit = () => {
    const map = new Map();
    [...owned, ...shared].forEach(g => map.set(g.id, g));
    callback(Array.from(map.values()));
  };
  const q1 = query(collection(db, 'groups'), where('teacherId', '==', teacherId));
  const unsub1 = onSnapshot(q1, snap => { owned = snap.docs.map(d => ({ id: d.id, ...d.data() })); emit(); });
  const q2 = query(collection(db, 'groups'), where('coTeachers', 'array-contains', teacherId));
  const unsub2 = onSnapshot(q2, snap => { shared = snap.docs.map(d => ({ id: d.id, ...d.data() })); emit(); });
  return () => { unsub1(); unsub2(); };
}
export async function createGroup(teacherId, name, subject) {
  const n = clip(name, 80), sub = clip(subject, 80);
  if (!n || !sub) throw invalid('group');
  const ref = await addDoc(collection(db, 'groups'), {
    teacherId, name: n, subject: sub, coTeachers: [], createdAt: serverTimestamp()
  });
  return ref.id;
}
export async function updateGroup(groupId, { name, subject }) {
  const n = clip(name, 80), sub = clip(subject, 80);
  if (!n || !sub) throw invalid('group');
  await updateDoc(doc(db, 'groups', groupId), { name: n, subject: sub });
}
export async function deleteGroup(groupId) {
  // Guruhga tegishli BARCHA ma'lumot o'chiriladi: o'quvchilar, davomat, hujjatlar (ular katta
  // base64 fayllar bo'lishi mumkin) va yillik ish reja. Avval bolalar, eng oxirida guruhning o'zi
  // o'chiriladi (qoidalar guruh mavjud bo'lganda ruxsat beradi).
  for (const col of ['students', 'attendance', 'groupDocs']) {
    try {
      const snap = await getDocs(query(collection(db, col), where('groupId', '==', groupId)));
      await deleteRefsInChunks(snap.docs.map(d => d.ref));
    } catch (e) {
      console.warn(`${col} ni o\u2019chirishda ogohlantirish (davom etilmoqda):`, e);
    }
  }
  try { await deleteDoc(doc(db, 'workPlans', groupId)); }
  catch (e) { console.warn('Ish rejani o\u2019chirishda ogohlantirish:', e); }
  await deleteDoc(doc(db, 'groups', groupId));
}

/* ---------- hamkor o'qituvchilar (bitta guruhni birga boshqarish) ---------- */
export async function findApprovedTeacherByEmail(email) {
  const snap = await getDoc(doc(db, 'teacherDirectory', directoryKey(email)));
  if (!snap.exists()) return null;
  const d = snap.data();
  return { id: d.uid, fullName: d.fullName || '', email: d.email || String(email).trim().toLowerCase() };
}
export async function addCoTeacher(groupId, teacherUid, info) {
  await updateDoc(doc(db, 'groups', groupId), {
    coTeachers: arrayUnion(teacherUid),
    [`coTeacherInfo.${teacherUid}`]: info,
  });
}
export async function removeCoTeacher(groupId, teacherUid) {
  await updateDoc(doc(db, 'groups', groupId), {
    coTeachers: arrayRemove(teacherUid),
    [`coTeacherInfo.${teacherUid}`]: deleteField(),
  });
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
export async function addStudent(teacherId, groupId, { fullName, className, photo, fromPhoto, birthDate, address }) {
  const name = clip(fullName, 120);
  if (!name) throw invalid('student');
  if (photo && (!isImageData(photo) || photo.length > 250000)) throw invalid('photo');
  const ref = await addDoc(collection(db, 'students'), {
    teacherId, groupId, fullName: name, className: clip(className, 40),
    photo: photo || null, fromPhoto: !!fromPhoto,
    birthDate: DATE_RE.test(birthDate || '') ? birthDate : '', address: clip(address, 200),
    grades: [], createdAt: serverTimestamp()
  });
  return ref.id;
}
/** Ko'p o'quvchini bir yo'la (writeBatch) qo'shadi — bittadan await qilishdan ancha tez va arzon. */
export async function addStudentsBatch(teacherId, groupId, names, className) {
  const list = names.map(n => clip(n, 120)).filter(Boolean);
  for (let i = 0; i < list.length; i += 400) {
    const batch = writeBatch(db);
    list.slice(i, i + 400).forEach(fullName => {
      batch.set(doc(collection(db, 'students')), {
        teacherId, groupId, fullName, className: clip(className, 40),
        photo: null, fromPhoto: false, birthDate: '', address: '',
        grades: [], createdAt: serverTimestamp()
      });
    });
    await batch.commit();
  }
  return list.length;
}
export async function deleteStudent(studentId) {
  await deleteDoc(doc(db, 'students', studentId));
}
export async function addGrade(studentId, subject, value, period) {
  const v = Number(value);
  const sub = clip(subject, 60);
  if (!Number.isInteger(v) || v < 1 || v > 5 || !sub) throw invalid('grade');
  await updateDoc(doc(db, 'students', studentId), {
    grades: arrayUnion({ subject: sub, value: v, date: Date.now(), period: period ? clip(period, 20) : null })
  });
}

/* ---------- bildirishnomalar (admin -> hammaga) ---------- */
export function watchNotifications(callback) {
  const q = query(collection(db, 'notifications'), orderBy('createdAt', 'desc'), limit(100));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}
export async function createNotification(title, message) {
  await addDoc(collection(db, 'notifications'), { title: clip(title, 120), message: clip(message, 1000), createdAt: serverTimestamp() });
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
export async function cancelSubscription(uid) {
  // Obunani bekor qilish: foydalanuvchi darhol bepul rejaga qaytadi.
  await updateDoc(doc(db, 'users', uid), {
    plan: 'free', planExpiresAt: null, selectedPlan: null, planContacted: false
  });
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

/* ---------- reklama (admin -> hammaga, bir nechta reklama, tepada karusel) ---------- */
export function watchAds(callback) {
  const q = query(collection(db, 'ads'), orderBy('createdAt', 'desc'), limit(50));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}
export async function addAd(data) {
  const ref = await addDoc(collection(db, 'ads'), { ...data, createdAt: serverTimestamp() });
  return ref.id;
}
export async function updateAd(id, data) {
  await updateDoc(doc(db, 'ads', id), data);
}
export async function deleteAd(id) {
  await deleteDoc(doc(db, 'ads', id));
}

/* ---------- ish reja / dars ishlanmasi hujjatlari (guruhga bog'liq) ----------
   Eslatma: bu va quyidagi (davomat, ish reja) ma'lumotlar endi doimiy
   real-vaqtli tinglovchi (onSnapshot) orqali emas, balki oyna ochilganda
   BIR MARTA (getDocs) o'qiladi. Sabab: har guruh almashtirilganda 4-5 ta
   tinglovchini bir vaqtda uzib-ulash Firestore SDK'sining ichki xatosini
   ("INTERNAL ASSERTION FAILED") keltirib chiqarishi mumkin edi. */
export function watchGroupDocs(groupId, callback) {
  const q = query(collection(db, 'groupDocs'), where('groupId', '==', groupId));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}
export async function getGroupDocsOnce(groupId) {
  const q = query(collection(db, 'groupDocs'), where('groupId', '==', groupId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function addGroupDoc(teacherId, groupId, { title, category, fileName, fileData }) {
  if (!['workplan', 'lesson'].includes(category)) throw invalid('category');
  if (typeof fileData !== 'string' || !/^data:[a-z0-9\/.+-]*;base64,/i.test(fileData) || fileData.length > 800000) throw invalid('file');
  const ref = await addDoc(collection(db, 'groupDocs'), {
    teacherId, groupId, title: clip(title, 120), category, fileName: clip(fileName, 150), fileData, createdAt: serverTimestamp()
  });
  return ref.id;
}
export async function deleteGroupDoc(docId) {
  await deleteDoc(doc(db, 'groupDocs', docId));
}

/* ---------- davomat (yo'qlama) ---------- */
export function watchGroupAttendance(groupId, callback) {
  const q = query(collection(db, 'attendance'), where('groupId', '==', groupId));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}
export async function getAttendanceOnce(groupId) {
  const q = query(collection(db, 'attendance'), where('groupId', '==', groupId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function saveAttendance(teacherId, groupId, date, records) {
  if (!DATE_RE.test(date || '')) throw invalid('date');
  const docId = `${groupId}_${date}`;
  await setDoc(doc(db, 'attendance', docId), {
    teacherId, groupId, date, records, updatedAt: serverTimestamp()
  }, { merge: true });
}

/* ---------- yillik ish reja (rasmiy to'garak daftari formatida: Mavzu/Soat/Sana/Izoh) ---------- */
export function watchWorkPlan(groupId, callback) {
  return onSnapshot(doc(db, 'workPlans', groupId), snap => {
    callback(snap.exists() ? snap.data().items || [] : []);
  });
}
export async function getWorkPlanOnce(groupId) {
  const snap = await getDoc(doc(db, 'workPlans', groupId));
  return snap.exists() ? snap.data().items || [] : [];
}
export async function saveWorkPlanItems(teacherId, groupId, items) {
  const clean = (items || []).slice(0, 300).map(r => ({
    topic: clip(r.topic, 200), hours: clip(r.hours, 10), date: clip(r.date, 10), note: clip(r.note, 300)
  }));
  await setDoc(doc(db, 'workPlans', groupId), { teacherId, groupId, items: clean }, { merge: true });
}

/* ---------- admin: butun tizim bo'yicha hisobotlar uchun to'liq ma'lumot ----------
   Avval bu kolleksiyalar doimiy tinglanardi (onSnapshot): har bir o'quvchi/baho o'zgarishi admin
   brauzeriga qayta yuklanib, Spark rejasidagi o'qish limitini tez tugatardi. Endi bir marta
   o'qiladi (getDocs); main.js kerak bo'lganda (sahifaga qaytganda, 5 daqiqadan keyin) yangilaydi. */
export async function getAllGroupsAdminOnce() {
  const snap = await getDocs(collection(db, 'groups'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function getAllStudentsAdminOnce() {
  const snap = await getDocs(collection(db, 'students'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
