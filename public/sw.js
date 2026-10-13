const VERSION = 'daymark-v4';
const SHELL = `${VERSION}-shell`;
const OFFLINE_URL = '/offline.html';

const PRECACHE = [
  OFFLINE_URL,
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== SHELL).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Daymark', {
      body: data.body || 'You have tasks due.',
      tag: data.tag || 'daymark-reminder',
      icon: '/icons/icon-192.png',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => 'focus' in client);
      return open ? open.focus() : clients.openWindow('/');
    }),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(pageOrCached(request, event));
    return;
  }

  event.respondWith(freshOrCached(request, event));
});

async function pageOrCached(request, event) {
  const cache = await caches.open(SHELL);
  try {
    const response = await fetch(request);
    if (response && response.ok) event.waitUntil(cache.put(request, response.clone()));
    return response;
  } catch {
    return (
      (await cache.match(request)) ||
      (await cache.match(OFFLINE_URL)) ||
      new Response('Daymark is offline.', { status: 503, headers: { 'Content-Type': 'text/plain' } })
    );
  }
}

async function freshOrCached(request, event) {
  const cache = await caches.open(SHELL);
  try {
    const response = await fetch(request);
    if (response && response.ok && response.type === 'basic') {
      event.waitUntil(cache.put(request, response.clone()));
    }
    return response;
  } catch {
    const hit = await cache.match(request);
    if (hit) return hit;
    throw new Error('offline');
  }
}
