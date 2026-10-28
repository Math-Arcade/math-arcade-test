import { app } from '../app.js';
import { $, h, fmt } from '../util.js';
import { friendlyError } from '../cloud.js';
import { buildOpChips, setChecked } from './modes.js';

export function initLeaderboard() {
  const { store, cloud, router } = app;
  const ops = $('#lb-ops'), list = $('#lb-list'), foot = $('#lb-foot');
  const refresh = h('button', 'btn btn-ghost lb-refresh', 'REFRESH');
  refresh.type = 'button';
  refresh.setAttribute('aria-label', 'Refresh leaderboard');
  refresh.onclick = () => load(true);
  let mode = 'mix', token = 0;
  const cache = {};

  buildOpChips(ops, mode, (m) => { mode = m; setChecked(ops, 'data-op', m); load(true); });
  ops.append(refresh);

  function message(text, actionText, action) {
    list.textContent = '';
    const box = h('div', 'lb-msg');
    box.append(h('span', '', text));
    if (actionText) { const b = h('button', 'btn btn-sm', actionText); b.type = 'button'; b.onclick = action; box.append(b); }
    list.append(box);
  }

  function render(rows) {
    list.textContent = '';
    foot.textContent = '';
    const myId = cloud.user && cloud.user.uid;
    if (!rows.length) message('No scores yet. Be the first!');
    rows.forEach((r, i) => {
      const row = h('div', `lb-row${i < 3 ? ' top' : ''}${r.uid === myId ? ' me' : ''}`);
      row.setAttribute('role', 'listitem');
      row.append(h('span', 'lb-rank', `#${i + 1}`), h('span', 'lb-name', r.name), h('span', 'lb-score', fmt(r.score)));
      list.append(row);
    });
    if (!cloud.user) {
      const b = h('button', 'btn btn-primary', 'SIGN IN TO COMPETE');
      b.type = 'button'; b.onclick = () => router.go('auth', { mode: 'signin' });
      foot.append(b);
    } else if (!rows.some((r) => r.uid === myId)) {
      const mine = store.profile.best[mode];
      foot.append(h('div', 'muted center', mine ? `Your best: ${fmt(mine)} (play Blitz to rank up)` : 'Play Blitz to get on the board!'));
    }
  }

  async function load(force = false) {
    const t = ++token;
    list.textContent = '';
    foot.textContent = '';
    for (let i = 0; i < 7; i++) list.append(h('div', 'skel'));
    const c = cache[mode];
    try {
      const rows = !force && c && Date.now() - c.t < 60000 ? c.rows : await cloud.leaderboard(mode);
      if (t !== token) return;
      cache[mode] = { rows, t: Date.now() };
      render(rows);
    } catch (e) {
      if (t !== token) return;
      message(friendlyError(e), 'RETRY', () => load(true));
      if (!cloud.user) { const b = h('button', 'btn btn-primary', 'SIGN IN'); b.type = 'button'; b.onclick = () => router.go('auth', { mode: 'signin' }); foot.append(b); }
    }
  }

  cloud.onChange(() => { Object.keys(cache).forEach((k) => delete cache[k]); });
  return { enter: () => load(true), leave: () => { token++; } };
}
