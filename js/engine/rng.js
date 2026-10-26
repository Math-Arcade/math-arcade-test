// Seeded random numbers. Same seed => same sequence on every device,
// which is what makes the Daily Challenge (and later, online duels) fair.

function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

function mulberry32(a) {
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  constructor(seed = (Math.random() * 2 ** 32) >>> 0) {
    this.seed = seed;
    this._next = mulberry32(typeof seed === 'string' ? xmur3(seed) : seed >>> 0);
  }
  float() { return this._next(); }
  int(min, max) { return Math.floor(this._next() * (max - min + 1)) + min; }
  chance(p) { return this._next() < p; }
  pick(arr) { return arr[Math.floor(this._next() * arr.length)]; }
  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this._next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  // items: [[value, weight], ...]
  weighted(items) {
    let total = 0;
    for (const [, w] of items) total += w;
    let r = this._next() * total;
    for (const [v, w] of items) { r -= w; if (r < 0) return v; }
    return items[items.length - 1][0];
  }
}
