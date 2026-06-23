/**
 * Decoupled loop: a fixed-timestep simulation update + a variable-rate render.
 * Sim runs in deterministic fixed steps (so physics/AI are reproducible);
 * render interpolates and runs as fast as the display allows.
 */
export class Loop {
  /**
   * @param {object} o
   * @param {(fixedDt:number)=>void} o.update   fixed-step sim tick (seconds)
   * @param {(dt:number, alpha:number)=>void} o.render  render tick (seconds, interp 0..1)
   * @param {number} [o.hz]  simulation frequency
   */
  constructor({ update, render, hz = 60 }) {
    this._update = update;
    this._render = render;
    this._fixed = 1 / hz;
    this._acc = 0;
    this._last = 0;
    this._raf = 0;
    this._running = false;
    this.timeScale = 1; // <1 = slow-mo; eases back to 1 each frame
    this._tick = this._tick.bind(this);
  }

  /** Kick into slow-motion; time then eases back to normal speed. */
  slowmo(scale = 0.35) {
    this.timeScale = Math.min(this.timeScale, scale);
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._last = performance.now();
    this._acc = 0;
    this._raf = requestAnimationFrame(this._tick);
  }

  stop() {
    this._running = false;
    cancelAnimationFrame(this._raf);
  }

  _tick(now) {
    if (!this._running) return;
    this._raf = requestAnimationFrame(this._tick);

    let frame = (now - this._last) / 1000;
    this._last = now;
    // Clamp huge gaps (tab was backgrounded) so we don't spiral the sim.
    if (frame > 0.25) frame = 0.25;

    // ease time-scale back to normal (slow-mo recovery)
    this.timeScale += (1 - this.timeScale) * Math.min(1, frame * 3.5);
    const scaled = frame * this.timeScale;

    this._acc += scaled;
    let steps = 0;
    while (this._acc >= this._fixed && steps < 5) {
      this._update(this._fixed);
      this._acc -= this._fixed;
      steps++;
    }
    const alpha = this._acc / this._fixed; // interpolation factor for render
    this._render(scaled, alpha);
  }
}
