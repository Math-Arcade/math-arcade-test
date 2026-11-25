// What other players can see about you: name, theme, picture and a stats summary.
import { MODES, ALL_THEME_IDS } from './config.js';
import { levelInfo } from './engine/level.js';
import { cleanFrame, cleanCard } from './shop.js';
import { titleByMilestone, cleanTitleLevel } from './titles.js';
import { achById, cleanAch, cleanAchTitle, cleanShowcase } from './achievements.js';
import { thumbFrom, safePic } from './avatar.js';

export const THEMES = ALL_THEME_IDS;
export const PUBLIC_PIC_MAX = 14000;

const num = (v, max = 1e8) => (Number.isFinite(Number(v)) ? Math.max(0, Math.min(max, Math.round(Number(v)))) : 0);

export function ownStats(store) {
  const { totals: t, best, days } = store.profile;
  return {
    blitzGames: t.blitzGames, correct: t.correct, wrong: t.wrong, bestStreak: t.bestStreak, bestLevel: t.bestLevel,
    seconds: t.seconds, dailies: Object.keys(days).length, dailyStreak: store.streak, best: { ...best },
  };
}

export async function buildPublic(store, cloud, me = cloud.user) {
  const s = ownStats(store);
  const stats = { best: {} };
  for (const k of ['blitzGames', 'correct', 'wrong', 'bestStreak', 'bestLevel', 'seconds', 'dailies', 'dailyStreak']) stats[k] = num(s[k]);
  for (const m of MODES) stats.best[m] = num(s.best[m], 100000);
  const out = { xp: num(store.profile.xp), titleLevel: Number(store.profile.titleLevel) || 1, name: me.name, theme: THEMES.includes(store.theme) ? store.theme : 'green', stats, updated: Date.now() };
  const ach = cleanAch(store.profile.ach); // earned achievements, the one worn as a title, and the (up to 3) shown on the profile
  if (Object.keys(ach).length) out.ach = ach;
  const shown = cleanShowcase(store.profile.showcase, ach); if (shown.length) out.showcase = shown.join(',');
  const worn = cleanAchTitle(store.profile.achTitle, ach); if (worn) out.achTitle = worn;
  if (store.profile.card) out.card = store.profile.card;
  if (store.profile.frame) out.frame = store.profile.frame; // everything is read before the first await, so it all belongs to one moment
  const pic = await thumbFrom(store.settings.avatar, 96, PUBLIC_PIC_MAX);
  if (pic) out.pic = pic;
  return out;
}

// Build and publish the signed-in player's public profile. The account is fixed at the start and checked again at the
// write, so a profile built for one account can never land on another one that signed in meanwhile.
export async function publishFor(store, cloud) {
  const me = cloud.user;
  if (!me) return false;
  const data = await buildPublic(store, cloud, me);
  return cloud.publishProfile(data, me.uid);
}

// Anything read back from the database is treated as untrusted.
export function cleanPublic(v) {
  if (!v || typeof v !== 'object') return null;
  const stats = { best: {} };
  for (const k of ['blitzGames', 'correct', 'wrong', 'bestStreak', 'bestLevel', 'seconds', 'dailies', 'dailyStreak']) stats[k] = num(v.stats?.[k]);
  for (const m of MODES) stats.best[m] = num(v.stats?.best?.[m], 100000);
  const xp = num(v.xp);
  const ach = cleanAch(v.ach), achTitle = cleanAchTitle(v.achTitle, ach);
  const showcase = cleanShowcase(typeof v.showcase === 'string' ? v.showcase.split(',') : [], ach);
  const levelTitle = titleByMilestone(cleanTitleLevel(v.titleLevel, levelInfo(xp).level)).name;
  return { frame: cleanFrame(v.frame), card: cleanCard(v.card), xp, level: levelInfo(xp).level, titleLevel: cleanTitleLevel(v.titleLevel, levelInfo(xp).level), title: achTitle ? achById(achTitle).name : levelTitle, ach, showcase, achTitle, name: String(v.name || '?').slice(0, 16), theme: THEMES.includes(v.theme) ? v.theme : 'green', pic: safePic(v.pic, PUBLIC_PIC_MAX), stats };
}
