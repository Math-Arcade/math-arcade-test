import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeProfiles, newProfile, store } from '../js/store.js';
import { FRAMES, CARDS, RETIRED_ITEMS, balance, cleanFrame, cleanCard, frameById, cardById, itemById } from '../js/shop.js';
import { cleanPublic } from '../js/public.js';

test('coins only grow when merging, so syncing never loses or duplicates them', () => {
  const a = { ...newProfile(), coinsEarned: 500, coinsSpent: 120, owned: ['neon'], frame: 'neon' };
  const b = { ...newProfile(), coinsEarned: 300, coinsSpent: 250, owned: ['frost'] };
  const m = mergeProfiles(a, b);
  assert.equal(m.coinsEarned, 500); assert.equal(m.coinsSpent, 250);
  assert.deepEqual(m.owned.sort(), ['frost', 'neon']);
  assert.equal(m.frame, 'neon');
  assert.equal(balance(m), 250);
});

test('unknown frames are dropped and the worn frame is always owned', () => {
  const m = mergeProfiles({ ...newProfile(), owned: ['nope', 'sugar'], frame: 'rainbow' }, null);
  assert.deepEqual(m.owned.sort(), ['rainbow', 'sugar']);
  assert.equal(cleanFrame('nope'), null);
  assert.ok(FRAMES.every((f) => f.price > 0 && cleanFrame(f.id) === f.id));
});

// ---- profile cards ----

test('cards: catalog is valid, ids never collide with frame ids, every card costs coins', () => {
  assert.equal(CARDS.length, 6);
  assert.ok(CARDS.every((c) => c.price > 0 && c.name && cleanCard(c.id) === c.id && cardById(c.id) === c));
  assert.equal(new Set([...FRAMES, ...CARDS].map((x) => x.id)).size, FRAMES.length + CARDS.length, 'frame and card ids are all different');
  assert.equal(cleanCard('nope'), null); assert.equal(cleanCard(null), null); assert.equal(cleanCard('neon'), null, 'a frame id is not a card');
  assert.equal(cleanFrame('crystal'), null, 'a card id is not a frame');
  assert.ok(itemById('neon') && itemById('crystal') && !itemById('nope'));
  assert.ok(frameById('rainbow'), 'the redesigned Prismatic frame keeps its id, so everyone who owns it still has it');
});

test('cards: merging keeps owned frames and cards, drops unknown ids, and a worn card is always owned', () => {
  const a = { ...newProfile(), coinsEarned: 900, coinsSpent: 200, owned: ['neon', 'snowdrift'], frame: 'neon', card: 'snowdrift' };
  const b = { ...newProfile(), owned: ['crystal', 'bogus'] };
  const m = mergeProfiles(a, b);
  assert.deepEqual(m.owned.sort(), ['crystal', 'neon', 'snowdrift']);
  assert.equal(m.card, 'snowdrift'); assert.equal(m.frame, 'neon');
  const worn = mergeProfiles({ ...newProfile(), owned: [], card: 'northern' }, null);
  assert.deepEqual(worn.owned, ['northern']);
  assert.equal(mergeProfiles({ ...newProfile(), card: 'hacked' }, null).card, null, 'an unknown card is dropped');
  assert.equal(mergeProfiles({ ...newProfile(), card: 'neon' }, null).card, null, 'a frame id cannot be worn as a card');
  assert.equal(newProfile().card, null);
  assert.equal(mergeProfiles(null, null).card, null, 'older saves without a card still load');
  assert.equal(mergeProfiles(mergeProfiles(a, b), mergeProfiles(b, a)).card, 'snowdrift', 'merge is stable');
});

