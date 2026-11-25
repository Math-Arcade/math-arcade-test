// Store: coins are earned together with XP and spent on avatar frames, profile cards and themes.
export const COINS_PER_XP = 1;   // coins earned for every XP point
export const LEVEL_UP_COINS = 25; // bonus coins for every level gained

export const FRAMES = [
  { id: 'neon', name: 'Neon Edge', price: 120 },
  { id: 'frost', name: 'Frostbite', price: 250 },
  { id: 'sugar', name: 'Sugar Rush', price: 900 },
  { id: 'bone', name: 'Bone Crown', price: 1000 },
  { id: 'aurora', name: 'Aurora', price: 1200 },
  { id: 'rainbow', name: 'Prismatic', price: 2000 },
];
// Profile cards restyle your row in Ranks and Friends. Each one borrows the look of a frame (same colours, same decorations).
export const CARDS = [
  { id: 'neongrid', name: 'Neon Grid', price: 200 },
  { id: 'snowdrift', name: 'Snowdrift', price: 400 },
  { id: 'sprinkle', name: 'Sprinkle Pop', price: 1100 },
  { id: 'crypt', name: 'Crypt Keeper', price: 1200 },
  { id: 'northern', name: 'Northern Lights', price: 1500 },
  { id: 'crystal', name: 'Crystal Prism', price: 2400 },
];
// Items that were taken out of the Store. Anyone who owned one gets the coins back (see mergeProfiles in store.js).
export const RETIRED_ITEMS = { gold: 900, goldledger: 1100 }; // Gold Rush frame, Gold Ledger card
// Themes restyle the whole game (palette, wallpaper, fonts). The free ones live in config.js; these are bought with coins,
// then picked here or in Settings. Until you own one, the game shows the default theme instead.
export const THEME_ITEMS = [
  { id: 'notebook', name: 'Notebook', price: 1500 },
  { id: 'space', name: 'Space', price: 1800 },
  { id: 'winter', name: 'Winter', price: 1600 },
  { id: 'candy', name: 'Candy', price: 1700 },
  { id: 'gothic', name: 'Gothic', price: 1900 },
];
export const themeById = (id) => THEME_ITEMS.find((t) => t.id === id) || null;
export const frameById = (id) => FRAMES.find((f) => f.id === id) || null;
export const cleanFrame = (id) => (frameById(id) ? id : null);
export const cardById = (id) => CARDS.find((c) => c.id === id) || null;
export const cleanCard = (id) => (cardById(id) ? id : null);
// frames, cards and themes share one list of owned ids (the ids never overlap)
export const itemById = (id) => frameById(id) || cardById(id) || themeById(id);
export const balance = (p) => Math.max(0, Math.floor((p?.coinsEarned || 0) - (p?.coinsSpent || 0)));
