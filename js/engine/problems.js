// Problem generation. Pure functions: no DOM, no globals. Every random choice goes through the
// seeded RNG, so the same seed always produces the same questions (Daily, duels, tests).
//
// Every problem has:   { type, format, level, text, answer, choices[], correctIndex, key }
//   format  tells the UI how to draw it and which answer buttons to show:
//     'number'    standard maths          text "7 × 8 = ?"            4 numeric buttons
//     'sequence'  number sequence         text "3, 6, 9, ?, 15"       4 numeric buttons   (+ seq, hole, rule)
//     'equations' find the incorrect one  text = the prompt           4 equation buttons  (+ valid[])
//     'compare'   > = <                   text "7 × 8 ? 6 × 9"        3 buttons: > = <    (+ left, right, relation)
//   answer      the correct value: a number, or the wrong equation's text, or the relation symbol
//   choices     what the buttons show; choices[correctIndex] === answer, always exactly once
// Markers inside text: "^2" (any single digit after ^) renders as a superscript, "√n" as a radical.

import { RNG } from './rng.js';
import { makeSequence } from './sequences.js';

export const SYM = { add: '+', sub: '−', mul: '×', div: '÷' };
export const MAX_LEVEL = 12;
export const FORMATS = ['number', 'sequence', 'equations', 'compare'];
const TOTAL_FORMATS = new Set(FORMATS);

// ---- what unlocks when --------------------------------------------------------
// at    = first level where the type can appear (after that it stays in the mix for good)
// w     = steady-state weight in the mixed pool
// fresh = false to skip the "just unlocked" boost
export const TYPES = {
  add:       { at: 1,  w: 1.0, format: 'number' },
  mul:       { at: 2,  w: 1.5, format: 'number' },
  div:       { at: 3,  w: 1.5, format: 'number' },
  sub:       { at: 3,  w: 1.5, format: 'number' },        // includes negative results
  incorrect: { at: 4,  w: 1.5, format: 'equations' },
  sequence:  { at: 5,  w: 1.5, format: 'sequence' },
  miss:      { at: 5,  w: 1.0, format: 'number', fresh: false }, // "7 + ? = 12", existing format
  compare:   { at: 6,  w: 1.5, format: 'compare' },
  sq:        { at: 7,  w: 1.0, format: 'number' },        // powers: squares ...
  pow:       { at: 7,  w: 0.6, format: 'number' },        // ... cubes and powers of 2
  sqrt:      { at: 8,  w: 1.0, format: 'number' },
  paren:     { at: 9,  w: 1.2, format: 'number' },        // brackets
  mixed:     { at: 9,  w: 1.2, format: 'number' },        // order of operations
  combo:     { at: 10, w: 2.0, format: 'number' },        // 10+: several concepts in one question
};
export const UNLOCK = Object.fromEntries(Object.entries(TYPES).map(([k, v]) => [k, v.at]));
export const FORMAT_OF = Object.fromEntries(Object.entries(TYPES).map(([k, v]) => [k, v.format]));

// The first question at a newly reached level is this type, so every unlock is actually seen.
export const INTRO = { 2: 'mul', 3: 'div', 4: 'incorrect', 5: 'sequence', 6: 'compare', 7: 'sq', 8: 'sqrt', 9: 'paren', 10: 'combo' };

const BASIC = new Set(['add', 'sub', 'mul', 'div']);

// Weighted pool for a level. Everything unlocked so far stays in; the newest types get a boost,
// and the four basic operations slowly give way to richer questions.
export function poolFor(lvl, formats) {
  const out = [];
  for (const [type, t] of Object.entries(TYPES)) {
    if (t.at > lvl) continue;
    if (formats && !formats.includes(t.format)) continue;
    const age = lvl - t.at;
    let w = t.w * (t.fresh === false ? 1 : age === 0 ? 2.4 : age === 1 ? 1.5 : 1);
    if (BASIC.has(type)) w *= Math.max(0.45, 1 - 0.07 * Math.max(0, lvl - 6));
    out.push([type, w]);
  }
  return out;
}

