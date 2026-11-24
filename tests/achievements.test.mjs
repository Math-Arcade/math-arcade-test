import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, blitzTierFor, isTopPercent, topCount, cleanAch, cleanShowcase, cleanAchTitle, hasTitle, liveAchievements, ACHIEVEMENTS, SHOP_IDS, BLITZ_TIERS, medalTier } from '../js/achievements.js';
import { newProfile, mergeProfiles, store } from '../js/store.js';
import { equippedTitleName, tierForTitle } from '../js/titles.js';
import { cleanPublic } from '../js/public.js';
import { xpForLevel } from '../js/engine/level.js';

const day = (off) => new Date(Date.parse('2026-10-25') + off * 864e5).toISOString().slice(0, 10);
const fresh = () => { store.resetAll(); return store; };

test('Blitz tiers: Bronze 100, Silver 500, Gold 1000 correct answers', () => {
  assert.deepEqual(BLITZ_TIERS.map((t) => t.at), [100, 500, 1000]);
  assert.equal(blitzTierFor(99), 0);
  assert.equal(blitzTierFor(100), 1);
  assert.equal(blitzTierFor(499), 1);
  assert.equal(blitzTierFor(500), 2);
  assert.equal(blitzTierFor(1000), 3);
  assert.equal(blitzTierFor(999999), 3, 'counting alone never reaches Platinum');
});

test('each Blitz mode has its own counter and achievement', () => {
  const p = newProfile(); p.modeCorrect.add = 120; p.modeCorrect.mul = 600;
  const r = evaluate(p);
  assert.equal(r.ach.adder, 1); assert.equal(r.ach.multiplier, 2);
  assert.equal(r.ach.subtractor, undefined); assert.equal(r.ach.polymath, undefined);
  assert.deepEqual(r.unlocked.map((u) => u.id).sort(), ['adder', 'multiplier']);
});

test('earned tiers are never lost, and an upgrade is reported once', () => {
  const p = newProfile(); p.modeCorrect.div = 600;
  p.ach = evaluate(p).ach;
  p.modeCorrect.div = 0; // even if the counter somehow went down
  assert.equal(evaluate(p).ach.divider, 2);
  assert.deepEqual(evaluate(p).unlocked, []);
  p.modeCorrect.div = 1000;
  assert.deepEqual(evaluate(p).unlocked, [{ id: 'divider', tier: 3, from: 2 }]);
});

test('Platinum is only kept, never granted by evaluate, and needs Gold first (store.grantPlatinum)', () => {
  const s = fresh();
  assert.equal(s.grantPlatinum('add'), false, 'no Gold yet');
  s.update((p) => { p.modeCorrect.add = 1000; });
  assert.equal(s.profile.ach.adder, 3);
  assert.equal(s.grantPlatinum('add'), true);
  assert.equal(s.profile.ach.adder, 4);
  assert.equal(hasTitle(s.profile.ach, 'adder'), true);
  s.update((p) => { p.modeCorrect.add = 0; });
  assert.equal(s.profile.ach.adder, 4, 'permanent');
});

test('top 1% rule needs 100 players, and decides by the k-th best score', () => {
  assert.equal(topCount(100), 1); assert.equal(topCount(101), 2); assert.equal(topCount(1000), 10);
  assert.equal(isTopPercent({ total: 99, scores: [500], myScore: 500 }), false, 'fewer than 100 players');
  assert.equal(isTopPercent({ total: 100, scores: [500], myScore: 500 }), true);
  assert.equal(isTopPercent({ total: 100, scores: [900], myScore: 500 }), false);
  assert.equal(isTopPercent({ total: 1000, scores: [9, 8, 7, 6, 5, 4, 3, 2, 1, 0].map((x) => 100 + x), myScore: 100 }), true, 'ties with 10th place count');
  assert.equal(isTopPercent({ total: 1000, scores: [150, 140], myScore: 200 }), false, 'incomplete data is never guessed');
  assert.equal(isTopPercent({ total: 500, scores: [10, 9, 8, 7, 6], myScore: 0 }), false);
});

