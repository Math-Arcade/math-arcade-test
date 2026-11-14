import { app } from '../app.js';
import { $, h, fmt, toast, fillSymbols, icon } from '../util.js';
import { confirmDialog } from '../router.js';
import { MODES, MODE_SIGN, MODE_NAME } from '../config.js';
import { validateName, friendlyError } from '../cloud.js';
import { fileToAvatar } from '../avatar.js';
import { ownStats, THEMES, buildPublic } from '../public.js';
import { levelInfo } from '../engine/level.js';
import { TITLES, titleByMilestone, cleanTitleLevel, tierForLevel, tierForTitle, titleProgress } from '../titles.js';

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

  // ---- level card (yours, or the player you are looking at) ----
  const lvPanel = $('#pf-level'), lvBadge = $('#pf-lvbadge');
  const titleEl = $('#pf-title'), titleSheet = $('#pf-titles'), titleScroll = $('#pf-title-scroll');
  const equippedTitle = () => titleByMilestone(cleanTitleLevel(store.profile.titleLevel, store.level.level));
  function paintTitle(name) { titleEl.textContent = name || 'Rookie'; titleEl.dataset.tier = tierForTitle(name || 'Rookie').id; titleEl.hidden = false; }
  function paintLevel(info) {
    $('#pfl-lv').textContent = info.maxed ? 'MAX LEVEL' : `LEVEL ${info.level}`;
    $('#pfl-xp').textContent = info.maxed ? `${fmt(info.xp)} XP` : `${fmt(info.into)} / ${fmt(info.need)} XP`;
    $('#pfl-fill').style.width = `${Math.round(info.pct * 100)}%`;
    $('#pfl-note').textContent = info.maxed ? 'Top of the ladder. Nothing higher to reach!' : `${fmt(info.toNext)} XP to level ${info.level + 1}`;
    lvBadge.textContent = String(info.level); lvBadge.setAttribute('aria-label', `Level ${info.level}`);
    lvBadge.hidden = false; lvPanel.hidden = false;
    lvPanel.setAttribute('aria-label', `Level ${info.level}. Open title progression`);
  }

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
    $('#pf-avatar').dataset.frame = store.profile.frame || '';
    const av = store.settings.avatar;
    img.hidden = !av; ph.style.display = av ? 'none' : '';
    if (av) img.src = av;
    remove.hidden = !av;

    paintLevel(store.level);
    paintTitle(equippedTitle().name);
    body.textContent = '';
    renderStats(body, ownStats(store));

  }

  // ---- titles screen: hero (equipped + next), then a rail of medals from Rookie to The Mathematician ----
  const heroEl = $('#tt-hero');
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  function equipTitle(t) {
    store.update((p) => { p.titleLevel = t.level; });
    cloud.title = t.name;
    paintTitle(t.name);
    if (cloud.user) cloud.updateLeaderboardTitle(t.name).catch((e) => console.warn('Title leaderboard sync failed', e));
    if (cloud.user) buildPublic(store, cloud).then((data) => cloud.publishProfile(data)).catch((e) => console.warn('Title profile sync failed', e));
    render();
  }

  function paintTitles() {
    const info = store.level, level = info.level, selected = equippedTitle();
    const prog = titleProgress(level, info.pct);
    const keep = titleScroll.scrollTop;

    // hero: what you wear now, and what is next
    const tier = tierForLevel(selected.level);
    heroEl.dataset.tier = tier.id;
    heroEl.textContent = '';
    const chips = h('div', 'tt-chips');
    chips.append(h('span', 'tt-chip', `LEVEL ${level}`), h('span', 'tt-chip tier', tier.name));
    const eyebrow = h('div', 'tt-hero-top');
    eyebrow.append(h('span', 'tt-eyebrow', 'EQUIPPED TITLE'), h('span', 'tt-eyebrow tt-count', `${prog.unlockedCount} / ${prog.total}`));
    heroEl.append(eyebrow, h('b', 'tt-hero-name', selected.name), chips);
    const nx = h('div', 'tt-next');
    if (prog.next) {
      nx.dataset.tier = tierForLevel(prog.next.level).id;
      const top = h('div', 'tt-next-row');
      top.append(h('span', 'tt-eyebrow', 'NEXT TITLE'), h('span', 'tt-togo', `${plural(prog.levelsToGo, 'level')} to go`));
      const bar = h('div', 'xp-track big tt-bar'), fill = h('i');
      fill.style.width = `${Math.round(prog.pct * 100)}%`; bar.append(fill);
      nx.append(top, h('b', 'tt-next-name', prog.next.name), bar, h('small', 'tt-next-sub', `Unlocks at level ${prog.next.level}`));
    } else nx.append(h('b', 'tt-next-name', 'Every title unlocked'), h('small', 'tt-next-sub', 'You are at the very top of the ladder.'));
    heroEl.append(nx);

    // the ladder
    titleScroll.textContent = '';
    TITLES.forEach((t, i) => {
      const unlocked = t.level <= level, equipped = t.level === selected.level, isNext = !!prog.next && prog.next.level === t.level;
      const tr = tierForLevel(t.level);
      const row = h('button', `tt-row${unlocked ? ' unlocked' : ' locked'}${equipped ? ' equipped' : ''}${isNext ? ' next' : ''}${t.level === 100 ? ' final' : ''}`);
      row.type = 'button'; row.dataset.tier = tr.id;
      row.style.setProperty('--i', String(i));
      // the rail fills as you climb: the stretch you are on is filled by your progress to the next milestone
      const nextRow = TITLES[i + 1];
      const up = unlocked ? 1 : isNext ? Math.max(0, prog.pct * 2 - 1) : 0;
      const down = nextRow && nextRow.level <= level ? 1 : t === prog.prev ? Math.min(1, prog.pct * 2) : 0;
      row.style.setProperty('--up', up.toFixed(3)); row.style.setProperty('--down', down.toFixed(3));
      row.setAttribute('aria-pressed', String(equipped));
      row.setAttribute('aria-label', `${t.name}, level ${t.level}, ${equipped ? 'equipped' : unlocked ? 'unlocked, tap to equip' : 'locked'}`);

      const medal = h('span', 'tt-medal');
      if (unlocked) medal.textContent = String(t.level); else medal.innerHTML = icon('lock');
      const card = h('span', 'tt-card');
      const text = h('span', 'tt-text');
      text.append(h('b', 'tt-name', t.name), h('small', 'tt-sub', isNext ? 'NEXT TITLE' : `LEVEL ${t.level} · ${tr.name}`));
      const state = h('span', 'tt-state');
      if (equipped) state.innerHTML = `${icon('check')}EQUIPPED`;
      else if (unlocked) state.textContent = 'EQUIP';
      else state.textContent = `${t.level - level} TO GO`;
      card.append(text, state);
      row.append(medal, card);
      row.onclick = () => {
        if (!unlocked) {
          card.classList.remove('nope'); void card.offsetWidth; card.classList.add('nope');
          toast(`Reach level ${t.level} to unlock “${t.name}”`);
          return;
        }
        if (equipped) return;
        equipTitle(t);
        toast(`Equipped “${t.name}”`);
        paintTitles();
      };
      titleScroll.append(row);
    });
    titleScroll.scrollTop = keep;
  }

  function closeTitles() { titleSheet.hidden = true; titleSheet.classList.remove('open'); lvPanel.focus?.(); }
  function openTitles() {
    if (other) return;
    titleScroll.scrollTop = 0;
    paintTitles();
    titleSheet.hidden = false;
    requestAnimationFrame(() => {
      titleSheet.classList.add('open');
      const cur = titleScroll.querySelector('.next') || titleScroll.querySelector('.equipped');
      if (cur) titleScroll.scrollTop = Math.max(0, cur.offsetTop - (titleScroll.clientHeight - cur.offsetHeight) / 2);
      $('#pf-titles-close').focus({ preventScroll: true });
    });
  }
  lvPanel.onclick = openTitles;
  lvPanel.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTitles(); } };
  $('#pf-titles-close').onclick = closeTitles;
  titleSheet.addEventListener('click', (e) => { if (e.target === titleSheet) closeTitles(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !titleSheet.hidden) closeTitles(); });

  cloud.onChange(render);
  store.on('settings', (k) => { if (k === 'avatar' || k === 'localName') render(); });
  store.on('profile', () => { if (!other && router.current === 'profile') render(); });
  // ---- viewing someone else: same screen, their stats and theme, nothing editable ----
  const setThemeColor = () => {
    const bg = getComputedStyle(screen).getPropertyValue('--bg').trim();
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && bg) meta.content = bg;
  };
  const showAvatar = (pic) => { img.hidden = !pic; ph.style.display = pic ? 'none' : ''; if (pic) img.src = pic; };

  function reset() {
    token++; other = null;
    fbox.hidden = true; lvPanel.hidden = false; lvBadge.hidden = false; titleSheet.hidden = true;
    lvPanel.setAttribute('role', 'button'); lvPanel.tabIndex = 0;
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
    paintTitle(params.title || 'Rookie');
    pfSub.textContent = params.score ? `Best score: ${fmt(params.score)}` : '';
    showAvatar(params.pic || '');
    fbox.hidden = true;
    lvPanel.removeAttribute('role'); lvPanel.tabIndex = -1;
    $('#pf-avatar').dataset.frame = params.frame || '';
    lvPanel.hidden = true; lvBadge.hidden = !params.lvl; if (params.lvl) lvBadge.textContent = String(params.lvl);
    body.textContent = ''; body.append(h('div', 'lb-msg', 'Loading…'));
    loadRelation(mine);
    try {
      const p = await cloud.fetchPublicProfile(params.uid);
      if (mine !== token) return;
      body.textContent = '';
      if (!p) { body.append(h('div', 'lb-msg', "This player hasn't shared a profile yet.")); return; }
      if (THEMES.includes(p.theme)) screen.dataset.theme = p.theme;
      pfName.textContent = p.name;
      paintTitle(titleByMilestone(cleanTitleLevel(p.titleLevel, p.level)).name);
      showAvatar(p.pic || params.pic || '');
      paintLevel(levelInfo(p.xp));
      $('#pf-avatar').dataset.frame = p.frame || '';
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