// ---- difficulty tables (index 0 = level 1) -------------------------------------
// Difficulty grows through new concepts and multi-step questions; the numbers themselves stay small.
const ADD = [[1, 9], [2, 12], [5, 20], [8, 30], [10, 40], [12, 50], [15, 60], [18, 70], [20, 80], [25, 90], [25, 99], [30, 120]];
const MUL = [ // [rangeA, rangeB]
  [[2, 5], [2, 5]], [[2, 6], [2, 9]], [[2, 9], [2, 9]], [[2, 10], [2, 10]], [[2, 12], [2, 12]], [[3, 12], [3, 12]],
  [[4, 12], [4, 12]], [[5, 12], [5, 12]], [[6, 12], [6, 15]], [[6, 15], [6, 15]], [[8, 15], [6, 15]], [[10, 16], [8, 16]],
];
const SQ = [[2, 5], [2, 5], [2, 6], [2, 7], [2, 8], [2, 9], [2, 9], [2, 10], [2, 12], [2, 13], [3, 14], [4, 15]];
// chance that a subtraction goes below zero: never before level 3, then slowly more often
const negChance = (lvl) => (lvl < 3 ? 0 : Math.min(0.4, 0.2 + 0.04 * (lvl - 3)));

const clampLevel = (l) => Math.max(1, Math.min(MAX_LEVEL, Math.round(l)));
const rangeInt = (rng, [a, b]) => rng.int(a, b);

// ---- generators: return { text, answer, traps[] } -------------------------------
// Everything except 'miss' has the shape "<expression> = ?", which the incorrect-equation and
// comparison formats reuse: the expression is text minus the " = ?", its value is the answer.

