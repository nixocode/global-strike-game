/**
 * Local persistence for records + preferences. Pure localStorage, fail-safe:
 * if storage is unavailable (privacy mode, etc.) every call degrades to a no-op
 * with sane defaults so the game never breaks over a missing record.
 */
const KEY = 'globalStrike.v2';

const DEFAULTS = {
  records: {
    arcade: { bestScore: 0, mostKills: 0, games: 0 },
    realistic: { wins: 0, bestEarthPct: 0, games: 0 },
  },
  prefs: { sound: true },
};

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const data = JSON.parse(raw);
    // shallow-merge so new fields in DEFAULTS appear for old saves
    return {
      records: {
        arcade: { ...DEFAULTS.records.arcade, ...(data.records?.arcade) },
        realistic: { ...DEFAULTS.records.realistic, ...(data.records?.realistic) },
      },
      prefs: { ...DEFAULTS.prefs, ...(data.prefs) },
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

function write(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage unavailable — silently skip */
  }
}

export const Store = {
  records(modeId) {
    return read().records[modeId] || {};
  },

  prefs() {
    return read().prefs;
  },

  setPref(key, value) {
    const data = read();
    data.prefs[key] = value;
    write(data);
    return data.prefs;
  },

  /**
   * Fold a finished game into the records. Returns { newRecord, records }
   * so the game-over screen can celebrate a fresh best.
   */
  recordGame({ modeId, score = 0, kills = 0, outcome, earthPct = 0 }) {
    const data = read();
    const r = data.records[modeId];
    let newRecord = false;
    r.games = (r.games || 0) + 1;

    if (modeId === 'arcade') {
      if (score > (r.bestScore || 0)) { r.bestScore = score; newRecord = true; }
      if (kills > (r.mostKills || 0)) r.mostKills = kills;
    } else {
      const won = outcome === 'victory' || outcome === 'pyrrhic';
      if (won) r.wins = (r.wins || 0) + 1;
      // only a clean victory counts toward the "planet saved" record
      if (outcome === 'victory' && earthPct > (r.bestEarthPct || 0)) {
        r.bestEarthPct = earthPct; newRecord = true;
      }
    }

    write(data);
    return { newRecord, records: r };
  },
};
