const S = (window.__fbmock ||= { users: {}, cur: null, subs: [], db: {}, n: 0 });
S.alive ||= {}; S.g ||= 0; // every login that currently exists, registered or guest
const err = (code) => Object.assign(new Error(code), { code });
const notify = () => S.subs.forEach((f) => f(S.cur));
const kill = (u) => { if (u.email && S.users[u.email] === u) delete S.users[u.email]; delete S.alive[u.uid]; if (S.cur === u) S.cur = null; notify(); };
const make = (props) => { const u = { displayName: null, email: null, isAnonymous: false, async delete() { kill(u); }, ...props }; S.alive[u.uid] = u; return u; };
export const getAuth = () => ({ get currentUser() { return S.cur; } });
// A second, independent login (used to check a password without touching the signed-in guest).
export const inMemoryPersistence = {};
export const initializeAuth = () => ({ secondary: true, currentUser: null });
export const onAuthStateChanged = (auth, cb) => { S.subs.push(cb); setTimeout(() => cb(S.cur), 0); return () => {}; };
// Guest logins only exist when a test switches them on (window.__fbmock.anon = true), like a project with anonymous auth enabled.
export async function signInAnonymously() {
  if (!S.anon) throw new TypeError('authM.signInAnonymously is not a function');
  S.cur = make({ uid: 'g' + (++S.g), isAnonymous: true }); notify();
  return { user: S.cur };
}
export async function createUserWithEmailAndPassword(auth, email, pw) {
  if (S.users[email]) throw err('auth/email-already-in-use');
  if (pw.length < 6) throw err('auth/weak-password');
  const u = make({ uid: 'u' + (++S.n), email, pw });
  S.users[email] = u; S.cur = u; notify();
  return { user: u };
}
// Upgrades a guest login in place: same uid, now with an email and password.
export async function linkWithCredential(u, c) {
  if (S.fail?.link) throw err('auth/network-request-failed');
  if (S.users[c.email]) throw err('auth/email-already-in-use');
  if (c.pw.length < 6) throw err('auth/weak-password');
  if (!/^[^@\s]+@[^@\s]+$/.test(c.email)) throw err('auth/invalid-email');
  Object.assign(u, { email: c.email, pw: c.pw, isAnonymous: false });
  S.users[c.email] = u;
  return { user: u };
}
export async function signInWithEmailAndPassword(auth, email, pw) {
  if (S.fail?.signIn || (!auth.secondary && S.fail?.signInMain)) throw err('auth/network-request-failed');
  const u = S.users[email];
  if (!u || u.pw !== pw) throw err('auth/invalid-credential');
  if (auth.secondary) { auth.currentUser = u; S.verifies = (S.verifies || 0) + 1; return { user: u }; } // does not touch the real session
  S.cur = u; notify();
  return { user: u };
}
export async function updateProfile(u, p) { if (S.fail?.updateProfile) throw err('auth/network-request-failed'); Object.assign(u, p); }
export async function signOut(auth) { if (auth && auth.secondary) { auth.currentUser = null; return; } S.cur = null; notify(); }
export async function sendPasswordResetEmail() {}
export const EmailAuthProvider = { credential: (email, pw) => ({ email, pw }) };
export async function reauthenticateWithCredential(u, c) { if (u.pw !== c.pw) throw err('auth/wrong-password'); }
export async function deleteUser(u) { if (S.fail?.deleteUser) throw err('auth/network-request-failed'); await u.delete(); }
