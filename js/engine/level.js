// Account level: 1..100. Every level costs more XP than the one before it.
export const MAX_LEVEL = 100;
export const XP_SCALE = 80; // tune this one number to make the whole curve faster or slower

// XP needed to go from `level` to `level + 1`.
export const xpToNext = (level) => Math.round(XP_SCALE * level ** 1.3);

// TOTAL[L] = XP you need in total to reach level L.
const TOTAL = [0, 0];
for (let l = 2; l <= MAX_LEVEL; l++) TOTAL[l] = TOTAL[l - 1] + xpToNext(l - 1);
export const MAX_XP = TOTAL[MAX_LEVEL];
export const xpForLevel = (level) => TOTAL[Math.max(1, Math.min(MAX_LEVEL, level))];

export function levelInfo(xp) {
  const x = Math.max(0, Math.min(MAX_XP, Math.floor(Number(xp) || 0)));
  let level = 1;
  while (level < MAX_LEVEL && TOTAL[level + 1] <= x) level++;
  const maxed = level >= MAX_LEVEL;
  const need = maxed ? 0 : xpToNext(level);
  const into = maxed ? 0 : x - TOTAL[level];
  return { level, xp: x, into, need, toNext: maxed ? 0 : need - into, pct: maxed ? 1 : into / need, maxed };
}
