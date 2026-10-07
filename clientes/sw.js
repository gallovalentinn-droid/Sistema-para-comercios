const CACHE_PREFIXES=['kiosco-','micomercio-legacy-redirect-'];
const CACHE='micomercio-legacy-redirect-rev30';
const BASE=['./','./index.html'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(BASE)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>CACHE_PREFIXES.some(prefix=>key.startsWith(prefix))&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  event.respondWith(fetch(event.request).catch(()=>caches.match(event.request).then(hit=>hit||caches.match('./index.html'))));
});
