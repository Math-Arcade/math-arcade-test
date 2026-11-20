import test from 'node:test';
import assert from 'node:assert/strict';
import { RNG } from '../js/engine/rng.js';
import { generate, ProblemStream, MAX_LEVEL, TYPES, UNLOCK, INTRO, FORMAT_OF, isValidChoice, revealText } from '../js/engine/problems.js';
import { otherCompletions, fitsRule, fitsAnyPattern } from '../js/engine/sequences.js';
import { RunEngine, RULES, LEVEL_AT, levelForCorrect } from '../js/engine/run.js';
import { DuelEngine } from '../js/engine/duel.js';
import { evalExpr, equationHolds, literals, complexity } from './helpers/expr.mjs';

const ALL = Object.keys(TYPES);
const EXPECTED_BUTTONS = { number: 4, sequence: 4, equations: 4, compare: 3 };

test('every question type x level builds a valid question with exactly one correct answer', () => {
  const rng = new RNG(2026);
  for (let level = 1; level <= MAX_LEVEL; level++) {
    for (const type of ALL) {
      for (let i = 0; i < 60; i++) {
        const p = generate(rng, { level, type });
        const ctx = `${type} L${level}: ${p.text}`;
        assert.equal(p.type, type, ctx);
        assert.equal(p.format, FORMAT_OF[type], ctx);
        assert.equal(p.choices.length, EXPECTED_BUTTONS[p.format], `button count ${ctx}`);
        assert.equal(new Set(p.choices).size, p.choices.length, `duplicate choices ${ctx}`);
        assert.equal(p.choices.filter((c) => c === p.answer).length, 1, `answer must appear once ${ctx}`);
        assert.equal(p.choices[p.correctIndex], p.answer, ctx);
        assert.ok(typeof p.key === 'string' && p.key.length, ctx);
        assert.ok(!/NaN|undefined/.test(JSON.stringify(p)), ctx);
        for (let k = 0; k < p.choices.length; k++) assert.ok(isValidChoice(p, k));
        assert.ok(!isValidChoice(p, p.choices.length) && !isValidChoice(p, -1));
      }
    }
  }
});

test('find the incorrect equation: exactly one false equation, three true, no formatting tells', () => {
  const rng = new RNG(11);
  for (let level = 4; level <= MAX_LEVEL; level++) {
    for (let i = 0; i < 400; i++) {
      const p = generate(rng, { level, type: 'incorrect' });
      const ctx = `L${level}: ${p.choices.join(' | ')}`;
      const verdicts = p.choices.map(equationHolds);
      assert.equal(verdicts.filter((v) => !v).length, 1, `exactly one false ${ctx}`);
      assert.equal(verdicts[p.correctIndex], false, `correctIndex points at the false one ${ctx}`);
      assert.deepEqual(p.valid, verdicts, ctx);
      assert.equal(p.answer, p.choices[p.correctIndex], ctx);
      assert.equal(new Set(p.choices).size, 4, ctx);
      assert.equal(new Set(p.choices.map((c) => c.split(' = ')[0])).size, 4, `four different expressions ${ctx}`);
      // the false equation is a believable slip: close to the truth, same sign family
      const bad = p.choices[p.correctIndex];
      const [lhs, rhs] = bad.split(' = ');
      const truth = evalExpr(lhs), shown = Number(rhs.replace('−', '-'));
      assert.ok(Math.abs(shown - truth) <= Math.max(12, Math.ceil(Math.abs(truth) * 0.35)), `wild outlier ${bad}`);
      if (truth >= 0) assert.ok(shown >= 0, `sign tell ${bad}`);
      // all four are the same kind of thing: complexity within one concept-step of each other
      const cs = p.choices.map((c) => complexity(c.split(' = ')[0]));
      assert.ok(Math.max(...cs) - Math.min(...cs) <= 3, `complexity tell ${ctx}`);
    }
  }
});

