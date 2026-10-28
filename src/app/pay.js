import { t } from '../i18n.js';
import { updateStudentPayment } from '../db.js';
import { localDateStr, num, toast } from './util.js';
import { state } from './state.js';
import { studentAvg, validGradeValues } from './grades.js';

/* ---------- TO'LOV (oylik to'lov muddati) ----------
   va payDue bir oyga suriladi. Shu tufayli holat har doim sanadan hisoblanadi (qo'shimcha yangilash kerak emas). */
export const PAY_WARN_DAYS = 3;

export const pad2 = (n) => String(n).padStart(2, '0');

export function parseYMD(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str || ''));
  return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
}

function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }

export function daysBetween(fromStr, toStr) {
  const a = parseYMD(fromStr), b = parseYMD(toStr);
  if (!a || !b) return null;
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000);
}

/** Sanani bir oyga suradi, oyning kuni (day) saqlanadi (qisqa oyda oxirgi kunga tushadi). */
export function addMonthKeepDay(dateStr, day) {
  const p = parseYMD(dateStr);
  if (!p) return '';
  let y = p.y, m = p.m + 1;
  if (m > 12) { m = 1; y++; }
  return `${y}-${pad2(m)}-${pad2(Math.min(day || p.d, daysInMonth(y, m)))}`;
}

/** Bugundan boshlab eng yaqin to'lov kuni (bugun ham hisoblanadi). */
export function nextDueFromDay(payDay, todayStr) {
  const t0 = parseYMD(todayStr || localDateStr());
  const cand = Math.min(payDay, daysInMonth(t0.y, t0.m));
  if (cand >= t0.d) return `${t0.y}-${pad2(t0.m)}-${pad2(cand)}`;
  return addMonthKeepDay(`${t0.y}-${pad2(t0.m)}-${pad2(t0.d)}`, payDay);
}

export function validPayDay(v) { const n = Number(v); return Number.isInteger(n) && n >= 1 && n <= 31 ? n : null; }

export function fmtDMY(str) { const p = parseYMD(str); return p ? `${pad2(p.d)}.${pad2(p.m)}.${p.y}` : ''; }

export function fmtMoney(n) { return Number(n || 0).toLocaleString('ru-RU'); }

export function payStatus(s) {
  if (!parseYMD(s.payDue)) return { kind: 'none' };
  const today = localDateStr();
  if (parseYMD(s.paidThrough) && s.paidThrough >= today) return { kind: 'paid', until: s.paidThrough };
  const days = daysBetween(today, s.payDue);
  if (days < 0) return { kind: 'overdue', days: -days };
  if (days <= PAY_WARN_DAYS) return { kind: 'soon', days };
  return { kind: 'ok', days };
}

export function payText(st) {
  if (st.kind === 'paid') return t('payStatusPaid', { date: fmtDMY(st.until) });
  if (st.kind === 'overdue') return t('payStatusOverdue', { n: st.days });
  if (st.kind === 'soon') return st.days === 0 ? t('payStatusToday') : t('payDaysLeft', { n: st.days });
  if (st.kind === 'ok') return t('payDaysLeft', { n: st.days });
  return t('payStatusNone');
}

export function payStyle(kind) {
  if (kind === 'paid') return 'background:var(--teal);color:#fff;';
  if (kind === 'overdue') return 'background:var(--danger);color:#fff;';
  if (kind === 'soon') return 'background:var(--gold);color:#fff;';
  if (kind === 'ok') return 'background:var(--paper-2);color:var(--ink);';
  return 'background:transparent;color:var(--ink-soft);border:1px dashed var(--line);';
}

export function monthCollected(students) {
  const now = new Date();
  let sum = 0;
  students.forEach(s => (Array.isArray(s.payHistory) ? s.payHistory : []).forEach(h => {
    const at = num(h.at);
    if (!at) return;
    const d = new Date(at);
    if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) sum += num(h.amount);
  }));
  return sum;
}

/** Faol guruhda to'lov kuni belgilangan bo'lsa, yangi o'quvchilar uchun boshlang'ich muddat. */
export function groupPayDefaults() {
  const g = state.groups.find(x => x.id === state.activeGroupId);
  const day = validPayDay(g?.payDay);
  return day ? { payDay: day, payDue: nextDueFromDay(day) } : {};
}

export async function markStudentPaid(s, amount) {
  if (!parseYMD(s.payDue)) { toast(t('payNoDue'), 'error'); return false; }
  const day = validPayDay(s.payDay) || parseYMD(s.payDue).d;
  const hist = Array.isArray(s.payHistory) ? s.payHistory : [];
  const entry = { at: Date.now(), due: s.payDue, amount: Math.max(0, Math.round(num(amount))), prev: s.paidThrough || '' };
  await updateStudentPayment(s.id, {
    paidThrough: s.payDue, payDue: addMonthKeepDay(s.payDue, day), payDay: day,
    payHistory: [...hist, entry].slice(-24)
  });
  toast(t('payMarked'), 'info');
  return true;
}

/** Qidiruv va saralash. Standart tartib — qo'shilgan vaqti bo'yicha. */
export function visibleStudents(students) {
  const q = (state.studentQuery || '').trim().toLowerCase();
  let list = q ? students.filter(s => (s.fullName || '').toLowerCase().includes(q) || (s.className || '').toLowerCase().includes(q)) : [...students];
  const created = (s) => s.createdAt?.toMillis ? s.createdAt.toMillis() : Infinity; // hali yozilayotgani oxirida
  const byName = (a, b) => (a.fullName || '').localeCompare(b.fullName || '', 'uz');
  const graded = (s) => (s.grades && validGradeValues(s).length) ? studentAvg(s) : null;
  const sort = state.studentSort;
  if (sort === 'nameAsc') list.sort(byName);
  else if (sort === 'avgDesc') list.sort((a, b) => (graded(b) ?? -1) - (graded(a) ?? -1) || byName(a, b));
  else if (sort === 'avgAsc') list.sort((a, b) => (graded(a) ?? 99) - (graded(b) ?? 99) || byName(a, b));
  else if (sort === 'pay') {
    const rank = { overdue: 0, soon: 1, ok: 2, none: 3, paid: 4 };
    list.sort((a, b) => rank[payStatus(a).kind] - rank[payStatus(b).kind] || byName(a, b));
  } else list.sort((a, b) => created(a) - created(b));
  return list;
}
