import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeProfiles, dailyStreak, newProfile } from '../js/store.js';

const day = (offset, from = '2026-10-25') => new Date(Date.parse(from) + offset * 864e5).toISOString().slice(0, 10);

test('merge never loses progress and is symmetric', () => {
  const a = newProfile(), b = newProfile();
  a.best.mix = 500; b.best.mix = 300; b.best.add = 90;
  a.totals.correct = 40; b.totals.correct = 75;
  a.days['2026-10-24'] = { score: 7 }; b.days['2026-10-24'] = { score: 9 }; b.days['2026-10-25'] = { score: 5 };
  const m1 = mergeProfiles(a, b), m2 = mergeProfiles(b, a);
  assert.deepEqual(m1.best, { mix: 500, add: 90, sub: 0, mul: 0, div: 0 });
  assert.equal(m1.totals.correct, 75);
  assert.equal(m1.days['2026-10-24'].score, 9);
  assert.deepEqual(m1.best, m2.best);
  assert.deepEqual(m1.days, m2.days);
});

test('merge handles missing remote data and prunes old days', () => {
  const a = newProfile();
  for (let i = 0; i < 120; i++) a.days[day(-i)] = { score: 5 };
  const m = mergeProfiles(a, null);
  assert.equal(Object.keys(m.days).length, 90);
  assert.ok(m.days[day(0)]);
  assert.deepEqual(mergeProfiles(null, null).best, newProfile().best);
});

test('daily streak counts consecutive days, forgives "not played yet today"', () => {
  const today = '2026-10-25';
  const mk = (...offs) => Object.fromEntries(offs.map((o) => [day(o, today), { score: 1 }]));
  assert.equal(dailyStreak({}, today), 0);
  assert.equal(dailyStreak(mk(0), today), 1);
  assert.equal(dailyStreak(mk(0, -1, -2), today), 3);
  assert.equal(dailyStreak(mk(-1, -2), today), 2);   // today still open, streak alive
  assert.equal(dailyStreak(mk(-2, -3), today), 0);   // missed yesterday: streak broken
  assert.equal(dailyStreak(mk(0, -1, -3), today), 2); // gap stops the count
});
