import { EV } from '../core/EventBus.js';

/**
 * Synthesized SFX + ambient bed via Web Audio — no asset files. Subscribes to
 * game events and plays procedural sounds: launch whoosh, impact booms, intercept
 * zaps, DEFCON sirens, a sub-bass collapse gut-punch, and a low ambient drone.
 *
 * The AudioContext is created lazily and resumed on first user gesture (browsers
 * block autoplay). Output runs through a compressor so stacked booms never clip.
 */
export class AudioManager {
  constructor(bus) {
    this.bus = bus;
    this.enabled = true;
    this.ctx = null;
    this._lastBoom = 0;

    bus.on(EV.GAME_START, () => { this._ensure(); this._startAmbient(); });
    bus.on(EV.MISSILE_LAUNCH, (m) => this.launch(m));
    bus.on(EV.MISSILE_INTERCEPT, () => this.zap());
    bus.on(EV.MISSILE_IMPACT, (m) => this.boom(m?.yieldMul || 1));
    bus.on(EV.DEFCON_CHANGE, ({ level }) => { if (level <= 2) this.siren(); });
    bus.on('vfx:collapse', () => this.collapse());
    bus.on(EV.GAME_OVER, () => this._stopAmbient());

    // resume on any pointer/key (covers the autoplay policy)
    const resume = () => this.ctx && this.ctx.state === 'suspended' && this.ctx.resume();
    window.addEventListener('pointerdown', resume);
    window.addEventListener('keydown', resume);
  }

  _ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.4;
    this.comp = this.ctx.createDynamicsCompressor();
    this.master.connect(this.comp);
    this.comp.connect(this.ctx.destination);
    // reusable white-noise buffer
    const len = this.ctx.sampleRate * 1.5;
    this._noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this._noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  toggle() { this.enabled = !this.enabled; if (this.master) this.master.gain.value = this.enabled ? 0.4 : 0; }

  _noiseSrc() { const s = this.ctx.createBufferSource(); s.buffer = this._noise; s.loop = true; return s; }
  _env(g, t0, peak, attack, decay) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }

  // ── individual sounds ──────────────────────────────────────
  launch() {
    if (!this._ok()) return;
    const t = this.ctx.currentTime, src = this._noiseSrc(), bp = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(1800, t + 0.5);
    this._env(g, t, 0.25, 0.05, 0.5);
    src.connect(bp); bp.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 0.65);
  }

  boom(intensity = 1) {
    if (!this._ok()) return;
    const t = this.ctx.currentTime;
    if (t - this._lastBoom < 0.035) return; // throttle stacked impacts
    this._lastBoom = t;
    const amp = Math.min(1, 0.5 + intensity * 0.25);
    // body: filtered noise
    const src = this._noiseSrc(), lp = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(120, t + 0.4);
    this._env(g, t, 0.5 * amp, 0.008, 0.45);
    src.connect(lp); lp.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 0.5);
    // thump: sine sweep down
    const o = this.ctx.createOscillator(), og = this.ctx.createGain();
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.35);
    this._env(og, t, 0.6 * amp, 0.01, 0.4);
    o.connect(og); og.connect(this.master);
    o.start(t); o.stop(t + 0.45);
  }

  zap() {
    if (!this._ok()) return;
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'square'; o.frequency.setValueAtTime(900, t); o.frequency.exponentialRampToValueAtTime(1700, t + 0.07);
    this._env(g, t, 0.12, 0.005, 0.08);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.1);
  }

  siren() {
    if (!this._ok()) return;
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(520, t); o.frequency.linearRampToValueAtTime(700, t + 0.3);
    o.frequency.linearRampToValueAtTime(520, t + 0.6);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.14, t + 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.75);
  }

  collapse() {
    if (!this._ok()) return;
    const t = this.ctx.currentTime;
    // sub gut-punch
    const o = this.ctx.createOscillator(), og = this.ctx.createGain();
    o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(24, t + 1.6);
    this._env(og, t, 0.9, 0.02, 1.7);
    o.connect(og); og.connect(this.master); o.start(t); o.stop(t + 1.8);
    // rumble wash
    const src = this._noiseSrc(), lp = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(400, t); lp.frequency.exponentialRampToValueAtTime(80, t + 2);
    this._env(g, t, 0.5, 0.05, 2.0);
    src.connect(lp); lp.connect(g); g.connect(this.master); src.start(t); src.stop(t + 2.2);
  }

  // ── ambient drone ──────────────────────────────────────────
  _startAmbient() {
    if (!this._ok() || this._ambient) return;
    const t = this.ctx.currentTime, g = this.ctx.createGain();
    g.gain.value = 0.06;
    const a = this.ctx.createOscillator(), b = this.ctx.createOscillator();
    a.type = b.type = 'sawtooth';
    a.frequency.value = 55; b.frequency.value = 55.4; // slight detune → slow beating
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
    a.connect(lp); b.connect(lp); lp.connect(g); g.connect(this.master);
    a.start(t); b.start(t);
    this._ambient = { a, b, g };
  }
  _stopAmbient() {
    if (!this._ambient) return;
    const t = this.ctx.currentTime;
    this._ambient.g.gain.linearRampToValueAtTime(0.0001, t + 1.5);
    this._ambient.a.stop(t + 1.6); this._ambient.b.stop(t + 1.6);
    this._ambient = null;
  }

  _ok() { this._ensure(); return this.enabled && this.ctx; }
}
