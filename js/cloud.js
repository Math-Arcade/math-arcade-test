// Online features (accounts, cloud save, leaderboard) via Firebase, loaded lazily.
// If the SDK can't load (offline, blocked) the game simply runs as a local guest.

import { FIREBASE_CONFIG, FIREBASE_SDK, MODES } from './config.js';

let F = null;
let initPromise = null;
const listeners = new Set();
const fail = (code) => Object.assign(new Error(code), { code });
const withTimeout = (p, ms = 9000) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(fail('timeout')), ms))]);
const nameKey = (name) => name.trim().toLowerCase().replace(/[.#$/[\]\s]/g, '_');
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

  async changeGuestName(rawName) {
    await this.need();
    const u = F.auth.currentUser;
    if (!u || !u.isAnonymous) throw fail('not-guest');
    const name = validateName(rawName);
    const oldName = this.user?.name || u.displayName || readGuestName(u.uid);
    if (name.toLowerCase() === String(oldName || '').toLowerCase()) return name;

    const newKey = await this.reserveUsername(name, u.uid);
    try {
      await withTimeout(F.authM.updateProfile(u, { displayName: name }));
      writeGuestName(u.uid, name);
      if (oldName) await withTimeout(F.dbM.remove(F.dbM.ref(F.db, `usernames/${nameKey(oldName)}`)));
      this.user = { uid: u.uid, name, guest: true };
      this._emit();
      return name;
    } catch (e) {
      await withTimeout(F.dbM.remove(F.dbM.ref(F.db, `usernames/${newKey}`))).catch(() => {});
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
    const updates = { [`users/${u.uid}`]: null };
    MODES.forEach((m) => { updates[`leaderboard/${m}/${u.uid}`] = null; });
    if (u.displayName) updates[`usernames/${nameKey(u.displayName)}`] = null;
    await withTimeout(dbM.update(dbM.ref(db), updates));
    await withTimeout(authM.deleteUser(u));
    this.user = null;
    this._emit();
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

  async submitScore(mode, score) {
    if (!this.user || !score) return;
    const r = F.dbM.ref(F.db, `leaderboard/${mode}/${this.user.uid}`);
    const snap = await withTimeout(F.dbM.get(r));
    if (!snap.exists() || (snap.val().score || 0) < score) {
      await withTimeout(F.dbM.set(r, { name: this.user.name, score }));
    }
  },

  async leaderboard(mode, n = 50) {
    await this.need();
    const q = F.dbM.query(F.dbM.ref(F.db, `leaderboard/${mode}`), F.dbM.orderByChild('score'), F.dbM.limitToLast(n));
    const snap = await withTimeout(F.dbM.get(q));
    const rows = [];
    snap.forEach((c) => { const v = c.val(); rows.push({ uid: c.key, name: String(v.name || '?'), score: Number(v.score) || 0 }); });
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