test('number sequences: provable rule, unique completion, valid distractors', () => {
  const rng = new RNG(5);
  for (let level = 5; level <= MAX_LEVEL; level++) {
    for (let i = 0; i < 250; i++) {
      const p = generate(rng, { level, type: 'sequence' });
      const ctx = `L${level} ${p.rule}: ${p.text}`;
      assert.equal(p.seq[p.hole], p.answer, ctx);
      assert.ok(fitsRule(p.rule, p.seq), `intended rule must describe the full sequence ${ctx}`);
      assert.equal(p.text.split(', ').length, p.seq.length, ctx);
      assert.equal(p.text.split(', ').indexOf('?'), p.hole, ctx);
      assert.ok(p.seq.length >= 5, ctx);
      // unambiguous: no other value completes the sequence into ANY known pattern (wide search)
      assert.deepEqual(otherCompletions(p.seq, p.hole, 12 * Math.max(...p.seq.map(Math.abs)) + 400), [], `ambiguous ${ctx}`);
      // so none of the three wrong options can be defended either
      for (const c of p.choices) if (c !== p.answer) {
        const t = p.seq.slice(); t[p.hole] = c;
        assert.ok(!fitsAnyPattern(t), `distractor ${c} fits a pattern ${ctx}`);
      }
      // independent check for the two classic rules
      const ts = p.seq.slice(); ts[p.hole] = p.answer;
      if (p.rule === 'arith') assert.equal(new Set(ts.slice(1).map((v, k) => v - ts[k])).size, 1, ctx);
      if (p.rule === 'geom') assert.equal(new Set(ts.slice(1).map((v, k) => v / ts[k])).size, 1, ctx);
    }
  }
});

test('sequences start simple and add rules gradually', () => {
  const rng = new RNG(8);
  const rules = (lvl) => new Set(Array.from({ length: 400 }, () => generate(rng, { level: lvl, type: 'sequence' }).rule));
  assert.deepEqual([...rules(5)], ['arith']);
  assert.ok(rules(6).has('geom') && !rules(6).has('squares'));
  assert.ok(rules(7).has('squares'));
  assert.ok(rules(9).size >= 7);
  for (let i = 0; i < 300; i++) assert.ok(generate(rng, { level: 5, type: 'sequence' }).hole >= 2, 'level 5 never hides the first terms');
});

test('equation comparison: both sides evaluate correctly and the relation is right', () => {
  const rng = new RNG(21);
  const seen = { '>': 0, '=': 0, '<': 0 };
  for (let level = 6; level <= MAX_LEVEL; level++) {
    for (let i = 0; i < 400; i++) {
      const p = generate(rng, { level, type: 'compare' });
      const ctx = `L${level}: ${p.text}`;
      assert.deepEqual(p.choices, ['>', '=', '<'], ctx);
      const [l, r] = p.text.split(' ? ');
      assert.equal(l, p.left); assert.equal(r, p.right);
      const lv = evalExpr(l), rv = evalExpr(r);
      assert.equal(lv, p.leftValue, ctx); assert.equal(rv, p.rightValue, ctx);
      const rel = lv > rv ? '>' : lv < rv ? '<' : '=';
      assert.equal(p.answer, rel, ctx);
      assert.equal(p.choices[p.correctIndex], rel, ctx);
      assert.notEqual(l, r, ctx);
      // quick to do in your head: small values, short expressions
      assert.ok(Math.max(Math.abs(lv), Math.abs(rv)) <= 200, `too big ${ctx}`);
      assert.ok(complexity(l) <= 4 && complexity(r) <= 4, `too long ${ctx}`);
      assert.ok(Math.abs(lv - rv) <= 12, `sides should be close ${ctx}`);
      seen[rel]++;
    }
  }
  const total = seen['>'] + seen['='] + seen['<'];
  for (const k of Object.keys(seen)) assert.ok(seen[k] / total > 0.2 && seen[k] / total < 0.45, `relation mix is lopsided: ${JSON.stringify(seen)}`);
});

