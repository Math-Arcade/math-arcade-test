// Platinum needs the leaderboard, so it is checked online: when a Gold player's progress changes, when they sign in,
// and when they open the Achievements sheet. Each mode is checked at most once every few minutes.
import { ACHIEVEMENTS, PLATINUM } from './achievements.js';

const GAP = 10 * 60 * 1000;

export function createPlatinumWatcher({ store, cloud }) {
  const last = {};   // 'owner:mode' -> when it was last checked
  const status = {}; // mode -> { total, qualifies } from the latest check, for the Achievements sheet
  let busy = false, timer = 0;

  async function run(force) {
    if (busy || !cloud.user) return;
    busy = true;
    const owner = store.owner, uid = cloud.user.uid;
    try {
      for (const a of ACHIEVEMENTS.filter((x) => x.live && x.kind === 'blitz')) {
        const best = store.profile.best[a.mode] || 0;
        if ((store.profile.ach[a.id] || 0) !== 3 || best <= 0) continue; // Gold earned, Platinum not yet
        const key = `${owner}:${a.mode}`;
        if (!force && Date.now() - (last[key] || 0) < GAP) continue;
        last[key] = Date.now();
        const r = await cloud.topPercentCheck(a.mode, best);
        if (store.owner !== owner || !cloud.user || cloud.user.uid !== uid) return; // the account changed meanwhile
        status[a.mode] = { total: r.total, qualifies: r.qualifies };
        if (r.qualifies) store.grantPlatinum(a.mode);
      }
    } catch (e) { console.warn('Platinum check failed', e); } finally { busy = false; }
  }

  return {
    status, minPlayers: PLATINUM.minPlayers,
    check: ({ force = false } = {}) => run(force),
    schedule(delay = 4000) { clearTimeout(timer); timer = setTimeout(() => run(false), delay); }, // lets the new score reach the board first
  };
}
