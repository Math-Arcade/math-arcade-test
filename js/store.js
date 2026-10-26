// Local-first storage. Everything the game needs lives in localStorage so it works offline;
// when the player is signed in the profile is merged with the cloud copy (monotonic max-merge,
// so progress can never be lost by syncing).

import { utcDay } from './util.js';

const SKEY = 'ma2.settings';
const PKEY = 'ma2.profile';

export const DEFAULT_SETTINGS = {
  theme: 'green', sfx: true, sfxVol: 0.8, music: 'none', musicVol: 0.5, haptics: true,
  grid: true, crt: true, particles: true, mute: false,
  reduceMotion: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches, op: 'mix', duelTarget: 10, p1: 'Player 1', p2: 'Player 2',
};

export const newProfile = () => ({
  v: 2,
  best: { mix: 0, add: 0, sub: 0, mul: 0, div: 0 },
  totals: { correct: 0, wrong: 0, blitzGames: 0, duelGames: 0, duelWins0: 0, duelWins1: 0, bestStreak: 0, bestLevel: 0, seconds: 0 },
  days: {}, // 'YYYY-MM-DD' -> { score, ms, grid }
  updated: 0,
});

const read = (key) => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
const write = (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* private mode / quota */ } };

export function mergeProfiles(a, b) {
  const out = newProfile();
  for (const k of Object.keys(out.best)) out.best[k] = Math.max(a?.best?.[k] || 0, b?.best?.[k] || 0);
  for (const k of Object.keys(out.totals)) out.totals[k] = Math.max(a?.totals?.[k] || 0, b?.totals?.[k] || 0);
  const days = { ...(b?.days || {}) };
  for (const [d, v] of Object.entries(a?.days || {})) if (!days[d] || v.score >= days[d].score) days[d] = v;
  out.days = Object.fromEntries(Object.entries(days).sort().slice(-90));
  out.updated = Math.max(a?.updated || 0, b?.updated || 0);
  return out;
}

export function dailyStreak(days, today = utcDay()) {
  let d = days[today] ? today : new Date(Date.parse(today) - 864e5).toISOString().slice(0, 10);
  let n = 0;
  while (days[d]) { n++; d = new Date(Date.parse(d) - 864e5).toISOString().slice(0, 10); }
  return n;
}

class Store {
  constructor() {
    this.listeners = {};
    const saved = read(SKEY);
    this.settings = { ...DEFAULT_SETTINGS, ...(saved || this.legacySettings()) };
    if (!['green', 'blue', 'red', 'yellow', 'purple', 'light', 'dark', 'colorblind'].includes(this.settings.theme)) this.settings.theme = 'green';
    if (!saved) write(SKEY, this.settings);
    this.profile = mergeProfiles(read(PKEY), null);
  }

  // Import settings from the v1 game once, so existing players keep their look.
  legacySettings() {
    try {
      const g = (k) => localStorage.getItem(k);
      if (!g('selectedTheme')) return {};
      const theme = g('selectedTheme') === 'colorBlind' ? 'colorblind' : g('selectedTheme');
      const music = ({ campFire: 'campfire', wildLife: 'wildlife' })[g('selectedNoise')] || g('selectedNoise') || 'none';
      return {
        theme, music, sfx: g('soundEffectsToggle') === 'true',
        grid: g('backGroundGridT') !== 'false', particles: g('particalsT') !== 'false',
        p1: g('playerOneName') || 'Player 1', p2: g('playerTwoName') || 'Player 2',
        duelTarget: [5, 10, 15, 20].includes(+g('limit')) ? +g('limit') : 10,
      };
    } catch { return {}; }
  }

  on(evt, fn) { (this.listeners[evt] ||= []).push(fn); return () => { this.listeners[evt] = this.listeners[evt].filter((f) => f !== fn); }; }
  emit(evt, data) { (this.listeners[evt] || []).forEach((f) => f(data)); }

  set(key, val) {
    if (this.settings[key] === val) return;
    this.settings[key] = val;
    write(SKEY, this.settings);
    this.emit('settings', key);
  }

  update(fn) {
    fn(this.profile);
    this.profile.updated = Date.now();
    write(PKEY, this.profile);
    this.emit('profile');
  }

  mergeRemote(remote) {
    const merged = mergeProfiles(this.profile, remote);
    const changed = JSON.stringify(merged) !== JSON.stringify(this.profile);
    this.profile = merged;
    write(PKEY, merged);
    if (changed) this.emit('profile');
    return merged;
  }

  get streak() { return dailyStreak(this.profile.days); }
  get today() { return this.profile.days[utcDay()] || null; }

  resetAll() {
    this.profile = newProfile();
    write(PKEY, this.profile);
    this.emit('profile');
  }
}

export const store = new Store();
