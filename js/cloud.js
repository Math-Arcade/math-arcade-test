// Online features (accounts, cloud save, leaderboard) via Firebase, loaded lazily.
// If the SDK can't load (offline, blocked) the game simply runs as a local guest.

import { FIREBASE_CONFIG, FIREBASE_SDK, MODES } from './config.js';
import { safePic } from './avatar.js';
import { cleanPublic } from './public.js';
import { cleanFrame, cleanCard } from './shop.js';
import { planWipe, planRename } from './cloudplan.js';
import { PLATINUM, topCount, isTopPercent } from './achievements.js';

let F = null;
let initPromise = null;
const listeners = new Set();
const fail = (code) => Object.assign(new Error(code), { code });
const withTimeout = (p, ms = 9000) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(fail('timeout')), ms))]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const nameKey = (name) => name.trim().toLowerCase().replace(/[.#$/[\]\s]/g, '_');
const cleanLvl = (v) => Math.max(1, Math.min(100, Math.floor(Number(v) || 1)));
const cleanName = (n) => { const s = String(n || '').trim().slice(0, 16); return s.length >= 3 ? s : 'Player'; };
const guestKey = (uid) => `ma2.guestName.${uid}`;
const readGuestName = (uid) => { try { return localStorage.getItem(guestKey(uid)); } catch { return null; } };
const writeGuestName = (uid, name) => { try { localStorage.setItem(guestKey(uid), name); } catch {} };
const clearGuestName = (uid) => { try { localStorage.removeItem(guestKey(uid)); } catch {} };
const wrapErr = (code, cause) => Object.assign(new Error(code), { code, cause });
const guestName = () => `guest#${Math.floor(100 + Math.random() * 900)}`;

export function validateName(raw) {
  const name = (raw || '').trim().replace(/\s+/g, ' ');
  if (name.length < 3 || name.length > 16) throw fail('name-length');
  if (!/^[A-Za-z0-9 _.#-]+$/.test(name)) throw fail('name-chars');
  return name;
}

export const cloud = {
  ready: false,
  user: null, // { uid, name } or null
  deleting: false, // true while an account is being removed: nothing may write its data back
  upgradedUid: null, // set when a guest has just become a registered account, so the app carries the guest's progress over
  _deletedHooks: [],
  pic: '', // small JPEG data URL shown next to this player's leaderboard score
  lvl: 1, // account level shown on the leaderboard
  title: 'Rookie', // equipped profile title
  frame: null, // equipped avatar frame
  card: null, // equipped profile card (the look of your row in Ranks and Friends)

  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  _emit() { listeners.forEach((fn) => fn(this.user)); },

  init() {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      try {
        const [appM, authM, dbM] = await withTimeout(Promise.all([
          import(`${FIREBASE_SDK}/firebase-app.js`),
          import(`${FIREBASE_SDK}/firebase-auth.js`),
          import(`${FIREBASE_SDK}/firebase-database.js`),
        ]), 15000);
        const app = appM.initializeApp(FIREBASE_CONFIG);
        F = { appM, authM, dbM, app, auth: authM.getAuth(app), db: dbM.getDatabase(app) };
        authM.onAuthStateChanged(F.auth, async (u) => {
          if (!u) {
            try { await withTimeout(authM.signInAnonymously(F.auth)); }
            catch (e) { console.warn('Guest sign-in unavailable:', e); this.user = null; this._emit(); }
            return;
          }

          if (u.isAnonymous) {
            try {
              const name = await this.ensureGuestName(u);
              this.user = { uid: u.uid, name, guest: true };
            } catch (e) {
              console.warn('Guest username unavailable:', e);
              this.user = { uid: u.uid, name: 'Guest', guest: true };
            }
          } else {
            this.user = { uid: u.uid, name: u.displayName || (u.email || 'Player').split('@')[0], guest: false };
          }
          this._emit();
        });
        this.ready = true;
        return true;
      } catch (e) {
        console.warn('Online features unavailable:', e);
        initPromise = null; // allow a retry later
        return false;
      }
    })();
    return initPromise;
  },

  async need() {
    if (!F && !(await this.init())) throw fail('offline');
  },

  async reserveUsername(name, uid) {
    const { dbM, db } = F;
    const key = nameKey(name);
    const r = dbM.ref(db, `usernames/${key}`);
    const tx = await withTimeout(dbM.runTransaction(r, (current) => current === null ? uid : undefined));
    if (!tx.committed) throw fail('name-taken');
    return key;
  },

  async ensureGuestName(u) {
    const saved = readGuestName(u.uid);
    if (saved) {
      const key = nameKey(saved);
      const snap = await withTimeout(F.dbM.get(F.dbM.ref(F.db, `usernames/${key}`)));
      if (snap.exists() && snap.val() === u.uid) return saved;
      if (!snap.exists()) { // the claim was released (for example by an aborted sign-in): take the same name back
        try { await this.reserveUsername(saved, u.uid); return saved; }
        catch (e) { if ((e && e.code) !== 'name-taken') throw e; }
      }
    }

    for (let i = 0; i < 20; i++) {
      const candidate = guestName();
      try {
        await this.reserveUsername(candidate, u.uid);
        await F.authM.updateProfile(u, { displayName: candidate });
        writeGuestName(u.uid, candidate);
        return candidate;
      } catch (e) {
        if ((e && e.code) !== 'name-taken') throw e;
      }
    }
    throw fail('name-taken');
  },

  changeGuestName(rawName) { return this.changeName(rawName); },

  // Rename the signed-in player (guest or registered). Names stay unique (case-insensitive).
  async changeName(rawName) {
    await this.need();
    const u = F.auth.currentUser;
    if (!u) throw fail('not-signed-in');
    const guest = !!u.isAnonymous;
    const name = validateName(rawName);
    const oldName = this.user?.name || u.displayName || (guest ? readGuestName(u.uid) : '');
    if (name === oldName) return name;

    // Same name, different letter case: the claim already belongs to this player, only the display changes.
    const sameClaim = String(oldName || '').toLowerCase() === name.toLowerCase();
    const newKey = sameClaim ? null : await this.reserveUsername(name, u.uid); // atomic: throws name-taken or the real error
    try {
      await withTimeout(F.authM.updateProfile(u, { displayName: name }));
    } catch (e) {
      if (newKey) await withTimeout(F.dbM.remove(F.dbM.ref(F.db, `usernames/${newKey}`))).catch(() => {});
      throw e; // nothing changed
    }
    // From here the new name is the player's name; the rest is housekeeping that must not undo it.
    if (guest) writeGuestName(u.uid, name);
    this.user = { uid: u.uid, name, guest };
    if (!sameClaim && oldName) {
      try { await withTimeout(F.dbM.remove(F.dbM.ref(F.db, `usernames/${nameKey(oldName)}`))); }
      catch (e) { console.warn('Could not release the old name', e); }
    }
    const results = await Promise.allSettled([this.updateLeaderboardName(u.uid, name), this._syncNames(u.uid, name)]);
    results.forEach((r) => { if (r.status === 'rejected') console.warn('Name sync incomplete', r.reason); });
    this._emit();
    return name;
  },

  // Friends, friend requests and recent Daily results keep a copy of your name: keep those copies current.
  async _syncNames(uid, name) {
    const { dbM, db } = F;
    const keys = async (p) => { const s = await withTimeout(dbM.get(dbM.ref(db, p))); return s.exists() ? Object.keys(s.val()) : []; };
    const [friends, incoming, sent, days] = await Promise.all([keys(`friends/${uid}`), keys(`friendRequests/${uid}`), keys(`friendSent/${uid}`), keys(`dailyResults/${uid}`)]);
    const updates = planRename(uid, name, { friends, incoming, sent, days });
    if (!Object.keys(updates).length) return;
    try { await withTimeout(dbM.update(dbM.ref(db), updates)); }
    catch (e) { // one stale record must not block the others
      await Promise.allSettled(Object.entries(updates).map(([path, v]) => withTimeout(dbM.set(dbM.ref(db, path), v))));
    }
  },

  // Everything online that belongs to one uid. One atomic update: it either all goes or none of it does.
  // Returns what was removed, so a caller that has to back out can put back what the rules allow.
  async _wipeCloudData(uid, names = []) {
    const { dbM, db } = F;
    const val = async (p) => { const s = await withTimeout(dbM.get(dbM.ref(db, p))); return s.exists() ? s.val() : null; };
    const [users, pub, daily, friends, incoming, sent, ...boards] = await Promise.all([
      val(`users/${uid}`), val(`publicProfiles/${uid}`), val(`dailyResults/${uid}`), val(`friends/${uid}`), val(`friendRequests/${uid}`), val(`friendSent/${uid}`),
      ...MODES.map((m) => val(`leaderboard/${m}/${uid}`)),
    ]);
    const board = {};
    boards.forEach((e, i) => { if (e) board[MODES[i]] = e; });
    const claims = [];
    for (const n of new Set(names.filter(Boolean))) { // only release name claims that really are ours
      const k = nameKey(n);
      const claim = await withTimeout(dbM.get(dbM.ref(db, `usernames/${k}`)));
      if (claim.exists() && claim.val() === uid) claims.push(k);
    }
    const updates = planWipe(uid, { friends, incoming, sent, daily, claims }); // single-entry writes, as the rules require
    await withTimeout(dbM.update(dbM.ref(db), updates));
    return { users, pub, daily, friends: friends || {}, incoming: incoming || {}, sent: sent || {}, board, claims, name: names.find(Boolean) || 'Player' };
  },

  // Put back what _wipeCloudData removed, as far as the security rules let one person do so. Your own records and the
  // requests you sent can be re-created; friendships and requests other people sent you cannot (only they can create them).
  async _restoreCloudData(uid, saved) {
    const { dbM, db } = F;
    const updates = {};
    if (saved.users) updates[`users/${uid}`] = saved.users;
    if (saved.pub) updates[`publicProfiles/${uid}`] = saved.pub;
    if (saved.daily) updates[`dailyResults/${uid}`] = saved.daily;
    Object.entries(saved.board).forEach(([m, e]) => { updates[`leaderboard/${m}/${uid}`] = e; });
    saved.claims.forEach((k) => { updates[`usernames/${k}`] = uid; });
    Object.entries(saved.sent).forEach(([x, v]) => { updates[`friendSent/${uid}/${x}`] = v; updates[`friendRequests/${x}/${uid}`] = { name: cleanName(saved.name), ts: Number(v && v.ts) || Date.now() }; });
    if (Object.keys(updates).length) {
      try { await withTimeout(dbM.update(dbM.ref(db), updates)); }
      catch (e) { await Promise.allSettled(Object.entries(updates).map(([p, v]) => withTimeout(dbM.set(dbM.ref(db, p), v)))); }
    }
    return { friends: Object.keys(saved.friends).length, incoming: Object.keys(saved.incoming).length }; // what could not come back
  },

  async signUp(rawName, email, password) {
    await this.need();
    const { authM, dbM, auth, db } = F;
    const name = validateName(rawName);
    email = String(email || '').trim();
    const cur = auth.currentUser;
    if (cur && cur.isAnonymous) return this._upgradeGuest(cur, name, email, password);

    // No guest session (for example guest sign-in was unavailable): create the account, then claim the name atomically.
    const taken = await withTimeout(dbM.get(dbM.ref(db, `usernames/${nameKey(name)}`)));
    if (taken.exists()) throw fail('name-taken');
    const cred = await withTimeout(authM.createUserWithEmailAndPassword(auth, email, password));
    let key = null;
    try {
      key = await this.reserveUsername(name, cred.user.uid);
      await withTimeout(authM.updateProfile(cred.user, { displayName: name }));
    } catch (e) { // roll back so nothing half-made is left behind, but keep the real reason
      if (key) await withTimeout(dbM.remove(dbM.ref(db, `usernames/${key}`))).catch(() => {});
      await cred.user.delete().catch(() => {});
      throw e;
    }
    this.upgradedUid = cred.user.uid; // the device's guest progress becomes this account's
    this.user = { uid: cred.user.uid, name, guest: false };
    this._emit();
    return this.user;
  },

  // Guest -> registered account: the guest account itself is upgraded in place, so its uid, progress,
  // leaderboard entries and friends stay and nothing is left abandoned.
  async _upgradeGuest(cur, name, email, password) {
    const { authM, dbM, db } = F;
    const uid = cur.uid;
    const oldName = this.user?.name || cur.displayName || readGuestName(uid) || '';
    const sameClaim = String(oldName).toLowerCase() === name.toLowerCase();
    const newKey = sameClaim ? null : await this.reserveUsername(name, uid); // atomic; throws name-taken or the real error
    const release = () => (newKey ? withTimeout(dbM.remove(dbM.ref(db, `usernames/${newKey}`))).catch(() => {}) : null);
    try {
      await withTimeout(authM.linkWithCredential(cur, authM.EmailAuthProvider.credential(email, password)));
    } catch (e) { await release(); throw e; } // email in use, weak password...: the guest is untouched
    // The account exists now. Finish the rename; problems here must not undo it.
    let shown = name;
    try { await withTimeout(authM.updateProfile(cur, { displayName: name })); }
    catch (e) { console.warn('Could not set the display name', e); await release(); shown = oldName || name; }
    if (shown === name && !sameClaim && oldName) await withTimeout(dbM.remove(dbM.ref(db, `usernames/${nameKey(oldName)}`))).catch((e) => console.warn('Could not release the guest name', e));
    clearGuestName(uid);
    this.user = { uid, name: shown, guest: false };
    this.upgradedUid = uid;
    await Promise.allSettled([this.updateLeaderboardName(uid, shown), this._syncNames(uid, shown)]);
    this._emit();
    return this.user;
  },

  // Checks an email and password on a separate, throw-away login, so the current (guest) session is never touched.
  async _verifyCredentials(email, password) {
    const { appM, authM } = F;
    if (!F.verifyAuth) {
      const app2 = appM.getApps().find((a) => a.name === 'verify') || appM.initializeApp(FIREBASE_CONFIG, 'verify');
      try { F.verifyAuth = authM.initializeAuth(app2, { persistence: authM.inMemoryPersistence }); }
      catch { F.verifyAuth = authM.getAuth(app2); }
    }
    try { await withTimeout(authM.signInWithEmailAndPassword(F.verifyAuth, email, password)); }
    finally { try { await authM.signOut(F.verifyAuth); } catch { /* ignore */ } }
  },

  async signIn(email, password) {
    await this.need();
    const { authM, auth } = F;
    email = String(email || '').trim();
    const cur = auth.currentUser;
    if (!cur || !cur.isAnonymous) { await withTimeout(authM.signInWithEmailAndPassword(auth, email, password)); return; }

    // Signing in to an existing account leaves the current guest behind. Its online traces go with it, but nothing is
    // deleted until the password is proven right, and nothing at all if the cleanup itself cannot be completed.
    await this._verifyCredentials(email, password); // wrong password / no network: the guest and all its records stay exactly as they are
    const names = [cur.displayName, readGuestName(cur.uid)];
    this.deleting = true;
    let saved;
    try { saved = await this._wipeCloudData(cur.uid, names); } // atomic
    catch (e) { this.deleting = false; throw wrapErr('guest-cleanup-failed', e); } // nothing removed, still signed in as the guest
    const hopeless = ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/user-disabled', 'auth/invalid-email'];
    let failure = null;
    for (let i = 0; i < 3; i += 1) { // the password is already known to be right, so only a network hiccup can fail here
      try { await withTimeout(authM.signInWithEmailAndPassword(auth, email, password)); failure = null; break; }
      catch (e) { failure = e; if (hopeless.includes(e && e.code)) break; await wait(400 * (i + 1)); }
    }
    this.deleting = false;
    if (failure) {
      const lost = await this._restoreCloudData(cur.uid, saved).catch(() => ({ friends: 0, incoming: 0 }));
      await this._restoreGuest(cur);
      if (lost.friends + lost.incoming > 0) throw wrapErr('signin-failed-guest-partial', failure);
      throw failure;
    }
    clearGuestName(cur.uid);
    authM.deleteUser(cur).catch(() => {}); // best effort: the empty guest login itself
  },

  async _restoreGuest(cur) {
    try {
      const name = await this.ensureGuestName(cur);
      this.user = { uid: cur.uid, name, guest: true };
      this._emit(); // the app re-syncs the guest's local progress
    } catch (e) { console.warn('Could not restore the guest', e); }
  },

  async signOut() { if (F) await F.authM.signOut(F.auth); },

  async resetPassword(email) {
    await this.need();
    await withTimeout(F.authM.sendPasswordResetEmail(F.auth, email.trim()));
  },

  onAccountDeleted(fn) { this._deletedHooks.push(fn); },

  // Required by Google Play: players must be able to delete their account (and data) in-app.
  // Every step is safe to repeat. Success is only reported when the login itself is gone.
  async deleteAccount(password) {
    await this.need();
    const { authM, auth } = F;
    const u = auth.currentUser;
    if (!u || u.isAnonymous) throw fail('not-signed-in');
    await withTimeout(authM.reauthenticateWithCredential(u, authM.EmailAuthProvider.credential(u.email, password)));
    const uid = u.uid;
    this.deleting = true;
    try {
      try { await this._wipeCloudData(uid, [u.displayName]); }
      catch (e) { throw wrapErr('delete-data-failed', e); } // atomic: nothing was removed
      try { await withTimeout(authM.deleteUser(u)); }
      catch (e) { throw wrapErr('delete-account-failed', e); } // online data is gone, the login is not: retry finishes the job
      if (auth.currentUser && auth.currentUser.uid === uid) throw wrapErr('delete-account-failed', null);
    } finally { this.deleting = false; }
    this._deletedHooks.forEach((fn) => { try { fn(uid); } catch (e) { console.warn(e); } });
    this.user = null;
    this._emit();
  },

  // ---------- friends ----------
  // friends/{me}/{them} = their name · friendRequests/{to}/{from} = {name, ts} · friendSent/{from}/{to} = {name, ts}
  _me() {
    if (!this.user) throw fail('not-signed-in');
    return this.user;
  },

  async friendsState() {
    const me = this._me(); await this.need();
    const { dbM, db } = F;
    const get = async (p) => { const s = await withTimeout(dbM.get(dbM.ref(db, p))); return s.exists() ? s.val() : {}; };
    const [f, inc, sent] = await Promise.all([get(`friends/${me.uid}`), get(`friendRequests/${me.uid}`), get(`friendSent/${me.uid}`)]);
    const name = (v) => String((v && v.name) || v || '?').slice(0, 16);
    return {
      friends: Object.entries(f).map(([uid, v]) => ({ uid, name: name(v) })),
      incoming: Object.entries(inc).map(([uid, v]) => ({ uid, name: name(v), ts: Number(v && v.ts) || 0 })).sort((a, b) => b.ts - a.ts),
      sent: Object.entries(sent).map(([uid, v]) => ({ uid, name: name(v), ts: Number(v && v.ts) || 0 })).sort((a, b) => b.ts - a.ts),
    };
  },

  async incomingCount() {
    if (!this.user) return 0;
    await this.need();
    const snap = await withTimeout(F.dbM.get(F.dbM.ref(F.db, `friendRequests/${this.user.uid}`)));
    return snap.exists() ? Object.keys(snap.val()).length : 0;
  },

  // 'self' | 'friends' | 'incoming' | 'sent' | 'none'
  async relationWith(uid) {
    const me = this._me(); await this.need();
    if (uid === me.uid) return 'self';
    const { dbM, db } = F;
    const has = async (p) => (await withTimeout(dbM.get(dbM.ref(db, p)))).exists();
    const [f, inc, sent] = await Promise.all([has(`friends/${me.uid}/${uid}`), has(`friendRequests/${me.uid}/${uid}`), has(`friendSent/${me.uid}/${uid}`)]);
    return f ? 'friends' : inc ? 'incoming' : sent ? 'sent' : 'none';
  },

  // Names that start with the typed text (the usernames node maps lower-cased name -> uid).
  async searchPlayers(text) {
    const me = this._me(); await this.need();
    const key = nameKey(String(text || '')).slice(0, 16);
    if (key.length < 2) return [];
    const { dbM, db } = F;
    const q = dbM.query(dbM.ref(db, 'usernames'), dbM.orderByKey(), dbM.startAt(key), dbM.endAt(`${key}\uf8ff`), dbM.limitToFirst(10));
    const snap = await withTimeout(dbM.get(q));
    const out = [];
    snap.forEach((c) => { if (c.val() && c.val() !== me.uid) out.push({ uid: String(c.val()), name: c.key }); });
    return out;
  },

  async sendFriendRequest(toUid, toName) {
    const me = this._me(); await this.need();
    const { dbM, db } = F;
    if (toUid === me.uid) throw fail('friend-self');
    const get = async (p) => withTimeout(dbM.get(dbM.ref(db, p)));
    if ((await get(`friends/${me.uid}/${toUid}`)).exists()) return 'friends';
    const inc = await get(`friendRequests/${me.uid}/${toUid}`);
    if (inc.exists()) { await this.acceptFriendRequest(toUid, (inc.val() && inc.val().name) || toName); return 'friends'; } // they asked first
    const ts = Date.now();
    await withTimeout(dbM.update(dbM.ref(db), {
      [`friendRequests/${toUid}/${me.uid}`]: { name: me.name, ts },
      [`friendSent/${me.uid}/${toUid}`]: { name: cleanName(toName), ts },
    }));
    return 'sent';
  },

  async cancelFriendRequest(toUid) {
    const me = this._me(); await this.need();
    await withTimeout(F.dbM.update(F.dbM.ref(F.db), { [`friendRequests/${toUid}/${me.uid}`]: null, [`friendSent/${me.uid}/${toUid}`]: null }));
  },

  async acceptFriendRequest(fromUid, fromName) {
    const me = this._me(); await this.need();
    await withTimeout(F.dbM.update(F.dbM.ref(F.db), {
      [`friends/${me.uid}/${fromUid}`]: cleanName(fromName),
      [`friends/${fromUid}/${me.uid}`]: cleanName(me.name),
      [`friendRequests/${me.uid}/${fromUid}`]: null,
      [`friendSent/${fromUid}/${me.uid}`]: null,
    }));
  },

  async declineFriendRequest(fromUid) {
    const me = this._me(); await this.need();
    await withTimeout(F.dbM.update(F.dbM.ref(F.db), { [`friendRequests/${me.uid}/${fromUid}`]: null, [`friendSent/${fromUid}/${me.uid}`]: null }));
  },

  async removeFriend(uid) {
    const me = this._me(); await this.need();
    await withTimeout(F.dbM.update(F.dbM.ref(F.db), { [`friends/${me.uid}/${uid}`]: null, [`friends/${uid}/${me.uid}`]: null }));
  },

  async _friendUids() {
    const me = this._me(); await this.need();
    const snap = await withTimeout(F.dbM.get(F.dbM.ref(F.db, `friends/${me.uid}`)));
    return snap.exists() ? Object.keys(snap.val()) : [];
  },

  // Leaderboard limited to you + your friends: one small read per friend.
  async friendsLeaderboard(mode, n = 50) {
    const me = this._me();
    const friends = await this._friendUids();
    const { dbM, db } = F;
    const rows = (await Promise.all([me.uid, ...friends].map(async (uid) => {
      try {
        const snap = await withTimeout(dbM.get(dbM.ref(db, `leaderboard/${mode}/${uid}`)));
        if (!snap.exists()) return null;
        const v = snap.val();
        return { uid, name: String(v.name || '?'), score: Number(v.score) || 0, pic: safePic(v.pic), lvl: cleanLvl(v.lvl), title: String(v.title || 'Rookie').slice(0, 40), frame: cleanFrame(v.frame), card: cleanCard(v.card) };
      } catch { return null; }
    }))).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, n);
    return { rows, friendCount: friends.length };
  },

  // Daily Challenge results are readable by you and your friends only (see database rules).
  async publishDaily(day, d) {
    if (this.deleting) return;
    const me = this._me(); await this.need();
    const grid = String(d.grid || '').replace(/[^01]/g, '').slice(0, 50);
    const data = { name: me.name, score: Math.max(0, Math.round(d.score) || 0), total: Math.max(1, grid.length || 10), ms: Math.max(0, Math.round(d.ms) || 0), grid };
    if (!grid) delete data.grid;
    await withTimeout(F.dbM.set(F.dbM.ref(F.db, `dailyResults/${me.uid}/${day}`), data));
  },

  async friendsDaily(day) {
    const friends = await this._friendUids();
    const { dbM, db } = F;
    const rows = (await Promise.all(friends.map(async (uid) => {
      try {
        const snap = await withTimeout(dbM.get(dbM.ref(db, `dailyResults/${uid}/${day}`)));
        if (!snap.exists()) return null;
        const v = snap.val();
        return { uid, name: String(v.name || '?').slice(0, 16), score: Number(v.score) || 0, total: Number(v.total) || 10, ms: Number(v.ms) || 0, grid: /^[01]{1,50}$/.test(v.grid || '') ? v.grid : '' };
      } catch { return null; }
    }))).filter(Boolean);
    return { rows, friendCount: friends.length };
  },

  // `uid` is the account the data was built for. If somebody else is signed in by the time we write, the data is dropped.
  async publishProfile(data, uid = this.user && this.user.uid) {
    if (this.deleting || !uid) return false;
    await this.need();
    if (!this.user || this.user.uid !== uid) return false;
    const r = F.dbM.ref(F.db, `publicProfiles/${uid}`);
    try { await withTimeout(F.dbM.set(r, data)); }
    catch (e) { // rules without the newer fields must not stop the rest of the profile from publishing
      const { ach, showcase, achTitle, ...base } = data; // achievements are the newest optional fields
      try {
        if (ach === undefined && showcase === undefined && achTitle === undefined) throw e;
        await withTimeout(F.dbM.set(r, base));
      } catch (e2) {
        const { xp, titleLevel, frame, card, ...rest } = base; // older optional fields
        if (rest.theme === 'notebook') rest.theme = 'light'; else if (rest.theme === 'space') rest.theme = 'dark'; else if (rest.theme === 'winter') rest.theme = 'light'; else if (rest.theme === 'candy') rest.theme = 'light'; else if (rest.theme === 'gothic') rest.theme = 'dark'; // a bought theme shows as its closest free one if the rules do not know it yet
        if (xp === undefined && titleLevel === undefined && frame === undefined && card === undefined && rest.theme === base.theme) throw e2;
        await withTimeout(F.dbM.set(r, rest));
      }
    }
    return true;
  },

  async fetchPublicProfile(uid) {
    await this.need();
    const snap = await withTimeout(F.dbM.get(F.dbM.ref(F.db, `publicProfiles/${uid}`)));
    return snap.exists() ? cleanPublic(snap.val()) : null;
  },

  async pullProfile() {
    if (!this.user) return null;
    const snap = await withTimeout(F.dbM.get(F.dbM.ref(F.db, `users/${this.user.uid}/profile`)));
    return snap.exists() ? snap.val() : null;
  },

  async pushProfile(profile) {
    if (this.deleting) return;
    if (!this.user) return;
    await withTimeout(F.dbM.set(F.dbM.ref(F.db, `users/${this.user.uid}/profile`), profile));
  },

  async updateLeaderboardName(uid, name) {
    if (this.deleting) return;
    const updates = {};
    await Promise.all(MODES.map(async (mode) => {
      const r = F.dbM.ref(F.db, `leaderboard/${mode}/${uid}`);
      const snap = await withTimeout(F.dbM.get(r));
      if (snap.exists()) updates[`leaderboard/${mode}/${uid}/name`] = name;
    }));
    if (Object.keys(updates).length) await withTimeout(F.dbM.update(F.dbM.ref(F.db), updates));
  },

  // Add / change / remove (pic = '') the picture on every existing leaderboard entry of this player.
  async updateLeaderboardPic(pic) {
    if (this.deleting) return;
    if (!this.user) return;
    await this.need();
    const uid = this.user.uid, updates = {};
    await Promise.all(MODES.map(async (mode) => {
      const snap = await withTimeout(F.dbM.get(F.dbM.ref(F.db, `leaderboard/${mode}/${uid}`)));
      if (snap.exists()) updates[`leaderboard/${mode}/${uid}/pic`] = pic || null;
    }));
    if (Object.keys(updates).length) await withTimeout(F.dbM.update(F.dbM.ref(F.db), updates));
  },

  // Keep the level on every existing leaderboard entry of this player up to date.
  async updateLeaderboardFrame(frame) {
    if (this.deleting) return;
    if (!this.user) return;
    await this.need();
    const uid = this.user.uid, updates = {};
    await Promise.all(MODES.map(async (mode) => {
      const snap = await withTimeout(F.dbM.get(F.dbM.ref(F.db, `leaderboard/${mode}/${uid}`)));
      if (snap.exists()) updates[`leaderboard/${mode}/${uid}/frame`] = frame || null;
    }));
    if (Object.keys(updates).length) await withTimeout(F.dbM.update(F.dbM.ref(F.db), updates));
  },

  async updateLeaderboardCard(card) {
    if (this.deleting) return;
    if (!this.user) return;
    await this.need();
    const uid = this.user.uid, updates = {};
    await Promise.all(MODES.map(async (mode) => {
      const snap = await withTimeout(F.dbM.get(F.dbM.ref(F.db, `leaderboard/${mode}/${uid}`)));
      if (snap.exists()) updates[`leaderboard/${mode}/${uid}/card`] = card || null;
    }));
    if (Object.keys(updates).length) await withTimeout(F.dbM.update(F.dbM.ref(F.db), updates));
  },

  async updateLeaderboardTitle(title) {
    if (this.deleting) return;
    if (!this.user) return;
    await this.need();
    const uid = this.user.uid, updates = {};
    await Promise.all(MODES.map(async (mode) => {
      const snap = await withTimeout(F.dbM.get(F.dbM.ref(F.db, `leaderboard/${mode}/${uid}`)));
      if (snap.exists()) updates[`leaderboard/${mode}/${uid}/title`] = title || null;
    }));
    if (Object.keys(updates).length) await withTimeout(F.dbM.update(F.dbM.ref(F.db), updates));
  },

  async updateLeaderboardLevel(lvl) {
    if (this.deleting) return;
    if (!this.user) return;
    await this.need();
    const uid = this.user.uid, updates = {};
    await Promise.all(MODES.map(async (mode) => {
      const snap = await withTimeout(F.dbM.get(F.dbM.ref(F.db, `leaderboard/${mode}/${uid}`)));
      if (snap.exists()) updates[`leaderboard/${mode}/${uid}/lvl`] = lvl > 1 ? lvl : null;
    }));
    if (Object.keys(updates).length) await withTimeout(F.dbM.update(F.dbM.ref(F.db), updates));
  },

  async submitScore(mode, score) {
    if (this.deleting) return;
    const me = this.user;
    if (!me || !score) return;
    const r = F.dbM.ref(F.db, `leaderboard/${mode}/${me.uid}`);
    const snap = await withTimeout(F.dbM.get(r));
    if (this.deleting || !this.user || this.user.uid !== me.uid) return; // the account changed while we were reading
    if (!snap.exists() || (snap.val().score || 0) < score) {
      const entry = { name: me.name, score };
      const extras = {};
      if (this.pic) extras.pic = this.pic;
      if (this.lvl > 1) extras.lvl = this.lvl;
      if (this.title && this.title !== 'Rookie') extras.title = this.title;
      if (this.frame) extras.frame = this.frame;
      if (this.card) extras.card = this.card;
      try {
        await withTimeout(F.dbM.set(r, { ...entry, ...extras }));
      } catch (e) {
        // Database rules without the newer fields (not deployed yet) must never block saving a score.
        if (!Object.keys(extras).length) throw e;
        await withTimeout(F.dbM.set(r, entry));
      }
    }
  },

  // How many players have a score in this mode. A shallow read returns only the keys, never the entries.
  async leaderboardCount(mode) {
    const url = `${FIREBASE_CONFIG.databaseURL}leaderboard/${mode}.json?shallow=true`;
    const res = await withTimeout(fetch(url));
    if (!res.ok) throw fail('count-failed');
    const keys = await res.json();
    return keys && typeof keys === 'object' ? Object.keys(keys).length : 0;
  },

  // Platinum check: is `myScore` inside the top percent of this mode? Reads the player count, then only the top 1% of the board.
  async topPercentCheck(mode, myScore) {
    await this.need();
    const total = await this.leaderboardCount(mode);
    if (total < PLATINUM.minPlayers) return { total, qualifies: false };
    const q = F.dbM.query(F.dbM.ref(F.db, `leaderboard/${mode}`), F.dbM.orderByChild('score'), F.dbM.limitToLast(topCount(total)));
    const snap = await withTimeout(F.dbM.get(q));
    const scores = [];
    snap.forEach((c) => { scores.push(Number(c.val() && c.val().score) || 0); });
    return { total, qualifies: isTopPercent({ total, scores, myScore }) };
  },

  async leaderboard(mode, n = 50) {
    await this.need();
    const q = F.dbM.query(F.dbM.ref(F.db, `leaderboard/${mode}`), F.dbM.orderByChild('score'), F.dbM.limitToLast(n));
    const snap = await withTimeout(F.dbM.get(q));
    const rows = [];
    snap.forEach((c) => { const v = c.val(); rows.push({ uid: c.key, name: String(v.name || '?'), score: Number(v.score) || 0, pic: safePic(v.pic), lvl: cleanLvl(v.lvl), title: String(v.title || 'Rookie').slice(0, 40), frame: cleanFrame(v.frame), card: cleanCard(v.card) }); });
    return rows.sort((a, b) => b.score - a.score);
  },
};

export function friendlyError(e) {
  const c = (e && (e.code || e.message)) || '';
  if (/offline|timeout|network-request-failed/.test(c)) return "Can't reach the server. Check your connection and try again.";
  const map = {
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/missing-email': 'Please enter your email address.',
    'auth/missing-password': 'Please enter your password.',
    'auth/invalid-credential': 'Email or password is incorrect.',
    'auth/wrong-password': 'Email or password is incorrect.',
    'auth/user-not-found': 'Email or password is incorrect.',
    'auth/invalid-login-credentials': 'Email or password is incorrect.',
    'auth/email-already-in-use': 'That email is already registered. Try signing in.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
    'auth/user-disabled': 'This account has been disabled.',
    'auth/requires-recent-login': 'Please sign in again, then retry.',
    'name-taken': 'That player name is already taken.',
    'name-length': 'Player name must be 3 to 16 characters.',
    'name-chars': 'Use letters, numbers, spaces, #, . _ or - only.',
    'not-guest': 'Only guest usernames can be changed here.',
    'guest-cleanup-failed': "We couldn't prepare this guest for sign-in, so you were not signed in and nothing was changed. Please try again.",
    'signin-failed-guest-partial': "We couldn't sign you in, and some of this guest's friends and requests couldn't be put back. Your progress is safe.",
    'delete-data-failed': "We couldn't remove your online data, so nothing was deleted. Please try again.",
    'delete-account-failed': "Your online data was removed, but we couldn't finish deleting your login. Please try again.",
  };
  if (map[c]) return map[c];
  if (/PERMISSION_DENIED/i.test(String(e && e.message))) return 'The online service is not ready for this yet.';
  return 'Something went wrong. Please try again.';
}
