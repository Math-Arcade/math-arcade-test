import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeProfiles, newProfile } from '../js/store.js';
import { FRAMES, balance, cleanFrame } from '../js/shop.js';

test('coins only grow when merging, so syncing never loses or duplicates them', () => {
  const a = { ...newProfile(), coinsEarned: 500, coinsSpent: 120, owned: ['neon'], frame: 'neon' };
  const b = { ...newProfile(), coinsEarned: 300, coinsSpent: 250, owned: ['ember'] };
  const m = mergeProfiles(a, b);
  assert.equal(m.coinsEarned, 500); assert.equal(m.coinsSpent, 250);
  assert.deepEqual(m.owned.sort(), ['ember', 'neon']);
  assert.equal(m.frame, 'neon');
  assert.equal(balance(m), 250);
});

test('unknown frames are dropped and the worn frame is always owned', () => {
  const m = mergeProfiles({ ...newProfile(), owned: ['nope', 'gold'], frame: 'rainbow' }, null);
  assert.deepEqual(m.owned.sort(), ['gold', 'rainbow']);
  assert.equal(cleanFrame('nope'), null);
  assert.ok(FRAMES.every((f) => f.price > 0 && cleanFrame(f.id) === f.id));
});
