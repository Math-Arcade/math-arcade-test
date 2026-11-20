const S = (window.__fbmock ||= { users: {}, cur: null, subs: [], db: {}, n: 0 });
const parts = (p) => p.split('/').filter(Boolean);
const getAt = (p) => parts(p).reduce((o, k) => (o == null ? undefined : o[k]), S.db);
function setAt(p, val) {
  const ks = parts(p);
  if (val === null || val === undefined) { // like the real database: deleting never creates parents, and empty parents disappear
    const chain = [S.db]; let o = S.db;
    for (const k of ks.slice(0, -1)) { o = o && o[k]; if (!o || typeof o !== 'object') return; chain.push(o); }
    delete o[ks.at(-1)];
    for (let i = chain.length - 1; i > 0 && !Object.keys(chain[i]).length; i -= 1) delete chain[i - 1][ks[i - 1]];
    return;
  }
  let o = S.db;
  ks.slice(0, -1).forEach((k) => { o = o[k] ||= {}; });
  o[ks.at(-1)] = JSON.parse(JSON.stringify(val));
}
// Tests can make the database fail on purpose: window.__fbmock.failDb = { ops: ['update'], match: 'regex on the path' }
const fault = (op, path) => {
  const f = S.failDb;
  if (f && f.ops.includes(op) && (!f.match || new RegExp(f.match).test(path))) throw Object.assign(new Error('PERMISSION_DENIED: Permission denied'), { code: 'PERMISSION_DENIED' });
};
// a snapshot is a copy, like the real database: later writes must not change data a caller already read
const copy = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const snap = (val, key) => ({ key, exists: () => val !== undefined && val !== null, val: () => copy(val),
  forEach(fn) { Object.entries(val || {}).forEach(([k, v]) => fn(snap(v, k))); } });
export const getDatabase = () => ({});
export const ref = (db, path = '') => ({ path });
export const query = (r, ...cons) => ({ path: r.path, cons });
export const orderByChild = (k) => ({ t: 'o', k });
export const limitToLast = (n) => ({ t: 'l', n });
export const orderByKey = () => ({ t: 'k' });
export const startAt = (v) => ({ t: 's', v });
export const endAt = (v) => ({ t: 'e', v });
export const limitToFirst = (n) => ({ t: 'f', n });
export async function get(r) {
  let val = getAt(r.path);
  if (r.cons) {
    const o = r.cons.find((c) => c.t === 'o'), l = r.cons.find((c) => c.t === 'l');
    const byKey = r.cons.find((c) => c.t === 'k'), s = r.cons.find((c) => c.t === 's'), en = r.cons.find((c) => c.t === 'e'), f = r.cons.find((c) => c.t === 'f');
    let e = Object.entries(val || {});
    if (byKey) e = e.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).filter(([k]) => (!s || k >= s.v) && (!en || k <= en.v));
    else if (o) e = e.sort((a, b) => a[1][o.k] - b[1][o.k]);
    if (l) e = e.slice(-l.n);
    if (f) e = e.slice(0, f.n);
    val = Object.fromEntries(e);
  }
  return snap(val, parts(r.path).at(-1));
}
export async function set(r, v) { fault('set', r.path); setAt(r.path, v); }
export async function update(r, updates) { fault('update', Object.keys(updates).join(' ')); for (const [p, v] of Object.entries(updates)) setAt((r.path ? r.path + '/' : '') + p, v); }
export async function runTransaction(r, fn) {
  fault('transaction', r.path);
  const cur = getAt(r.path), next = fn(cur === undefined ? null : cur);
  if (next === undefined) return { committed: false };
  setAt(r.path, next);
  return { committed: true };
}
export async function remove(r) { fault('remove', r.path); setAt(r.path, null); }
