import { gradeDay, qGradesOf } from './grades.js';
import { DATE_STR_RE } from './dates.js';
import { clip, num } from './safe.js';

/* Ota-onalar uchun faqat o'qish havolasi.
   Xavfsizlik modeli: havola = 192 bitli tasodifiy kalit (`/p/<kalit>`). Kalitni bilgan har kim FAQAT shu bitta
   `parentLinks/{kalit}` hujjatini o'qiy oladi (ro'yxat qilib bo'lmaydi). Hujjatda faqat o'quvchining ismi, guruh
   nomi, baholar, davomat va chorak baholari bor — telefon, manzil, tug'ilgan kun, rasm va to'lovlar YO'Q.
   Ma'lumot "surat" (snapshot) sifatida o'qituvchi yangilaganda yoziladi. */

export const PARENT_TOKEN_RE = /^[A-Za-z0-9_-]{32,64}$/;

export function newParentToken(cryptoObj = globalThis.crypto) {
  const bytes = new Uint8Array(24); // 24 bayt = 32 belgi (base64url)
  cryptoObj.getRandomValues(bytes);
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
/** "/p/<kalit>" yo'lidan kalitni oladi; boshqa yo'l yoki yaroqsiz kalit — null. */
export function parentTokenFromPath(pathname) {
  const m = /^\/p\/([^/]+)\/?$/.exec(String(pathname || ''));
  return m && PARENT_TOKEN_RE.test(m[1]) ? m[1] : null;
}
export function parentUrl(origin, token) { return `${origin}/p/${token}`; }

/** O'qituvchi tomonida: hujjatga yoziladigan "surat". Faqat ruxsat etilgan maydonlar. */
export function buildParentSnapshot({ group, student, attendance = [] }) {
  const grades = (student.grades || []).slice(0, 300)
    .map(g => ({ day: gradeDay(g), value: num(g.value) }))
    .filter(g => DATE_STR_RE.test(g.day) && g.value >= 1 && g.value <= 5);
  const att = {};
  attendance
    .filter(a => typeof a.date === 'string' && DATE_STR_RE.test(a.date) && a.records && Object.prototype.hasOwnProperty.call(a.records, student.id))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 400)
    .forEach(a => { att[a.date] = !!a.records[student.id]; });
  return {
    groupId: group.id,
    studentId: student.id,
    studentName: clip(student.fullName, 120),
    groupName: clip(group.name, 80),
    subject: clip(group.subject, 80),
    grades,
    attendance: att,
    qGrades: qGradesOf(student)
  };
}

/** Ota-ona sahifasida: Firestore'dan kelgan hujjatni tekshirib, xavfsiz ko'rinishga keltiradi. */
export function sanitizeParentData(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const grades = (Array.isArray(r.grades) ? r.grades : []).slice(0, 300)
    .map(g => ({ day: DATE_STR_RE.test(g?.day || '') ? g.day : '', value: num(g?.value) }))
    .filter(g => g.day && g.value >= 1 && g.value <= 5);
  const attendance = Object.entries(r.attendance && typeof r.attendance === 'object' ? r.attendance : {})
    .filter(([d, p]) => DATE_STR_RE.test(d) && typeof p === 'boolean')
    .map(([date, present]) => ({ date, present }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const ms = typeof r.updatedAt?.toMillis === 'function' ? r.updatedAt.toMillis() : 0;
  return {
    studentName: clip(r.studentName, 120),
    groupName: clip(r.groupName, 80),
    subject: clip(r.subject, 80),
    grades, attendance,
    qGrades: qGradesOf({ qGrades: r.qGrades }),
    updatedAtMs: ms
  };
}
