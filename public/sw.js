/* PWA 离线兜底。静态资源一律网络优先、缓存只作离线回退 —— 线上改动立即生效；
   只有修改 sw.js 自身时才需要 bump CACHE 版本号。
   全部使用相对路径，GitHub Pages 子路径（/repo-name/）下同样生效。 */
const CACHE = 'proxy-calc-v4';
const SHELL = [
  './',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 汇率快照源（er-api / frankfurter）直连，不做缓存

  event.respondWith((async () => {
    try {
      return await fetch(req);
    } catch {
      const hit = await caches.match(req);
      if (hit) return hit;
      if (req.mode === 'navigate') return (await caches.match('./')) ?? Response.error();
      return Response.error();
    }
  })());
});
