// An independent evaluator for the maths shown on screen, written separately from the generators so the tests
// do not just agree with the code they check. Supports + − × ÷, brackets, ^d and √n. Division must be exact.

export function evalExpr(text) {
  const src = text.replace(/\s+/g, '');
  let i = 0;
  const peek = () => src[i];
  const fail = (m) => { throw new Error(`${m} in "${text}" at ${i}`); };

  function number() {
    const m = /^\d+/.exec(src.slice(i));
    if (!m) fail('number expected');
    i += m[0].length;
    return Number(m[0]);
  }
  function atom() {
    if (peek() === '(') { i++; const v = expr(); if (peek() !== ')') fail('")" expected'); i++; return v; }
    if (peek() === '√') {
      i++; const n = number(); const r = Math.round(Math.sqrt(n));
      if (r * r !== n) fail(`√${n} is not a whole number`);
      return r;
    }
    return number();
  }
  function factor() {
    let v = atom();
    while (peek() === '^') { i++; const e = Number(src[i]); if (!Number.isInteger(e)) fail('exponent expected'); i++; v = v ** e; }
    return v;
  }
  function term() {
    let v = factor();
    while (peek() === '×' || peek() === '÷') {
      const op = src[i++]; const r = factor();
      if (op === '×') v *= r;
      else { if (r === 0 || v % r !== 0) fail(`inexact division ${v} ÷ ${r}`); v /= r; }
    }
    return v;
  }
  function expr() {
    let v = term();
    while (peek() === '+' || peek() === '−') { const op = src[i++]; const r = term(); v = op === '+' ? v + r : v - r; }
    return v;
  }
  const v = expr();
  if (i !== src.length) fail('unexpected trailing text');
  return v;
}

// "3 − 8 = −5": is the equation as written true?
export function equationHolds(line) {
  const [lhs, rhs, ...extra] = line.split(' = ');
  if (extra.length || rhs === undefined) throw new Error(`not an equation: ${line}`);
  return evalExpr(lhs) === Number(rhs.replace('−', '-'));
}

// every whole number literal shown in a piece of maths
export const literals = (text) => (text.match(/\d+/g) || []).map(Number);

// rough "how much is going on" score: operators, powers, roots and brackets
export const complexity = (text) => (text.match(/[+−×÷]/g) || []).length + (text.match(/\^/g) || []).length + (text.match(/√/g) || []).length + (text.match(/\(/g) || []).length;
