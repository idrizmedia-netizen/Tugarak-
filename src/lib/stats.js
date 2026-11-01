import { gradeDay, mean } from './grades.js';
import { DATE_STR_RE } from './dates.js';
import { num } from './safe.js';

const MONTH_RE = /^\d{4}-\d{2}$/;

/** Guruh o'rtachasi oylar bo'yicha: [{ key: '2026-10', value, n }] (oy tartibida). */
export function monthlyGroupAverages(students) {
  const byMonth = new Map();
  for (const s of students) {
    for (const g of s.grades || []) {
      const v = num(g.value);
      if (!(v >= 1 && v <= 5)) continue;
      const k = gradeDay(g).slice(0, 7);
      if (!MONTH_RE.test(k)) continue;
      if (!byMonth.has(k)) byMonth.set(k, []);
      byMonth.get(k).push(v);
    }
  }
  return [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, arr]) => ({ key, value: mean(arr), n: arr.length }));
}

/** Davomat dinamikasi oylar bo'yicha (foiz). fromDate — yangi o'quv yili boshlangan sana ('' bo'lsa hammasi).
 *  Faqat hozirgi o'quvchilar (studentIds) hisobga olinadi. */
export function attendanceMonthly(attendance, studentIds, fromDate = '') {
  const ids = new Set(studentIds);
  const byMonth = new Map();
  for (const a of attendance || []) {
    if (typeof a.date !== 'string' || !DATE_STR_RE.test(a.date)) continue;
    if (fromDate && a.date < fromDate) continue;
    const k = a.date.slice(0, 7);
    for (const [id, present] of Object.entries(a.records || {})) {
      if (!ids.has(id)) continue;
      if (!byMonth.has(k)) byMonth.set(k, { p: 0, total: 0 });
      const m = byMonth.get(k);
      m.total++; if (present) m.p++;
    }
  }
  return [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b))
    .filter(([, m]) => m.total > 0)
    .map(([key, m]) => ({ key, value: (m.p / m.total) * 100, n: m.total }));
}

/** Bitta o'quvchining oylik o'rtachalari: [{ key, value }]. */
export function studentMonthAverages(s) {
  const byMonth = new Map();
  for (const g of s.grades || []) {
    const v = num(g.value);
    if (!(v >= 1 && v <= 5)) continue;
    const k = gradeDay(g).slice(0, 7);
    if (!MONTH_RE.test(k)) continue;
    if (!byMonth.has(k)) byMonth.set(k, []);
    byMonth.get(k).push(v);
  }
  return [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, arr]) => ({ key, value: mean(arr) }));
}

/** Eng ko'p o'sgan o'quvchilar: eng birinchi va eng oxirgi baholangan oy o'rtachasi farqi (kamida 2 ta oy kerak). */
export function topGrowers(students, limit = 5, minDelta = 0.1) {
  return students.map(s => {
    const m = studentMonthAverages(s);
    if (m.length < 2) return null;
    const first = m[0], last = m[m.length - 1];
    return { student: s, from: first.value, to: last.value, delta: last.value - first.value, fromKey: first.key, toKey: last.key };
  }).filter(r => r && r.delta >= minDelta)
    .sort((a, b) => b.delta - a.delta || (a.student.fullName || '').localeCompare(b.student.fullName || '', 'uz'))
    .slice(0, limit);
}
