// Achievements: the catalog and the rules. No DOM in here, so it is easy to test.
//
// A player's progress is stored on the profile as `ach`: { <id>: tier }.
//   Blitz achievements: 0 = locked, 1 = Bronze, 2 = Silver, 3 = Gold, 4 = Platinum.
//   Every other achievement: 1 = unlocked.
// Tiers only ever go up, and syncing merges them with max(), so nothing earned can be lost.
// Each achievement's name is also a title; it can be worn once the title is unlocked.
import { FRAMES, CARDS, THEME_ITEMS } from './shop.js';
import { levelInfo } from './engine/level.js';

// Cumulative correct answers in that Blitz mode (Blitz runs only).
export const BLITZ_TIERS = [
  { id: 'bronze', name: 'BRONZE', at: 100 },
  { id: 'silver', name: 'SILVER', at: 500 },
  { id: 'gold', name: 'GOLD', at: 1000 },
];
// Platinum needs Gold first, then a place in the top percent of that mode's leaderboard (once enough people play).
export const PLATINUM = { id: 'platinum', name: 'PLATINUM', topPercent: 1, minPlayers: 100 };
export const TIER_IDS = ['bronze', 'silver', 'gold', 'platinum'];
export const STREAK_DAYS = 30;
export const ABSOLUTE_LEVEL = 100;
export const SHOWCASE_MAX = 3;

// `live: false` = planned, not playable yet (the Elo ones wait for online 1v1). Flip it to true and they count,
// both for themselves and towards The Absolute.
export const ACHIEVEMENTS = [
  { id: 'adder', name: 'The Adder', kind: 'blitz', mode: 'add', live: true },
  { id: 'subtractor', name: 'The Subtractor', kind: 'blitz', mode: 'sub', live: true },
  { id: 'multiplier', name: 'The Multiplier', kind: 'blitz', mode: 'mul', live: true },
  { id: 'divider', name: 'The Divider', kind: 'blitz', mode: 'div', live: true },
  { id: 'polymath', name: 'The Polymath', kind: 'blitz', mode: 'mix', live: true },
  { id: 'streaker', name: 'The Streaker', kind: 'daily', live: true },
  { id: 'collector', name: 'The Collector', kind: 'shop', live: true },
  { id: 'contender', name: 'The Contender', kind: 'elo', live: false },
  { id: 'challenger', name: 'The Challenger', kind: 'elo', live: false },
  { id: 'elite', name: 'The Elite', kind: 'elo', live: false },
  { id: 'grandmaster', name: 'The Grandmaster', kind: 'elo', live: false },
  { id: 'absolute', name: 'The Absolute', kind: 'ultimate', live: true },
];

export const SHOP_IDS = [...FRAMES, ...CARDS, ...THEME_ITEMS].map((i) => i.id);
export const liveAchievements = () => ACHIEVEMENTS.filter((a) => a.live);
export const achById = (id) => ACHIEVEMENTS.find((a) => a.live && a.id === id) || null;
export const achByTitle = (name) => ACHIEVEMENTS.find((a) => a.live && a.name === name) || null;
export const blitzAch = (mode) => ACHIEVEMENTS.find((a) => a.live && a.kind === 'blitz' && a.mode === mode) || null;
export const maxTier = (a) => (a.kind === 'blitz' ? 4 : 1);

// Tiers earned from a counter alone (Platinum is never reached this way).
export const blitzTierFor = (count) => BLITZ_TIERS.filter((t) => (Number(count) || 0) >= t.at).length;

// Anything read from storage or the network is cleaned before use.
export function cleanAch(v) {
  const out = {};
  if (!v || typeof v !== 'object') return out;
  for (const a of liveAchievements()) {
    const n = Math.floor(Number(v[a.id]) || 0);
    if (n > 0) out[a.id] = Math.min(maxTier(a), n);
  }
  return out;
}

export const tierOf = (ach, id) => (ach && Number(ach[id])) || 0;
// The title is unlocked at Platinum for the Blitz achievements, and as soon as it is earned for the rest.
export const hasTitle = (ach, id) => { const a = achById(id); return !!a && tierOf(ach, id) >= (a.kind === 'blitz' ? 4 : 1); };
export const cleanAchTitle = (id, ach) => (typeof id === 'string' && hasTitle(ach, id) ? id : null);
export function cleanShowcase(list, ach) {
  const out = [];
  for (const id of Array.isArray(list) ? list : []) if (achById(id) && tierOf(ach, id) >= 1 && !out.includes(id)) out.push(id);
  return out.slice(0, SHOWCASE_MAX);
}

// The metal a medal is drawn in: Blitz medals follow their tier, the others have one fixed look.
export const medalTier = (a, tier = 1) => (a.kind === 'blitz' ? TIER_IDS[Math.max(1, Math.min(4, tier)) - 1] : a.kind === 'ultimate' ? 'mythic' : 'gold');
// The metal a title is drawn in (see tierForTitle in titles.js).
export const titleTier = (a) => (a.kind === 'blitz' ? 'platinum' : a.kind === 'ultimate' ? 'mythic' : 'gold');

export const ownsEverything = (owned) => SHOP_IDS.every((id) => (owned || []).includes(id));

// What the profile has earned. `before` is the tier map to compare against (defaults to the profile's own),
// `streak` is the current Daily streak. Returns the new tier map and what was newly unlocked or upgraded.
export function evaluate(p, { streak = 0, before } = {}) {
  const prev = cleanAch(before || p.ach);
  const next = { ...cleanAch(p.ach) };
  for (const k of Object.keys(prev)) next[k] = Math.max(next[k] || 0, prev[k]);
  const live = liveAchievements().filter((a) => a.kind !== 'ultimate');
  for (const a of live) {
    if (a.kind === 'blitz') {
      const t = Math.max(next[a.id] || 0, blitzTierFor(p.modeCorrect && p.modeCorrect[a.mode])); // Platinum (4) is kept, never earned here
      if (t > 0) next[a.id] = t;
    } else if (a.kind === 'daily') {
      if (streak >= STREAK_DAYS) next[a.id] = 1;
    } else if (a.kind === 'shop') {
      if (ownsEverything(p.owned)) next[a.id] = 1;
    }
  }
  // The Absolute: every other live achievement at its top tier, and level 100.
  if (live.every((a) => (next[a.id] || 0) >= maxTier(a)) && levelInfo(p.xp).level >= ABSOLUTE_LEVEL) next.absolute = 1;
  const unlocked = [];
  for (const a of liveAchievements()) if ((next[a.id] || 0) > (prev[a.id] || 0)) unlocked.push({ id: a.id, tier: next[a.id], from: prev[a.id] || 0 });
  return { ach: next, unlocked };
}

// Top-percent rule for Platinum. `scores` holds the best scores of the top k players of the mode (any order).
export const topCount = (total) => Math.max(1, Math.ceil((Number(total) || 0) * PLATINUM.topPercent / 100));
export function isTopPercent({ total, scores, myScore }) {
  if (!(total >= PLATINUM.minPlayers) || !(myScore > 0)) return false;
  const k = topCount(total);
  const top = [...(scores || [])].sort((a, b) => b - a);
  if (top.length < k) return false; // not enough data to decide: never guess
  return myScore >= top[k - 1]; // ties with the last place inside the top percent count as inside
}
