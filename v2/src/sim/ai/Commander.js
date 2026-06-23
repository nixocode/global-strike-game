import { doctrineById } from '../../data/doctrines.js';

/**
 * Strategic AI with a proportional escalation ladder. Each enemy answers what it
 * actually took — a measured second strike, amplified by its doctrine and by how
 * far the war has already climbed — rather than emptying its silos on contact.
 * This is what keeps realistic mode winnable: a small exchange stays a small
 * exchange, while a sustained slugfest is what tips the planet into nuclear winter.
 */
export class Commander {
  constructor(state, bus) {
    this.s = state;
    this.bus = bus;
  }

  /**
   * How far up the ladder the war has climbed (0..1). Driven by cumulative
   * devastation plus a slow per-turn drift, so reserves erode and gloves come off
   * only as the conflict actually escalates.
   */
  _escalation() {
    const s = this.s;
    const dmg = s.worldDestroyedFrac(); // 0..1 of world population already lost
    const winter = s.winterIndex || 0;
    return Math.min(1, dmg * 2.4 + winter * 0.6 + (s.turn - 1) * 0.07);
  }

  planRetaliation() {
    const s = this.s;
    const orders = [];
    const player = s.player;
    const targets = this._valueTargets(player);
    if (targets.length === 0) return orders;

    const incoming = s.lastIncoming || {};
    const rung = this._escalation();

    for (const ai of s.aiNations()) {
      if (s.isDestroyed(ai)) continue;
      const total = s.totalArsenal(ai);
      if (total <= 0) continue;

      const doc = doctrineById(ai.doctrine);
      const inc = incoming[ai.id] || 0; // warheads the player aimed here this turn

      // proportional second strike: answer what you took, scaled by how willing
      // this doctrine is to escalate and by the current rung of the ladder.
      const ratio = 0.8 + doc.aggression * 1.2; // 0.8 .. 2.0 returned per incoming
      let shots = Math.ceil(inc * ratio * (0.7 + rung));

      // nations the player ignored: aggressive powers pile on once the war is
      // underway; restrained ones hold their fire until directly struck.
      if (inc === 0) {
        shots = Math.round(rung * (doc.aggression > 0.6 ? 4 : 1.5));
      } else if (s.turn === 1 && doc.aggression > 0.7) {
        shots += 1; // first-strike personalities open a touch heavier
      }

      // survival reserve: deep for restrained doctrines, eroding as the war climbs.
      const reserveFrac = Math.max(0.1, 0.55 * doc.restraint * (1 - rung * 0.8));
      const cap = Math.floor(total * (1 - reserveFrac));
      shots = Math.max(0, Math.min(shots, cap, total));
      if (shots <= 0) continue;

      for (let i = 0; i < shots; i++) {
        const leg = this._pickLeg(ai);
        if (!leg) break;
        // saturate the top targets: concentrate fire on the highest-value city,
        // spilling to the next as earlier ones get hammered
        const tgt = targets[Math.min(i % Math.max(1, Math.ceil(shots / 2)), targets.length - 1)];
        orders.push({ ownerId: ai.id, targetId: player.id, cityIdx: tgt.idx, leg });
        ai.arsenal[leg]--; // tentative reserve so _pickLeg stays honest; re-applied in sim
      }
      // restore — the Simulation does the authoritative decrement on spawn
      for (const o of orders) {
        if (o.ownerId === ai.id) ai.arsenal[o.leg]++;
      }
    }
    return orders;
  }

  _valueTargets(player) {
    return player.cities
      .map((c, idx) => ({ idx, pop: c.pop }))
      .filter((c) => c.pop > 0)
      .sort((a, b) => b.pop - a.pop);
  }

  _pickLeg(nation) {
    for (const leg of ['icbm', 'slbm', 'bomber']) if (nation.arsenal[leg] > 0) return leg;
    return null;
  }
}
