import { DATE_STR_RE, ymdOf } from './dates.js';
import { num, clip, invalid } from './safe.js';
import { quarterOfMonth } from './months.js';

/** Baholar ro'yxatini tekshirib, tozalangan nusxasini qaytaradi (eng ko'pi 300 ta). */
export function sanitizeGrades(grades) {
  return (grades || []).slice(0, 300).map(g => {
    const v = Number(g.value);
    const sub = clip(g.subject, 60);
    if (!Number.isInteger(v) || v < 1 || v > 5 || !sub) throw invalid('grade');
    const date = Number(g.date);
    const out = { subject: sub, value: v, date: Number.isFinite(date) ? date : Date.now(), period: g.period ? clip(g.period, 20) : null };
    if (DATE_STR_RE.test(g.day || '')) out.day = g.day; // jurnal dars sanasi
    return out;
  });
}

/** Bahoning dars sanasi: jurnaldan qo'yilgan bo'lsa `day`, eski baholarda qo'yilgan vaqtidan. */
export function gradeDay(g) { return DATE_STR_RE.test(g.day || '') ? g.day : ymdOf(new Date(num(g.date))); }
export function validGradeValues(s) { return (s.grades || []).map(g => num(g.value)).filter(v => v >= 1 && v <= 5); }
export function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
export function studentAvg(s) { return mean(validGradeValues(s)); }

/** Joriy o'quv yili (1-sentabrdan 31-avgustgacha) chegaralari, millisekundda. */
export function academicYearRange(now = new Date()) {
  const y = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return { start: new Date(y, 8, 1).getTime(), end: new Date(y + 1, 8, 1).getTime() };
}

/** Joriy o'quv yilidagi baholar choraklar bo'yicha: { 1: [..], 2: [..], 3: [..], 4: [..] }. */
export function quarterBuckets(s, ay = academicYearRange()) {
  const byQ = { 1: [], 2: [], 3: [], 4: [] };
  (s.grades || []).forEach(g => {
    if (typeof g.date === 'number' && (g.date < ay.start || g.date >= ay.end)) return;
    const q = quarterOfMonth(g.period);
    const v = num(g.value);
    if (q && v >= 1 && v <= 5) byQ[q].push(v);
  });
  return byQ;
}

/** Qo'lda qo'yiladigan chorak/yillik baholar: student.qGrades = { q1, q2, q3, q4, year } (1..5). */
export const Q_KEYS = ['q1', 'q2', 'q3', 'q4', 'year'];
export function qGradesOf(s) {
  const raw = s && typeof s.qGrades === 'object' && s.qGrades ? s.qGrades : {};
  const out = {};
  Q_KEYS.forEach(k => { const v = raw[k]; if (Number.isInteger(v) && v >= 1 && v <= 5) out[k] = v; });
  return out;
}

/** Chorak/yillik ustun uchun: { q1: {manual, auto}, ..., year: {manual, auto} }. auto — baholar o'rtachasi (yoki null). */
export function quarterSummary(s, ay = academicYearRange()) {
  const b = quarterBuckets(s, ay);
  const q = qGradesOf(s);
  const cell = (key, arr) => ({ manual: q[key] ?? null, auto: arr.length ? mean(arr) : null });
  return {
    q1: cell('q1', b[1]), q2: cell('q2', b[2]), q3: cell('q3', b[3]), q4: cell('q4', b[4]),
    year: cell('year', [...b[1], ...b[2], ...b[3], ...b[4]])
  };
}

/** Bitta oy (YYYY-MM) uchun o'rtacha baho; baho yo'q bo'lsa null. */
export function monthAverage(s, month) {
  const v = (s.grades || []).filter(g => gradeDay(g).startsWith(month)).map(g => num(g.value)).filter(x => x >= 1 && x <= 5);
  return v.length ? mean(v) : null;
}
