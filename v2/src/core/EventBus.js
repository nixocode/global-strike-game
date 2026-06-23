/**
 * Tiny synchronous pub/sub. Decouples sim ↔ render ↔ ui.
 * The simulation emits events; render and ui subscribe. Sim never imports them.
 */
export class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._handlers = new Map();
  }

  on(type, fn) {
    if (!this._handlers.has(type)) this._handlers.set(type, new Set());
    this._handlers.get(type).add(fn);
    return () => this.off(type, fn); // returns unsubscribe
  }

  once(type, fn) {
    const off = this.on(type, (payload) => {
      off();
      fn(payload);
    });
    return off;
  }

  off(type, fn) {
    this._handlers.get(type)?.delete(fn);
  }

  emit(type, payload) {
    const set = this._handlers.get(type);
    if (!set) return;
    // copy so handlers can subscribe/unsubscribe during dispatch
    for (const fn of [...set]) {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[EventBus] handler for "${type}" threw:`, err);
      }
    }
  }

  clear() {
    this._handlers.clear();
  }
}

/** Canonical event names — one place so emitters and listeners can't drift. */
export const EV = {
  // lifecycle
  GAME_START: 'game:start',
  GAME_OVER: 'game:over',
  PHASE_CHANGE: 'phase:change',
  TURN_BEGIN: 'turn:begin',
  TURN_END: 'turn:end',
  // combat
  MISSILE_LAUNCH: 'missile:launch',
  MISSILE_INTERCEPT: 'missile:intercept',
  MISSILE_IMPACT: 'missile:impact',
  CITY_HIT: 'city:hit',
  NATION_DESTROYED: 'nation:destroyed',
  // sim state
  FALLOUT_TICK: 'fallout:tick',
  WINTER_CHANGE: 'winter:change',
  DEFCON_CHANGE: 'defcon:change',
  SCORE_CHANGE: 'score:change',
  // ui plumbing
  LOG: 'log',
  TOAST: 'toast',
};
