// What other players can see about you: name, theme, picture and a stats summary.
import { MODES } from './config.js';
import { levelInfo } from './engine/level.js';
import { titleByMilestone, cleanTitleLevel } from './titles.js';
import { thumbFrom, safePic } from './avatar.js';

export const THEMES = ['green', 'blue', 'red', 'yellow', 'purple', 'light', 'dark', 'colorblind'];
export const PUBLIC_PIC_MAX = 14000;

const num = (v, max = 1e8) => (Number.isFinite(Number(v)) ? Math.max(0, Math.min(max, Math.round(Number(v)))) : 0);

export function ownStats(store) {
  const { totals: t, best, days } = store.profile;
  return {
    blitzGames: t.blitzGames, correct: t.correct, wrong: t.wrong, bestStreak: t.bestStreak, bestLevel: t.bestLevel,
    seconds: t.seconds, dailies: Object.keys(days).length, dailyStreak: store.streak, best: { ...best },
  };
}

export async function buildPublic(store, cloud) {
  const s = ownStats(store);
  const stats = { best: {} };
  for (const k of ['blitzGames', 'correct', 'wrong', 'bestStreak', 'bestLevel', 'seconds', 'dailies', 'dailyStreak']) stats[k] = num(s[k]);
  for (const m of MODES) stats.best[m] = num(s.best[m], 100000);
  const out = { xp: num(store.profile.xp), titleLevel: Number(store.profile.titleLevel) || 1, name: cloud.user.name, theme: THEMES.includes(store.settings.theme) ? store.settings.theme : 'green', stats, updated: Date.now() };
  const pic = await thumbFrom(store.settings.avatar, 96, PUBLIC_PIC_MAX);
  if (pic) out.pic = pic;
  return out;
}

// Anything read back from the database is treated as untrusted.
export function cleanPublic(v) {
  if (!v || typeof v !== 'object') return null;
  const stats = { best: {} };
  for (const k of ['blitzGames', 'correct', 'wrong', 'bestStreak', 'bestLevel', 'seconds', 'dailies', 'dailyStreak']) stats[k] = num(v.stats?.[k]);
  for (const m of MODES) stats.best[m] = num(v.stats?.best?.[m], 100000);
  const xp = num(v.xp);
  return { xp, level: levelInfo(xp).level, titleLevel: cleanTitleLevel(v.titleLevel, levelInfo(xp).level), title: titleByMilestone(cleanTitleLevel(v.titleLevel, levelInfo(xp).level)).name, name: String(v.name || '?').slice(0, 16), theme: THEMES.includes(v.theme) ? v.theme : 'green', pic: safePic(v.pic, PUBLIC_PIC_MAX), stats };
}
