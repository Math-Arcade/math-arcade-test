import { app } from './app.js';
import { store } from './store.js';
import { audio } from './audio.js';
import { fx } from './fx.js';
import { Router } from './router.js';
import { cloud } from './cloud.js';
import { MODES } from './config.js';
import { sleep } from './util.js';
import { thumbFrom } from './avatar.js';
import { initHome } from './screens/home.js';
import { initModes } from './screens/modes.js';
import { initGame } from './screens/game.js';
import { initDuel } from './screens/duel.js';
import { initLeaderboard } from './screens/leaderboard.js';
import { initProfile } from './screens/profile.js';
import { initStore } from './screens/store.js';
import { initSettings } from './screens/settings.js';
import { initAuth } from './screens/auth.js';

function applySettings() {
  const s = store.settings, root = document.documentElement;
  root.dataset.theme = s.theme;
  root.classList.toggle('no-grid', !s.grid);
  root.classList.toggle('crt', s.crt);
  root.classList.toggle('reduce-motion', s.reduceMotion);
  requestAnimationFrame(() => {
    const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && bg) meta.content = bg;
  });
}

function backgroundSymbols() {
  const box = document.getElementById('bg-symbols');
  const glyphs = ['+', '\u2212', '\u00d7', '\u00f7', '=', '%', '7', '9', '3', '\u00b2'];
  for (let i = 0; i < 11; i++) {
    const s = document.createElement('span');
    s.textContent = glyphs[i % glyphs.length];
    s.style.left = `${Math.random() * 92}%`;
    s.style.fontSize = `${1.6 + Math.random() * 2.6}rem`;
    s.style.animationDuration = `${22 + Math.random() * 26}s`;
    s.style.animationDelay = `${-Math.random() * 40}s`;
    box.append(s);
  }
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;
  const dev = ['localhost', '127.0.0.1'].includes(location.hostname) && !location.search.includes('sw=1');
  if (dev) return; // avoid stale caches while developing
  navigator.serviceWorker.register('service-worker.js').catch((e) => console.warn('SW registration failed', e));
}

// Keep the leaderboard thumbnail in step with the profile picture.
let picSeq = 0;
async function syncPic() {
  const seq = ++picSeq;
  try {
    const pic = await thumbFrom(store.settings.avatar);
    if (seq !== picSeq) return;
    cloud.pic = pic;
    if (cloud.user) await cloud.updateLeaderboardPic(pic);
  } catch (e) { console.warn('Picture sync failed', e); }
}

// When a player signs in: merge cloud + local progress, then push the result back.
function wireCloudSync() {
  store.on('settings', (k) => { if (k === 'avatar') syncPic(); });
  cloud.onChange(async (user) => {
    if (!user) return;
    await syncPic();
    try {
      const merged = store.mergeRemote(await cloud.pullProfile());
      await cloud.pushProfile(merged);
      for (const m of MODES) if (merged.best[m] > 0) await cloud.submitScore(m, merged.best[m]);
    } catch (e) { console.warn('Cloud sync failed', e); }
  });
}

async function boot() {
  Object.assign(app, { store, audio, fx, cloud });
  applySettings();
  store.on('settings', (k) => { if (['theme', 'grid', 'crt', 'reduceMotion'].includes(k)) applySettings(); });
  audio.init(store);
  fx.init(store);
  backgroundSymbols();

  const router = new Router(store);
  app.router = router;
  router.register('home', initHome());
  router.register('modes', initModes());
  router.register('game', initGame());
  router.register('duel', initDuel());
  router.register('leaderboard', initLeaderboard());
  router.register('profile', initProfile());
  router.register('store', initStore());
  router.register('settings', initSettings());
  router.register('auth', initAuth());

  // a little click feedback on every menu control (answer buttons have their own sounds)
  document.addEventListener('click', (e) => {
    const t = e.target.closest('button, .link');
    if (t && !t.classList.contains('answer') && !t.closest('.p-answers')) { audio.sfx('click'); audio.buzz('tap'); }
  }, true);

  await Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), sleep(1200)]);

  const mode = new URLSearchParams(location.search).get('mode');
  await router.go('home');
  document.body.classList.add('ready');
  if (mode === 'daily') router.go('game', { kind: 'daily', mode: 'mix', view: !!store.today });
  else if (mode === 'blitz') router.go('game', { kind: 'blitz', mode: store.settings.op });

  wireCloudSync();
  cloud.init();
  registerServiceWorker();
}

boot().catch((e) => { console.error(e); document.body.classList.add('ready'); });
