import test from 'node:test';
import assert from 'node:assert/strict';
import { TITLES, titleForLevel, titleByMilestone, cleanTitleLevel, TIERS, tierForLevel, tierForTitle, titleProgress } from '../js/titles.js';

test('title milestones run from Rookie at level 1 to The Mathematician at level 100', () => {
  assert.equal(TITLES.length, 21);
  assert.deepEqual(titleByMilestone(1), { level: 1, name: 'Rookie' });
  assert.deepEqual(titleByMilestone(100), { level: 100, name: 'The Mathematician' });
  assert.equal(titleForLevel(99).level, 95);
  assert.equal(titleForLevel(100).name, 'The Mathematician');
});

test('equipped title is limited to an unlocked milestone', () => {
  assert.equal(cleanTitleLevel(10, 10), 10);
  assert.equal(cleanTitleLevel(15, 12), 1);
  assert.equal(cleanTitleLevel(8, 20), 1);
  assert.equal(cleanTitleLevel(null, 50), 1);
});

test('every title belongs to a tier and tiers climb with the level', () => {
  assert.equal(TIERS.length, 5);
  assert.equal(tierForLevel(1).id, 'bronze');
  assert.equal(tierForLevel(20).id, 'bronze');
  assert.equal(tierForLevel(25).id, 'silver');
  assert.equal(tierForLevel(50).id, 'gold');
  assert.equal(tierForLevel(75).id, 'platinum');
  assert.equal(tierForLevel(100).id, 'mythic');
  assert.equal(tierForTitle('The Mathematician').id, 'mythic');
  assert.equal(tierForTitle('not a title').id, 'bronze');
  for (const t of TITLES) assert.ok(TIERS.some((x) => x.id === tierForLevel(t.level).id));
});

test('titleProgress says what is next and how far along you are', () => {
  const a = titleProgress(3, 0);
  assert.equal(a.prev.level, 1); assert.equal(a.next.level, 5); assert.equal(a.levelsToGo, 2); assert.equal(a.unlockedCount, 1);
  assert.ok(Math.abs(a.pct - 0.5) < 1e-9);
  const b = titleProgress(5, 0);
  assert.equal(b.prev.level, 5); assert.equal(b.next.level, 10); assert.equal(b.pct, 0);
  const c = titleProgress(100, 0);
  assert.equal(c.next, null); assert.equal(c.pct, 1); assert.equal(c.unlockedCount, 21); assert.equal(c.levelsToGo, 0);
  assert.ok(titleProgress(7, 0.5).pct > titleProgress(7, 0).pct);
});
