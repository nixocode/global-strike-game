import { Phase } from '../core/GameState.js';
import { EV } from '../core/EventBus.js';
import { makeLiveNations } from '../data/nations.js';
import { doctrineById } from '../data/doctrines.js';
import { flightDuration, arcHeight, greatCircleKm } from './ballistics.js';
import { resolveIntercept } from './intercept.js';
import { initWind, spawnFallout, tickFallout } from './fallout.js';
import { accrueWinter, tickWinter, winterStage } from './winter.js';
import { Commander } from './ai/Commander.js';

const DEFCON_LABELS = { 1: 'NUCLEAR WAR', 2: 'WAR IMMINENT', 3: 'INCREASED READINESS', 4: 'ELEVATED ALERT', 5: 'PEACETIME' };

/**
 * The headless game engine. Owns all rules and the authoritative munition state.
 * It mutates GameState and emits events; it never touches THREE or the DOM.
 */
export class Simulation {
  constructor(state, bus) {
    this.s = state;
    this.bus = bus;
    this._munId = 0;
    this._destroyed = new Set();
    this.commander = new Commander(state, bus);
  }

  // ── lifecycle ──────────────────────────────────────────────
  startGame(playerId, doctrineId) {
    const s = this.s;
    s.nations = makeLiveNations();
    s.player = s.nationById(playerId);
    s.playerDoctrine = doctrineById(doctrineId);

    // apply doctrine to the player's force
    const d = s.playerDoctrine;
    for (const layer of ['boost', 'midcourse', 'terminal']) {
      s.player.defense[layer] = Math.min(0.95, s.player.defense[layer] * d.defenseMul);
    }
    s.player.doctrineBonus = d.interceptBonus;
    s.player.yieldMul = d.yieldMul;
    // give every AI a Commander persona based on its national doctrine
    for (const n of s.aiNations()) n.doctrineBonus = 0;

    s.initialWorldPop = s.worldPopAlive();
    s.turn = 1;
    s.orders = [];
    s.lastIncoming = {};
    s.inflight = [];
    s.fallout = [];
    s.winterIndex = 0;
    this._destroyed.clear();
    if (s.mode.rules.fallout) initWind(s);
    this._setPhase(Phase.PLANNING);
    this._setDefcon(5);
    this.bus.emit(EV.GAME_START, { player: s.player, mode: s.mode });
    this.bus.emit(EV.TURN_BEGIN, { turn: s.turn });
    this._log(`Turn 1 — ${s.player.flag} ${s.player.name} ready. Select targets.`, 'info');
  }

  // ── planning ───────────────────────────────────────────────
  legAvailable(leg) {
    const queued = this.s.orders.filter((o) => o.leg === leg).length;
    return this.s.player.arsenal[leg] - queued;
  }

  bestAvailableLeg() {
    // prefer ICBM, then SLBM, then bomber for the player's quick-fire targeting
    for (const leg of ['icbm', 'slbm', 'bomber']) if (this.legAvailable(leg) > 0) return leg;
    return null;
  }

  queueOrder(targetNationId, cityIdx, leg = null) {
    if (this.s.phase !== Phase.PLANNING) return false;
    leg = leg || this.bestAvailableLeg();
    if (!leg || this.legAvailable(leg) <= 0) {
      this.bus.emit(EV.TOAST, { msg: 'No warheads available', kind: 'warn' });
      return false;
    }
    this.s.orders.push({ targetNationId, cityIdx, leg });
    return true;
  }

  removeOrder(index) {
    if (this.s.phase !== Phase.PLANNING) return;
    this.s.orders.splice(index, 1);
  }

  clearOrders() {
    this.s.orders = [];
  }

