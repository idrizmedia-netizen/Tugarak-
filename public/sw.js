// TUGARAK+ Service Worker — asosiy fayllarni keshlab, PWA sifatida
// o'rnatilishini ta'minlaydi va internet vaqtincha uzilganda oldingi
// yuklangan sahifani ko'rsatishga yordam beradi.
const CACHE_NAME = 'tugarak-plus-v1';
const PRECACHE_URLS = ['/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Firebase/Firestore so'rovlarini keshlamaymiz (har doim tarmoqdan olinadi) —
// faqat statik fayllar (JS/CSS/rasm/HTML) uchun "network first, fallback cache" strategiyasi.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // tashqi (Firebase) so'rovlarga tegmaymiz
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {});
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('/index.html')))
  );
});
