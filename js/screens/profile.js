import { app } from '../app.js';
import { $, h, fmt, toast } from '../util.js';
import { MODES, MODE_SIGN, MODE_NAME } from '../config.js';
import { validateName, friendlyError } from '../cloud.js';
import { fileToAvatar } from '../avatar.js';

// Name shown for the player: online name if signed in, else the local name, else "Guest".
export const displayName = (cloud, store) => (cloud.user && cloud.user.name) || store.settings.localName || 'Guest';

export function initProfile() {
  const { store, cloud, router } = app;
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
  $('#pf-avatar').onclick = () => file.click();
  file.onchange = async () => {
    const f = file.files && file.files[0];
    file.value = '';
    if (!f) return;
    try { store.set('avatar', await fileToAvatar(f)); setMsg('Photo updated.', true); }
    catch (err) { setMsg(err.message || 'Could not use that image.'); }
  };
  remove.onclick = () => { store.set('avatar', ''); setMsg(''); };

  pfBtn.onclick = () => router.go(cloud.user ? 'settings' : 'auth', { mode: 'signin' });

  function card(k, v) {
    const c = h('div', 'stat');
    c.append(h('span', 'k', k), h('span', 'v', v));
    return c;
  }
  const dur = (sec) => (sec >= 3600 ? `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m` : `${Math.max(0, Math.floor(sec / 60))}m`);

  function render() {
    pfName.textContent = displayName(cloud, store);
    pfSub.textContent = !cloud.user ? 'Not signed in' : cloud.user.guest ? 'Guest account' : 'Signed in';
    pfBtn.textContent = cloud.user ? 'SETTINGS' : 'SIGN IN';
    const av = store.settings.avatar;
    img.hidden = !av; ph.style.display = av ? 'none' : '';
    if (av) img.src = av;
    remove.hidden = !av;

    const { totals: t, best, days } = store.profile;
    const answered = t.correct + t.wrong;
    body.textContent = '';
    const grid = h('div', 'stat-cards');
    grid.append(
      card('Blitz games', fmt(t.blitzGames)),
      card('Correct answers', fmt(t.correct)),
      card('Accuracy', answered ? `${Math.round((t.correct / answered) * 100)}%` : '-'),
      card('Best streak', fmt(t.bestStreak)),
      card('Highest level', t.bestLevel ? String(t.bestLevel) : '-'),
      card('Daily streak', `${store.streak} day${store.streak === 1 ? '' : 's'}`),
      card('Dailies played', fmt(Object.keys(days).length)),
      card('Play time', dur(t.seconds)),
    );
    body.append(grid);

    const bests = h('div', 'panel');
    bests.append(h('h3', '', 'BLITZ BEST SCORES'));
    const max = Math.max(1, ...MODES.map((m) => best[m]));
    MODES.forEach((m) => {
      const r = h('div', 'best-row');
      r.setAttribute('aria-label', `${MODE_NAME[m]} ${best[m]}`);
      const s = h('span', `s${m === 'mix' ? ' mix' : ''}`, MODE_SIGN[m]);
      const bg = h('div', 'bar-bg'), i = h('i');
      i.style.width = `${Math.round((best[m] / max) * 100)}%`;
      bg.append(i);
      r.append(s, bg, h('span', 'n', fmt(best[m])));
      bests.append(r);
    });
    body.append(bests);

    const duel = h('div', 'panel');
    duel.append(h('h3', '', 'DUEL RECORD'));
    const row = h('div', 'stat-cards');
    row.append(card(`${store.settings.p1} wins`, fmt(t.duelWins0)), card(`${store.settings.p2} wins`, fmt(t.duelWins1)));
    duel.append(row, h('div', 'muted', `${fmt(t.duelGames)} duel${t.duelGames === 1 ? '' : 's'} played`));
    body.append(duel);
  }

  cloud.onChange(render);
  store.on('settings', (k) => { if (k === 'avatar' || k === 'localName') render(); });
  return { enter: () => { openForm(false); render(); } };
}
