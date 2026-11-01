import { app } from '../app.js';
import { $, icon } from '../util.js';
import { VERSION } from '../config.js';
import { displayName } from './profile.js';

export function initHome() {
  const { store, router, cloud } = app;
  const name = $('#h-name'), mute = $('#h-mute'), sub = $('#h-daily-sub');
  const streak = $('#h-streak'), streakN = $('#h-streak-n'), daily = $('#h-daily');
  $('#h-version').textContent = `v${VERSION}`;

  const render = () => {
    name.textContent = displayName(cloud, store);
    const av = store.settings.avatar;
    $('#h-img').hidden = !av; $('#h-ph').style.display = av ? 'none' : '';
    if (av) $('#h-img').src = av;
    mute.innerHTML = icon(store.settings.mute ? 'mute' : 'vol');
    mute.setAttribute('aria-pressed', String(store.settings.mute));
    const today = store.today, n = store.streak;
    daily.classList.toggle('done', !!today);
    sub.textContent = today ? `Done: ${today.score}/10. Back tomorrow!` : '10 questions. Same for everyone.';
    streak.hidden = n < 1;
    streakN.textContent = n;
  };

  $('#h-play').onclick = () => router.go('modes');
  daily.onclick = () => router.go('game', { kind: 'daily', mode: 'mix', view: !!store.today });
  $('#h-ranks').onclick = () => router.go('leaderboard');
  $('#h-store').onclick = () => router.go('store');
  $('#h-settings').onclick = () => router.go('settings');
  $('#h-player').onclick = () => router.go('profile');
  $('#h-friends').onclick = () => router.go('friends');

  // Red badge on the friends button = number of requests waiting for you.
  const fbadge = $('#h-fbadge');
  const setBadge = (n) => { fbadge.hidden = !n; fbadge.textContent = n > 9 ? '9+' : String(n); };
  const checkRequests = async () => { try { setBadge(cloud.user ? await cloud.incomingCount() : 0); } catch { /* offline */ } };
  document.addEventListener('friends:count', (e) => setBadge(e.detail || 0));
  mute.onclick = () => { store.set('mute', !store.settings.mute); render(); };

  store.on('profile', render);
  store.on('settings', (k) => { if (['mute', 'avatar', 'localName'].includes(k)) render(); });
  cloud.onChange(() => { render(); checkRequests(); });
  render();
  return { enter() { render(); checkRequests(); } };
}
