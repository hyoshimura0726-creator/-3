const CACHE_NAME = 'payroll-app-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // PWAとしてInstallできるようにするための最低限のfetchハンドラ
  event.respondWith(
    fetch(event.request).catch(() => {
      return new Response('Offline mode');
    })
  );
});
