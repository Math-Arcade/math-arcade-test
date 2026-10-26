const S = (window.__fbmock ||= { users: {}, cur: null, subs: [], db: {}, n: 0 });
const err = (code) => Object.assign(new Error(code), { code });
const notify = () => S.subs.forEach((f) => f(S.cur));
export const getAuth = () => ({ get currentUser() { return S.cur; } });
export const onAuthStateChanged = (auth, cb) => { S.subs.push(cb); setTimeout(() => cb(S.cur), 0); return () => {}; };
export async function createUserWithEmailAndPassword(auth, email, pw) {
  if (S.users[email]) throw err('auth/email-already-in-use');
  if (pw.length < 6) throw err('auth/weak-password');
  const u = { uid: 'u' + (++S.n), email, pw, displayName: null, async delete() { delete S.users[email]; if (S.cur === u) S.cur = null; notify(); } };
  S.users[email] = u; S.cur = u; notify();
  return { user: u };
}
export async function signInWithEmailAndPassword(auth, email, pw) {
  const u = S.users[email];
  if (!u || u.pw !== pw) throw err('auth/invalid-credential');
  S.cur = u; notify();
  return { user: u };
}
export async function updateProfile(u, p) { Object.assign(u, p); }
export async function signOut() { S.cur = null; notify(); }
export async function sendPasswordResetEmail() {}
export const EmailAuthProvider = { credential: (email, pw) => ({ email, pw }) };
export async function reauthenticateWithCredential(u, c) { if (u.pw !== c.pw) throw err('auth/wrong-password'); }
export async function deleteUser(u) { await u.delete(); }
