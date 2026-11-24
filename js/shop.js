// Store: coins are earned together with XP and spent on avatar frames and profile cards.
export const COINS_PER_XP = 1;   // coins earned for every XP point
export const LEVEL_UP_COINS = 25; // bonus coins for every level gained

export const FRAMES = [
  { id: 'neon', name: 'Neon Edge', price: 120 },
  { id: 'frost', name: 'Frostbite', price: 250 },
  { id: 'gold', name: 'Gold Rush', price: 900 },
  { id: 'aurora', name: 'Aurora', price: 1200 },
  { id: 'rainbow', name: 'Prismatic', price: 2000 },
];
// Profile cards restyle your row in Ranks and Friends. Each one borrows the look of a frame (same colours, same decorations).
export const CARDS = [
  { id: 'neongrid', name: 'Neon Grid', price: 200 },
  { id: 'snowdrift', name: 'Snowdrift', price: 400 },
  { id: 'goldledger', name: 'Gold Ledger', price: 1100 },
  { id: 'northern', name: 'Northern Lights', price: 1500 },
  { id: 'crystal', name: 'Crystal Prism', price: 2400 },
];
export const frameById = (id) => FRAMES.find((f) => f.id === id) || null;
export const cleanFrame = (id) => (frameById(id) ? id : null);
export const cardById = (id) => CARDS.find((c) => c.id === id) || null;
export const cleanCard = (id) => (cardById(id) ? id : null);
// frames and cards share one list of owned ids (the ids never overlap)
export const itemById = (id) => frameById(id) || cardById(id);
export const balance = (p) => Math.max(0, Math.floor((p?.coinsEarned || 0) - (p?.coinsSpent || 0)));
