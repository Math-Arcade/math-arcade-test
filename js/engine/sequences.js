// Number sequences with one hidden term. Pure functions: seeded RNG only, no DOM, no globals.
//
// Every sequence is generated from a named rule and then PROVEN unambiguous: we try every other
// value in the hole, and none of them may complete the sequence into any pattern the recognisers
// below know about. So the intended answer is the only one that "makes sense".

// ---- recognisers ---------------------------------------------------------------
// fits(s) = true when the WHOLE sequence follows the pattern. A pattern only counts when the
// visible terms over-determine it, so a "curve fit" through every visible point is never accepted.

const diffs = (s) => s.slice(1).map((v, i) => v - s[i]);
const allEq = (a) => a.every((v) => v === a[0]);
const nthDiff = (s, n) => { let d = s; for (let i = 0; i < n; i++) d = diffs(d); return d; };
const poly = (deg) => (s) => s.length >= deg + 3 && allEq(nthDiff(s, deg));

export const RECOGNISERS = {
  arith: poly(1),                                                        // +d every step
  geom: (s) => s.length >= 4 && s.every((v) => v !== 0) &&
    s.slice(2).every((v, i) => v * s[i] === s[i + 1] * s[i + 1]),         // x r every step
  quad: poly(2),                                                         // squares, triangular, growing steps
  cubic: poly(3),                                                        // cubes
  altdiff: (s) => s.length >= 5 && diffs(s).slice(2).every((d, i) => d === diffs(s)[i]), // +x, +y, +x, +y
  fib: (s) => s.length >= 4 && s.slice(2).every((v, i) => v === s[i] + s[i + 1]),         // sum of previous two
  affine: (s) => {                                                       // next = a x prev + b  (integers)
    if (s.length < 5 || s[1] === s[0]) return false;
    const a = (s[2] - s[1]) / (s[1] - s[0]);
    if (!Number.isInteger(a) || Math.abs(a) > 6) return false;
    const b = s[1] - a * s[0];
    return s.slice(1).every((v, i) => v === a * s[i] + b);
  },
  interleave: (s) => {                                                   // two arithmetic sequences taking turns
    if (s.length < 6) return false;
    const ev = s.filter((_, i) => i % 2 === 0), od = s.filter((_, i) => i % 2 === 1);
    return allEq(diffs(ev)) && allEq(diffs(od));
  },
};

export const fitsAnyPattern = (s) => Object.values(RECOGNISERS).some((f) => f(s));
export const fitsRule = (rule, s) => {
  const fams = RULE_FAMILY[rule] || [rule];
  return fams.some((f) => RECOGNISERS[f](s));
};

// Which recogniser(s) vouch for each generator rule.
const RULE_FAMILY = {
  arith: ['arith'], geom: ['geom'], squares: ['quad'], steps: ['quad'], altdiff: ['altdiff'],
  fib: ['fib'], affine: ['affine'], cubes: ['cubic'], interleave: ['interleave'],
};

// Values (other than the true one) that would also complete the sequence into a known pattern.
export function otherCompletions(seq, hole, span) {
  const maxAbs = Math.max(...seq.map(Math.abs));
  const R = span ?? 4 * maxAbs + 60;
  const bad = [];
  const t = seq.slice();
  for (let v = -R; v <= R; v++) {
    if (v === seq[hole]) continue;
    t[hole] = v;
    if (fitsAnyPattern(t)) bad.push(v);
  }
  return bad;
}

// ---- rule generators: (rng, lvl) -> { seq, rule } or null to retry ------------------

const LEN = (lvl) => (lvl < 7 ? 5 : 6);
const seqFrom = (a0, step, n) => Array.from({ length: n }, (_, i) => step(i, a0));

