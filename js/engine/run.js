// RunEngine: the rules for Blitz, Daily and Zen. No DOM in here, so it is easy to test
// and easy to reuse when online play arrives.

import { ProblemStream, MAX_LEVEL } from './problems.js';

export const RULES = {
  blitz: { time: 30, maxTime: 40, lives: 3, levelEvery: 10, levelBonus: 5, bonus: [2.5, 2.5, 2.5, 2, 2, 2, 1.5, 1.5, 1.5, 1], fastBonus: 0.5 },
  daily: { questions: 10, qTime: 12, levels: [2, 2, 3, 3, 4, 5, 5, 6, 7, 7] },
  zen: { levelEvery: 8, maxLevel: 8 },
  fastMs: 2000,
  comboEvery: 5,
  maxMultiplier: 5,
};

export class RunEngine {
  constructor({ kind = 'blitz', mode = 'mix', seed } = {}) {
    this.kind = kind;
    this.mode = mode;
    this.stream = new ProblemStream({ seed, mode });
    this.reset();
  }

  reset() {
    const k = this.kind;
    this.score = 0; this.correct = 0; this.wrong = 0;
    this.streak = 0; this.bestStreak = 0;
    this.level = 1; this.maxLevel = 1;
    this.answered = 0; this.totalMs = 0;
    this.history = [];
    this.lives = k === 'blitz' ? RULES.blitz.lives : Infinity;
    this.timeLeft = k === 'blitz' ? RULES.blitz.time : k === 'daily' ? RULES.daily.qTime : Infinity;
    this.total = k === 'daily' ? RULES.daily.questions : Infinity;
    this.problem = null; this.qStart = 0; this.over = null;
  }

  get multiplier() { return Math.min(RULES.maxMultiplier, 1 + Math.floor(this.streak / RULES.comboEvery)); }

  levelFor() {
    if (this.kind === 'blitz') return Math.min(MAX_LEVEL, 1 + Math.floor(this.correct / RULES.blitz.levelEvery));
    if (this.kind === 'daily') return RULES.daily.levels[Math.min(this.answered, RULES.daily.levels.length - 1)];
    return Math.min(RULES.zen.maxLevel, 2 + Math.floor(this.correct / RULES.zen.levelEvery));
  }

  // progress toward the next level, 0..1 (blitz only)
  get levelProgress() {
    if (this.kind !== 'blitz' || this.level >= MAX_LEVEL) return 1;
    return (this.correct % RULES.blitz.levelEvery) / RULES.blitz.levelEvery;
  }

  next(now = performance.now()) {
    this.level = this.levelFor();
    this.maxLevel = Math.max(this.maxLevel, this.level);
    this.problem = this.stream.next(this.level);
    this.qStart = now;
    if (this.kind === 'daily') this.timeLeft = RULES.daily.qTime;
    return this.problem;
  }

  // dt in seconds. Returns 'timeout' when the clock hits zero.
  tick(dt) {
    if (this.over || this.kind === 'zen') return null;
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) { this.timeLeft = 0; return 'timeout'; }
    return null;
  }

  // index = -1 means "ran out of time" on a daily question
  answer(index, now = performance.now()) {
    const p = this.problem;
    const ms = Math.max(0, now - this.qStart);
    const correct = index === p.correctIndex;
    this.answered++;
    this.totalMs += ms;
    const res = {
      correct, index, correctIndex: p.correctIndex, ms,
      points: 0, timeBonus: 0, fast: false, leveledUp: false,
      multiplier: this.multiplier, over: null, timedOut: index < 0,
    };

    if (correct) {
      this.correct++; this.streak++;
      this.bestStreak = Math.max(this.bestStreak, this.streak);
      res.multiplier = this.multiplier;
      res.fast = ms <= RULES.fastMs;
      res.points = (10 + (res.fast ? 5 : 0)) * res.multiplier;
      this.score += res.points;

      if (this.kind === 'blitz') {
        res.timeBonus = RULES.blitz.bonus[this.level - 1] + (res.fast ? RULES.blitz.fastBonus : 0);
        if (this.levelFor() > this.level) {
          res.leveledUp = true;
          res.timeBonus += RULES.blitz.levelBonus;
        }
        this.timeLeft = Math.min(RULES.blitz.maxTime, this.timeLeft + res.timeBonus);
      } else if (this.levelFor() > this.level) {
        res.leveledUp = true;
      }
    } else {
      this.wrong++; this.streak = 0;
      res.multiplier = 1;
      if (this.kind === 'blitz') {
        this.lives--;
        if (this.lives <= 0) res.over = 'lives';
      }
    }

    if (this.kind === 'daily') {
      this.history.push(correct);
      if (this.answered >= this.total) res.over = 'done';
    }
    this.over = res.over;
    return res;
  }

  finish(reason) { this.over = reason; }

  summary() {
    const n = this.answered;
    return {
      kind: this.kind, mode: this.mode,
      score: this.score, correct: this.correct, wrong: this.wrong, answered: n,
      accuracy: n ? this.correct / n : 0,
      bestStreak: this.bestStreak, maxLevel: this.maxLevel,
      avgMs: n ? this.totalMs / n : 0,
      history: this.history.slice(),
      over: this.over,
    };
  }
}
