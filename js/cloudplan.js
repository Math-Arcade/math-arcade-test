// The exact multi-path updates the app sends when an account is removed or renamed.
// They live here (pure functions) so the security-rule tests can run these very payloads through the rules.
// Every write targets ONE CHILD ENTRY, because the rules grant write permission per entry
// (friends/$uid/$friend, friendRequests/$to/$from, dailyResults/$uid/$day...), never on a whole node.
import { MODES } from './config.js';

const keys = (o) => (Array.isArray(o) ? o : o && typeof o === 'object' ? Object.keys(o) : []); // a list of ids, or an object keyed by id

// Remove everything online that belongs to `uid`, including the other side of each friendship and request.
export function planWipe(uid, { friends, incoming, sent, daily, claims = [] } = {}) {
  const u = { [`users/${uid}`]: null, [`publicProfiles/${uid}`]: null };
  MODES.forEach((m) => { u[`leaderboard/${m}/${uid}`] = null; });
  keys(friends).forEach((x) => { u[`friends/${uid}/${x}`] = null; u[`friends/${x}/${uid}`] = null; });
  keys(incoming).forEach((x) => { u[`friendRequests/${uid}/${x}`] = null; u[`friendSent/${x}/${uid}`] = null; });
  keys(sent).forEach((x) => { u[`friendSent/${uid}/${x}`] = null; u[`friendRequests/${x}/${uid}`] = null; });
  keys(daily).forEach((d) => { u[`dailyResults/${uid}/${d}`] = null; });
  claims.forEach((k) => { u[`usernames/${k}`] = null; });
  return u;
}

// Keep the copies of your name that other people's records hold in step with a rename.
export function planRename(uid, name, { friends, incoming, sent, days } = {}) {
  const u = {};
  keys(friends).forEach((x) => { u[`friends/${x}/${uid}`] = name; });
  keys(incoming).forEach((x) => { u[`friendSent/${x}/${uid}/name`] = name; });
  keys(sent).forEach((x) => { u[`friendRequests/${x}/${uid}/name`] = name; });
  [...(days || [])].sort().slice(-14).forEach((d) => { u[`dailyResults/${uid}/${d}/name`] = name; });
  return u;
}
