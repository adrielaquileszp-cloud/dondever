importScripts('js/store.js', 'js/anime-check.js');

const CACHE = 'dondever-v1';
const SHELL = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'js/store.js', 'js/anime-check.js', 'js/app.js',
  'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// App shell: network first (so updates show up), cache as offline fallback. APIs go straight to network.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});

async function checkAndNotify() {
  await Anime.check(async (anime, episode) => {
    const n = Anime.notificationFor(anime, episode);
    await self.registration.showNotification(n.title, n.options);
  });
}

// Chrome decides how often this runs (depends on how much you use the app).
self.addEventListener('periodicsync', e => {
  if (e.tag === 'check-anime') e.waitUntil(checkAndNotify());
});

self.addEventListener('message', e => {
  if (e.data === 'check-anime') e.waitUntil(checkAndNotify());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(self.clients.openWindow(url));
});
