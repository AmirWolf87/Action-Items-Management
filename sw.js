/* Offline shell: caches the app files; data always comes live from the sheet. */
const CACHE = 'action-items-v84';
const FILES = ['./', 'index.html', 'styles.css?v=84', 'i18n.js?v=84', 'app.js?v=84', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith(CACHE.replace(/\d+$/, '')) && k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;   // never cache sheet data
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request)));
});
self.addEventListener('notificationclick', e => {   // tapping "focus paused" brings the app back
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => { const c = cs.find(x => x.url.startsWith(self.registration.scope)); return c ? c.focus() : self.clients.openWindow(url); }));
});
