import { app } from '../app.js';
import { $, h, fmt, toast, fillSymbols } from '../util.js';
import { confirmDialog } from '../router.js';
import { MODES, MODE_SIGN, MODE_NAME } from '../config.js';
import { validateName, friendlyError } from '../cloud.js';
import { fileToAvatar } from '../avatar.js';
import { ownStats, THEMES } from '../public.js';

// Name shown for the player: online name if signed in, else the local name, else "Guest".
export const displayName = (cloud, store) => (cloud.user && cloud.user.name) || store.settings.localName || 'Guest';

function statCard(k, v) {
  const c = h('div', 'stat');
  c.append(h('span', 'k', k), h('span', 'v', v));
  return c;
}
const dur = (sec) => (sec >= 3600 ? `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m` : `${Math.max(0, Math.floor(sec / 60))}m`);

// Stat cards + best-score bars. `s` is the shape returned by ownStats() / stored in a public profile.
export function renderStats(body, s) {
  const answered = s.correct + s.wrong;
  const grid = h('div', 'stat-cards');
  grid.append(
    statCard('Blitz games', fmt(s.blitzGames)),
    statCard('Correct answers', fmt(s.correct)),
    statCard('Accuracy', answered ? `${Math.round((s.correct / answered) * 100)}%` : '-'),
    statCard('Best streak', fmt(s.bestStreak)),
    statCard('Highest level', s.bestLevel ? String(s.bestLevel) : '-'),
    statCard('Daily streak', `${s.dailyStreak} day${s.dailyStreak === 1 ? '' : 's'}`),
    statCard('Dailies played', fmt(s.dailies)),
    statCard('Play time', dur(s.seconds)),
  );
  body.append(grid);

  const bests = h('div', 'panel');
  bests.append(h('h3', '', 'BLITZ BEST SCORES'));
  const max = Math.max(1, ...MODES.map((m) => s.best[m]));
  MODES.forEach((m) => {
    const r = h('div', 'best-row');
    r.setAttribute('aria-label', `${MODE_NAME[m]} ${s.best[m]}`);
    const sign = h('span', `s${m === 'mix' ? ' mix' : ''}`, MODE_SIGN[m]);
    const bg = h('div', 'bar-bg'), i = h('i');
    i.style.width = `${Math.round((s.best[m] / max) * 100)}%`;
    bg.append(i);
    r.append(sign, bg, h('span', 'n', fmt(s.best[m])));
    bests.append(r);
  });
  body.append(bests);
}

