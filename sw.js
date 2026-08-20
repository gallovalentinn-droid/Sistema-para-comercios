/* Service Worker — hace que el sistema abra sin internet.
   Guarda una copia de la página y de las librerías la primera vez
   que entrás, y la sirve cuando no hay señal. */

const CACHE = 'kiosco-v1';

// lo mínimo para que el sistema arranque solo
const BASE = [
  './',
  './index.html'
];

// librerías externas: se guardan cuando se piden por primera vez
const EXTERNOS = [
  'cdn.jsdelivr.net',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(BASE))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('SW install:', err))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Supabase y la API nunca se cachean: si no hay señal, que falle y el
  // sistema se dé cuenta de que está offline
  if (url.hostname.includes('supabase') || url.hostname.includes('api.anthropic.com')) return;

  const esExterno = EXTERNOS.some(d => url.hostname.includes(d));

  if (esExterno) {
    // librerías y fuentes: primero lo guardado, y si no está lo buscamos
    e.respondWith(
      caches.match(req).then(hit =>
        hit || fetch(req).then(res => {
          const copia = res.clone();
          caches.open(CACHE).then(c => c.put(req, copia)).catch(()=>{});
          return res;
        }).catch(() => hit)
      )
    );
    return;
  }

  // la página propia: primero la red (para tener siempre la última versión),
  // y si no hay señal, la copia guardada
  e.respondWith(
    fetch(req)
      .then(res => {
        const copia = res.clone();
        caches.open(CACHE).then(c => c.put(req, copia)).catch(()=>{});
        return res;
      })
      .catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
  );
});