  // ── launch / resolve ───────────────────────────────────────
  launch() {
    const s = this.s;
    if (s.phase !== Phase.PLANNING || s.orders.length === 0) return;
    this._setPhase(Phase.RESOLVING);
    this._setDefcon(2);

    // record what we threw at each nation — the AI answers proportionally next turn
    s.lastIncoming = {};
    for (const o of s.orders) {
      s.lastIncoming[o.targetNationId] = (s.lastIncoming[o.targetNationId] || 0) + 1;
    }

    // saturation index per target city (each stacked inbound erodes defense)
    const sat = {};
    for (const o of s.orders) {
      const from = this._launchSite(s.player);
      const target = s.nationById(o.targetNationId).cities[o.cityIdx];
      const key = o.targetNationId + ':' + o.cityIdx;
      const saturationIdx = (sat[key] = (sat[key] ?? -1) + 1);
      s.player.arsenal[o.leg]--;
      this._spawnMunition({
        owner: s.player,
        target: s.nationById(o.targetNationId),
        targetCity: target,
        cityIdx: o.cityIdx,
        from,
        leg: o.leg,
        saturationIdx,
        yieldMul: s.player.yieldMul || 1,
      });
    }
    this._log(`${s.player.flag} Launched ${s.orders.length} warhead(s)`, 'launch');
    s.orders = [];
  }

  _launchSite(nation) {
    const c = nation.cities.find((c) => c.pop > 0) || nation.cities[0];
    return { lat: c.lat, lng: c.lng };
  }

  _spawnMunition({ owner, target, targetCity, cityIdx, from, leg, saturationIdx, yieldMul }) {
    const s = this.s;
    const km = greatCircleKm(from.lat, from.lng, targetCity.lat, targetCity.lng);
    const duration = flightDuration(leg, km, s.mode.rules.realFlightTimes);
    const intercept = resolveIntercept(s.rng, {
      defenderDefense: target.defense,
      doctrineBonus: target.doctrineBonus || 0,
      leg,
      saturationIdx,
    });
    const m = {
      id: ++this._munId,
      ownerId: owner.id,
      targetId: target.id,
      cityIdx,
      leg,
      fromLat: from.lat, fromLng: from.lng,
      toLat: targetCity.lat, toLng: targetCity.lng,
      arc: arcHeight(leg) * (s.mode.physics.arcScale || 1),
      duration,
      elapsed: 0,
      t: 0,
      yieldMul,
      intercept,
      interceptFired: false,
      resolved: false,
    };
    s.inflight.push(m);
    this.bus.emit(EV.MISSILE_LAUNCH, m);
  }

  // ── per-fixed-step tick ────────────────────────────────────
  tick(dt) {
    const s = this.s;
    if (s.inflight.length) this._tickMunitions(dt);

    // arcade combo decay
    if (s.combo > 0) {
      s.comboTimer -= dt;
      if (s.comboTimer <= 0) {
        s.combo = 0;
        this.bus.emit(EV.SCORE_CHANGE, { score: s.score, combo: 0 });
      }
    }

    // volley finished?
    if (s.inflight.length === 0) {
      if (s.phase === Phase.RESOLVING) this._beginAITurn();
      else if (s.phase === Phase.AI_TURN && this._aiVolleyDone) this._endTurn();
    }
  }

  _tickMunitions(dt) {
    const s = this.s;
    for (const m of s.inflight) {
      if (m.resolved) continue;
      m.elapsed += dt;
      m.t = Math.min(1, m.elapsed / m.duration);

      if (m.intercept.intercepted && !m.interceptFired && m.t >= m.intercept.t) {
        m.interceptFired = true;
        m.resolved = true;
        this.bus.emit(EV.MISSILE_INTERCEPT, m);
        const tgt = s.nationById(m.targetId);
        this._log(`${tgt.flag} intercepted an inbound (${m.intercept.layer})`, 'defend');
        continue;
      }
      if (!m.intercept.intercepted && m.t >= 1) {
        m.resolved = true;
        this._resolveImpact(m);
      }
    }
    s.inflight = s.inflight.filter((m) => !m.resolved);
  }