test('cards: buying spends coins once, equips, and is kept apart from frames', () => {
  store.update((p) => { Object.assign(p, newProfile(), { coinsEarned: 1000 }); });
  assert.equal(store.coins, 1000);
  assert.equal(store.buyCard('nope'), false);
  assert.equal(store.buyCard('crystal'), false, 'cannot afford 2400');
  assert.equal(store.buyCard('neongrid'), true);
  assert.equal(store.coins, 800); assert.equal(store.profile.card, 'neongrid'); assert.ok(store.profile.owned.includes('neongrid'));
  assert.equal(store.buyCard('neongrid'), false, 'no double charge'); assert.equal(store.coins, 800);
  assert.equal(store.buyCard('neon'), false, 'a frame id is not a card');
  assert.equal(store.buyFrame('neongrid'), false, 'a card id is not a frame');
  assert.equal(store.buyFrame('neon'), true);
  assert.equal(store.profile.frame, 'neon'); assert.equal(store.profile.card, 'neongrid', 'a frame and a card are worn together');
  assert.equal(store.equipCard('snowdrift'), false, 'cannot wear a card you do not own');
  assert.equal(store.equipCard('neon'), false, 'cannot wear a frame as a card');
  assert.equal(store.equipFrame('neongrid'), false, 'cannot wear a card as a frame');
  assert.equal(store.equipCard(null), true); assert.equal(store.profile.card, null);
  assert.ok(store.profile.owned.includes('neongrid'), 'taking a card off keeps it');
  assert.equal(store.equipCard('neongrid'), true); assert.equal(store.profile.card, 'neongrid');
});

test('cards: what comes back from the database is cleaned', () => {
  const base = { name: 'Nova', theme: 'green', stats: {} };
  assert.equal(cleanPublic({ ...base, card: 'northern' }).card, 'northern');
  assert.equal(cleanPublic({ ...base, card: '<img src=x>' }).card, null);
  assert.equal(cleanPublic({ ...base, card: 'neon' }).card, null);
  assert.equal(cleanPublic({ ...base }).card, null);
  assert.equal(cleanPublic({ ...base, card: 'crystal', frame: 'rainbow' }).frame, 'rainbow');
});

// ---- items taken out of the Store ----

test('retired items: Gold Rush and Gold Ledger are gone from the Store, and everyone who owned one gets the coins back', () => {
  assert.equal(frameById('gold'), null); assert.equal(cardById('goldledger'), null);
  assert.equal(cleanFrame('gold'), null); assert.equal(cleanCard('goldledger'), null);
  assert.equal(itemById('gold'), null); assert.equal(itemById('goldledger'), null);
  const bought = { ...newProfile(), coinsEarned: 3000, coinsSpent: 900 + 1100 + 250, owned: ['gold', 'goldledger', 'frost'], frame: 'gold', card: 'goldledger' };
  const m = mergeProfiles(bought, null);
  assert.deepEqual(m.owned, ['frost']); assert.equal(m.frame, null); assert.equal(m.card, null);
  assert.equal(m.coinsSpent, 250, 'only the 250 for Frostbite stays spent');
  assert.equal(balance(m), 2750, 'balance is exactly what it was before the two purchases');
  // merging again with an old copy that still lists the items must not refund a second time
  const again = mergeProfiles(m, bought);
  assert.equal(again.coinsSpent, 250); assert.equal(balance(again), 2750);
  assert.equal(mergeProfiles(again, m).coinsSpent, 250);
  // someone who never owned them is untouched, and spending can never go below zero
  assert.equal(mergeProfiles({ ...newProfile(), coinsSpent: 120, owned: ['neon'] }, null).coinsSpent, 120);
  assert.equal(mergeProfiles({ ...newProfile(), coinsSpent: 0, owned: ['gold'] }, null).coinsSpent, 0);
  assert.deepEqual(Object.keys(RETIRED_ITEMS).sort(), ['gold', 'goldledger']);
});

test('the Candy and Gothic frames and cards exist, are priced, and keep their ids away from the themes', () => {
  for (const id of ['sugar', 'bone']) assert.ok(frameById(id) && frameById(id).price > 0, id);
  for (const id of ['sprinkle', 'crypt']) assert.ok(cardById(id) && cardById(id).price > 0, id);
  assert.equal(FRAMES.length, 6);
  const all = [...FRAMES, ...CARDS].map((x) => x.id);
  assert.equal(new Set(all).size, all.length);
  for (const t of ['candy', 'gothic', 'notebook', 'space', 'winter']) assert.ok(!all.includes(t), 'item ids never overlap theme ids');
  assert.equal(cleanFrame('bone'), 'bone'); assert.equal(cleanCard('crypt'), 'crypt'); assert.equal(cleanCard('bone'), null);
});
