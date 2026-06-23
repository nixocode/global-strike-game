/**
 * Mode profiles. Both modes run the SAME Simulation; a profile flips rules and tunes
 * constants. Nothing in the engine is hard-coded to a mode — it reads these flags.
 */
export const MODES = {
  realistic: {
    id: 'realistic',
    name: 'Realistic',
    icon: '🌍',
    tag: 'Simulation',
    desc: 'A grounded nuclear-war simulation. Manage a triad, read early warning, and try to win without ending the world.',
    feats: [
      'Triad: ICBM · SLBM · bombers',
      'Real flight times & layered defense',
      'Fallout & nuclear winter',
      'Win without breaking the planet',
    ],
    rules: {
      fallout: true,
      nuclearWinter: true,
      earlyWarning: true,
      realFlightTimes: true,
      restockWarheads: false,
      scoring: false,
      // outcome thresholds (fraction of world pop killed / nations wiped)
      apocalypsePopFrac: 0.55,
      apocalypseNations: 7,
      apocalypseWinter: 0.8, // runaway winter alone can doom the planet
      pyrrhicPopFrac: 0.3,
      pyrrhicNations: 4,
      pyrrhicWinter: 0.45, // a winter this deep taints any "victory"
    },
    physics: {
      gravity: 1.0, // debris falls back fast; no planet chunks
      chunkBudget: 0, // no earth chunks in realistic
      yieldScale: 1.0, // grounded blast radius
      screenShake: 0.25,
      arcScale: 1.0, // grounded missile arcs
    },
  },

  arcade: {
    id: 'arcade',
    name: 'Arcade',
    icon: '☄️',
    tag: 'Spectacle',
    desc: 'Pure spectacle. Giant warheads, infinite restock, and chunks of the planet flying off into space. Chain detonations for combos.',
    feats: [
      'Planet chunks blast into orbit',
      'Low-gravity debris & screen shake',
      'Combo multipliers & score chase',
      'Apocalypse is the finale, not a loss',
    ],
    rules: {
      fallout: false,
      nuclearWinter: false,
      earlyWarning: false,
      realFlightTimes: false,
      restockWarheads: true,
      scoring: true,
      apocalypsePopFrac: 2, // effectively never auto-ends
      apocalypseNations: 99,
      pyrrhicPopFrac: 2,
      pyrrhicNations: 99,
    },
    physics: {
      gravity: 0.18, // chunks drift & tumble in low gravity
      chunkBudget: 360, // pooled rocky debris rigid bodies
      yieldScale: 2.6, // oversized blasts
      screenShake: 1.0,
      arcScale: 1.3, // tall, dramatic arcs into space
    },
  },
};

export const MODE_LIST = [MODES.realistic, MODES.arcade];
