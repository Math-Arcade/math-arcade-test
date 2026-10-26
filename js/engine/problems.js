// Problem generation. Pure functions: no DOM, no globals.
// Every problem: { type, level, text, answer, choices[4], correctIndex }
// Markers inside `text`: "^2" renders as a superscript 2, a leading "√" as a radical.

import { RNG } from './rng.js';

export const SYM = { add: '+', sub: '−', mul: '×', div: '÷' };
export const MAX_LEVEL = 10;

// Operand ranges per level (index 0 = level 1)
const ADD = [[1, 9], [3, 15], [10, 40], [15, 70], [30, 150], [60, 300], [100, 600], [150, 900], [250, 999], [350, 999]];
const MUL = [ // [rangeA, rangeB]
  [[2, 5], [2, 5]], [[2, 6], [2, 9]], [[2, 9], [2, 9]], [[2, 12], [2, 12]], [[3, 12], [6, 15]],
  [[6, 15], [6, 15]], [[11, 25], [3, 9]], [[12, 35], [4, 9]], [[13, 49], [5, 9]], [[15, 75], [6, 9]],
];
const SQ = [[2, 5], [2, 8], [2, 10], [2, 12], [2, 12], [6, 15], [8, 18], [11, 22], [12, 25], [15, 30]];

// Mixed-mode pools: which problem types appear at each level, with weights
const POOL = {
  1: [['add', 1]],
  2: [['add', 3], ['sub', 2]],
  3: [['add', 2], ['sub', 2], ['mul', 2]],
  4: [['add', 2], ['sub', 2], ['mul', 3], ['div', 2]],
  5: [['add', 1], ['sub', 1], ['mul', 2], ['div', 2], ['sq', 1], ['miss', 1]],
  6: [['add', 1], ['sub', 1], ['mul', 2], ['div', 2], ['sq', 1], ['sqrt', 1], ['mixed', 2], ['miss', 1]],
  7: [['sub', 1], ['mul', 2], ['div', 2], ['sq', 1], ['sqrt', 1], ['mixed', 2], ['paren', 1], ['miss', 2]],
  8: [['sub', 1], ['mul', 2], ['div', 2], ['sq', 2], ['sqrt', 1], ['mixed', 2], ['paren', 2], ['miss', 2]],
  9: [['mul', 2], ['div', 2], ['sq', 2], ['sqrt', 2], ['mixed', 3], ['paren', 2], ['miss', 2]],
  10: [['mul', 2], ['div', 2], ['sq', 2], ['sqrt', 2], ['mixed', 3], ['paren', 3], ['miss', 3]],
};

const clampLevel = (l) => Math.max(1, Math.min(MAX_LEVEL, Math.round(l)));
const rangeInt = (rng, [a, b]) => rng.int(a, b);

// ---- generators: return { text, answer, traps[] } ----------------------------

const GEN = {
  add(rng, lvl) {
    const r = ADD[lvl - 1];
    const a = rangeInt(rng, r), b = rangeInt(rng, r);
    return { text: `${a} ${SYM.add} ${b} = ?`, answer: a + b, traps: [Math.abs(a - b), a + b + 10, a + b - 10] };
  },
  sub(rng, lvl) {
    const r = ADD[Math.max(0, lvl - 1)];
    let a = rangeInt(rng, r), b = rangeInt(rng, r);
    if (b > a) [a, b] = [b, a];
    if (lvl >= 8 && rng.chance(0.2)) [a, b] = [b, a]; // occasional negative result
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
  sqrt(rng, lvl) {
    const n = rangeInt(rng, SQ[Math.min(MAX_LEVEL - 1, Math.max(0, lvl - 2))]);
    return { text: `√${n * n} = ?`, answer: n, traps: [n + 1, n - 1, n * 2, Math.floor((n * n) / 2), n + 2] };
  },
  mixed(rng, lvl) {
    const small = [[2, 5], [2, 9], [2, 9], [3, 12], [3, 12], [4, 12], [4, 15], [5, 15], [6, 19], [6, 25]][lvl - 1];
    const big = ADD[Math.min(MAX_LEVEL - 1, lvl - 1)];
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
  paren(rng, lvl) {
    const small = [[2, 5], [2, 6], [2, 8], [2, 9], [2, 9], [3, 9], [3, 12], [3, 12], [4, 12], [4, 15]][lvl - 1];
    const form = rng.int(0, 2);
    const c = rangeInt(rng, small);
    if (form === 0) { // (a + b) × c
      const a = rng.int(2, 6 + lvl * 3), b = rng.int(2, 6 + lvl * 3);
      return { text: `(${a} ${SYM.add} ${b}) ${SYM.mul} ${c} = ?`, answer: (a + b) * c, traps: [a + b * c, a * c + b, a + b + c] };
    }
    if (form === 1) { // (a − b) × c
      let a = rng.int(5, 12 + lvl * 3), b = rng.int(2, a - 1);
      return { text: `(${a} ${SYM.sub} ${b}) ${SYM.mul} ${c} = ?`, answer: (a - b) * c, traps: [a - b * c, a * c - b, a - b + c] };
    }
    // a × (b + c)
    const a = rangeInt(rng, small), b = rng.int(2, 5 + lvl * 2), d = rng.int(2, 5 + lvl * 2);
    return { text: `${a} ${SYM.mul} (${b} ${SYM.add} ${d}) = ?`, answer: a * (b + d), traps: [a * b + d, a + b * d, a * b + a * d + a] };
  },
  miss(rng, lvl, kind) {
    const k = kind || rng.pick(['add', 'sub', 'mul', 'div']);
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

function makeChoices(raw, lvl, rng, count = 4) {
  const ans = raw.answer;
  const okNeg = ans < 0;
  const valid = (v) => Number.isInteger(v) && v !== ans && (okNeg || v >= 0) && Math.abs(v) < 1e6;
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

// ---- public API ---------------------------------------------------------------

export function generate(rng, { mode = 'mix', level = 1, count = 4 } = {}) {
  const lvl = clampLevel(level);
  let type, kind;
  if (mode === 'mix') {
    type = rng.weighted(POOL[lvl]);
  } else {
    type = mode;
    if (lvl >= 5 && rng.chance(0.22)) { type = 'miss'; kind = mode; }
  }
  const raw = GEN[type](rng, lvl, kind);
  const choices = makeChoices(raw, lvl, rng, count);
  return { type, level: lvl, text: raw.text, answer: raw.answer, choices, correctIndex: choices.indexOf(raw.answer) };
}

// Stateful helper that avoids showing the same question twice in a row.
export class ProblemStream {
  constructor({ seed, mode = 'mix', count = 4 } = {}) {
    this.rng = new RNG(seed);
    this.mode = mode;
    this.count = count;
    this.last = '';
  }
  next(level) {
    let p;
    for (let i = 0; i < 6; i++) {
      p = generate(this.rng, { mode: this.mode, level, count: this.count });
      if (p.text !== this.last) break;
    }
    this.last = p.text;
    return p;
  }
}
