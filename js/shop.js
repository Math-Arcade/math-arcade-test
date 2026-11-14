// Store: coins are earned together with XP and spent on avatar frames.
export const COINS_PER_XP = 1;   // coins earned for every XP point
export const LEVEL_UP_COINS = 25; // bonus coins for every level gained

export const FRAMES = [
  { id: 'neon', name: 'Neon Edge', price: 120 },
  { id: 'ember', name: 'Ember', price: 250 },
  { id: 'frost', name: 'Frostbite', price: 250 },
  { id: 'pixel', name: 'Pixel Crown', price: 400 },
  { id: 'royal', name: 'Royal', price: 600 },
  { id: 'gold', name: 'Gold Rush', price: 900 },
  { id: 'aurora', name: 'Aurora', price: 1200 },
  { id: 'rainbow', name: 'Prismatic', price: 2000 },
];
export const frameById = (id) => FRAMES.find((f) => f.id === id) || null;
export const cleanFrame = (id) => (frameById(id) ? id : null);
export const balance = (p) => Math.max(0, Math.floor((p?.coinsEarned || 0) - (p?.coinsSpent || 0)));
