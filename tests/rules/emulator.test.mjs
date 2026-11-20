// Runs tests/rules/scenarios.mjs against the REAL Firebase Realtime Database emulator.
//   npm i -D @firebase/rules-unit-testing firebase firebase-tools
//   npx firebase emulators:exec --only database --project math-arcade-rules "node tests/rules/emulator.test.mjs"
import fs from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { ref, set, update, get } from 'firebase/database';
import { seed, scenarios } from './scenarios.mjs';
import { planWipe, planRename } from '../../js/cloudplan.js';

const [host, port] = (process.env.FIREBASE_DATABASE_EMULATOR_HOST || '127.0.0.1:9000').split(':');
const env = await initializeTestEnvironment({
  projectId: 'math-arcade-rules',
  database: { host, port: Number(port), rules: fs.readFileSync(new URL('../../database.rules.json', import.meta.url), 'utf8') },
});
let failed = 0;
const reset = async () => { await env.clearDatabase(); await env.withSecurityRulesDisabled(async (ctx) => { await set(ref(ctx.database()), seed); }); };
const dbFor = (uid) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).database();
const attempt = async (name, promiseFactory, expect) => {
  try { await (expect ? assertSucceeds(promiseFactory()) : assertFails(promiseFactory())); console.log('  ok   ' + name); }
  catch (e) { failed += 1; console.log('  FAIL ' + name + ' :: ' + String(e.message).split('\n')[0]); }
};

for (const s of scenarios) {
  await reset();
  const db = dbFor(s.as);
  await attempt(s.name, () => (s.op === 'read' ? get(ref(db, s.path)) : s.op === 'update' ? update(ref(db), s.updates) : set(ref(db, s.path), s.op === 'remove' ? null : s.value)), s.expect);
}
// The exact payloads the app builds
const stateOf = (uid) => ({ friends: seed.friends[uid], incoming: seed.friendRequests[uid], sent: seed.friendSent[uid], daily: seed.dailyResults[uid], days: Object.keys(seed.dailyResults[uid] || {}) });
await reset(); await attempt('app payload: delete account', () => update(ref(dbFor('A')), planWipe('A', { ...stateOf('A'), claims: ['alice'] })), true);
await reset(); await attempt('app payload: rename', () => update(ref(dbFor('A')), planRename('A', 'Alicia', stateOf('A'))), true);
await reset(); await attempt('app payload: a stranger cannot delete', () => update(ref(dbFor('E')), planWipe('A', { ...stateOf('A'), claims: ['alice'] })), false);

await env.cleanup();
console.log(failed ? `\nFAILED: ${failed}` : '\nPASSED');
process.exit(failed ? 1 : 0);
