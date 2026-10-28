import { t } from '../i18n.js';
import { state } from './state.js';
import { render } from './render.js';

/** Rasmni kichraytirib, siqilgan base64 (JPEG) shaklga o'giradi.
 *  Firebase Storage o'rniga to'g'ridan-to'g'ri Firestore'da saqlash uchun
 *  (Spark/bepul reja bilan mos ishlashi maqsadida) rasm hajmi cheklanadi. */
export function fileToCompressedBase64(file, maxWidth = 480, quality = 0.6) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        // JPEG shaffoflikni bilmaydi: oq fon chizilmasa, shaffof PNG qora bo'lib qoladi.
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = ev.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const uid = () => 'x' + Math.random().toString(36).slice(2, 9);

export function esc(s) { return (s ?? '').toString().replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

/* ---------- XAVFSIZLIK YORDAMCHILARI ----------
   qo'yilardi: zararli foydalanuvchi atribut ichiga kod yozib, admin brauzerida ishlatishi mumkin edi. */
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
export function safeHttpUrl(u) {
  try {
    const x = new URL(String(u || ''), location.origin);
    return /^https?:$/.test(x.protocol) ? x.href : '#';
  } catch (e) { return '#'; }
}

/** Mahalliy (UTC emas!) sana: YYYY-MM-DD. toISOString() Toshkentda 00:00-05:00 oralig'ida kechagi sanani berardi. */
export function localDateStr(d) {
  d = d || new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Joriy o'quv yili (1-sentabrdan 31-avgustgacha) chegaralari, millisekundda. */
export function academicYearRange() {
  const now = new Date();
  const y = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return { start: new Date(y, 8, 1).getTime(), end: new Date(y + 1, 8, 1).getTime() };
}

export function friendlyError(err) {
  const code = err?.code || '';
  const map = {
    'app/in-app-browser': t('errInApp'),
    'app/invalid': t('errInvalid'),
    'auth/user-not-found': t('errUserNotFound'),
    'auth/wrong-password': t('errWrongPassword'),
    'auth/invalid-credential': t('errInvalidCredential'),
    'auth/email-already-in-use': t('errEmailInUse'),
    'auth/weak-password': t('errWeakPassword'),
    'auth/invalid-email': t('errInvalidEmail'),
    'auth/too-many-requests': t('errTooMany'),
    'auth/popup-closed-by-user': t('errPopupClosed'),
    'auth/popup-blocked': t('errPopupClosed'),
    'auth/cancelled-popup-request': t('errPopupClosed'),
    'auth/network-request-failed': t('errNetwork'),
    'auth/unauthorized-domain': t('errUnauthorizedDomain'),
    'auth/user-disabled': t('errUserDisabled'),
    'unavailable': t('errNetwork'),
    'permission-denied': t('errPermission'),
  };
  if (!map[code]) console.warn('Xato:', err);
  // Ichki xato matnlari (err.message) foydalanuvchiga ko'rsatilmaydi.
  return map[code] || t('errGeneric');
}

export function toast(msg, kind) {
  state.toast = { msg, kind: kind || 'info' };
  render();
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { state.toast = null; render(); }, 3400);
}
