self.addEventListener('install', (e) => {
  console.log('[Service Worker] Install');
});

self.addEventListener('fetch', (e) => {
  // Basic pass-through for online-first gameplay
  e.respondWith(fetch(e.request));
});
