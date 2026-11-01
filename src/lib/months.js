/* Oy nomlari va choraklar. Saqlangan davr: yangi "m3" (til-mustaqil), eski "Aprel" / "April" / "Апрель". */
export const MONTHS_FULL = {
  uz: ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'],
  ru: ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
};
/** Saqlangan davrni oy raqamiga (0-11) o'giradi; topilmasa -1. */
export function monthIndexOf(p) {
  const v = String(p ?? '');
  const m = /^m(\d{1,2})$/.exec(v);
  if (m) return Number(m[1]) <= 11 ? Number(m[1]) : -1;
  for (const lang in MONTHS_FULL) { const i = MONTHS_FULL[lang].indexOf(v); if (i >= 0) return i; }
  return -1;
}
/** O'quv yili choraklari: Sen-Noy=1, Dek-Fev=2, Mar-May=3, Iyun-Avg=4. Noma'lum davr — null. */
export function quarterOfMonth(p) {
  const i = monthIndexOf(p);
  if (i < 0) return null;
  if ([8, 9, 10].includes(i)) return 1;
  if ([11, 0, 1].includes(i)) return 2;
  if ([2, 3, 4].includes(i)) return 3;
  return 4;
}
export function monthNames(lang) { return MONTHS_FULL[lang] || MONTHS_FULL.uz; }
export function monthShort(lang, i) { return (monthNames(lang)[i] || '').slice(0, 3); }
/** "2026-10" -> "Oktabr 2026" */
export function monthKeyTitle(lang, key) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(key || ''));
  if (!m) return '';
  return `${monthNames(lang)[Number(m[2]) - 1] || ''} ${m[1]}`;
}