const GEN = {
  add(rng, lvl) {
    const r = ADD[lvl - 1];
    const a = rangeInt(rng, r), b = rangeInt(rng, r);
    return { text: `${a} ${SYM.add} ${b} = ?`, answer: a + b, traps: [Math.abs(a - b), a + b + 10, a + b - 10] };
  },
  sub(rng, lvl, o = {}) {
    const r = ADD[lvl - 1];
    let a = rangeInt(rng, r), b = rangeInt(rng, r);
    if (b > a) [a, b] = [b, a];
    const neg = rng.chance(o.neg ?? negChance(lvl));
    if (neg && a !== b) [a, b] = [b, a];
    return { text: `${a} ${SYM.sub} ${b} = ?`, answer: a - b, traps: [a + b, b - a, a - b + 10, a - b - 10] };
  },
  mul(rng, lvl) {
    const [ra, rb] = MUL[lvl - 1];
    const a = rangeInt(rng, ra), b = rangeInt(rng, rb);
    return { text: `${a} ${SYM.mul} ${b} = ?`, answer: a * b, traps: [a + b, a * b + a, a * b - a, a * b + b, a * b - b] };
  },
  div(rng, lvl) {
    const [ra, rb] = MUL[lvl - 1];
    const q = rangeInt(rng, ra), d = rangeInt(rng, rb);
    return { text: `${q * d} ${SYM.div} ${d} = ?`, answer: q, traps: [q + 1, q - 1, d, q * 2, q + d] };
  },
  sq(rng, lvl) {
    const n = rangeInt(rng, SQ[lvl - 1]);
    return { text: `${n}^2 = ?`, answer: n * n, traps: [n * 2, n * n + n, n * n - n, (n + 1) ** 2, (n - 1) ** 2] };
  },
  pow(rng, lvl) {
    const form = rng.int(0, lvl >= 9 ? 3 : 2);
    if (form <= 1) { // cubes
      const n = rng.int(2, lvl >= 10 ? 6 : 5);
      return { text: `${n}^3 = ?`, answer: n ** 3, traps: [n * 3, n * n, (n + 1) ** 3, n ** 3 + n, n ** 3 - n] };
    }
    if (form === 2) { // powers of two
      const k = rng.int(4, lvl >= 9 ? 8 : 6);
      return { text: `2^${k} = ?`, answer: 2 ** k, traps: [2 * k, k * k, 2 ** (k - 1), 2 ** (k + 1)] };
    }
    const n = rng.int(2, 3); // fourth powers (16, 81)
    return { text: `${n}^4 = ?`, answer: n ** 4, traps: [n * 4, n ** 3, n ** 4 + n, (n + 1) ** 3] };
  },
  sqrt(rng, lvl) {
    const n = rng.int(2, SQ[lvl - 1][1]);
    return { text: `√${n * n} = ?`, answer: n, traps: [n + 1, n - 1, n * 2, Math.floor((n * n) / 2), n + 2] };
  },
  mixed(rng, lvl) { // order of operations, no brackets
    const small = [[2, 5], [2, 6], [2, 9], [2, 9], [3, 9], [3, 12], [3, 12], [4, 12], [4, 12], [5, 12], [5, 12], [6, 15]][lvl - 1];
    const big = ADD[lvl - 1];
    const form = rng.int(0, 3);
    const b = rangeInt(rng, small), c = rangeInt(rng, small);
    if (form === 0) { // a + b × c
      const a = rangeInt(rng, big);
      return { text: `${a} ${SYM.add} ${b} ${SYM.mul} ${c} = ?`, answer: a + b * c, traps: [(a + b) * c, a + b + c, a * b + c] };
    }
    if (form === 1) { // a × b − c
      const a = rangeInt(rng, small);
      const bc = a * b;
      const d = rng.int(1, Math.max(1, Math.min(bc, big[1])));
      return { text: `${a} ${SYM.mul} ${b} ${SYM.sub} ${d} = ?`, answer: bc - d, traps: [a * (b - d), bc + d, a + b - d] };
    }
    if (form === 2) { // a − b × c  (a large enough to stay positive)
      const a = b * c + rng.int(1, Math.max(2, big[1] >> 1));
      return { text: `${a} ${SYM.sub} ${b} ${SYM.mul} ${c} = ?`, answer: a - b * c, traps: [(a - b) * c, a - b - c, a - b + c] };
    }
    // a + b − c
    const a = rangeInt(rng, big), bb = rangeInt(rng, big);
    const cc = rng.int(1, a + bb);
    return { text: `${a} ${SYM.add} ${bb} ${SYM.sub} ${cc} = ?`, answer: a + bb - cc, traps: [a + bb + cc, a - bb - cc, a - bb + cc] };
  },
  paren(rng, lvl) { // brackets
    const small = [[2, 5], [2, 6], [2, 8], [2, 8], [2, 9], [2, 9], [3, 9], [3, 9], [3, 10], [3, 12], [3, 12], [4, 12]][lvl - 1];
    const pr = 4 + Math.ceil(lvl * 0.8);
    const form = rng.int(0, 2);
    const c = rangeInt(rng, small);
    if (form === 0) { // (a + b) × c
      const a = rng.int(2, pr), b = rng.int(2, pr);
      return { text: `(${a} ${SYM.add} ${b}) ${SYM.mul} ${c} = ?`, answer: (a + b) * c, traps: [a + b * c, a * c + b, a + b + c] };
    }
    if (form === 1) { // (a − b) × c
      const a = rng.int(5, 8 + lvl), b = rng.int(2, a - 1);
      return { text: `(${a} ${SYM.sub} ${b}) ${SYM.mul} ${c} = ?`, answer: (a - b) * c, traps: [a - b * c, a * c - b, a - b + c] };
    }
    // a × (b + c)
    const top = 4 + Math.ceil(lvl * 0.6);
    const a = rangeInt(rng, small), b = rng.int(2, top), d = rng.int(2, top);
    return { text: `${a} ${SYM.mul} (${b} ${SYM.add} ${d}) = ?`, answer: a * (b + d), traps: [a * b + d, a + b * d, a * b + a * d + a] };
  },
  combo(rng, lvl) { // level 10+: powers, roots, brackets and order of operations in one expression
    const forms = lvl >= 12 ? [0, 1, 2, 3, 4, 5, 6, 7] : lvl >= 11 ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 5];
    const hi = lvl >= 12 ? 12 : 9;
    const f = rng.pick(forms);
    const x = () => rng.int(2, hi);
    if (f === 0) { const n = rng.int(2, lvl + 1), a = x(), b = x(); // n² + a × b
      return { text: `${n}^2 ${SYM.add} ${a} ${SYM.mul} ${b} = ?`, answer: n * n + a * b, traps: [(n * n + a) * b, n * 2 + a * b, n * n + a + b] }; }
    if (f === 1) { const a = rng.int(2, 12), b = rng.int(2, 12), c = x(), d = rng.int(1, 30); // (a + b) × c − d
      return { text: `(${a} ${SYM.add} ${b}) ${SYM.mul} ${c} ${SYM.sub} ${d} = ?`, answer: (a + b) * c - d, traps: [a + b * c - d, (a + b) * (c - d), (a + b) * c + d] }; }
    if (f === 2) { const m = rng.int(2, 12), a = x(), b = x(); // √m² + a × b
      return { text: `√${m * m} ${SYM.add} ${a} ${SYM.mul} ${b} = ?`, answer: m + a * b, traps: [(m + a) * b, m * m + a * b, m + a + b] }; }
    if (f === 3) { const a = rng.int(4, 12), b = rng.int(4, 12), n = rng.int(2, Math.floor(Math.sqrt(a * b))); // a × b − n²
      return { text: `${a} ${SYM.mul} ${b} ${SYM.sub} ${n}^2 = ?`, answer: a * b - n * n, traps: [a * b + n * n, a * b - n * 2, a * b - n] }; }
    if (f === 4) { const a = rng.int(6, 15), b = rng.int(1, a - 2); // (a − b)²
      return { text: `(${a} ${SYM.sub} ${b})^2 = ?`, answer: (a - b) ** 2, traps: [a * a - b * b, a * a - b, (a - b) * 2] }; }
    if (f === 5) { const q = rng.int(2, 12), d = rng.int(2, 9), a = x(), b = x(); // q×d ÷ d + a × b
      return { text: `${q * d} ${SYM.div} ${d} ${SYM.add} ${a} ${SYM.mul} ${b} = ?`, answer: q + a * b, traps: [(q + a) * b, q + a + b, q * d + a * b] }; }
    if (f === 6) { const m = rng.int(2, 9), a = x(), b = x(); // √m² × (a + b)
      return { text: `√${m * m} ${SYM.mul} (${a} ${SYM.add} ${b}) = ?`, answer: m * (a + b), traps: [m * a + b, m + a + b, m * m * (a + b)] }; }
    const n = rng.int(5, 12), a = x(), b = x(); // n² − (a + b)
    return { text: `${n}^2 ${SYM.sub} (${a} ${SYM.add} ${b}) = ?`, answer: n * n - a - b, traps: [n * n - a + b, n * 2 - a - b, n * n + a - b] };
  },
  miss(rng, lvl, o = {}) { // missing number: 7 + ? = 12
    const k = o.kind || rng.pick(['add', 'sub', 'mul', 'div']);
    if (k === 'add') {
      const r = ADD[lvl - 1], a = rangeInt(rng, r), b = rangeInt(rng, r);
      return { text: `${a} ${SYM.add} ? = ${a + b}`, answer: b, traps: [a + b, b + 1, b - 1, a] };
    }
    if (k === 'sub') {
      const r = ADD[lvl - 1];
      let a = rangeInt(rng, r), b = rangeInt(rng, r);
      if (b > a) [a, b] = [b, a];
      if (rng.chance(0.5)) return { text: `${a} ${SYM.sub} ? = ${a - b}`, answer: b, traps: [a + b, a - b, b + 1, b - 1] };
      return { text: `? ${SYM.sub} ${b} = ${a - b}`, answer: a, traps: [a - b - b, a - b, a + 1, a - 1] };
    }
    const [ra, rb] = MUL[lvl - 1];
    const x = rangeInt(rng, ra), y = rangeInt(rng, rb);
    if (k === 'mul') {
      if (rng.chance(0.5)) return { text: `${x} ${SYM.mul} ? = ${x * y}`, answer: y, traps: [x * y, y + 1, y - 1, x] };
      return { text: `? ${SYM.mul} ${y} = ${x * y}`, answer: x, traps: [x * y, x + 1, x - 1, y] };
    }
    // div: x*y ÷ ? = x   or   ? ÷ y = x
    if (rng.chance(0.5)) return { text: `${x * y} ${SYM.div} ? = ${x}`, answer: y, traps: [x, y + 1, y - 1, x * y] };
    return { text: `? ${SYM.div} ${y} = ${x}`, answer: x * y, traps: [x, x + y, x * y + y, x * y - y] };
  },
};

