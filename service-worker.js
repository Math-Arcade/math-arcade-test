// Offline support. Bump VERSION on every release so the precache is rebuilt.
const VERSION = 'ma-2.0.0';
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;

const PRECACHE = [
  './', 'index.html', 'privacy.html', 'manifest.json',
  'css/theme.css', 'css/app.css',
  'js/main.js', 'js/app.js', 'js/audio.js', 'js/cat.js', 'js/cloud.js', 'js/config.js', 'js/fx.js', 'js/router.js', 'js/store.js', 'js/util.js',
  'js/engine/duel.js', 'js/engine/problems.js', 'js/engine/rng.js', 'js/engine/run.js',
  'js/screens/auth.js', 'js/screens/duel.js', 'js/screens/game.js', 'js/screens/home.js', 'js/screens/leaderboard.js',
  'js/screens/modes.js', 'js/screens/settings.js', 'js/screens/stats.js',
  'assets/fonts/jersey-25-latin-400-normal.woff2', 'assets/fonts/press-start-2p-latin-400-normal.woff2',
  'assets/icons/icon-192.png', 'assets/icons/icon-512.png', 'assets/icons/maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Ambient audio is requested with Range headers, which the Cache API can't store directly.
async function audioResponse(req) {
  const cache = await caches.open(RUNTIME);
  let res = await cache.match(req.url);
  if (!res) {
    const full = await fetch(req.url);
    if (!full.ok) return full;
    cache.put(req.url, full.clone());
    res = full;
  }
  const range = req.headers.get('range');
  if (!range) return res;
  const buf = await res.arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(range);
  const start = m && m[1] ? Number(m[1]) : 0;
  const end = Math.min(m && m[2] ? Number(m[2]) : buf.byteLength - 1, buf.byteLength - 1);
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': res.headers.get('Content-Type') || 'audio/mpeg',
      'Content-Range': `bytes ${start}-${end}/${buf.byteLength}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    },
  });
}

// Network first (always fresh when online), fall back to the cache when offline or slow.
async function networkFirst(req) {
  const cache = await caches.open(SHELL);
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(req, { signal: ctrl.signal });
    clearTimeout(timer);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return (await cache.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? cache.match('index.html') : Response.error());
  }
}

// Firebase SDK files are versioned URLs, so they are safe to cache forever.
async function cacheFirst(req) {
  const cache = await caches.open(RUNTIME);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (url.pathname.endsWith('.mp3')) e.respondWith(audioResponse(req));
    else e.respondWith(networkFirst(req));
  } else if (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) {
    e.respondWith(cacheFirst(req));
  }
});
