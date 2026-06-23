/**
 * Ballistics — pure math, no THREE. Flight time is derived from great-circle
 * distance so a Moscow→DC shot genuinely takes longer than a regional strike.
 */

const DEG = Math.PI / 180;
const EARTH_KM = 6371;

/** great-circle distance between two lat/lng points, in km */
export function greatCircleKm(aLat, aLng, bLat, bLng) {
  const dLat = (bLat - aLat) * DEG;
  const dLng = (bLng - aLng) * DEG;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * DEG) * Math.cos(bLat * DEG) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** angular separation 0..1 (0 = same point, 1 = antipode) — for arc height */
export function angularFrac(aLat, aLng, bLat, bLng) {
  return greatCircleKm(aLat, aLng, bLat, bLng) / (Math.PI * EARTH_KM);
}

// Per-leg flight envelope (SIM SECONDS), short-range → antipodal. Real force
// structure is preserved as *relative* speed — ICBMs fast, bombers slowest —
// but every leg is bounded to a watchable window so a turn never drags.
const LEG = {
  icbm: { minS: 3.0, maxS: 7.5, arc: 1.45 },
  slbm: { minS: 2.6, maxS: 6.5, arc: 1.40 },
  bomber: { minS: 6.0, maxS: 13.0, arc: 1.12 },
};

const ANTIPODE_KM = 19000; // ~max great-circle distance; normalizes range → 0..1

/**
 * Flight duration in SIM SECONDS for a munition.
 * @param {string} leg                 'icbm' | 'slbm' | 'bomber'
 * @param {number} km                  great-circle distance
 * @param {boolean} realFlightTimes    mode flag; false = snappy arcade timing
 */
export function flightDuration(leg, km, realFlightTimes) {
  const cfg = LEG[leg] || LEG.icbm;
  if (!realFlightTimes) {
    // arcade: slow, dramatic arcs you can watch climb and fall (range-scaled)
    return 5.0 + (km / ANTIPODE_KM) * 5.0;
  }
  // realistic: distance scaled into the leg's bounded window
  const frac = Math.min(1, km / ANTIPODE_KM);
  return cfg.minS + frac * (cfg.maxS - cfg.minS);
}

export function arcHeight(leg) {
  return (LEG[leg] || LEG.icbm).arc;
}
