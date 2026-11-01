import { isoWeekday, daysInMonth, pad2, parseYMD } from './dates.js';
import { gradeDay, monthAverage, quarterSummary, academicYearRange } from './grades.js';
import { num } from './safe.js';

/** Jurnal ustunlari: dars kunlari + (dars kuni bo'lmasa ham) baho qo'yilgan yoki qo'lda qo'shilgan sanalar. */
export function buildJournalColumns(group, students, month, extraDays = []) {
  const [y, m] = month.split('-').map(Number);
  const wds = Array.isArray(group?.weekdays) ? group.weekdays : [];
  const regular = new Set();
  for (let d = 1; d <= daysInMonth(y, m); d++) {
    if (wds.includes(isoWeekday(y, m, d))) regular.add(`${y}-${pad2(m)}-${pad2(d)}`);
  }
  const extra = new Set();
  students.forEach(s => (s.grades || []).forEach(g => { const dd = gradeDay(g); if (dd.startsWith(month) && !regular.has(dd)) extra.add(dd); }));
  (extraDays || []).forEach(dd => { if (dd.startsWith(month) && !regular.has(dd)) extra.add(dd); });
  return [...regular].map(day => ({ day, extra: false }))
    .concat([...extra].map(day => ({ day, extra: true })))
    .sort((a, b) => a.day.localeCompare(b.day));
}

/* ---------- klaviatura bilan tez baholash ---------- */
const GRADE_KEYS = { '5': 5, '4': 4, '3': 3, '2': 2 };
export function gradeKeyValue(key) { return GRADE_KEYS[key] ?? null; }
const ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
export const isNavKey = (key) => ARROWS.includes(key);

/** Tanlangan katakni strelkalar bilan siljitadi. Tanlov yo'q yoki noto'g'ri bo'lsa — birinchi o'quvchi,
 *  bugungi (yoki birinchi) ustun. Chegarada to'xtaydi (aylanmaydi). */
export function moveSelection(sel, key, cols, rowIds, today) {
  if (!cols.length || !rowIds.length) return null;
  let r = sel ? rowIds.indexOf(sel.studentId) : -1;
  let c = sel ? cols.findIndex(x => x.day === sel.day) : -1;
  if (r < 0 || c < 0) {
    r = 0;
    c = Math.max(0, cols.findIndex(x => x.day === today));
    return { studentId: rowIds[r], day: cols[c].day };
  }
  if (key === 'ArrowRight') c = Math.min(cols.length - 1, c + 1);
  else if (key === 'ArrowLeft') c = Math.max(0, c - 1);
  else if (key === 'ArrowDown') r = Math.min(rowIds.length - 1, r + 1);
  else if (key === 'ArrowUp') r = Math.max(0, r - 1);
  else if (key === 'Home') c = 0;
  else if (key === 'End') c = cols.length - 1;
  return { studentId: rowIds[r], day: cols[c].day };
}

/** Katakka baho qo'yish rejasi: 0 ta baho — qo'shish; 1 ta — almashtirish (bir xil bo'lsa hech narsa);
 *  2 va undan ko'p — yana qo'shish (oynadagi xatti-harakat bilan bir xil). */
export function planGradeWrite(student, day, value) {
  const gs = (student.grades || []).filter(g => gradeDay(g) === day);
  if (gs.length === 0) return { op: 'add' };
  if (gs.length === 1) return num(gs[0].value) === value ? { op: 'noop' } : { op: 'replace', target: gs[0] };
  return { op: 'add' };
}
/** O'chirish tugmasi: shu kundagi OXIRGI bahoni o'chiradi. */
export function planGradeClear(student, day) {
  const gs = (student.grades || []).filter(g => gradeDay(g) === day);
  return gs.length ? { op: 'remove', target: gs[gs.length - 1] } : { op: 'noop' };
}

/** Bitta tugma bosilishini harakatga aylantiradi (DOM'siz — sinash oson).
 *  ctx: { active, locked, cols, rowIds, sel, today }.  Natija: null (e'tiborsiz) yoki
 *  { type: 'select', sel } | { type: 'grade', value } | { type: 'clear' } | { type: 'open' } | { type: 'deselect' } */
export function decideJournalKey(e, ctx) {
  if (!ctx.active || e.ctrlKey || e.metaKey || e.altKey) return null;
  // Tanlov bo'lmasa (yoki yaroqsiz bo'lsa) hech narsa qilinmaydi: strelkalar odatdagidek sahifani aylantiradi.
  // Tanlash — katakni bosish bilan boshlanadi.
  const valid = ctx.sel && ctx.rowIds.includes(ctx.sel.studentId) && ctx.cols.some(c => c.day === ctx.sel.day);
  if (!valid) return null;
  if (isNavKey(e.key)) {
    const sel = moveSelection(ctx.sel, e.key, ctx.cols, ctx.rowIds, ctx.today);
    return sel ? { type: 'select', sel } : null;
  }
  if (e.key === 'Escape') return { type: 'deselect' };
  if (e.key === 'Enter') return { type: 'open' };
  if (ctx.locked) return null;
  const v = gradeKeyValue(e.key);
  if (v) return { type: 'grade', value: v };
  if (e.key === 'Delete' || e.key === 'Backspace') return { type: 'clear' };
  return null;
}

/* ---------- Excel: oylik jurnal varag'i ---------- */
const round2 = (v) => Math.round(v * 100) / 100;

/** Oylik jurnal: sanalar × o'quvchilar. attendanceByDay: { 'YYYY-MM-DD': { records } | null }.
 *  labels: { num, name, avg, q1, q2, q3, q4, year, absent, legend }. Natija — massivlar massivi (aoa_to_sheet uchun). */
export function buildJournalSheet({ students, month, cols, attendanceByDay = {}, labels, ay = academicYearRange() }) {
  const head = [labels.num, labels.name,
    ...cols.map(c => { const p = parseYMD(c.day); return `${pad2(p.d)}.${pad2(p.m)}${c.extra ? '*' : ''}`; }),
    labels.avg, labels.q1, labels.q2, labels.q3, labels.q4, labels.year];
  const sorted = students.slice().sort((a, b) => (a.fullName || '').localeCompare(b.fullName || '', 'uz'));
  const body = sorted.map((s, i) => {
    const cells = cols.map(c => {
      const gs = (s.grades || []).filter(g => gradeDay(g) === c.day);
      if (gs.length) return gs.map(g => num(g.value)).join('/');
      const rec = attendanceByDay[c.day]?.records;
      return rec && rec[s.id] === false ? labels.absent : '';
    });
    const avg = monthAverage(s, month);
    const q = quarterSummary(s, ay);
    const qv = (c) => c.manual ?? (c.auto === null ? '' : round2(c.auto));
    return [i + 1, s.fullName || '', ...cells, avg === null ? '' : round2(avg), qv(q.q1), qv(q.q2), qv(q.q3), qv(q.q4), qv(q.year)];
  });
  return [head, ...body, [], [labels.legend]];
}