// ---- wrong answers ------------------------------------------------------------

// maxDist (optional) keeps every wrong value within that distance of the right one.
function makeChoices(raw, lvl, rng, count = 4, maxDist = Infinity) {
  const ans = raw.answer;
  const okNeg = ans < 0;
  const valid = (v) => Number.isInteger(v) && v !== ans && (okNeg || v >= 0) && Math.abs(v) < 1e6 && Math.abs(v - ans) <= maxDist;
  const uniq = (arr) => [...new Set(arr.filter(valid))];

  const spread = lvl <= 2 ? 3 : lvl <= 5 ? 5 : 8;
  const near = [];
  for (let d = 1; d <= spread; d++) near.push(ans + d, ans - d);
  const ten = Math.abs(ans) >= 10 ? [ans + 10, ans - 10, ans + (lvl > 6 ? 20 : 10)] : [];
  const s = String(Math.abs(ans));
  const swap = [];
  if (s.length >= 2) { // swap the last two digits: 54 -> 45
    const t = s.slice(0, -2) + s[s.length - 1] + s[s.length - 2];
    swap.push(Number(t) * (ans < 0 ? -1 : 1));
  }
  const pool = { near: uniq(near), ten: uniq(ten), swap: uniq(swap), trap: uniq(raw.traps || []) };

  const order = lvl <= 3 ? ['near', 'near', 'trap', 'ten']
    : lvl <= 6 ? ['trap', 'near', 'ten', 'swap', 'near']
    : ['trap', 'trap', 'near', 'swap', 'ten', 'near'];

  const picked = [];
  for (const kind of order) {
    if (picked.length >= count - 1) break;
    const opts = pool[kind].filter((v) => !picked.includes(v));
    if (opts.length) picked.push(rng.pick(opts));
  }
  for (let d = 1; picked.length < count - 1; d++) { // guaranteed fill
    for (const v of [ans + d, ans - d]) {
      if (picked.length < count - 1 && valid(v) && !picked.includes(v)) picked.push(v);
    }
    if (d > 50) { picked.push(ans + 100 + picked.length); } // safety net
  }
  return rng.shuffle([ans, ...picked]);
}

