import test from 'node:test';
import assert from 'node:assert/strict';
import { TITLES, titleForLevel, titleByMilestone, cleanTitleLevel } from '../js/titles.js';

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
