// Runs tests/rules/scenarios.mjs against database.rules.json with the Targaryen rules simulator.
// NOTE: Targaryen re-implements the rules language; it is not Google's own engine. Run emulator.test.mjs for that.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { seed, scenarios } from './scenarios.mjs';
import { planWipe, planRename } from '../../js/cloudplan.js';

const require = createRequire(import.meta.url);
let targaryen = null;
try { targaryen = require('targaryen'); } catch { /* not installed */ }
const rules = JSON.parse(fs.readFileSync(new URL('../../database.rules.json', import.meta.url), 'utf8'));

for (const s of scenarios) {
  test(`rules: ${s.name}`, { skip: targaryen ? false : 'targaryen is not installed (npm i -D targaryen)' }, () => {
    const db = targaryen.database(rules, JSON.parse(JSON.stringify(seed)));
    const who = s.as ? db.as({ uid: s.as }) : db.as(null);
    const res = s.op === 'read' ? who.read(s.path)
      : s.op === 'update' ? who.update('/', s.updates)
      : who.write(s.path, s.op === 'remove' ? null : s.value);
    assert.equal(res.allowed, s.expect, `${s.op} ${s.path || Object.keys(s.updates).join(', ')} as ${s.as || 'signed out'}: expected ${s.expect ? 'allowed' : 'denied'}\n${res.info || ''}`);
  });
}

// The payloads the app really builds (js/cloudplan.js) must pass the real rules.
const stateOf = (uid) => ({
  friends: seed.friends[uid], incoming: seed.friendRequests[uid], sent: seed.friendSent[uid],
  daily: seed.dailyResults[uid], days: Object.keys(seed.dailyResults[uid] || {}),
});
const run = (as, updates) => targaryen.database(rules, JSON.parse(JSON.stringify(seed))).as({ uid: as }).update('/', updates);
const skip = targaryen ? false : 'targaryen is not installed (npm i -D targaryen)';

test('app payload: deleting an account is accepted by the rules', { skip }, () => {
  const plan = planWipe('A', { ...stateOf('A'), claims: ['alice'] });
  const res = run('A', plan);
  assert.ok(res.allowed, `${Object.keys(plan).join(', ')}\n${res.info}`);
  assert.ok(Object.keys(plan).every((p) => p.split('/').length >= 2 && !/^(friends|friendRequests|friendSent|dailyResults)\/A$/.test(p)), 'never writes a whole node');
});
test('app payload: removing a guest that has no friends is accepted too', { skip }, () => {
  assert.ok(run('A', planWipe('A', { claims: ['alice'] })).allowed);
});
test('app payload: a rename is accepted by the rules', { skip }, () => {
  const plan = planRename('A', 'Alicia', stateOf('A'));
  const res = run('A', plan);
  assert.ok(res.allowed, `${Object.keys(plan).join(', ')}\n${res.info}`);
  assert.equal(Object.keys(plan).length, 4);
});
test('app payload: nobody else can run the delete or rename payloads', { skip }, () => {
  assert.equal(run('E', planWipe('A', { ...stateOf('A'), claims: ['alice'] })).allowed, false);
  assert.equal(run('E', planRename('A', 'Hacked', stateOf('A'))).allowed, false);
});