test('unlock progression follows the specified levels', () => {
  assert.deepEqual(
    { add: UNLOCK.add, mul: UNLOCK.mul, div: UNLOCK.div, sub: UNLOCK.sub, incorrect: UNLOCK.incorrect, sequence: UNLOCK.sequence, compare: UNLOCK.compare, sq: UNLOCK.sq, sqrt: UNLOCK.sqrt, paren: UNLOCK.paren, combo: UNLOCK.combo },
    { add: 1, mul: 2, div: 3, sub: 3, incorrect: 4, sequence: 5, compare: 6, sq: 7, sqrt: 8, paren: 9, combo: 10 });
  const rng = new RNG(99);
  const seenAt = (lvl) => { const m = new Map(); for (let i = 0; i < 4000; i++) { const t = generate(rng, { level: lvl }).type; m.set(t, (m.get(t) || 0) + 1); } return m; };
  for (let lvl = 1; lvl <= MAX_LEVEL; lvl++) {
    const seen = seenAt(lvl);
    for (const t of seen.keys()) assert.ok(UNLOCK[t] <= lvl, `${t} appeared at level ${lvl}, unlocks at ${UNLOCK[t]}`);
    for (const t of ALL) {
      if (UNLOCK[t] <= lvl) assert.ok(seen.has(t), `${t} (unlocked at ${UNLOCK[t]}) is missing at level ${lvl}: previously unlocked types must keep appearing`);
    }
  }
});

test('the first question of a new level introduces what that level unlocks', () => {
  const s = new ProblemStream({ seed: 4, intro: true });
  let prev = 0;
  for (let lvl = 1; lvl <= MAX_LEVEL; lvl++) {
    for (let k = 0; k < 6; k++) {
      const p = s.next(lvl);
      if (k === 0 && lvl > 1 && INTRO[lvl]) assert.equal(p.type, INTRO[lvl], `level ${lvl} should open with ${INTRO[lvl]}`);
    }
    prev = lvl;
  }
  assert.equal(prev, MAX_LEVEL);
});

test('same seed, same questions in every format (seeded determinism)', () => {
  for (const intro of [false, true]) {
    const mk = () => new ProblemStream({ seed: 'daily-2026-11-20', intro });
    const a = mk(), b = mk();
    const sa = [], sb = [];
    for (let i = 0; i < 120; i++) { const lvl = 1 + Math.floor(i / 10); sa.push(a.next(lvl)); sb.push(b.next(lvl)); }
    assert.deepEqual(sa, sb);
    assert.ok(new Set(sa.map((p) => p.format)).size === 4, 'a long run touches every format');
  }
});

test('special formats never repeat back to back, and no question repeats', () => {
  const s = new ProblemStream({ seed: 31 });
  let last = null;
  for (let i = 0; i < 600; i++) {
    const p = s.next(6 + (i % 6));
    if (last) { assert.notEqual(p.key, last.key); if (p.format !== 'number') assert.notEqual(p.format, last.format); }
    last = p;
  }
});

test('answer validation works for every format (and rejects impossible buttons)', () => {
  const rng = new RNG(1);
  for (const type of ['add', 'incorrect', 'sequence', 'compare']) {
    const level = Math.max(6, UNLOCK[type]);
    const e = new RunEngine({ kind: 'zen', seed: 1 });
    for (let i = 0; i < 20; i++) {
      e.problem = generate(rng, { level, type });
      e.qStart = 0;
      const p = e.problem;
      const right = e.answer(p.correctIndex, 100);
      assert.equal(right.correct, true, type);
      e.problem = p;
      for (let k = 0; k < p.choices.length; k++) if (k !== p.correctIndex) assert.equal(e.answer(k, 100).correct, false, `${type} button ${k}`);
      assert.equal(e.answer(p.choices.length, 100).correct, false, `${type}: a 4th button on a 3-choice question`);
      assert.equal(e.answer(-1, 100).correct, false);
    }
  }
});

