/**
 * Nuclear winter (realistic mode). Soot lofted by detonations accrues a 0..1
 * severity index. Past an onset threshold it inflicts global per-turn attrition
 * — cold and famine that kill in *every* nation, regardless of who struck whom.
 * Pure logic: operates only on GameState. Emits nothing.
 */

const SOOT_PER_DET = 0.022; // base index per detonation — ~23 hits to reach apocalypse winter
const ONSET = 0.15; // index below which the climate still copes
const ATTRITION = 0.07; // per-turn global pop fraction lost at full winter

/** Add one detonation's soot to the index. Bigger yields loft more. */
export function accrueWinter(state, { yieldMul = 1 }) {
  state.winterIndex = Math.min(1, state.winterIndex + SOOT_PER_DET * (0.6 + yieldMul));
  return state.winterIndex;
}

/**
 * Apply one turn of nuclear-winter attrition across all nations.
 * No effect below onset. Mutates populations + tallies; returns a summary.
 */
export function tickWinter(state) {
  const w = state.winterIndex;
  if (w < ONSET) return { kills: 0, byNation: {}, frac: 0 };

  const frac = ATTRITION * ((w - ONSET) / (1 - ONSET)); // ramps from onset → full
  let kills = 0;
  const byNation = {};
  for (const n of state.nations) {
    for (const c of n.cities) {
      if (c.pop <= 0) continue;
      const k = Math.round(c.pop * frac);
      if (k <= 0) continue;
      c.pop = Math.max(0, c.pop - k);
      n.casualties += k;
      kills += k;
      byNation[n.id] = (byNation[n.id] || 0) + k;
    }
  }
  state.totalKills += kills;
  return { kills, byNation, frac };
}

/** Human-readable severity band for UI. */
export function winterStage(w) {
  if (w < ONSET) return 'none';
  if (w < 0.4) return 'cooling';
  if (w < 0.7) return 'winter';
  return 'severe';
}
