import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_LEVEL, MAX_XP, xpToNext, xpForLevel, levelInfo } from '../js/engine/level.js';
import { mergeProfiles, newProfile } from '../js/store.js';

test('every level costs more XP than the one before, and the cap is level 100', () => {
  assert.equal(MAX_LEVEL, 100);
  for (let l = 1; l < MAX_LEVEL - 1; l++) assert.ok(xpToNext(l + 1) > xpToNext(l), `level ${l + 1} should cost more than ${l}`);
  assert.equal(levelInfo(MAX_XP).level, 100);
  assert.equal(levelInfo(MAX_XP * 10).level, 100); // never above the cap
  assert.equal(levelInfo(MAX_XP).maxed, true);
});

test('levelInfo reports level, progress and XP to the next level', () => {
  assert.equal(levelInfo(0).level, 1);
  assert.equal(levelInfo(0).pct, 0);
  const edge = xpForLevel(2);
  assert.equal(levelInfo(edge - 1).level, 1);
  assert.equal(levelInfo(edge).level, 2);
  const i = levelInfo(edge + 10);
  assert.equal(i.into, 10);
  assert.equal(i.toNext, xpToNext(2) - 10);
  assert.ok(i.pct > 0 && i.pct < 1);
  assert.equal(levelInfo(-5).level, 1);
  assert.equal(levelInfo(NaN).xp, 0);
});

test('XP is merged by max so syncing never loses progress', () => {
  const a = { ...newProfile(), xp: 500 }, b = { ...newProfile(), xp: 900 };
  assert.equal(mergeProfiles(a, b).xp, 900);
  assert.equal(mergeProfiles(a, null).xp, 500);
  assert.equal(mergeProfiles({ ...newProfile(), xp: MAX_XP * 3 }, null).xp, MAX_XP);
});
