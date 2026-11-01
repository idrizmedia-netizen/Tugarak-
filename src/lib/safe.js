/* Xavfsizlik va tozalash yordamchilari (DOM/Firebase'ga bog'liq emas — shuning uchun sinab ko'riladi). */

/** HTML ichiga qo'yishdan oldin matnni tozalaydi. */
export function esc(s) {
  return (s ?? '').toString().replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
/** Faqat data:image/... ko'rinishidagi rasm; aks holda bo'sh satr. */
export function safeImgSrc(v) {
  return (typeof v === 'string' && /^data:image\/(png|jpe?g|webp|gif);base64,/.test(v)) ? esc(v) : '';
}
/** Yuklab olinadigan hujjat uchun faqat data: havola (HTML/JS turlari emas). */
export function safeFileHref(v) {
  return (typeof v === 'string' && /^data:(application\/(pdf|msword|octet-stream|vnd\.openxmlformats-officedocument\.wordprocessingml\.document)|image\/(png|jpe?g));base64,/i.test(v)) ? esc(v) : '#';
}
/** Faqat http/https havolalar (javascript: va boshqalarni o'tkazmaydi). */
export function safeHttpUrl(u, base) {
  try {
    const b = base || (typeof location !== 'undefined' ? location.origin : 'http://localhost');
    const x = new URL(String(u || ''), b);
    return /^https?:$/.test(x.protocol) ? x.href : '#';
  } catch (e) { return '#'; }
}
export const clip = (s, n) => String(s ?? '').trim().slice(0, n);
export function invalid(msg) { const e = new Error(msg || 'invalid'); e.code = 'app/invalid'; return e; }