export function initProfile() {
  const { store, cloud, router } = app;
  const screen = document.querySelector('section[data-screen="profile"]');
  let other = null; // set while looking at another player's (read-only) profile
  let token = 0, symbolsReady = false;
  const body = $('#st-body');
  const pfName = $('#pf-name'), pfSub = $('#pf-sub'), pfBtn = $('#pf-account');
  const img = $('#pf-img'), ph = $('#pf-ph'), file = $('#pf-file'), remove = $('#pf-remove');
  const form = $('#pf-form'), input = $('#pf-input'), save = $('#pf-save'), msg = $('#pf-msg'), editBtn = $('#pf-edit');

  // ---- name ----
  const setMsg = (t, ok = false) => { msg.textContent = t; msg.classList.toggle('ok', ok); };
  const openForm = (on) => {
    form.hidden = !on; pfName.parentElement.hidden = on;
    setMsg('');
    if (on) { input.value = displayName(cloud, store); input.focus(); input.select(); }
  };
  editBtn.onclick = () => openForm(true);
  $('#pf-cancel').onclick = () => openForm(false);
  form.onsubmit = async (e) => {
    e.preventDefault();
    save.disabled = true; setMsg('');
    try {
      let name;
      if (cloud.user) name = await cloud.changeName(input.value);
      else { name = validateName(input.value); store.set('localName', name); }
      toast(`You are now ${name}`);
      openForm(false); render();
    } catch (err) { setMsg(friendlyError(err)); }
    finally { save.disabled = false; }
  };

  // ---- picture ----
  $('#pf-avatar').onclick = () => { if (!other) file.click(); };
  file.onchange = async () => {
    const f = file.files && file.files[0];
    file.value = '';
    if (!f) return;
    try { store.set('avatar', await fileToAvatar(f)); setMsg('Photo updated.', true); }
    catch (err) { setMsg(err.message || 'Could not use that image.'); }
  };
  remove.onclick = () => { store.set('avatar', ''); setMsg(''); };

  pfBtn.onclick = () => router.go(cloud.user ? 'settings' : 'auth', { mode: 'signin' });

  function render() {
    if (other) return;
    pfName.textContent = displayName(cloud, store);
    pfSub.textContent = !cloud.user ? 'Not signed in' : cloud.user.guest ? 'Guest account' : 'Signed in';
    pfBtn.textContent = cloud.user ? 'SETTINGS' : 'SIGN IN';
    const av = store.settings.avatar;
    img.hidden = !av; ph.style.display = av ? 'none' : '';
    if (av) img.src = av;
    remove.hidden = !av;

    body.textContent = '';
    renderStats(body, ownStats(store));

  }

  cloud.onChange(render);
  store.on('settings', (k) => { if (k === 'avatar' || k === 'localName') render(); });
  // ---- viewing someone else: same screen, their stats and theme, nothing editable ----
  const setThemeColor = () => {
    const bg = getComputedStyle(screen).getPropertyValue('--bg').trim();
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && bg) meta.content = bg;
  };
  const showAvatar = (pic) => { img.hidden = !pic; ph.style.display = pic ? 'none' : ''; if (pic) img.src = pic; };

  function reset() {
    token++; other = null;
    fbox.hidden = true;
    screen.classList.remove('is-other');
    screen.removeAttribute('data-other'); screen.removeAttribute('data-theme');
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && bg) meta.content = bg;
  }

  // ---- friend actions shown on someone else's profile ----
  const fbox = $('#pf-friend'), fstat = $('#pf-fstat'), fbtns = $('#pf-fbtns');
  async function loadRelation(mine) {
    fbox.hidden = true;
    if (!cloud.user || !other) return;
    let rel;
    try { rel = await cloud.relationWith(other.uid); } catch { return; }
    if (mine !== token || !other) return;
    const uid = other.uid, name = pfName.textContent;
    const go = async (fn, ok) => {
      fbtns.querySelectorAll('button').forEach((b) => { b.disabled = true; });
      try { await fn(); if (ok) toast(ok); } catch (e) { toast(friendlyError(e)); }
      if (mine === token) loadRelation(mine);
    };
    const btn = (label, cls, fn, ok) => { const b = h('button', `btn btn-sm ${cls}`, label); b.type = 'button'; b.onclick = () => go(fn, ok); return b; };
    fbtns.textContent = '';
    if (rel === 'friends') {
      fstat.textContent = 'You are friends';
      fbtns.append(btn('REMOVE', '', async () => {
        const r = await confirmDialog({ title: 'Remove friend?', text: `${name} will be removed from your friends.`, ok: 'REMOVE', danger: true });
        if (r && r.ok) await cloud.removeFriend(uid);
      }));
    } else if (rel === 'incoming') {
      fstat.textContent = 'Wants to be friends';
      fbtns.append(btn('ACCEPT', 'btn-primary', () => cloud.acceptFriendRequest(uid, name), `You and ${name} are friends`), btn('DECLINE', '', () => cloud.declineFriendRequest(uid)));
    } else if (rel === 'sent') {
      fstat.textContent = 'Request sent';
      fbtns.append(btn('CANCEL', '', () => cloud.cancelFriendRequest(uid)));
    } else if (rel === 'none') {
      fstat.textContent = '';
      fbtns.append(btn('ADD FRIEND', 'btn-primary', () => cloud.sendFriendRequest(uid, name), 'Request sent'));
    } else return;
    fbox.hidden = false;
  }

  async function enterOther(params) {
    const mine = ++token;
    other = params;
    if (!symbolsReady) { fillSymbols($('#pf-symbols')); symbolsReady = true; }
    openForm(false);
    screen.classList.add('is-other'); screen.dataset.other = '';
    screen.removeAttribute('data-theme'); // the viewer's own theme until theirs has loaded
    pfName.textContent = params.name || '?';
    pfSub.textContent = params.score ? `Best score: ${fmt(params.score)}` : '';
    showAvatar(params.pic || '');
    fbox.hidden = true;
    body.textContent = ''; body.append(h('div', 'lb-msg', 'Loading…'));
    loadRelation(mine);
    try {
      const p = await cloud.fetchPublicProfile(params.uid);
      if (mine !== token) return;
      body.textContent = '';
      if (!p) { body.append(h('div', 'lb-msg', "This player hasn't shared a profile yet.")); return; }
      if (THEMES.includes(p.theme)) screen.dataset.theme = p.theme;
      pfName.textContent = p.name;
      showAvatar(p.pic || params.pic || '');
      renderStats(body, p.stats);
      loadRelation(mine);
      requestAnimationFrame(setThemeColor);
    } catch (e) {
      if (mine !== token) return;
      body.textContent = ''; body.append(h('div', 'lb-msg', "Couldn't load this profile. Check your connection and try again."));
    }
  }

  return {
    enter(params = {}) {
      if (params.uid && !(cloud.user && cloud.user.uid === params.uid)) { enterOther(params); return; }
      reset(); openForm(false); render();
    },
    leave() { reset(); },
    parent: () => (other ? (other.from === 'friends' ? 'friends' : 'leaderboard') : 'home'),
  };
}