const RULES = {
  arith: { at: 5, make(rng, lvl) {
    const n = LEN(lvl);
    const dMax = lvl < 7 ? 6 : lvl < 10 ? 9 : 15;
    const d = rng.int(2, dMax);
    const down = rng.chance(lvl < 7 ? 0.25 : 0.4);
    if (!down) return { seq: seqFrom(rng.int(1, lvl < 7 ? 20 : 40), (i, a) => a + d * i, n), rule: 'arith' };
    // descending: below zero only once negatives have been introduced and the player is past the first levels
    const start = lvl < 7 ? d * (n - 1) + rng.int(1, 15) : rng.int(-2 * d, d * (n - 1) + 10);
    return { seq: seqFrom(start, (i, a) => a - d * i, n), rule: 'arith' };
  } },
  geom: { at: 6, make(rng, lvl) {
    const n = LEN(lvl);
    const r = lvl < 9 ? rng.int(2, 3) : lvl < 10 ? rng.int(2, 4) : rng.pick([2, 3, 4, 5, -2, -3]);
    const a = rng.int(1, lvl < 9 ? 4 : 3);
    let seq = seqFrom(a, (i, x) => x * r ** i, n);
    if (lvl >= 7 && r > 0 && rng.chance(0.35)) seq = seq.slice().reverse(); // x r in reverse = divide down
    return { seq, rule: 'geom' };
  } },
  squares: { at: 7, make(rng, lvl) {
    const n0 = rng.int(1, lvl < 9 ? 4 : 6);
    const k = lvl >= 8 && rng.chance(0.3) ? rng.int(1, 9) * (rng.chance(0.5) ? 1 : -1) : 0; // n^2 + k
    return { seq: seqFrom(n0, (i, a) => (a + i) ** 2 + k, 6), rule: 'squares' };
  } },
  steps: { at: 8, make(rng, lvl) { // steps that grow: +1, +2, +3 ...  (triangular numbers and friends)
    const d0 = rng.int(1, lvl < 10 ? 3 : 5), e = rng.int(1, lvl < 10 ? 2 : 3);
    return { seq: seqFrom(rng.int(0, 12), (i, a) => a + d0 * i + (e * i * (i - 1)) / 2, 6), rule: 'steps' };
  } },
  altdiff: { at: 8, make(rng, lvl) { // +x, +y, +x, +y
    const x = rng.int(1, 9), y = rng.int(1, 9);
    if (x === y) return null;
    const out = [rng.int(1, 20)];
    for (let i = 1; i < 6; i++) out.push(out[i - 1] + (i % 2 ? x : y));
    return { seq: out, rule: 'altdiff' };
  } },
  fib: { at: 8, make(rng) { // each term is the sum of the two before it
    const a = rng.int(1, 5), b = rng.int(1, 6);
    const out = [a, b];
    for (let i = 2; i < 6; i++) out.push(out[i - 1] + out[i - 2]);
    return { seq: out, rule: 'fib' };
  } },
  affine: { at: 9, make(rng, lvl) { // double and add 1, triple and take 1, ...
    const a = rng.pick([2, 2, 3]);
    const b = rng.pick(a === 2 ? [-3, -2, -1, 1, 2, 3] : [-2, -1, 1, 2]);
    const out = [rng.int(1, a === 2 ? 5 : 2)];
    for (let i = 1; i < 6; i++) out.push(a * out[i - 1] + b);
    return { seq: out, rule: 'affine' };
  } },
  cubes: { at: 9, make(rng) {
    const n0 = rng.int(1, 4);
    return { seq: seqFrom(n0, (i, a) => (a + i) ** 3, 6), rule: 'cubes' };
  } },
  interleave: { at: 9, make(rng) { // two patterns taking turns: 2, 20, 4, 17, 6, 14
    const p = rng.int(1, 20), u = rng.int(1, 4), q = rng.int(10, 40), v = rng.int(2, 5);
    const out = [];
    for (let i = 0; i < 6; i++) out.push(i % 2 === 0 ? p + u * (i / 2) : q - v * ((i - 1) / 2));
    return { seq: out, rule: 'interleave' };
  } },
};

export const SEQ_UNLOCK = Object.fromEntries(Object.entries(RULES).map(([k, v]) => [k, v.at]));

const maxTerm = (lvl) => (lvl < 9 ? 300 : 500);

function pickRule(rng, lvl) {
  const items = Object.entries(RULES).filter(([, r]) => r.at <= lvl)
    .map(([k, r]) => [k, (k === 'arith' ? 1.6 : 1) * (r.at === lvl ? 2.5 : 1)]);
  return rng.weighted(items);
}

function pickHole(rng, lvl, n) {
  // early on the hole is never one of the first two terms, so the pattern is always visible first
  const lo = lvl < 7 ? 2 : lvl < 9 ? 1 : 0;
  return rng.int(lo, n - 1);
}

// Returns { seq, hole, rule } with a proven-unique answer seq[hole].
export function makeSequence(rng, level) {
  const lvl = Math.max(5, level); // sequences start at level 5; asking earlier just gives the level-5 kind
  for (let attempt = 0; attempt < 60; attempt++) {
    const rule = pickRule(rng, lvl);
    const made = RULES[rule].make(rng, lvl);
    if (!made) continue;
    const { seq } = made;
    if (!seq.every(Number.isInteger) || Math.max(...seq.map(Math.abs)) > maxTerm(lvl)) continue;
    if (new Set(seq).size < seq.length - 1 && rule !== 'interleave') continue; // no near-constant junk
    if (!fitsRule(made.rule, seq)) continue;
    const hole = pickHole(rng, lvl, seq.length);
    if (otherCompletions(seq, hole).length) continue; // ambiguous: try again
    return { seq, hole, rule: made.rule };
  }
  // cannot happen in practice; a plain, always-unambiguous fallback keeps the game safe
  const seq = seqFrom(2, (i, a) => a + 3 * i, 5);
  return { seq, hole: 3, rule: 'arith' };
}
