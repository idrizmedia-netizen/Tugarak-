import { getLang, t } from '../i18n.js';
import { academicYearRange, esc, num } from './util.js';
import { state } from './state.js';

/* ---------- ADMIN DASHBOARD ---------- */
export function monthKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthShortLabel(key) {
  const [y, m] = key.split('-');
  const names = { uz: ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyun', 'Iyul', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'],
    ru: ['\u042f\u043d\u0432', '\u0424\u0435\u0432', '\u041c\u0430\u0440', '\u0410\u043f\u0440', '\u041c\u0430\u0439', '\u0418\u044e\u043d', '\u0418\u044e\u043b', '\u0410\u0432\u0433', '\u0421\u0435\u043d', '\u041e\u043a\u0442', '\u041d\u043e\u044f', '\u0414\u0435\u043a'],
    en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] };
  const arr = names[getLang()] || names.uz;
  return `${arr[parseInt(m) - 1]} ${y}`;
}

/* ---------- TEACHER DASHBOARD ---------- */
/** Arxivga yoziladigan o'quv yili nomi: eng oxirgi baho sanasiga qarab ("2025-2026"). Sentabrdan yangi yil boshlanadi. */
export function defaultYearLabel(students) {
  let maxDate = 0;
  students.forEach(s => (s.grades || []).forEach(g => { const d = num(g.date); if (d > maxDate) maxDate = d; }));
  const d = maxDate ? new Date(maxDate) : new Date();
  const y = d.getFullYear();
  return d.getMonth() >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

/** Bahoni (sana + fan + qiymat bo'yicha) topadi: ro'yxat tartibi o'zgarsa ham to'g'ri bahoga tegadi. */
export function findGrade(s, ref) {
  if (!ref) return null;
  return (s.grades || []).find(g => g.date === ref.date && g.subject === ref.subject && num(g.value) === ref.value) || null;
}

export function validGradeValues(s) { return (s.grades || []).map(g => num(g.value)).filter(v => v >= 1 && v <= 5); }

export function studentAvg(s) { const v = validGradeValues(s); if (!v.length) return 0; return v.reduce((a, b) => a + b, 0) / v.length; }

export function studentAttendancePercent(studentId) {
  if (!state.attendance.length) return null;
  // Yangi o'quv yili boshlangan bo'lsa, foiz faqat shu sanadan keyingi darslardan hisoblanadi.
  const from = state.groups.find(g => g.id === state.activeGroupId)?.yearStart || '';
  let total = 0, present = 0;
  state.attendance.forEach(a => {
    if (from && String(a.date || '') < from) return;
    if (a.records && Object.prototype.hasOwnProperty.call(a.records, studentId)) {
      total++;
      if (a.records[studentId]) present++;
    }
  });
  if (!total) return null;
  return Math.round((present / total) * 100);
}

export function gradeClass(v) { if (v >= 5) return 'g5'; if (v >= 4) return 'g4'; if (v >= 3) return 'g3'; return 'g2'; }

export function levelLabel(avg) {
  if (avg === 0) return { label: t('levelUngraded'), c: 'var(--ink-soft)' };
  if (avg >= 4.5) return { label: t('levelExcellent'), c: 'var(--teal)' };
  if (avg >= 3.5) return { label: t('levelGood'), c: '#2E6FA8' };
  if (avg >= 3) return { label: t('levelSatisfactory'), c: 'var(--gold)' };
  return { label: t('levelUnsatisfactory'), c: 'var(--danger)' };
}

export const MONTHS_FULL = {
  uz: ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'],
  ru: ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
};

/** Saqlangan davrni (yangi: "m3", eski: "Aprel" / "April" / "Апрель") oy raqamiga (0-11) o'giradi; topilmasa -1. */
export function monthIndexOf(p) {
  const v = String(p ?? '');
  const m = /^m(\d{1,2})$/.exec(v);
  if (m) return Number(m[1]) <= 11 ? Number(m[1]) : -1;
  for (const lang in MONTHS_FULL) { const i = MONTHS_FULL[lang].indexOf(v); if (i >= 0) return i; }
  return -1;
}

/** Saqlangan davrni joriy tildagi oy nomiga o'giradi (noma'lum bo'lsa — o'zini qaytaradi). */
export function periodLabel(p) {
  const i = monthIndexOf(p);
  return i >= 0 ? (MONTHS_FULL[getLang()] || MONTHS_FULL.uz)[i] : String(p ?? '');
}

/** Oylar ro'yxati. selected: tanlangan oy raqami (standart: joriy oy). withEmpty — "davrsiz" varianti. */
export function monthOptionsHTML(selected, withEmpty) {
  const arr = MONTHS_FULL[getLang()] || MONTHS_FULL.uz;
  const sel = selected === undefined ? new Date().getMonth() : selected;
  // Qiymat til-mustaqil (m0..m11): keyinchalik til almashsa ham chorak to'g'ri aniqlanadi.
  return (withEmpty ? `<option value="" ${sel < 0 ? 'selected' : ''}>${t('gradeNoPeriod')}</option>` : '')
    + arr.map((name, i) => `<option value="m${i}" ${i === sel ? 'selected' : ''}>${name}</option>`).join('');
}

function quarterOfMonth(monthName) {
  const mm = /^m(\d{1,2})$/.exec(String(monthName ?? ''));
  if (mm) {
    const mi = Number(mm[1]);
    if (mi > 11) return null;
    if ([8, 9, 10].includes(mi)) return 1;
    if ([11, 0, 1].includes(mi)) return 2;
    if ([2, 3, 4].includes(mi)) return 3;
    return 4;
  }
  const idx = { Yanvar: 0, Fevral: 1, Mart: 2, Aprel: 3, May: 4, Iyun: 5, Iyul: 6, Avgust: 7, Sentabr: 8, Oktabr: 9, Noyabr: 10, Dekabr: 11,
    '\u042f\u043d\u0432\u0430\u0440\u044c': 0, '\u0424\u0435\u0432\u0440\u0430\u043b\u044c': 1, '\u041c\u0430\u0440\u0442': 2, '\u0410\u043f\u0440\u0435\u043b\u044c': 3, '\u041c\u0430\u0439': 4, '\u0418\u044e\u043d\u044c': 5, '\u0418\u044e\u043b\u044c': 6, '\u0410\u0432\u0433\u0443\u0441\u0442': 7, '\u0421\u0435\u043d\u0442\u044f\u0431\u0440\u044c': 8, '\u041e\u043a\u0442\u044f\u0431\u0440\u044c': 9, '\u041d\u043e\u044f\u0431\u0440\u044c': 10, '\u0414\u0435\u043a\u0430\u0431\u0440\u044c': 11,
    January: 0, February: 1, March: 2, April: 3, June: 5, July: 6, August: 7, September: 8, October: 9, November: 10, December: 11 };
  const m = idx[monthName];
  if (m === undefined) return null;
  // O'quv yili: Sen-Noy=1chorak, Dek-Fev=2, Mar-May=3, Iyun-Avg=4
  if ([8, 9, 10].includes(m)) return 1;
  if ([11, 0, 1].includes(m)) return 2;
  if ([2, 3, 4].includes(m)) return 3;
  return 4;
}

export function renderQuarterlyContent(groupId) {
  const students = state.students.filter(s => s.groupId === groupId);
  if (!students.length || !students.some(s => s.grades?.length)) {
    return `<div class="empty">${t('mQuarterlyEmpty')}</div>`;
  }
  const qLabels = { 1: t('q1'), 2: t('q2'), 3: t('q3'), 4: t('q4') };
  const ay = academicYearRange();
  let html = `<table><thead><tr><th>${t('colFullName')}</th><th>${qLabels[1]}</th><th>${qLabels[2]}</th><th>${qLabels[3]}</th><th>${qLabels[4]}</th></tr></thead><tbody>`;
  students.forEach(s => {
    const byQ = { 1: [], 2: [], 3: [], 4: [] };
    (s.grades || []).forEach(g => {
      // Faqat joriy o'quv yilidagi baholar (aks holda o'tgan yil baholari ham aralashib ketardi).
      if (typeof g.date === 'number' && (g.date < ay.start || g.date >= ay.end)) return;
      const q = quarterOfMonth(g.period);
      const v = num(g.value);
      if (q && v >= 1 && v <= 5) byQ[q].push(v);
    });
    const cell = (arr) => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : '\u2014';
    html += `<tr><td><b>${esc(s.fullName)}</b></td><td>${cell(byQ[1])}</td><td>${cell(byQ[2])}</td><td>${cell(byQ[3])}</td><td>${cell(byQ[4])}</td></tr>`;
  });
  html += `</tbody></table>`;
  return html;
}

/* ================= TEKSHIRUVCHI UCHUN HISOBOT (chop etish) =================
   sahifaning dizayniga (styles.css) bog'liq emas. */
export function quarterAverages(s) {
  const ay = academicYearRange();
  const byQ = { 1: [], 2: [], 3: [], 4: [] };
  (s.grades || []).forEach(g => {
    if (typeof g.date === 'number' && (g.date < ay.start || g.date >= ay.end)) return;
    const q = quarterOfMonth(g.period);
    const v = num(g.value);
    if (q && v >= 1 && v <= 5) byQ[q].push(v);
  });
  return [1, 2, 3, 4].map(q => byQ[q].length ? (byQ[q].reduce((a, b) => a + b, 0) / byQ[q].length).toFixed(2) : '\u2014');
}
