import { app } from '../app.js';
import { $, h, fmt, icon, lvlBadge } from '../util.js';
import { friendlyError } from '../cloud.js';
import { buildOpChips, setChecked } from './modes.js';

export function initLeaderboard() {
  const { store, cloud, router } = app;
  const ops = $('#lb-ops'), list = $('#lb-list'), foot = $('#lb-foot');
  const refresh = $('#lb-refresh');
  refresh.onclick = () => load(true);
  let mode = 'mix', token = 0, scope = 'global';
  const cache = {};

  const scopeBtns = Array.from(document.querySelectorAll('#lb-scope [data-scope]'));
  scopeBtns.forEach((b) => {
    b.onclick = () => {
      if (scope === b.dataset.scope) return;
      scope = b.dataset.scope;
      scopeBtns.forEach((x) => { const on = x.dataset.scope === scope; x.classList.toggle('on', on); x.setAttribute('aria-selected', String(on)); });
      load(true);
    };
  });

  buildOpChips(ops, mode, (m) => { mode = m; setChecked(ops, 'data-op', m); load(true); });

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
      const pic = h('span', 'lb-pic');
      if (r.pic) { const im = document.createElement('img'); im.src = r.pic; im.alt = ''; pic.append(im); }
      else pic.innerHTML = icon('user'); // default avatar for players without a photo
      const av = h('span', 'lb-av');
      av.append(pic, lvlBadge(r.uid === myId ? store.level.level : r.lvl || 1)); // level badge, bottom-left
      const identity = h('span', 'lb-identity');
      identity.append(h('span', 'lb-name', r.name), h('small', 'lb-title', r.title || 'Rookie'));
      row.append(h('span', 'lb-rank', `#${i + 1}`), av, identity, h('span', 'lb-score', fmt(r.score)));
      row.classList.add('tap'); row.tabIndex = 0;
      const open = () => (r.uid === myId ? router.go('profile') : router.go('profile', { uid: r.uid, name: r.name, pic: r.pic, score: r.score, lvl: r.lvl, mode }));
      row.onclick = open;
      row.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
      list.append(row);
    });
    if (cloud.user && !rows.some((r) => r.uid === myId)) {
      const mine = store.profile.best[mode];
      foot.append(h('div', 'muted center', mine ? `Your best: ${fmt(mine)} (play Blitz to rank up)` : 'Play Blitz to get on the board!'));
    }
  }

  async function load(force = false) {
    const t = ++token;
    list.textContent = '';
    foot.textContent = '';
    for (let i = 0; i < 7; i++) list.append(h('div', 'skel'));
    const key = `${scope}:${mode}`, c = cache[key];
    try {
      if (scope === 'friends' && !cloud.user) { message('Friends need an internet connection. Try again in a moment.', 'RETRY', () => load(true)); return; }
      let rows, noFriends = false;
      if (!force && c && Date.now() - c.t < 60000) ({ rows, noFriends } = c);
      else if (scope === 'friends') { const r = await cloud.friendsLeaderboard(mode); rows = r.rows; noFriends = !r.friendCount; }
      else rows = await cloud.leaderboard(mode);
      if (t !== token) return;
      cache[key] = { rows, noFriends, t: Date.now() };
      if (noFriends) { message('You have no friends yet. Add some to compete with them!', 'FIND FRIENDS', () => router.go('friends', { tab: 'add' })); return; }
      render(rows);
    } catch (e) {
      if (t !== token) return;
      message(friendlyError(e), 'RETRY', () => load(true));
    }
  }

  cloud.onChange(() => { Object.keys(cache).forEach((k) => delete cache[k]); });
  return { enter: () => load(true), leave: () => { token++; } };
}
