import test from 'node:test';
import assert from 'node:assert/strict';
import { RNG } from '../js/engine/rng.js';
import { generate, ProblemStream, MAX_LEVEL } from '../js/engine/problems.js';
import { RunEngine, RULES } from '../js/engine/run.js';
import { DuelEngine } from '../js/engine/duel.js';

// tiny safe evaluator for the display strings, to prove the shown answer is right
function evalText(text) {
  let m;
  if ((m = /^√(\d+) = \?$/.exec(text))) return Math.sqrt(+m[1]);
  if ((m = /^(\d+)\^2 = \?$/.exec(text))) return (+m[1]) ** 2;
  const norm = (s) => s.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
  if (text.includes('?') && !text.endsWith('= ?')) { // missing-number: solve by brute force
    const [lhs, rhs] = text.split('=').map((s) => norm(s.trim()));
    for (let x = -2000; x <= 100000; x++) {
      const v = Function(`return (${lhs.replace('?', `(${x})`)})`)();
      if (Math.abs(v - Number(rhs)) < 1e-9) return x;
    }
    return NaN;
  }
  return Function(`return (${norm(text.replace(/ = \?$/, ''))})`)();
}

test('every generated problem is valid (all modes x levels)', () => {
  const rng = new RNG(12345);
  for (const mode of ['mix', 'add', 'sub', 'mul', 'div']) {
    for (let level = 1; level <= MAX_LEVEL; level++) {
      for (let i = 0; i < 600; i++) {
        const p = generate(rng, { mode, level });
        const ctx = `${mode} L${level}: ${p.text}`;
        assert.equal(p.choices.length, 4, ctx);
        assert.equal(new Set(p.choices).size, 4, `duplicate choices ${ctx} ${p.choices}`);
        assert.ok(p.choices.every(Number.isInteger), ctx);
        assert.equal(p.choices.filter((c) => c === p.answer).length, 1, ctx);
        assert.equal(p.choices[p.correctIndex], p.answer, ctx);
        assert.ok(Number.isInteger(p.answer), `non-integer answer ${ctx}`);
        if (p.answer >= 0) assert.ok(p.choices.every((c) => c >= 0), `negative distractor ${ctx} ${p.choices}`);
        assert.equal(evalText(p.text), p.answer, `wrong answer for ${ctx}`);
        assert.ok(!p.text.includes('NaN') && !p.text.includes('undefined'), ctx);
      }
    }
  }
});

test('single-operation modes only use their operation', () => {
  const rng = new RNG(7);
  const sign = { add: '+', sub: '−', mul: '×', div: '÷' };
  for (const mode of Object.keys(sign)) {
    for (let level = 1; level <= MAX_LEVEL; level++) {
      for (let i = 0; i < 200; i++) {
        const p = generate(rng, { mode, level });
        assert.ok(p.text.includes(sign[mode]), `${mode} L${level} produced ${p.text}`);
      }
    }
  }
});

test('same seed gives the same sequence (daily / online fairness)', () => {
  const a = new ProblemStream({ seed: 'daily-2026-10-25' });
  const b = new ProblemStream({ seed: 'daily-2026-10-25' });
  const c = new ProblemStream({ seed: 'daily-2026-10-26' });
  const sa = [], sb = [], sc = [];
  for (let i = 0; i < 20; i++) { sa.push(a.next(1 + (i % 8))); sb.push(b.next(1 + (i % 8))); sc.push(c.next(1 + (i % 8))); }
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
});

test('correct answer position is roughly uniform', () => {
  const rng = new RNG(99);
  const counts = [0, 0, 0, 0];
  for (let i = 0; i < 8000; i++) counts[generate(rng, { mode: 'mix', level: 1 + (i % 10) }).correctIndex]++;
  for (const c of counts) assert.ok(c > 1700 && c < 2300, `skewed: ${counts}`);
});

test('mixed mode ramps up: early levels are add-only, late levels have variety', () => {
  const rng = new RNG(3);
  const types = (lvl) => new Set(Array.from({ length: 400 }, () => generate(rng, { mode: 'mix', level: lvl }).type));
  assert.deepEqual([...types(1)], ['add']);
  assert.ok(types(10).size >= 6);
});

