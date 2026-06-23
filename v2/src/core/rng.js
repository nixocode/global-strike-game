/**
 * Seeded deterministic RNG (mulberry32). All game randomness must flow through an
 * instance of this so runs are reproducible and scoring is fair/verifiable.
 */
export class RNG {
  constructor(seed = Date.now()) {
    this.seed = seed >>> 0;
    this._s = this.seed;
  }

  /** float in [0,1) */
  next() {
    this._s |= 0;
    this._s = (this._s + 0x6d2b79f5) | 0;
    let t = Math.imul(this._s ^ (this._s >>> 15), 1 | this._s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** float in [min,max) */
  range(min, max) {
    return min + this.next() * (max - min);
  }

  /** int in [min,max] inclusive */
  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }

  /** true with probability p */
  chance(p) {
    return this.next() < p;
  }

  /** random element of an array */
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** in-place Fisher–Yates shuffle */
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  reset() {
    this._s = this.seed;
  }
}

/** Make a short human-typable seed string from a number. */
export function seedToString(seed) {
  return (seed >>> 0).toString(36).toUpperCase().padStart(6, '0');
}

/** Parse a seed string back to a number (or hash arbitrary text into one). */
export function stringToSeed(str) {
  if (/^[0-9a-z]+$/i.test(str) && str.length <= 7) {
    const n = parseInt(str, 36);
    if (!Number.isNaN(n)) return n >>> 0;
  }
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
