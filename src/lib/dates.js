/* Sana yordamchilari. Barcha sanalar mahalliy vaqtda "YYYY-MM-DD" ko'rinishida (toISOString() ishlatilmaydi:
   Toshkentda 00:00-05:00 oralig'ida kechagi sanani berardi). */
export const DATE_STR_RE = /^\d{4}-\d{2}-\d{2}$/;
export const pad2 = (n) => String(n).padStart(2, '0');

export function localDateStr(d) {
  d = d || new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
export const ymdOf = (d) => localDateStr(d);

export function parseYMD(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str || ''));
  return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
}
export function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }
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
/** 1=dushanba ... 7=yakshanba */
export function isoWeekday(y, m, d) { const w = new Date(y, m - 1, d).getDay(); return w === 0 ? 7 : w; }