test('reveal text fills in the answer for every format', () => {
  const rng = new RNG(6);
  assert.match(revealText(generate(rng, { level: 6, type: 'compare' })), /^.+ [><=] .+$/);
  const q = generate(rng, { level: 5, type: 'sequence' });
  assert.ok(!revealText(q).includes('?') && revealText(q).includes(String(q.answer).replace('-', '−')));
  const e = generate(rng, { level: 4, type: 'incorrect' });
  assert.equal(revealText(e), e.text);
});

test('difficulty grows through concepts, not through big numbers', () => {
  const rng = new RNG(77);
  const stats = [];
  for (let lvl = 1; lvl <= MAX_LEVEL; lvl++) {
    let maxLit = 0, cx = 0, n = 0, special = 0;
    for (let i = 0; i < 1500; i++) {
      const p = generate(rng, { level: lvl });
      if (p.format !== 'number') special++;
      const exprs = p.format === 'equations' ? p.choices.map((c) => c.split(' = ')[0]) : p.format === 'compare' ? [p.left, p.right] : p.format === 'number' && !p.text.includes('= ?') ? [] : p.format === 'number' ? [p.text.replace(' = ?', '')] : [];
      for (const x of exprs) { maxLit = Math.max(maxLit, ...literals(x)); cx += complexity(x); n++; }
    }
    stats.push({ lvl, maxLit, cx: n ? cx / n : 0, special: special / 1500 });
  }
  // numbers stay small: nothing near the old 3-digit sums and 75 x 9 products
  for (const s of stats) assert.ok(s.maxLit <= 260, `level ${s.lvl} uses numbers up to ${s.maxLit}`);
  // complexity per question never drops from band to band and ends clearly richer (early levels are single-operation by design;
  // their difficulty comes from new concepts, which the unlock test covers)
  const avg = (a, b) => stats.slice(a - 1, b).reduce((t, s) => t + s.cx, 0) / (b - a + 1);
  assert.ok(avg(4, 6) >= avg(1, 3), 'intermediate is at least as complex as easy');
  assert.ok(avg(7, 9) > avg(4, 6), 'hard more complex than intermediate');
  assert.ok(avg(10, 12) > avg(7, 9), '10+ more complex than hard');
  // variety: no special formats before level 4, plenty once they are all unlocked
  assert.equal(stats[2].special, 0);
  assert.ok(stats[3].special > 0.2 && stats[5].special > 0.3 && stats[8].special > 0.2 && stats[5].special < 0.6, JSON.stringify(stats.map((x) => +x.special.toFixed(2))));
});

test('level curve: intermediate comes sooner, the road to hard is slower', () => {
  const OLD_EVERY = 10; // old curve: a level every 10 correct answers
  assert.ok(LEVEL_AT[4] <= 20 && LEVEL_AT[4] < 3 * OLD_EVERY, 'first intermediate level (4) is reached earlier than before');
  const toHard = LEVEL_AT[7] - LEVEL_AT[4];
  assert.ok(toHard > 3 * OLD_EVERY, `intermediate -> hard takes ${toHard} correct answers (was 30)`);
  const steps = RULES.blitz.levelSteps;
  assert.equal(steps.length, MAX_LEVEL - 1);
  for (let i = 1; i < steps.length; i++) assert.ok(steps[i] >= steps[i - 1], `levels never get shorter (${steps})`);
  for (let l = 1; l < MAX_LEVEL; l++) assert.equal(levelForCorrect(LEVEL_AT[l + 1] - 1), l), assert.equal(levelForCorrect(LEVEL_AT[l + 1]), l + 1);
  assert.equal(levelForCorrect(10 ** 6), MAX_LEVEL);
});