  _resolveImpact(m) {
    const s = this.s;
    const nation = s.nationById(m.targetId);
    const city = nation.cities[m.cityIdx];
    if (!city) return;

    const arcade = s.mode.id === 'arcade';
    let frac = arcade ? s.rng.range(0.6, 0.95) : s.rng.range(0.35, 0.6);
    frac = Math.min(1, frac * (m.yieldMul || 1));
    const kills = Math.round(city.pop * frac);
    city.pop = Math.max(0, city.pop - kills);
    nation.casualties += kills;
    s.totalKills += kills;

    this.bus.emit(EV.MISSILE_IMPACT, m);
    this.bus.emit(EV.CITY_HIT, { nation, city, cityIdx: m.cityIdx, lat: m.toLat, lng: m.toLng, kills, yieldMul: m.yieldMul });
    this._log(`💥 ${city.name} hit — ${fmt(kills)} casualties`, 'hit');

    if (arcade) this._scoreHit(kills);

    // realistic aftermath: a detonation seeds fallout and lofts winter soot
    const rules = s.mode.rules;
    if (rules.fallout) spawnFallout(s, { lat: m.toLat, lng: m.toLng, yieldMul: m.yieldMul || 1 });
    if (rules.nuclearWinter) {
      const w = accrueWinter(s, { yieldMul: m.yieldMul || 1 });
      this.bus.emit(EV.WINTER_CHANGE, { index: w, stage: winterStage(w) });
    }

    this._checkNationDestroyed(nation);
    this._recomputeDefcon();
  }

  _scoreHit(kills) {
    const s = this.s;
    s.combo += 1;
    s.comboTimer = 2.2;
    const mult = 1 + (s.combo - 1) * 0.5;
    s.score += Math.round((kills / 1000) * mult);
    this.bus.emit(EV.SCORE_CHANGE, { score: s.score, combo: s.combo, mult });
  }

  _checkNationDestroyed(nation) {
    if (this._destroyed.has(nation.id)) return;
    if (this.s.isDestroyed(nation)) {
      this._destroyed.add(nation.id);
      this.bus.emit(EV.NATION_DESTROYED, nation);
      this._log(`☠ ${nation.flag} ${nation.name} has been destroyed`, 'destroy');
    }
  }

  // ── AI turn ────────────────────────────────────────────────
  _beginAITurn() {
    const s = this.s;
    this._setPhase(Phase.AI_TURN);
    this._aiVolleyDone = false;
    const orders = this.commander.planRetaliation();
    if (orders.length === 0) {
      this._aiVolleyDone = true;
      return;
    }
    this._log('⚠ Enemy retaliation inbound', 'launch');
    this.bus.emit(EV.TOAST, { msg: '☢ Enemy retaliation incoming', kind: 'danger' });
    const sat = {};
    for (const o of orders) {
      const owner = s.nationById(o.ownerId);
      const from = this._launchSite(owner);
      const target = s.nationById(o.targetId);
      const city = target.cities[o.cityIdx];
      const key = o.targetId + ':' + o.cityIdx;
      const saturationIdx = (sat[key] = (sat[key] ?? -1) + 1);
      owner.arsenal[o.leg]--;
      this._spawnMunition({ owner, target, targetCity: city, cityIdx: o.cityIdx, from, leg: o.leg, saturationIdx, yieldMul: 1 });
    }
    this._aiVolleyDone = true;
  }

  // ── outcomes ───────────────────────────────────────────────
  _endTurn() {
    const s = this.s;
    const rules = s.mode.rules;

    // between-turn environment: fallout drift + nuclear-winter attrition resolve
    // here, BEFORE outcome checks, so delayed deaths can themselves end the game.
    this._tickEnvironment();

    if (this._isApocalypse()) return this._gameOver('apocalypse');
    const playerAlive = !s.isDestroyed(s.player);
    if (!playerAlive) return this._gameOver('defeat');

    const enemyThreat = s.aiNations().some((n) => !s.isDestroyed(n) && s.totalArsenal(n) > 0);
    if (!enemyThreat) return this._gameOver(this._isPyrrhic() ? 'pyrrhic' : 'victory');

    // next turn
    s.turn++;
    if (rules.restockWarheads) this._restock();
    this._setPhase(Phase.PLANNING);
    this._recomputeDefcon();
    this.bus.emit(EV.TURN_BEGIN, { turn: s.turn });
    this._log(`── Turn ${s.turn} ──`, 'info');
  }

