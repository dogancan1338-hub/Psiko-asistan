/* Psiko-Asistan Pro — service worker
   - Uygulama sayfası: önce ağ (güncel sürüm gelsin), ağ yoksa/yavaşsa önbellek
   - CDN kütüphaneleri ve yazı tipleri: önbellekten hızlı aç, arkada güncelle
   - Firebase, Gemini ve diğer API istekleri: hiç dokunulmaz, doğrudan ağa gider
   Önbelleği sıfırlamak gerekirse VERSION değerini değiştirmeniz yeterli. */
const VERSION = 'psiko-v1';
const PAGE_CACHE = VERSION + '-pages';
const ASSET_CACHE = VERSION + '-assets';
const CDN_HOSTS = ['unpkg.com', 'cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com', 'www.gstatic.com'];
const PRECACHE_LOCAL = ['./', 'manifest.json', 'icon-192.png', 'icon-512.png'];
const PRECACHE_CDN = [
  'https://unpkg.com/react@18/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
  'https://unpkg.com/@babel/standalone/babel.min.js',
  'https://unpkg.com/docx@7.1.0/build/index.js',
  'https://cdn.jsdelivr.net/npm/file-saver@2.0.5/dist/FileSaver.min.js',
  'https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const pages = await caches.open(PAGE_CACHE);
    await Promise.allSettled(PRECACHE_LOCAL.map((u) => pages.add(u)));
    const assets = await caches.open(ASSET_CACHE);
    // Bir kaynak (ör. güvenlik duvarı yüzünden) inmese bile kurulum bozulmaz.
    await Promise.allSettled(PRECACHE_CDN.map((u) => assets.add(u)));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

const withTimeout = (promise, ms) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('timeout')), ms);
  promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
});

async function networkFirst(request) {
  const cache = await caches.open(PAGE_CACHE);
  const cached = (await cache.match(request)) || (await cache.match('./')) || (await cache.match('index.html'));
  try {
    const res = await (cached ? withTimeout(fetch(request), 8000) : fetch(request));
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch (e) {
    if (cached) return cached;
    throw e;
  }
}

async function staleWhileRevalidate(event, cacheName) {
  const request = event.request;
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetching = fetch(request).then((res) => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone());
    return res;
  }).catch(() => null);
  if (cached) { event.waitUntil(fetching); return cached; }
  return (await fetching) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate') { event.respondWith(networkFirst(req)); return; }
    event.respondWith(staleWhileRevalidate(event, PAGE_CACHE));
    return;
  }
  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(event, ASSET_CACHE));
  }
  // Diğer her şey (Firebase, Gemini...) tarayıcının normal akışına bırakılır.
});