test('blitz walks the whole curve and each format arrives on schedule', () => {
  const e = new RunEngine({ kind: 'blitz', seed: 12 });
  const firstSeen = {}, firstAtLevel = {};
  let t = 0;
  e.next(t);
  for (let i = 0; i < LEVEL_AT[MAX_LEVEL] + 20; i++) {
    firstSeen[e.problem.type] ??= e.level;
    firstAtLevel[e.level] ??= e.problem.type;
    assert.ok(UNLOCK[e.problem.type] <= e.level, `${e.problem.type} at level ${e.level}`);
    t += 400;
    const r = e.answer(e.problem.correctIndex, t);
    assert.equal(r.correct, true);
    assert.ok(e.timeLeft <= RULES.blitz.maxTime);
    e.next(t);
  }
  // every level that has an intro type opened with it, and every type was first seen at (or after) its unlock level
  for (const [lvl, type] of Object.entries(INTRO)) assert.equal(firstAtLevel[lvl], type, `level ${lvl} opens with ${type}`);
  for (const [type, lvl] of Object.entries(firstSeen)) assert.ok(lvl >= UNLOCK[type], `${type} seen at ${lvl}`);
  assert.equal(e.level, MAX_LEVEL);
});

test('slow formats earn a little extra clock in Blitz', () => {
  const bonus = (type, level) => {
    const e = new RunEngine({ kind: 'blitz', seed: 1 });
    e.next(0); e.level = level; e.problem = generate(new RNG(3), { level, type });
    return e.answer(e.problem.correctIndex, 5000).timeBonus; // slow answer: no fast bonus
  };
  assert.ok(bonus('incorrect', 5) > bonus('compare', 5) && bonus('compare', 5) > bonus('add', 5));
  assert.ok(bonus('sequence', 5) > bonus('add', 5));
});

test('daily: levels follow the curve, only unlocked types, ten questions with real variety', () => {
  const e = new RunEngine({ kind: 'daily', seed: 'daily-2026-11-20' });
  const types = new Set(), formats = new Set();
  for (let i = 0; i < 10; i++) {
    const p = e.next(0);
    assert.ok(UNLOCK[p.type] <= RULES.daily.levels[i]);
    types.add(p.type); formats.add(p.format);
    e.answer(p.correctIndex, 1000);
  }
  assert.ok(types.size >= 6 && formats.size >= 4, `${[...types]} / ${[...formats]}`); // incorrect, sequence, compare and number all appear
  for (let i = 1; i < RULES.daily.levels.length; i++) assert.ok(RULES.daily.levels[i] >= RULES.daily.levels[i - 1]);
});

test('zen starts at level 2 and climbs on the same curve up to its cap', () => {
  const e = new RunEngine({ kind: 'zen', seed: 5 });
  e.next(0);
  assert.equal(e.level, 2);
  for (let i = 0; i < 200; i++) { assert.ok(UNLOCK[e.problem.type] <= e.level); e.answer(e.problem.correctIndex, 0); e.next(0); }
  assert.equal(e.level, RULES.zen.maxLevel);
});

test('duel keeps its four-number-button layout (number-answer questions only)', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const d = new DuelEngine({ seed, target: 50 });
    for (let i = 0; i < 80; i++) {
      assert.equal(d.problem.format, 'number');
      assert.equal(d.problem.choices.length, 4);
      d.answer(i % 2, d.problem.correctIndex, i * 5000);
      if (d.winner !== null) break;
    }
  }
});

test('single-operation modes stay numeric and keep their operation (negatives only from level 3)', () => {
  const rng = new RNG(13);
  for (let level = 1; level <= MAX_LEVEL; level++) {
    for (let i = 0; i < 300; i++) {
      const p = generate(rng, { mode: 'sub', level });
      assert.equal(p.format, 'number');
      if (level < 3 && p.type === 'sub') assert.ok(p.answer >= 0, `negative result before level 3: ${p.text}`);
    }
  }
  let neg = 0;
  for (let i = 0; i < 600; i++) if (generate(rng, { mode: 'mix', level: 3, type: 'sub' }).answer < 0) neg++;
  assert.ok(neg > 60 && neg < 300, `negative results appear at level 3 (${neg}/600)`);
});
