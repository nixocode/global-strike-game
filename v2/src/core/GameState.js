/**
 * Single source of truth for a run. No loose globals anywhere else.
 * Mutated only by the Simulation; read by render/ui. Cloned from data at game start.
 */
import { RNG } from './rng.js';

export const Phase = Object.freeze({
  MODE_SELECT: 'MODE_SELECT',
  SETUP: 'SETUP', // pick nation + doctrine
  PLANNING: 'PLANNING', // player queues orders
  RESOLVING: 'RESOLVING', // missiles in flight / impacts
  AI_TURN: 'AI_TURN',
  GAME_OVER: 'GAME_OVER',
});

export class GameState {
  constructor() {
    this.reset();
  }

  reset() {
    this.phase = Phase.MODE_SELECT;
    this.mode = null; // mode profile object
    this.seed = 0;
    this.rng = new RNG(0);

    this.turn = 0;
    this.defcon = 5;

    /** @type {object|null} player nation (a live nation ref) */
    this.player = null;
    this.playerDoctrine = null;
    /** @type {object[]} all live nations incl. player */
    this.nations = [];

    /** queued player orders for this turn */
    this.orders = [];
    /** warheads the player aimed at each nation on the last volley, by id (drives proportional AI retaliation) */
    this.lastIncoming = {};
    /** in-flight munitions (sim-side records, render mirrors them) */
    this.inflight = [];
    /** active fallout plumes (realistic mode) */
    this.fallout = [];

    this.winterIndex = 0; // 0..1 nuclear winter severity
    this.initialWorldPop = 0;
    this.totalKills = 0;

    // arcade scoring
    this.score = 0;
    this.combo = 0;
    this.comboTimer = 0;

    this.log = [];
  }

  // ── derived helpers (no mutation) ──
  worldPopAlive() {
    let s = 0;
    for (const n of this.nations) for (const c of n.cities) s += c.pop;
    return s;
  }

  worldDestroyedFrac() {
    if (!this.initialWorldPop) return 0;
    return Math.min(1, Math.max(0, 1 - this.worldPopAlive() / this.initialWorldPop));
  }

  aiNations() {
    return this.nations.filter((n) => n !== this.player);
  }

  nationById(id) {
    return this.nations.find((n) => n.id === id) || null;
  }

  isDestroyed(nation) {
    return nation.cities.every((c) => c.pop <= 0);
  }

  totalArsenal(nation) {
    const a = nation.arsenal;
    return a.icbm + a.slbm + a.bomber;
  }
}
