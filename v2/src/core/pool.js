/**
 * Generic object pool. Every persistent visual body (debris chunk, missile, puff)
 * is acquired from a pool and released back — never allocated in the hot loop.
 * This is the difference between smooth and GC-stutter, especially on mobile.
 */
export class Pool {
  /**
   * @param {() => T} factory      build a fresh object
   * @param {(o:T)=>void} [reset]   reset an object before reuse
   * @template T
   */
  constructor(factory, reset = () => {}) {
    this._factory = factory;
    this._reset = reset;
    this._free = [];
    this._live = new Set();
  }

  acquire() {
    const obj = this._free.pop() ?? this._factory();
    this._live.add(obj);
    return obj;
  }

  release(obj) {
    if (!this._live.delete(obj)) return;
    this._reset(obj);
    this._free.push(obj);
  }

  /** release everything currently live (e.g. on game reset) */
  releaseAll() {
    for (const obj of this._live) {
      this._reset(obj);
      this._free.push(obj);
    }
    this._live.clear();
  }

  get liveCount() {
    return this._live.size;
  }

  forEachLive(fn) {
    for (const obj of this._live) fn(obj);
  }

  /** pre-build n objects so the first burst doesn't allocate */
  warm(n) {
    for (let i = 0; i < n; i++) this._free.push(this._factory());
    return this;
  }
}
