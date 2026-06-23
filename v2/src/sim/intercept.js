/**
 * Layered missile defense resolution — pure logic. A munition runs a gauntlet of
 * up to three intercept layers (boost → midcourse → terminal). Each layer rolls
 * independently; the first hit kills the munition and records the layer + the
 * flight fraction where it dies (so the renderer can stage the interceptor).
 *
 * Saturation: each prior inbound aimed at the same city this turn degrades the
 * defender's odds (interceptors and radars get overwhelmed).
 */

const LAYER_ORDER = ['boost', 'midcourse', 'terminal'];
// where along the flight each layer engages (fraction of trajectory)
const LAYER_T = { boost: 0.18, midcourse: 0.55, terminal: 0.86 };
// SLBMs are harder to catch in boost/midcourse (shorter burn, depressed trajectory)
const LEG_PENALTY = { icbm: 1.0, slbm: 0.8, bomber: 1.25 };

/**
 * @returns {{intercepted:boolean, layer?:string, t:number}}
 */
export function resolveIntercept(rng, { defenderDefense, doctrineBonus = 0, leg = 'icbm', saturationIdx = 0 }) {
  const satMul = Math.pow(0.72, saturationIdx); // each stacked inbound erodes defense
  const legMul = LEG_PENALTY[leg] ?? 1.0;

  for (const layer of LAYER_ORDER) {
    let p = (defenderDefense[layer] || 0) + doctrineBonus;
    p *= satMul * legMul;
    p = Math.max(0, Math.min(0.95, p));
    if (rng.chance(p)) {
      const jitter = rng.range(-0.04, 0.04);
      return { intercepted: true, layer, t: Math.max(0.1, LAYER_T[layer] + jitter) };
    }
  }
  return { intercepted: false, t: 1 };
}