  _restock() {
    // arcade: top everyone back up so the spectacle never stops
    for (const n of this.s.nations) {
      n.arsenal.icbm = Math.max(n.arsenal.icbm, 6);
      n.arsenal.slbm = Math.max(n.arsenal.slbm, 4);
      n.arsenal.bomber = Math.max(n.arsenal.bomber, 2);
    }
  }

  /** Resolve one turn of fallout drift + nuclear winter, then settle the world. */
  _tickEnvironment() {
    const s = this.s;
    const rules = s.mode.rules;

    if (rules.fallout) {
      const fo = tickFallout(s);
      if (fo.kills > 0) {
        this._log(`☢ Fallout claims ${fmt(fo.kills)} more downwind`, 'hit');
        this.bus.emit(EV.FALLOUT_TICK, { plumes: s.fallout, kills: fo.kills });
      }
    }
    if (rules.nuclearWinter) {
      const wi = tickWinter(s);
      if (wi.kills > 0) {
        this._log(`❄ Nuclear winter kills ${fmt(wi.kills)} worldwide`, 'hit');
      }
      this.bus.emit(EV.WINTER_CHANGE, { index: s.winterIndex, stage: winterStage(s.winterIndex) });
    }

    // delayed deaths may have wiped nations out — settle destroyed status
    for (const n of s.nations) this._checkNationDestroyed(n);
  }

  _isApocalypse() {
    const r = this.s.mode.rules;
    return (
      this.s.worldDestroyedFrac() >= r.apocalypsePopFrac ||
      this._destroyed.size >= r.apocalypseNations ||
      (r.nuclearWinter && this.s.winterIndex >= (r.apocalypseWinter ?? 1.1))
    );
  }
  _isPyrrhic() {
    const r = this.s.mode.rules;
    return (
      this.s.worldDestroyedFrac() >= r.pyrrhicPopFrac ||
      this._destroyed.size >= r.pyrrhicNations ||
      (r.nuclearWinter && this.s.winterIndex >= (r.pyrrhicWinter ?? 1.1))
    );
  }

  _gameOver(outcome) {
    if (this.s.phase === Phase.GAME_OVER) return;
    this._setPhase(Phase.GAME_OVER);
    this._setDefcon(1);
    this.bus.emit(EV.GAME_OVER, { outcome, state: this.s, destroyed: this._destroyed });
  }

  // ── defcon ─────────────────────────────────────────────────
  _recomputeDefcon() {
    const s = this.s;
    let lvl = 5;
    if (s.turn >= 1) lvl = 3;
    const playerHurt = s.player.cities.some((c) => c.pop <= 0);
    if (playerHurt || s.totalKills > 1e6) lvl = 2;
    if (this._destroyed.size > 0 || s.totalKills > 5e6) lvl = 1;
    this._setDefcon(lvl);
  }
  _setDefcon(level) {
    level = Math.max(1, Math.min(5, level));
    if (level === this.s.defcon) return;
    this.s.defcon = level;
    this.bus.emit(EV.DEFCON_CHANGE, { level, label: DEFCON_LABELS[level] });
  }

  // ── helpers ────────────────────────────────────────────────
  _setPhase(phase) {
    this.s.phase = phase;
    this.bus.emit(EV.PHASE_CHANGE, phase);
  }
  _log(msg, kind = 'info') {
    this.bus.emit(EV.LOG, { msg, kind, t: Date.now() });
  }
}

export function fmt(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return Math.round(n / 1e3) + 'K';
  return String(Math.round(n));
}
