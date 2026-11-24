// Local-first storage. Everything the game needs lives in localStorage so it works offline;
// when the player is signed in the profile is merged with the cloud copy (monotonic max-merge,
// so progress can never be lost by syncing).

import { utcDay } from './util.js';
import { levelInfo, MAX_XP } from './engine/level.js';
import { COINS_PER_XP, LEVEL_UP_COINS, frameById, cardById, itemById, cleanFrame, cleanCard, balance } from './shop.js';
import { evaluate, cleanAch, cleanAchTitle, cleanShowcase, blitzAch, tierOf, SHOWCASE_MAX, achById, hasTitle } from './achievements.js';

const SKEY = 'ma2.settings';
const PKEY = 'ma2.profile'; // the device's guest profile; every registered account gets its own: `${PKEY}.${uid}`
const AKEY = 'ma2.active'; // whose profile is loaded ('guest' or a uid), so a reload picks up where it left off
const slotKey = (owner) => (owner === 'guest' ? PKEY : `${PKEY}.${owner}`);
const prefsKey = (owner) => `ma2.prefs.${owner}`; // per-person extras that live in settings: profile picture, offline name
const cleanOwner = (o) => (typeof o === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(o) ? o : 'guest');

export const DEFAULT_SETTINGS = {
  theme: 'green', sfx: true, sfxVol: 0.8, music: 'none', musicVol: 0.5, haptics: true,
  // one switch for particles, CRT lines, background grid, motion and on-screen cues (off if the device asks for less motion)
  effects: !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches), mute: false, op: 'mix', duelTarget: 10, p1: 'Player 1', p2: 'Player 2',
  avatar: '', localName: '', // profile picture (small data URL) and the offline guest name
};

