// Service Worker ro'yxatga olish. Inline <script> o'rniga alohida fayl —
// shunda CSP (script-src 'self') majburiy rejimda ham ishlaydi.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
