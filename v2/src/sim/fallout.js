/**
 * Fallout model (realistic mode). Each ground detonation seeds a radioactive
 * plume that drifts downwind, decays, and inflicts *delayed* casualties on any
 * population under it over the following turns. Pure logic — operates only on
 * GameState and its seeded RNG, emits nothing, touches no THREE/DOM.
 */
import { greatCircleKm } from './ballistics.js';

const PLUME_LIFETIME = 3; // turns a plume stays lethal
const BASE_RADIUS_KM = 650; // downwind lethal footprint of a baseline warhead
const LETHALITY = 0.16; // max per-turn fraction killed directly under a fresh plume
const DECAY = 0.6; // intensity multiplier each turn

/** Pick a prevailing wind for the run (seeded). Mostly eastward, jittered. */
export function initWind(state) {
  const r = state.rng;
  state._wind = { dLng: 4 + r.range(0, 4), dLat: r.range(-1.2, 1.2) }; // degrees/turn
}

/** Seed a plume at an impact point. Bigger yields → hotter, wider plumes. */
export function spawnFallout(state, { lat, lng, yieldMul = 1 }) {
  state.fallout.push({
    lat,
    lng,
    intensity: Math.min(1, 0.45 + yieldMul * 0.3),
    radiusKm: BASE_RADIUS_KM * (0.7 + yieldMul * 0.3),
    life: PLUME_LIFETIME,
  });
}

/**
 * Advance every plume one turn: drift downwind, kill under the footprint, decay.
 * Mutates city populations + casualty tallies. Returns a summary for logging.
 */
export function tickFallout(state) {
  if (!state.fallout.length) return { kills: 0, byNation: {} };
  const wind = state._wind || { dLng: 4, dLat: 0 };
  let kills = 0;
  const byNation = {};

  for (const p of state.fallout) {
    // drift downwind, wrapping longitude and clamping latitude
    p.lng += wind.dLng;
    if (p.lng > 180) p.lng -= 360;
    else if (p.lng < -180) p.lng += 360;
    p.lat = Math.max(-85, Math.min(85, p.lat + wind.dLat));

    for (const n of state.nations) {
      for (const c of n.cities) {
        if (c.pop <= 0) continue;
        const d = greatCircleKm(p.lat, p.lng, c.lat, c.lng);
        if (d > p.radiusKm) continue;
        const prox = 1 - d / p.radiusKm; // 0 at edge → 1 at centre
        const k = Math.round(c.pop * LETHALITY * p.intensity * prox);
        if (k <= 0) continue;
        c.pop = Math.max(0, c.pop - k);
        n.casualties += k;
        kills += k;
        byNation[n.id] = (byNation[n.id] || 0) + k;
      }
    }

    p.intensity *= DECAY;
    p.life -= 1;
  }

  state.fallout = state.fallout.filter((p) => p.life > 0 && p.intensity > 0.05);
  state.totalKills += kills;
  return { kills, byNation };
}