export const newProfile = () => ({
  v: 2,
  best: { mix: 0, add: 0, sub: 0, mul: 0, div: 0 },
  totals: { correct: 0, wrong: 0, blitzGames: 0, duelGames: 0, duelWins0: 0, duelWins1: 0, bestStreak: 0, bestLevel: 0, seconds: 0 },
  days: {}, // 'YYYY-MM-DD' -> { score, ms, grid }
  xp: 0, // account experience; the level is worked out from it (js/engine/level.js)
  titleLevel: null, // equipped title milestone; null defaults to Rookie
  coinsEarned: 0, coinsSpent: 0, // balance = earned - spent (both only ever grow, so syncing can't lose coins)
  owned: [], frame: null, card: null, // store: frames and cards you bought, and the ones you wear
  modeCorrect: { mix: 0, add: 0, sub: 0, mul: 0, div: 0 }, // correct answers per Blitz mode (counts towards achievements)
  ach: {}, achTitle: null, showcase: [], // achievements earned (id -> tier), the achievement title worn, up to 3 shown on the profile
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
  out.xp = Math.min(MAX_XP, Math.max(a?.xp || 0, b?.xp || 0));
  out.titleLevel = a?.titleLevel ?? b?.titleLevel ?? null;
  out.coinsEarned = Math.max(a?.coinsEarned || 0, b?.coinsEarned || 0);
  out.coinsSpent = Math.max(a?.coinsSpent || 0, b?.coinsSpent || 0);
  out.owned = [...new Set([...(a?.owned || []), ...(b?.owned || [])].filter((id) => itemById(id)))];
  out.frame = cleanFrame(a?.frame ?? b?.frame ?? null);
  if (out.frame && !out.owned.includes(out.frame)) out.owned.push(out.frame);
  out.card = cleanCard(a?.card ?? b?.card ?? null);
  if (out.card && !out.owned.includes(out.card)) out.owned.push(out.card);
  for (const k of Object.keys(out.modeCorrect)) out.modeCorrect[k] = Math.max(a?.modeCorrect?.[k] || 0, b?.modeCorrect?.[k] || 0);
  // earned tiers only ever go up
  const ta = cleanAch(a?.ach), tb = cleanAch(b?.ach);
  out.ach = cleanAch(Object.fromEntries([...new Set([...Object.keys(ta), ...Object.keys(tb)])].map((id) => [id, Math.max(ta[id] || 0, tb[id] || 0)])));
  // what you wear and show is a choice, not progress: the most recently changed copy wins
  const newer = (a?.updated || 0) >= (b?.updated || 0) ? [a, b] : [b, a];
  const pick = (k) => (newer[0] && newer[0][k] !== undefined ? newer[0][k] : newer[1] && newer[1][k] !== undefined ? newer[1][k] : undefined);
  out.achTitle = cleanAchTitle(pick('achTitle') ?? null, out.ach);
  out.showcase = cleanShowcase(pick('showcase'), out.ach);
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
    if (saved && saved.effects === undefined) this.settings.effects = !saved.reduceMotion; // older saves had four separate switches
    for (const k of ['grid', 'crt', 'particles', 'reduceMotion']) delete this.settings[k];
    if (!['green', 'blue', 'red', 'yellow', 'purple', 'light', 'dark', 'colorblind'].includes(this.settings.theme)) this.settings.theme = 'green';
    if (!saved) write(SKEY, this.settings);
    this._owner = cleanOwner(read(AKEY));
    this.profile = mergeProfiles(read(slotKey(this._owner)), null);
  }

  get owner() { return this._owner; }

  _savePrefs() { write(prefsKey(this._owner), { avatar: this.settings.avatar || '', localName: this.settings.localName || '' }); }
  _loadPrefs(owner) {
    const p = read(prefsKey(owner)) || {};
    this.settings.avatar = typeof p.avatar === 'string' ? p.avatar : '';
    this.settings.localName = typeof p.localName === 'string' ? p.localName : '';
    write(SKEY, this.settings);
    this.emit('settings', 'avatar'); this.emit('settings', 'localName');
  }

  // Load another person's profile. Progress, picture and offline name never cross from one owner to the next.
  switchOwner(owner, { persist = true } = {}) {
    owner = cleanOwner(owner);
    if (owner === this._owner) return false;
    if (persist) this._savePrefs();
    this._owner = owner;
    write(AKEY, owner);
    this.profile = mergeProfiles(read(slotKey(owner)), null);
    this._loadPrefs(owner);
    this.emit('profile');
    this.checkAchievements();
    return true;
  }

  // A guest registered: the device's guest progress (and picture) moves into the new account.
  adoptGuestInto(uid) {
    uid = cleanOwner(uid);
    if (uid === 'guest') return false;
    if (this._owner !== 'guest') return this.switchOwner(uid);
    const merged = mergeProfiles(this.profile, read(slotKey(uid)));
    write(slotKey(uid), merged);
    write(prefsKey(uid), { avatar: this.settings.avatar || '', localName: '' });
    write(PKEY, newProfile()); // the guest slot starts fresh
    write(prefsKey('guest'), { avatar: '', localName: '' });
    this._owner = uid; write(AKEY, uid);
    this.profile = merged;
    this.settings.localName = ''; write(SKEY, this.settings);
    this.emit('settings', 'localName'); this.emit('profile');
    this.checkAchievements();
    return true;
  }

  // Remove everything stored locally for a deleted account.
  purgeOwner(uid) {
    uid = cleanOwner(uid);
    if (uid === 'guest') return;
    try { localStorage.removeItem(slotKey(uid)); localStorage.removeItem(prefsKey(uid)); } catch { /* ignore */ }
    if (this._owner === uid) this.switchOwner('guest', { persist: false });
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
        effects: g('backGroundGridT') !== 'false' || g('particalsT') !== 'false',
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
    if (key === 'avatar' || key === 'localName') this._savePrefs();
    this.emit('settings', key);
  }

  // Work out what the profile has earned. Returns what was newly unlocked or upgraded (the profile is updated in place).
  _evaluate(before) {
    const r = evaluate(this.profile, { streak: dailyStreak(this.profile.days), before });
    this.profile.ach = r.ach;
    return r.unlocked;
  }

  update(fn) {
    const before = cleanAch(this.profile.ach);
    fn(this.profile);
    const unlocked = this._evaluate(before);
    this.profile.updated = Date.now();
    write(slotKey(this._owner), this.profile);
    this.emit('profile');
    if (unlocked.length) this.emit('unlock', unlocked);
  }

  // Catch up on anything already earned (for example a player who already owns every item, or loaded a synced profile).
  checkAchievements() {
    const unlocked = this._evaluate();
    if (!unlocked.length) return [];
    this.profile.updated = Date.now();
    write(slotKey(this._owner), this.profile);
    this.emit('profile');
    this.emit('unlock', unlocked);
    return unlocked;
  }

  mergeRemote(remote) {
    const before = JSON.stringify(this.profile);
    const merged = mergeProfiles(this.profile, remote);
    this.profile = merged;
    const unlocked = this._evaluate(cleanAch(merged.ach)); // tiers that arrived with the cloud copy are not announced again
    if (unlocked.length) merged.updated = Date.now();
    write(slotKey(this._owner), merged);
    if (JSON.stringify(merged) !== before) this.emit('profile');
    if (unlocked.length) this.emit('unlock', unlocked);
    return merged;
  }

  // Give XP; returns { before, after } level info so callers can celebrate a level-up.
  // XP also pays coins (plus a bonus per level gained). `coins` is what this call paid out.
  addXp(n) {
    const before = levelInfo(this.profile.xp);
    const gain = Math.max(0, Math.floor(Number(n) || 0));
    if (!gain) return { before, after: before, coins: 0 };
    const after = levelInfo(Math.min(MAX_XP, (this.profile.xp || 0) + gain));
    const coins = gain * COINS_PER_XP + Math.max(0, after.level - before.level) * LEVEL_UP_COINS;
    this.update((p) => { p.xp = after.xp; p.coinsEarned = (p.coinsEarned || 0) + coins; });
    return { before, after, coins };
  }
  get coins() { return balance(this.profile); }
  buyFrame(id) {
    const f = frameById(id);
    if (!f || this.profile.owned.includes(id) || this.coins < f.price) return false;
    this.update((p) => { p.coinsSpent = (p.coinsSpent || 0) + f.price; p.owned = [...p.owned, id]; p.frame = id; });
    return true;
  }
  equipFrame(id) { // null takes the frame off
    if (id && !(frameById(id) && this.profile.owned.includes(id))) return false;
    this.update((p) => { p.frame = id || null; });
    return true;
  }
  buyCard(id) {
    const c = cardById(id);
    if (!c || this.profile.owned.includes(id) || this.coins < c.price) return false;
    this.update((p) => { p.coinsSpent = (p.coinsSpent || 0) + c.price; p.owned = [...p.owned, id]; p.card = id; });
    return true;
  }
  equipCard(id) { // null takes the card off
    if (id && !(cardById(id) && this.profile.owned.includes(id))) return false;
    this.update((p) => { p.card = id || null; });
    return true;
  }
  get level() { return levelInfo(this.profile.xp); }

  // Platinum is granted by the rank check (js/achievementsync.js); it needs Gold first.
  grantPlatinum(mode) {
    const a = blitzAch(mode);
    if (!a || tierOf(this.profile.ach, a.id) < 3) return false;
    this.update((p) => { p.ach[a.id] = 4; });
    return true;
  }
  equipAchTitle(id) { // null takes it off (the level title shows again)
    if (id && !hasTitle(this.profile.ach, id)) return false;
    this.update((p) => { p.achTitle = id || null; });
    return true;
  }
  // Pin up to three earned achievements on the profile.
  setShowcase(list) {
    const next = cleanShowcase(list, this.profile.ach);
    if (next.length > SHOWCASE_MAX) return false;
    this.update((p) => { p.showcase = next; });
    return true;
  }

  get streak() { return dailyStreak(this.profile.days); }
  get today() { return this.profile.days[utcDay()] || null; }

  resetAll() {
    this.profile = newProfile();
    write(slotKey(this._owner), this.profile);
    this.emit('profile');
  }
}

export const store = new Store();