const num = (n) => String(n).replace('-', '−');

// ---- number-answer problems (standard maths and the rest of the single-answer family) ----

function buildNumber(type, rng, lvl, count, kind) {
  const raw = GEN[type](rng, lvl, { kind });
  const choices = makeChoices(raw, lvl, rng, count);
  return { type, format: 'number', level: lvl, text: raw.text, answer: raw.answer, choices, correctIndex: choices.indexOf(raw.answer), key: raw.text };
}

// ---- Find the incorrect equation ---------------------------------------------------

// Every equation in the set is drawn the same way (same operations, same size of numbers), so the
// wrong one has no formatting or complexity "tell". Its value is a realistic slip: an off-by-a-bit,
// a digit swap, a classic operation mistake.

const EXPR_TYPES = ['add', 'sub', 'mul', 'div', 'sq', 'pow', 'sqrt', 'paren', 'mixed', 'combo'];
const exprPool = (lvl) => poolFor(lvl).filter(([t]) => EXPR_TYPES.includes(t)).map(([t, w]) => [t, t === 'combo' ? w * 0.6 : w]);
const stripEq = (text) => text.replace(/ = \?$/, '');

function buildIncorrect(rng, lvl, count = 4) {
  const kinds = exprPool(lvl);
  for (let attempt = 0; attempt < 40; attempt++) {
    const eqs = [];
    const seen = new Set();
    for (let i = 0; i < count; i++) {
      const type = rng.weighted(kinds);
      const raw = GEN[type](rng, lvl);
      const expr = stripEq(raw.text);
      if (seen.has(expr)) break;
      seen.add(expr);
      eqs.push({ expr, value: raw.answer, raw });
    }
    if (eqs.length < count) continue;
    const wi = rng.int(0, count - 1);
    const w = eqs[wi];
    const band = Math.max(12, Math.ceil(Math.abs(w.value) * 0.35)); // a believable slip, never a wild outlier
    const pair = makeChoices({ answer: w.value, traps: w.raw.traps }, lvl, rng, 2, band);
    const wrong = pair.find((v) => v !== w.value);
    const lines = eqs.map((e, i) => `${e.expr} = ${num(i === wi ? wrong : e.value)}`);
    if (new Set(lines).size < count) continue;
    const order = rng.shuffle(eqs.map((_, i) => i));
    const choices = order.map((i) => lines[i]);
    const valid = order.map((i) => i !== wi);
    return {
      type: 'incorrect', format: 'equations', level: lvl,
      text: 'FIND THE INCORRECT EQUATION', answer: lines[wi], choices, correctIndex: order.indexOf(wi), valid,
      key: `eq:${[...choices].sort().join('|')}`,
    };
  }
  throw new Error('could not build an incorrect-equation question');
}

