// Level milestone titles. Keep this list easy to edit as the game evolves.
export const TITLES = [
  { level: 1, name: 'Rookie' },
  { level: 5, name: "What's 9 + 10?" },
  { level: 10, name: 'Do the Math' },
  { level: 15, name: 'PEMDAS Victim' },
  { level: 20, name: "What's a Calculator?" },
  { level: 25, name: 'Trust Me, I’m Counting' },
  { level: 30, name: 'Math Isn’t Mathing' },
  { level: 35, name: 'Professional Guess-er' },
  { level: 40, name: 'Carry the One' },
  { level: 45, name: 'Number Menace' },
  { level: 50, name: 'The Final Answer' },
  { level: 55, name: 'Beyond Calculation' },
  { level: 60, name: 'Functionally Lost' },
  { level: 65, name: 'Algebra Survivor' },
  { level: 70, name: 'Certified Nerd' },
  { level: 75, name: 'Mental Gymnast' },
  { level: 80, name: 'The Human Calculator' },
  { level: 85, name: 'Unreasonably Good' },
  { level: 90, name: 'Math Overlord' },
  { level: 95, name: 'One Last Equation' },
  { level: 100, name: 'The Mathematician' },
];

export const titleForLevel = (level) => { const unlocked = TITLES.filter((t) => t.level <= Math.max(1, Number(level) || 1)); return unlocked[unlocked.length - 1] || TITLES[0]; };
export const titleByMilestone = (level) => TITLES.find((t) => t.level === Number(level)) || TITLES[0];
export const cleanTitleLevel = (value, level = 1) => {
  const allowed = TITLES.filter((t) => t.level <= Math.max(1, Number(level) || 1));
  const found = allowed.find((t) => t.level === Number(value));
  return found ? found.level : 1;
};

// Five tiers colour the titles: the further up the ladder, the rarer the metal.
export const TIERS = [
  { id: 'bronze', name: 'BRONZE', from: 1 },
  { id: 'silver', name: 'SILVER', from: 25 },
  { id: 'gold', name: 'GOLD', from: 50 },
  { id: 'platinum', name: 'PLATINUM', from: 75 },
  { id: 'mythic', name: 'MYTHIC', from: 100 },
];
export const tierForLevel = (level) => { const l = Math.max(1, Number(level) || 1); return [...TIERS].reverse().find((x) => x.from <= l) || TIERS[0]; };
export const tierForTitle = (name) => tierForLevel((TITLES.find((x) => x.name === name) || TITLES[0]).level);

// Where you stand on the ladder: the equipped milestone, the next one, and how far along that stretch you are.
export function titleProgress(level, frac = 0) {
  const lv = Math.max(1, Math.min(100, Math.floor(Number(level) || 1)));
  const unlocked = TITLES.filter((x) => x.level <= lv);
  const prev = unlocked[unlocked.length - 1] || TITLES[0];
  const next = TITLES.find((x) => x.level > lv) || null;
  const pct = next ? Math.max(0, Math.min(1, (lv - prev.level + Math.max(0, Math.min(1, frac))) / (next.level - prev.level))) : 1;
  return { unlockedCount: unlocked.length, total: TITLES.length, prev, next, pct, levelsToGo: next ? next.level - lv : 0 };
}