test('The Streaker needs 30 consecutive completed Dailies, and stays once earned', () => {
  const today = new Date().toISOString().slice(0, 10);
  const days = (n, skip = -1) => Object.fromEntries(Array.from({ length: n }, (_, i) => [new Date(Date.parse(today) - i * 864e5).toISOString().slice(0, 10), { score: 0 }]).filter((_, i) => i !== skip));
  const s = fresh();
  s.update((p) => { p.days = days(29); });
  assert.equal(s.profile.ach.streaker, undefined);
  s.update((p) => { p.days = days(30, 12); }); // a missed day breaks the run
  assert.equal(s.profile.ach.streaker, undefined);
  s.update((p) => { p.days = days(30); }); // a Daily with 0 correct still counts as completed
  assert.equal(s.profile.ach.streaker, 1);
  s.update((p) => { p.days = {}; });
  assert.equal(s.profile.ach.streaker, 1);
});

test('The Collector needs every Store item and stays when new items arrive', () => {
  const s = fresh();
  s.update((p) => { p.owned = SHOP_IDS.slice(1); });
  assert.equal(s.profile.ach.collector, undefined);
  s.update((p) => { p.owned = [...SHOP_IDS]; });
  assert.equal(s.profile.ach.collector, 1);
  s.update((p) => { p.owned = []; }); // stands in for "a new item was added to the shop"
  assert.equal(s.profile.ach.collector, 1);
});

test('The Absolute needs every live achievement and level 100; Elo ones are not live yet', () => {
  assert.ok(ACHIEVEMENTS.filter((a) => a.kind === 'elo').every((a) => !a.live));
  const s = fresh();
  s.update((p) => {
    for (const m of ['add', 'sub', 'mul', 'div', 'mix']) p.modeCorrect[m] = 1000;
    p.owned = [...SHOP_IDS]; p.xp = xpForLevel(100);
    p.days = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [new Date(Date.now() - i * 864e5).toISOString().slice(0, 10), { score: 1 }]));
  });
  assert.equal(s.profile.ach.absolute, undefined, 'Blitz achievements are only Gold');
  for (const m of ['add', 'sub', 'mul', 'div']) s.grantPlatinum(m);
  assert.equal(s.profile.ach.absolute, undefined, 'Polymath is still Gold');
  s.grantPlatinum('mix');
  assert.equal(s.profile.ach.absolute, 1);
  assert.equal(liveAchievements().filter((a) => (s.profile.ach[a.id] || 0) > 0).length, liveAchievements().length);
});

test('The Absolute also needs level 100', () => {
  const s = fresh();
  s.update((p) => { for (const m of ['add', 'sub', 'mul', 'div', 'mix']) p.modeCorrect[m] = 1000; p.owned = [...SHOP_IDS]; p.xp = xpForLevel(99); p.days = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [new Date(Date.now() - i * 864e5).toISOString().slice(0, 10), { score: 1 }])); });
  for (const m of ['add', 'sub', 'mul', 'div', 'mix']) s.grantPlatinum(m);
  assert.equal(s.profile.ach.absolute, undefined);
  s.update((p) => { p.xp = xpForLevel(100); });
  assert.equal(s.profile.ach.absolute, 1);
});

test('unlock events fire once per new tier', () => {
  const s = fresh(); const seen = [];
  const off = s.on('unlock', (l) => seen.push(...l));
  s.update((p) => { p.modeCorrect.sub = 100; });
  s.update((p) => { p.modeCorrect.sub = 150; });
  s.update((p) => { p.modeCorrect.sub = 500; });
  off();
  assert.deepEqual(seen.map((u) => [u.id, u.tier]), [['subtractor', 1], ['subtractor', 2]]);
});

