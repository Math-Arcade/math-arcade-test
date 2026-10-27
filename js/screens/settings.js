import { app } from '../app.js';
import { $, h, toast } from '../util.js';
import { THEMES, MUSIC, VERSION } from '../config.js';
import { confirmDialog } from '../router.js';
import { friendlyError } from '../cloud.js';

export function initSettings() {
  const { store, cloud, router, audio } = app;

  const bindSwitch = (id, key) => {
    const el = $(id);
    el.checked = !!store.settings[key];
    el.onchange = () => store.set(key, el.checked);
  };
  const bindRange = (id, key, preview) => {
    const el = $(id);
    el.value = store.settings[key];
    el.oninput = () => store.set(key, parseFloat(el.value));
    if (preview) el.onchange = () => audio.sfx(preview);
  };
  bindSwitch('#s-sfx', 'sfx'); bindSwitch('#s-haptics', 'haptics'); bindSwitch('#s-grid', 'grid');
  bindSwitch('#s-crt', 'crt'); bindSwitch('#s-particles', 'particles'); bindSwitch('#s-motion', 'reduceMotion');
  bindRange('#s-sfxvol', 'sfxVol', 'coin'); bindRange('#s-musicvol', 'musicVol');
  $('#s-version').textContent = `v${VERSION}`;

  // music chips
  const music = $('#s-music');
  MUSIC.forEach(([id, label]) => {
    const b = h('button', 'cbtn', label);
    b.type = 'button'; b.dataset.v = id; b.setAttribute('role', 'radio');
    b.onclick = () => { store.set('music', id); if (store.settings.mute) store.set('mute', false); paint(); };
    music.append(b);
  });
  // theme swatches
  const themes = $('#s-themes');
  THEMES.forEach(([id, label]) => {
    const b = h('button', 'swatch');
    b.type = 'button'; b.dataset.t = id; b.dataset.theme = id; b.setAttribute('role', 'radio'); b.setAttribute('aria-label', `${label} theme`);
    b.append(h('span', 'dot'), h('span', '', label));
    b.onclick = () => { store.set('theme', id); paint(); };
    themes.append(b);
  });

  // duel names
  for (const [id, key, def] of [['#s-p1', 'p1', 'Player 1'], ['#s-p2', 'p2', 'Player 2']]) {
    const el = $(id);
    el.value = store.settings[key];
    el.oninput = () => store.set(key, el.value.trim().slice(0, 12) || def);
    el.onblur = () => { el.value = store.settings[key]; };
  }

  $('#s-reset').onclick = async () => {
    const r = await confirmDialog({ title: 'RESET STATS?', text: 'This clears scores and stats on this device. Your online account is not deleted.', ok: 'RESET', danger: true });
    if (r.ok) { store.resetAll(); toast('Local stats reset'); }
  };

  function paint() {
    music.querySelectorAll('[data-v]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === store.settings.music)));
    themes.querySelectorAll('[data-t]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.t === store.settings.theme)));
  }

  const acct = $('#s-account');
  function renderAccount() {
    acct.textContent = '';
    const box = h('div', 'acct');
    if (!cloud.user) {
      box.append(h('p', 'muted', 'Playing as a guest. Sign in to save progress online and join the leaderboard.'));
      const b = h('button', 'btn btn-primary', 'SIGN IN / SIGN UP');
      b.type = 'button'; b.onclick = () => router.go('auth', { mode: 'signin' });
      box.append(b);
    } else {
      const p = h('p'); p.append('Signed in as ', Object.assign(h('b'), { textContent: cloud.user.name }));
      box.append(p);
      const out = h('button', 'btn', 'SIGN OUT'); out.type = 'button';
      out.onclick = async () => { try { await cloud.signOut(); toast('Signed out'); } catch (e) { toast(friendlyError(e)); } };
      const del = h('button', 'btn btn-danger', 'DELETE ACCOUNT'); del.type = 'button';
      del.onclick = async () => {
        const r = await confirmDialog({
          title: 'DELETE ACCOUNT?', ok: 'DELETE', danger: true, password: true,
          text: 'This permanently deletes your account, online progress and leaderboard entries. It cannot be undone.',
          onConfirm: async (pw) => {
            try { await cloud.deleteAccount(pw); }
            catch (e) { throw new Error(/wrong-password|invalid-credential/.test(e.code || '') ? 'Wrong password.' : friendlyError(e)); }
          },
        });
        if (r.ok) toast('Account deleted');
      };
      box.append(out, del);
    }
    acct.append(box);
  }

  cloud.onChange(renderAccount);
  paint(); renderAccount();
  return { enter: () => { paint(); renderAccount(); } };
}