// ---- Equation comparison ---------------------------------------------------------

// Build an expression that evaluates to a given value, or null if this kind cannot make it.
const divisors = (v, lo, hi) => { const out = []; for (let d = lo; d <= hi; d++) if (v % d === 0) out.push(d); return out; };
const FOR_VALUE = {
  add(rng, v) {
    if (v < 3) return null;
    const lo = Math.max(1, Math.ceil(v * 0.2)), hi = Math.min(v - 1, Math.floor(v * 0.8));
    const a = lo <= hi ? rng.int(lo, hi) : rng.int(1, v - 1);
    return `${a} ${SYM.add} ${v - a}`;
  },
  sub(rng, v) {
    if (v > 80) return null;
    if (v >= 0) { const b = rng.int(2, Math.min(30, 99 - v)); return `${v + b} ${SYM.sub} ${b}`; }
    const a = rng.int(1, 30); return `${a} ${SYM.sub} ${a - v}`;
  },
  mul(rng, v) {
    if (v < 4) return null;
    const pairs = divisors(v, 2, 16).filter((d) => v / d >= 2 && v / d <= 16);
    if (!pairs.length) return null;
    const x = rng.pick(pairs);
    return `${x} ${SYM.mul} ${v / x}`;
  },
  div(rng, v) {
    if (v < 1) return null;
    const maxD = Math.min(9, Math.floor(120 / v));
    if (maxD < 2) return null;
    const d = rng.int(2, maxD);
    return `${v * d} ${SYM.div} ${d}`;
  },
  sq(rng, v) {
    const n = Math.round(Math.sqrt(v));
    return n >= 2 && n <= 15 && n * n === v ? `${n}^2` : null;
  },
  pow(rng, v) {
    const forms = { 8: ['2^3'], 16: ['2^4'], 27: ['3^3'], 32: ['2^5'], 64: ['4^3', '2^6'], 81: ['3^4'], 125: ['5^3'], 128: ['2^7'] }[v];
    return forms ? rng.pick(forms) : null;
  },
  sqrt(rng, v) { return v >= 2 && v <= 15 ? `√${v * v}` : null; },
  paren(rng, v) {
    if (v < 8) return null;
    const cs = divisors(v, 2, 9).filter((c) => v / c >= 4);
    if (!cs.length) return null;
    const c = rng.pick(cs), k = v / c;
    if (rng.chance(0.65)) { const a = rng.int(2, k - 2); return rng.chance(0.5) ? `(${a} ${SYM.add} ${k - a}) ${SYM.mul} ${c}` : `${c} ${SYM.mul} (${a} ${SYM.add} ${k - a})`; }
    const b = rng.int(2, 12); return `(${k + b} ${SYM.sub} ${b}) ${SYM.mul} ${c}`;
  },
  mixed(rng, v) {
    if (v < 8) return null;
    for (let i = 0; i < 12; i++) {
      const b = rng.int(2, 9), c = rng.int(2, 9), m = b * c;
      if (m >= v) continue;
      return rng.chance(0.6) ? `${v - m} ${SYM.add} ${b} ${SYM.mul} ${c}` : `${b} ${SYM.mul} ${c} ${SYM.add} ${v - m}`;
    }
    return null;
  },
  combo(rng, v) {
    const opts = [];
    const n = Math.floor(Math.sqrt(v - 1));
    if (n >= 2 && v - n * n >= 1) opts.push(`${n}^2 ${SYM.add} ${v - n * n}`);
    for (let k = n + 1; k <= 13; k++) if (k * k - v >= 1 && k * k - v <= 30) { opts.push(`${k}^2 ${SYM.sub} ${k * k - v}`); break; }
    const ms = divisors(v, 2, 12).filter((m) => v / m >= 2 && v / m <= 12);
    if (ms.length) { const m = rng.pick(ms); opts.push(`√${m * m} ${SYM.mul} ${v / m}`); }
    return opts.length ? rng.pick(opts) : null;
  },
};