test('merge: counters and tiers only grow; worn title and pins follow the newest copy', () => {
  const a = newProfile(), b = newProfile();
  a.modeCorrect.add = 300; b.modeCorrect.add = 700; b.modeCorrect.div = 5;
  a.ach = { adder: 1, streaker: 1 }; b.ach = { adder: 4, collector: 1 };
  a.achTitle = null; b.achTitle = 'adder'; a.showcase = ['streaker']; b.showcase = ['adder', 'collector'];
  a.updated = 200; b.updated = 100;
  const m = mergeProfiles(a, b), m2 = mergeProfiles(b, a);
  assert.equal(m.modeCorrect.add, 700); assert.equal(m.modeCorrect.div, 5);
  assert.deepEqual(m.ach, { adder: 4, streaker: 1, collector: 1 });
  assert.deepEqual(m.ach, m2.ach);
  assert.equal(m.achTitle, null, 'a is newer and wears no achievement title');
  assert.deepEqual(m.showcase, ['streaker']);
  assert.deepEqual(m2.showcase, m.showcase);
});

test('old profiles without achievement fields load with defaults and lose nothing', () => {
  const old = { v: 2, best: { mix: 5, add: 0, sub: 0, mul: 0, div: 0 }, totals: { correct: 9 }, xp: 50, owned: ['neon'], days: {}, updated: 7 };
  const m = mergeProfiles(old, null);
  assert.equal(m.best.mix, 5); assert.equal(m.totals.correct, 9); assert.equal(m.xp, 50); assert.deepEqual(m.owned, ['neon']);
  assert.deepEqual(m.modeCorrect, { mix: 0, add: 0, sub: 0, mul: 0, div: 0 });
  assert.deepEqual(m.ach, {}); assert.equal(m.achTitle, null); assert.deepEqual(m.showcase, []);
});

test('only earned achievements can be worn or pinned, at most three', () => {
  const ach = { adder: 3, streaker: 1, collector: 1, polymath: 1 };
  assert.equal(cleanAchTitle('adder', ach), null, 'Gold is not enough for the Blitz title');
  assert.equal(cleanAchTitle('streaker', ach), 'streaker');
  assert.equal(cleanAchTitle('absolute', ach), null);
  assert.equal(cleanAchTitle('contender', { contender: 1 }), null, 'Elo is not live');
  assert.deepEqual(cleanShowcase(['adder', 'adder', 'absolute', 'streaker', 'collector', 'polymath'], ach), ['adder', 'streaker', 'collector']);
  assert.deepEqual(cleanAch({ adder: 99, nope: 1, streaker: -3 }), { adder: 4 });
});

test('achievement titles replace the level title while worn, with their own metal', () => {
  const p = { ...newProfile(), titleLevel: 5, ach: { streaker: 1, adder: 4 }, achTitle: 'streaker', xp: 5000 };
  assert.equal(equippedTitleName(p, 10), 'The Streaker');
  assert.equal(equippedTitleName({ ...p, achTitle: null }, 10), "What's 9 + 10?");
  assert.equal(equippedTitleName({ ...p, ach: {} }, 10), "What's 9 + 10?", 'not earned: falls back');
  assert.equal(tierForTitle('The Adder').id, 'platinum');
  assert.equal(tierForTitle('The Streaker').id, 'gold');
  assert.equal(tierForTitle('The Absolute').id, 'mythic');
  assert.equal(medalTier(ACHIEVEMENTS[0], 2), 'silver');
});

test('public profiles are cleaned: unknown ids, locked pins and fake titles are dropped', () => {
  const v = { name: 'Zed', theme: 'green', stats: { best: {} }, xp: 0, ach: { adder: 2, streaker: 1, hacker: 4 }, showcase: 'adder,absolute,streaker', achTitle: 'adder' };
  const c = cleanPublic(v);
  assert.deepEqual(c.ach, { adder: 2, streaker: 1 });
  assert.deepEqual(c.showcase, ['adder', 'streaker']);
  assert.equal(c.achTitle, null);
  assert.equal(c.title, 'Rookie');
  assert.equal(cleanPublic({ ...v, ach: { streaker: 1 }, achTitle: 'streaker' }).title, 'The Streaker');
});