test('blitz scoring, combo, lives, level-up', () => {
  const e = new RunEngine({ kind: 'blitz', seed: 1 });
  let t = 0;
  e.next(t);
  let r;
  for (let i = 1; i <= 5; i++) { // 5 fast correct answers -> x2 on the 5th
    t += 1000; r = e.answer(e.problem.correctIndex, t); t += 10; e.next(t);
  }
  assert.equal(r.multiplier, 2);
  assert.equal(e.streak, 5);
  assert.equal(e.score, 15 * 1 * 4 + 15 * 2); // four x1 answers then one x2 (all fast: 10+5)
  const wrongIdx = (e.problem.correctIndex + 1) % 4;
  r = e.answer(wrongIdx, t + 3000);
  assert.equal(r.correct, false);
  assert.equal(e.lives, 2);
  assert.equal(e.streak, 0);
  e.next(t);
  e.answer((e.problem.correctIndex + 1) % 4, t); e.next(t);
  r = e.answer((e.problem.correctIndex + 1) % 4, t);
  assert.equal(r.over, 'lives');
});

test('blitz time cap and level-up bonus', () => {
  const e = new RunEngine({ kind: 'blitz', seed: 2 });
  e.next(0);
  let sawLevelUp = false;
  for (let i = 0; i < 25; i++) {
    const r = e.answer(e.problem.correctIndex, i * 500 + 400);
    if (r.leveledUp) { sawLevelUp = true; assert.ok(r.timeBonus >= RULES.blitz.levelBonus); }
    assert.ok(e.timeLeft <= RULES.blitz.maxTime);
    e.next(i * 500 + 500);
  }
  assert.ok(sawLevelUp);
  assert.equal(e.level, 3);
});

test('blitz clock runs out', () => {
  const e = new RunEngine({ kind: 'blitz', seed: 3 });
  e.next(0);
  let out = null;
  for (let i = 0; i < 400 && !out; i++) out = e.tick(0.1);
  assert.equal(out, 'timeout');
});

test('daily: 10 questions, same for everyone, ends with done', () => {
  const mk = () => new RunEngine({ kind: 'daily', seed: 'daily-2026-10-25' });
  const a = mk(), b = mk();
  let ra;
  for (let i = 0; i < 10; i++) {
    const pa = a.next(0), pb = b.next(0);
    assert.deepEqual(pa, pb);
    ra = a.answer(i % 3 === 0 ? -1 : pa.correctIndex, 1000);
    b.answer(i % 3 === 0 ? -1 : pb.correctIndex, 1000);
  }
  assert.equal(ra.over, 'done');
  assert.equal(a.history.length, 10);
  assert.equal(a.summary().correct, 6);
});

test('zen never ends', () => {
  const e = new RunEngine({ kind: 'zen', seed: 5 });
  e.next(0);
  for (let i = 0; i < 50; i++) { assert.equal(e.tick(10), null); const r = e.answer((e.problem.correctIndex + 1) % 4, 0); assert.equal(r.over, null); e.next(0); }
});

test('duel: first to target wins, wrong answers cost a point and lock', () => {
  const d = new DuelEngine({ seed: 9, target: 3 });
  let now = 0;
  let r = d.answer(0, d.problem.correctIndex, now);
  assert.equal(r.type, 'correct');
  r = d.answer(1, (d.problem.correctIndex + 1) % 4, now);
  assert.equal(r.type, 'wrong');
  assert.equal(d.scores[1], 0); // never below zero
  r = d.answer(1, d.problem.correctIndex, now + 100);
  assert.equal(r.type, 'ignored'); // locked
  r = d.answer(1, d.problem.correctIndex, now + 1500);
  assert.equal(r.type, 'correct');
  d.answer(0, d.problem.correctIndex, now + 2000);
  r = d.answer(0, d.problem.correctIndex, now + 2100);
  assert.equal(r.type, 'win');
  assert.equal(d.winner, 0);
  assert.equal(d.answer(1, 0, now + 9999).type, 'ignored');
});