const canon = (t) => t.replace(/[\s()]/g, '').split(/(?<=\d)(?=[^\d])|(?<=[^\d])(?=\d)/).sort().join('');
const VAL_RANGE = (lvl) => [10, Math.min(130, 50 + 10 * (lvl - 6))];
const DELTA = (lvl) => (lvl <= 6 ? [2, 10] : lvl === 7 ? [2, 9] : lvl === 8 ? [1, 8] : lvl < 10 ? [1, 7] : [1, 6]);

function orderedKinds(rng, pool, last) { // weighted order without repeats, the other side's kind goes last
  const left = pool.filter(([t]) => t !== last);
  const out = [];
  while (left.length) { const t = rng.weighted(left); out.push(t); left.splice(left.findIndex(([x]) => x === t), 1); }
  if (last && pool.some(([t]) => t === last)) out.push(last);
  return out;
}

function sideFor(rng, pool, v, avoid, prefer) {
  const order = orderedKinds(rng, pool, avoid);
  if (prefer && order.includes(prefer)) order.splice(order.indexOf(prefer), 1), order.unshift(prefer);
  for (const kind of order) {
    const text = FOR_VALUE[kind](rng, v);
    if (text) return { text, kind };
  }
  return null;
}

function buildCompare(rng, lvl) {
  const pool = exprPool(lvl).filter(([t]) => FOR_VALUE[t]);
  const [lo, hi] = VAL_RANGE(lvl);
  const [dlo, dhi] = DELTA(lvl);
  for (let attempt = 0; attempt < 60; attempt++) {
    const rel = rng.weighted([['>', 3], ['=', 2], ['<', 3]]);
    // a few value picks make powers and roots show up instead of only +, −, ×, ÷
    let vL, prefer = null;
    const pick = rng.float();
    if (lvl >= 7 && pick < 0.25) { vL = rng.int(2, Math.floor(Math.sqrt(hi))) ** 2; prefer = 'sq'; }
    else if (lvl >= 8 && pick < 0.38) { vL = rng.int(3, 15); prefer = 'sqrt'; }
    else if (lvl >= 7 && pick < 0.46) { vL = rng.pick([8, 16, 27, 32, 64, 81, 125]); prefer = 'pow'; }
    else vL = rng.int(lo, hi);
    const delta = rel === '=' ? 0 : rng.int(dlo, dhi);
    const vR = rel === '>' ? vL - delta : rel === '<' ? vL + delta : vL;
    if (vR < 1) continue;
    const L = sideFor(rng, pool, vL, null, prefer);
    if (!L) continue;
    const R = sideFor(rng, pool, vR, L.kind, null);
    if (!R) continue;
    if (L.text === R.text || canon(L.text) === canon(R.text)) continue;
    const swap = rng.chance(0.5); // randomise which side holds the "special" expression
    const [left, right, lv, rv] = swap ? [R.text, L.text, vR, vL] : [L.text, R.text, vL, vR];
    const relation = lv > rv ? '>' : lv < rv ? '<' : '=';
    const choices = ['>', '=', '<'];
    return {
      type: 'compare', format: 'compare', level: lvl,
      text: `${left} ? ${right}`, answer: relation, choices, correctIndex: choices.indexOf(relation),
      left, right, leftValue: lv, rightValue: rv, relation, key: `${left}?${right}`,
    };
  }
  throw new Error('could not build a comparison question');
}

