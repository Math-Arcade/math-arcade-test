import test from 'node:test';
import assert from 'node:assert/strict';

// A tiny localStorage so the store can be tested outside the browser.
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k), clear: () => mem.clear() };
const fresh = async (tag) => (await import(`../js/store.js?${tag}`)).store;

test('each owner has their own progress and picture, and switching never mixes them', async () => {
  mem.clear();
  const s = await fresh('a');
  assert.equal(s.owner, 'guest');
  s.update((p) => { p.xp = 100; }); s.set('avatar', 'GUESTPIC');
  s.switchOwner('uidA');
  assert.equal(s.profile.xp, 0); assert.equal(s.settings.avatar, '');
  s.update((p) => { p.xp = 50; }); s.set('avatar', 'APIC');
  s.switchOwner('guest');
  assert.equal(s.profile.xp, 100); assert.equal(s.settings.avatar, 'GUESTPIC');
  s.switchOwner('uidA');
  assert.equal(s.profile.xp, 50); assert.equal(s.settings.avatar, 'APIC');
});

test('a reload picks up the owner that was active', async () => {
  const s = await fresh('b');
  assert.equal(s.owner, 'uidA'); assert.equal(s.profile.xp, 50);
});

test('registering moves the guest progress into the account and empties the guest slot', async () => {
  mem.clear();
  const s = await fresh('c');
  s.update((p) => { p.xp = 100; }); s.set('avatar', 'PIC'); s.set('localName', 'Offline');
  s.adoptGuestInto('uidB');
  assert.equal(s.owner, 'uidB'); assert.equal(s.profile.xp, 100); assert.equal(s.settings.avatar, 'PIC'); assert.equal(s.settings.localName, '');
  s.switchOwner('guest');
  assert.equal(s.profile.xp, 0); assert.equal(s.settings.avatar, '');
});

test('purging a deleted account removes its local data and falls back to the guest slot', async () => {
  mem.clear();
  const s = await fresh('d');
  s.update((p) => { p.xp = 7; });
  s.switchOwner('uidC'); s.update((p) => { p.xp = 900; });
  assert.ok(mem.has('ma2.profile.uidC'));
  s.purgeOwner('uidC');
  assert.equal(s.owner, 'guest'); assert.equal(s.profile.xp, 7);
  assert.ok(!mem.has('ma2.profile.uidC') && !mem.has('ma2.prefs.uidC'));
  assert.equal(JSON.parse(mem.get('ma2.profile')).xp, 7); // the guest slot was not touched
});

test('cloud data is merged into the active owner only, and odd owner names are rejected', async () => {
  mem.clear();
  const s = await fresh('e');
  s.switchOwner('uidD');
  s.mergeRemote({ xp: 40 });
  assert.equal(JSON.parse(mem.get('ma2.profile.uidD')).xp, 40);
  assert.ok(!mem.has('ma2.profile') || JSON.parse(mem.get('ma2.profile')).xp !== 40);
  s.switchOwner('../evil'); // not a valid owner: ends up as the guest slot, never a path
  assert.equal(s.owner, 'guest');
});
