// Online features (accounts, cloud save, leaderboard) via Firebase, loaded lazily.
// If the SDK can't load (offline, blocked) the game simply runs as a local guest.

import { FIREBASE_CONFIG, FIREBASE_SDK, MODES } from './config.js';
import { safePic } from './avatar.js';
import { cleanPublic } from './public.js';
import { cleanFrame } from './shop.js';

let F = null;
let initPromise = null;
const listeners = new Set();
const fail = (code) => Object.assign(new Error(code), { code });
const withTimeout = (p, ms = 9000) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(fail('timeout')), ms))]);
const nameKey = (name) => name.trim().toLowerCase().replace(/[.#$/[\]\s]/g, '_');
const cleanLvl = (v) => Math.max(1, Math.min(100, Math.floor(Number(v) || 1)));
const cleanName = (n) => { const s = String(n || '').trim().slice(0, 16); return s.length >= 3 ? s : 'Player'; };
const guestKey = (uid) => `ma2.guestName.${uid}`;
const readGuestName = (uid) => { try { return localStorage.getItem(guestKey(uid)); } catch { return null; } };
const writeGuestName = (uid, name) => { try { localStorage.setItem(guestKey(uid), name); } catch {} };
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
  pic: '', // small JPEG data URL shown next to this player's leaderboard score
  lvl: 1, // account level shown on the leaderboard
  title: 'Rookie', // equipped profile title
  frame: null, // equipped avatar frame

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
        F = { authM, dbM, auth: authM.getAuth(app), db: dbM.getDatabase(app) };
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
    const newKey = sameClaim ? null : await this.reserveUsername(name, u.uid);
    try {
      await withTimeout(F.authM.updateProfile(u, { displayName: name }));
      if (guest) writeGuestName(u.uid, name);
      if (!sameClaim && oldName) await withTimeout(F.dbM.remove(F.dbM.ref(F.db, `usernames/${nameKey(oldName)}`)));
      await this.updateLeaderboardName(u.uid, name);
      this.user = { uid: u.uid, name, guest };
      this._emit();
      return name;
    } catch (e) {
      if (newKey) await withTimeout(F.dbM.remove(F.dbM.ref(F.db, `usernames/${newKey}`))).catch(() => {});
      throw e;
    }
  },


  async signUp(rawName, email, password) {
    await this.need();
    const { authM, dbM, auth, db } = F;
    const name = validateName(rawName);
    const key = nameKey(name);
    const taken = await withTimeout(dbM.get(dbM.ref(db, `usernames/${key}`)));
    if (taken.exists()) throw fail('name-taken');
    const cred = await withTimeout(authM.createUserWithEmailAndPassword(auth, email.trim(), password));
    try {
      await authM.updateProfile(cred.user, { displayName: name });
      await dbM.set(dbM.ref(db, `usernames/${key}`), cred.user.uid);
    } catch (e) {
      await cred.user.delete().catch(() => {});
      throw fail('name-taken');
    }
    this.user = { uid: cred.user.uid, name };
    this._emit();
    return this.user;
  },

  async signIn(email, password) {
    await this.need();
    await withTimeout(F.authM.signInWithEmailAndPassword(F.auth, email.trim(), password));
  },

  async signOut() { if (F) await F.authM.signOut(F.auth); },

  async resetPassword(email) {
    await this.need();
    await withTimeout(F.authM.sendPasswordResetEmail(F.auth, email.trim()));
  },

  // Required by Google Play: players must be able to delete their account (and data) in-app.
  async deleteAccount(password) {
    await this.need();
    const { authM, dbM, auth, db } = F;
    const u = auth.currentUser;
    if (!u) throw fail('not-signed-in');
    await withTimeout(authM.reauthenticateWithCredential(u, authM.EmailAuthProvider.credential(u.email, password)));
    const updates = { [`users/${u.uid}`]: null, [`publicProfiles/${u.uid}`]: null, [`friends/${u.uid}`]: null, [`friendRequests/${u.uid}`]: null, [`friendSent/${u.uid}`]: null, [`dailyResults/${u.uid}`]: null };
    try {
      const read = async (p) => { const s = await withTimeout(dbM.get(dbM.ref(db, p))); return s.exists() ? Object.keys(s.val()) : []; };
      const [fr, inc, sent] = await Promise.all([read(`friends/${u.uid}`), read(`friendRequests/${u.uid}`), read(`friendSent/${u.uid}`)]);
      fr.forEach((x) => { updates[`friends/${x}/${u.uid}`] = null; });
      inc.forEach((x) => { updates[`friendSent/${x}/${u.uid}`] = null; });
      sent.forEach((x) => { updates[`friendRequests/${x}/${u.uid}`] = null; });
    } catch (e) { console.warn('Could not tidy friend data', e); }
    MODES.forEach((m) => { updates[`leaderboard/${m}/${u.uid}`] = null; });
    if (u.displayName) updates[`usernames/${nameKey(u.displayName)}`] = null;
    await withTimeout(dbM.update(dbM.ref(db), updates));
    await withTimeout(authM.deleteUser(u));
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
        return { uid, name: String(v.name || '?'), score: Number(v.score) || 0, pic: safePic(v.pic), lvl: cleanLvl(v.lvl), title: String(v.title || 'Rookie').slice(0, 40), frame: cleanFrame(v.frame) };
      } catch { return null; }
    }))).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, n);
    return { rows, friendCount: friends.length };
  },

  // Daily Challenge results are readable by you and your friends only (see database rules).
  async publishDaily(day, d) {
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

  async publishProfile(data) {
    if (!this.user) return;
    await this.need();
    const r = F.dbM.ref(F.db, `publicProfiles/${this.user.uid}`);
    try { await withTimeout(F.dbM.set(r, data)); }
    catch (e) { // rules without the newer "xp" field must not stop the rest of the profile from publishing
      const { xp, titleLevel, frame, ...rest } = data; // newer optional fields
      if (xp === undefined && titleLevel === undefined && frame === undefined) throw e;
      await withTimeout(F.dbM.set(r, rest));
    }
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
    if (!this.user) return;
    await withTimeout(F.dbM.set(F.dbM.ref(F.db, `users/${this.user.uid}/profile`), profile));
  },

  async updateLeaderboardName(uid, name) {
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
    if (!this.user) return;
    await this.need();
    const uid = this.user.uid, updates = {};
    await Promise.all(MODES.map(async (mode) => {
      const snap = await withTimeout(F.dbM.get(F.dbM.ref(F.db, `leaderboard/${mode}/${uid}`)));
      if (snap.exists()) updates[`leaderboard/${mode}/${uid}/frame`] = frame || null;
    }));
    if (Object.keys(updates).length) await withTimeout(F.dbM.update(F.dbM.ref(F.db), updates));
  },

  async updateLeaderboardTitle(title) {
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
    if (!this.user || !score) return;
    const r = F.dbM.ref(F.db, `leaderboard/${mode}/${this.user.uid}`);
    const snap = await withTimeout(F.dbM.get(r));
    if (!snap.exists() || (snap.val().score || 0) < score) {
      const entry = { name: this.user.name, score };
      const extras = {};
      if (this.pic) extras.pic = this.pic;
      if (this.lvl > 1) extras.lvl = this.lvl;
      if (this.title && this.title !== 'Rookie') extras.title = this.title;
      if (this.frame) extras.frame = this.frame;
      try {
        await withTimeout(F.dbM.set(r, { ...entry, ...extras }));
      } catch (e) {
        // Database rules without the newer fields (not deployed yet) must never block saving a score.
        if (!Object.keys(extras).length) throw e;
        await withTimeout(F.dbM.set(r, entry));
      }
    }
  },

  async leaderboard(mode, n = 50) {
    await this.need();
    const q = F.dbM.query(F.dbM.ref(F.db, `leaderboard/${mode}`), F.dbM.orderByChild('score'), F.dbM.limitToLast(n));
    const snap = await withTimeout(F.dbM.get(q));
    const rows = [];
    snap.forEach((c) => { const v = c.val(); rows.push({ uid: c.key, name: String(v.name || '?'), score: Number(v.score) || 0, pic: safePic(v.pic), lvl: cleanLvl(v.lvl), title: String(v.title || 'Rookie').slice(0, 40), frame: cleanFrame(v.frame) }); });
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
  };
  if (map[c]) return map[c];
  if (/PERMISSION_DENIED/i.test(String(e && e.message))) return 'The online service is not ready for this yet.';
  return 'Something went wrong. Please try again.';
}