// ---- Number sequences ---------------------------------------------------------

function buildSequence(rng, lvl, count) {
  const { seq, hole, rule } = makeSequence(rng, lvl);
  const ans = seq[hole];
  const step = (i) => (seq[i + 1] !== undefined && seq[i] !== undefined ? seq[i + 1] - seq[i] : 0);
  const stepBefore = hole > 0 ? ans - seq[hole - 1] : step(hole);
  const traps = [ans + stepBefore, ans - stepBefore, ans + 1, ans - 1, seq[hole - 1], seq[hole + 1], ans + 2, ans - 2, ans * 2]
    .filter((v) => v !== undefined);
  const choices = makeChoices({ answer: ans, traps }, lvl, rng, count);
  return {
    type: 'sequence', format: 'sequence', level: lvl,
    text: seq.map((v, i) => (i === hole ? '?' : num(v))).join(', '),
    answer: ans, choices, correctIndex: choices.indexOf(ans), seq, hole, rule,
    key: seq.map((v, i) => (i === hole ? '?' : v)).join(','),
  };
}

// ---- public API ---------------------------------------------------------------

// formats: optional list limiting which formats the mixed pool may use (e.g. a screen that has no
// 3-button or equation layout). Single-operation modes always stay numeric.
export function generate(rng, { mode = 'mix', level = 1, count = 4, type: forced, formats } = {}) {
  const lvl = clampLevel(level);
  let type, kind;
  if (mode === 'mix') {
    type = forced || rng.weighted(poolFor(lvl, formats));
  } else {
    type = mode;
    if (lvl >= 5 && rng.chance(0.22)) { type = 'miss'; kind = mode; }
  }
  if (type === 'incorrect') return buildIncorrect(rng, lvl);
  if (type === 'compare') return buildCompare(rng, lvl);
  if (type === 'sequence') return buildSequence(rng, lvl, count);
  return buildNumber(type, rng, lvl, count, kind);
}

// the question text with the answer filled in (shown after answering)
export function revealText(p) {
  if (p.format === 'compare') return p.text.replace('?', () => p.answer);
  if (p.format === 'number' || p.format === 'sequence') return p.text.replace('?', () => num(p.answer));
  return p.text;
}

export const isValidChoice = (p, i) => Number.isInteger(i) && i >= 0 && i < p.choices.length;

// Stateful helper: never shows the same question twice in a row, never repeats a special format
// back to back, and (for Blitz/Zen) opens each newly reached level with the type it unlocks.
export class ProblemStream {
  constructor({ seed, mode = 'mix', count = 4, formats = null, intro = false } = {}) {
    this.rng = new RNG(seed);
    this.mode = mode;
    this.count = count;
    this.formats = formats && formats.every((f) => TOTAL_FORMATS.has(f)) ? formats : null;
    this.intro = intro;
    this.last = '';
    this.lastFormat = '';
    this.prevLevel = null;
  }
  next(level) {
    const lvl = clampLevel(level);
    let forced;
    if (this.intro && this.mode === 'mix' && this.prevLevel !== null && lvl > this.prevLevel) {
      const t = INTRO[lvl];
      if (t && (!this.formats || this.formats.includes(TYPES[t].format))) forced = t;
    }
    this.prevLevel = lvl;
    let p;
    for (let i = 0; i < 8; i++) {
      p = generate(this.rng, { mode: this.mode, level: lvl, count: this.count, type: forced, formats: this.formats });
      const repeat = p.key === this.last || (p.format !== 'number' && p.format === this.lastFormat);
      if (!repeat) break;
    }
    this.last = p.key;
    this.lastFormat = p.format;
    return p;
  }
}
