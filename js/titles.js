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
