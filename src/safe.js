// src/safe.js — XSS himoyasi va kiritilgan ma'lumotni tekshirish yordamchilari

const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };

/** Foydalanuvchi matnini innerHTML ichiga qo'yishdan oldin shu bilan o'tkazing. */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"'`]/g, (ch) => MAP[ch]);
}

/**
 * Tagged template: html`<td>${ism}</td>` — barcha ${...} avtomatik escape qilinadi.
 * Ichki tayyor HTML kerak bo'lsa raw(...) bilan o'rang.
 */
export function raw(str) {
  return { __raw: String(str) };
}
export function html(strings, ...values) {
  return strings.reduce((out, s, i) => {
    const v = values[i - 1];
    const part = v && typeof v === 'object' && '__raw' in v ? v.__raw : esc(v);
    return out + part + s;
  });
}

/** Ism/nom: ortiqcha bo'sh joylarni olib tashlab, uzunlikni cheklaydi. */
export function cleanName(value, max = 80) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Baho: faqat butun son, 0..max oralig'ida. Noto'g'ri bo'lsa null. */
export function parseGrade(value, max = 5) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > max) return null;
  return n;
}

/** O'rtacha: bo'sh ro'yxatda 0 ga bo'lishdan saqlanadi, 2 xonagacha yaxlitlaydi. */
export function average(grades) {
  const valid = grades.filter((g) => Number.isFinite(g));
  if (valid.length === 0) return 0;
  const sum = valid.reduce((a, b) => a + b, 0);
  return Math.round((sum / valid.length) * 100) / 100;
}
