const S = (window.__fbmock ||= { users: {}, cur: null, subs: [], db: {}, n: 0 });
const parts = (p) => p.split('/').filter(Boolean);
const getAt = (p) => parts(p).reduce((o, k) => (o == null ? undefined : o[k]), S.db);
function setAt(p, val) {
  const ks = parts(p); let o = S.db;
  ks.slice(0, -1).forEach((k) => { o = o[k] ||= {}; });
  if (val === null || val === undefined) delete o[ks.at(-1)]; else o[ks.at(-1)] = JSON.parse(JSON.stringify(val));
}
const snap = (val, key) => ({ key, exists: () => val !== undefined && val !== null, val: () => val,
  forEach(fn) { Object.entries(val || {}).forEach(([k, v]) => fn(snap(v, k))); } });
export const getDatabase = () => ({});
export const ref = (db, path = '') => ({ path });
export const query = (r, ...cons) => ({ path: r.path, cons });
export const orderByChild = (k) => ({ t: 'o', k });
export const limitToLast = (n) => ({ t: 'l', n });
export async function get(r) {
  let val = getAt(r.path);
  if (r.cons) {
    const o = r.cons.find((c) => c.t === 'o'), l = r.cons.find((c) => c.t === 'l');
    let e = Object.entries(val || {}).sort((a, b) => a[1][o.k] - b[1][o.k]);
    if (l) e = e.slice(-l.n);
    val = Object.fromEntries(e);
  }
  return snap(val, parts(r.path).at(-1));
}
export async function set(r, v) { setAt(r.path, v); }
export async function update(r, updates) { for (const [p, v] of Object.entries(updates)) setAt((r.path ? r.path + '/' : '') + p, v); }
export async function runTransaction(r, fn) {
  const cur = getAt(r.path), next = fn(cur === undefined ? null : cur);
  if (next === undefined) return { committed: false };
  setAt(r.path, next);
  return { committed: true };
}
export async function remove(r) { setAt(r.path, null); }
