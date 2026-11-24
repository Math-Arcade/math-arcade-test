import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeProfiles, newProfile, store } from '../js/store.js';
import { FRAMES, CARDS, balance, cleanFrame, cleanCard, frameById, cardById, itemById } from '../js/shop.js';
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
  const m = mergeProfiles({ ...newProfile(), owned: ['nope', 'gold'], frame: 'rainbow' }, null);
  assert.deepEqual(m.owned.sort(), ['gold', 'rainbow']);
  assert.equal(cleanFrame('nope'), null);
  assert.ok(FRAMES.every((f) => f.price > 0 && cleanFrame(f.id) === f.id));
});

// ---- profile cards ----

test('cards: catalog is valid, ids never collide with frame ids, every card costs coins', () => {
  assert.equal(CARDS.length, 5);
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
