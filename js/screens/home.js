import { app } from '../app.js';
import { $, icon } from '../util.js';
import { VERSION } from '../config.js';

export function initHome() {
  const { store, router, cloud } = app;
  const name = $('#h-name'), mute = $('#h-mute'), sub = $('#h-daily-sub');
  const streak = $('#h-streak'), streakN = $('#h-streak-n'), daily = $('#h-daily');
  $('#h-version').textContent = `v${VERSION}`;

  const render = () => {
    name.textContent = cloud.user ? cloud.user.name : 'Guest';
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
  $('#h-stats').onclick = () => router.go('stats');
  $('#h-settings').onclick = () => router.go('settings');
  $('#h-player').onclick = () => router.go(cloud.user ? 'settings' : 'auth', { mode: 'signin' });
  mute.onclick = () => { store.set('mute', !store.settings.mute); render(); };

  store.on('profile', render);
  store.on('settings', (k) => { if (k === 'mute') render(); });
  cloud.onChange(render);
  render();
  return { enter: render };
}
