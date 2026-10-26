// DuelEngine: two players race on the same problem. First to `target` wins.
// A wrong answer costs a point and locks that player out briefly.
// Pure logic with an injectable clock, so an online version can drive it with network events.

import { ProblemStream } from './problems.js';

export class DuelEngine {
  constructor({ seed, target = 10, mode = 'mix', lockMs = 1000 } = {}) {
    this.target = target;
    this.lockMs = lockMs;
    this.stream = new ProblemStream({ seed, mode });
    this.scores = [0, 0];
    this.lockedUntil = [0, 0];
    this.winner = null;
    this.rounds = 0;
    this.problem = null;
    this.next();
  }

  get level() {
    return Math.max(3, Math.min(7, 3 + Math.floor((this.scores[0] + this.scores[1]) / 4)));
  }

  next() {
    this.problem = this.stream.next(this.level);
    this.rounds++;
    return this.problem;
  }

  isLocked(player, now) { return now < this.lockedUntil[player]; }

  answer(player, index, now = performance.now()) {
    if (this.winner !== null) return { type: 'ignored' };
    if (this.isLocked(player, now)) return { type: 'ignored' };
    const problem = this.problem;

    if (index === problem.correctIndex) {
      this.scores[player]++;
      const res = { type: 'correct', player, index, problem, scores: this.scores.slice() };
      if (this.scores[player] >= this.target) { this.winner = player; res.type = 'win'; }
      else this.next();
      return res;
    }
    this.scores[player] = Math.max(0, this.scores[player] - 1);
    this.lockedUntil[player] = now + this.lockMs;
    return { type: 'wrong', player, index, problem, lockMs: this.lockMs, scores: this.scores.slice() };
  }
}
