import { app } from '../app.js';
import { $, h } from '../util.js';
import { renderStats } from './profile.js';
import { THEMES } from '../public.js';

// Read-only view of another player, drawn in THEIR theme.
export function initPlayer() {
  const { cloud } = app;
  const screen = document.querySelector('section[data-screen="player"]');
  const body = $('#pl-body'), nameEl = $('#pl-name'), subEl = $('#pl-sub'), img = $('#pl-img'), ph = $('#pl-ph');
  let token = 0;

  const setThemeColor = () => {
    const bg = getComputedStyle(screen).getPropertyValue('--bg').trim();
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && bg) meta.content = bg;
  };
  const setAvatar = (pic) => { img.hidden = !pic; ph.style.display = pic ? 'none' : ''; if (pic) img.src = pic; };
  const note = (t) => { body.textContent = ''; body.append(h('div', 'lb-msg', t)); };

  return {
    async enter({ uid, name = '?', pic = '', score = 0, mode = 'mix' } = {}) {
      const mine = ++token;
      screen.dataset.theme = ''; // fall back to the viewer's own theme while loading
      screen.removeAttribute('data-theme');
      nameEl.textContent = name; subEl.textContent = score ? `Best score: ${score}` : '';
      setAvatar(pic);
      note('Loading…');
      try {
        const p = await cloud.fetchPublicProfile(uid);
        if (mine !== token) return;
        if (!p) { note("This player hasn't shared a profile yet."); return; }
        if (THEMES.includes(p.theme)) screen.dataset.theme = p.theme;
        nameEl.textContent = p.name;
        setAvatar(p.pic || pic);
        body.textContent = '';
        renderStats(body, p.stats);
        requestAnimationFrame(setThemeColor);
      } catch (e) {
        if (mine === token) note("Couldn't load this profile. Check your connection and try again.");
      }
    },
    leave() {
      token++;
      screen.removeAttribute('data-theme');
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta && bg) meta.content = bg;
    },
  };
}
