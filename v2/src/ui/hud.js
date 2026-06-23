import { EV } from '../core/EventBus.js';
import { Phase } from '../core/GameState.js';
import { fmt } from '../sim/Simulation.js';

const PHASE_TEXT = {
  [Phase.PLANNING]: 'SELECT TARGETS',
  [Phase.RESOLVING]: '☢ MISSILES INBOUND',
  [Phase.AI_TURN]: '☢ ENEMY RETALIATION',
  [Phase.GAME_OVER]: 'WAR OVER',
};

/**
 * In-game HUD. Reads GameState, listens to sim events, and drives the launch flow.
 * Knows nothing about how the sim resolves combat — it just queues/launches orders.
 */
export class HUD {
  constructor(state, bus, sim) {
    this.s = state;
    this.bus = bus;
    this.sim = sim;
    this.root = document.createElement('div');
    this.root.id = 'hud';
    document.getElementById('ui').appendChild(this.root);

    bus.on(EV.GAME_START, () => { this._mount(); this.refresh(); });
    bus.on(EV.PHASE_CHANGE, () => this.refresh());
    bus.on(EV.TURN_BEGIN, () => this.refresh());
    bus.on(EV.CITY_HIT, () => this.refresh());
    bus.on(EV.NATION_DESTROYED, () => this.refresh());
    bus.on(EV.DEFCON_CHANGE, () => this.refresh());
    bus.on(EV.SCORE_CHANGE, () => this._refreshScore());
    bus.on(EV.WINTER_CHANGE, () => this._refreshEnv());
    bus.on(EV.FALLOUT_TICK, () => this._refreshEnv());
  }

  _mount() {
    const arcade = this.s.mode.id === 'arcade';
    this.root.innerHTML = `
      <div class="hud-top">
        <div class="hud-logo"><span class="pip"></span><span class="name">GLOBAL STRIKE</span></div>
        <span class="hud-mode mono">${this.s.mode.name.toUpperCase()}</span>
        <div class="hud-stats">
          <div class="hud-stat"><div class="v accent" id="hudTurn">1</div><div class="l">Turn</div></div>
          <div class="hud-stat"><div class="v red" id="hudKills">0</div><div class="l">Casualties</div></div>
          <div class="hud-stat"><div class="v green" id="hudCities">0/0</div><div class="l">Your Cities</div></div>
          <div class="defcon d5" id="hudDefcon">DEFCON 5</div>
        </div>
      </div>
      <div class="hud-phase" id="hudPhase"></div>
      ${arcade ? '<div class="score-box"><div class="s" id="hudScore">0</div><div class="combo" id="hudCombo"></div></div>'
               : '<div class="hud-env" id="hudEnv"></div>'}
      <div class="hud-bottom">
        <div class="arsenal" id="hudArsenal"></div>
        <div class="queue">
          <div class="queue-label">Target queue</div>
          <div class="queue-chips" id="hudQueue"></div>
        </div>
        <button class="launch-btn" id="hudLaunch" disabled>LAUNCH</button>
      </div>`;

    this.root.querySelector('#hudLaunch').addEventListener('click', () => {
      if (this.s.phase === Phase.PLANNING && this.s.orders.length) {
        this.sim.launch();
        this.refresh();
      }
    });
  }

  refresh() {
    if (!this.s.player) return;
    const s = this.s;
    const $ = (id) => this.root.querySelector('#' + id);
    // Events (phase/defcon) can fire before GAME_START mounts the HUD; the
    // mount's own refresh() renders the initial state, so just skip until then.
    if (!$('hudTurn')) return;
    $('hudTurn').textContent = s.turn;
    $('hudKills').textContent = fmt(s.totalKills);
    const alive = s.player.cities.filter((c) => c.pop > 0).length;
    $('hudCities').textContent = `${alive}/${s.player.cities.length}`;

    const d = $('hudDefcon');
    d.className = 'defcon d' + s.defcon;
    d.textContent = 'DEFCON ' + s.defcon;

    const phase = $('hudPhase');
    phase.textContent = (s.phase === Phase.PLANNING ? `TURN ${s.turn} — ` : '') + (PHASE_TEXT[s.phase] || '');
    phase.style.color = s.phase === Phase.PLANNING ? 'var(--accent2)' : 'var(--red)';

    // arsenal
    const legs = [['icbm', 'ICBM'], ['slbm', 'SLBM'], ['bomber', 'Bomber']];
    $('hudArsenal').innerHTML = legs
      .map(([k, label]) => {
        const n = s.player.arsenal[k];
        return `<div class="leg ${n <= 0 ? 'empty' : ''}"><div class="v">${n}</div><div class="l">${label}</div></div>`;
      })
      .join('');

    // queue chips
    const chips = $('hudQueue');
    chips.innerHTML = s.orders
      .map((o, i) => {
        const tn = s.nationById(o.targetNationId);
        const city = tn.cities[o.cityIdx];
        return `<span class="qchip" data-i="${i}">${tn.flag} ${city.name} · ${o.leg.toUpperCase()} ✕</span>`;
      })
      .join('');
    chips.querySelectorAll('.qchip').forEach((el) =>
      el.addEventListener('click', () => {
        this.sim.removeOrder(parseInt(el.dataset.i, 10));
        this.refresh();
        this.bus.emit('ui:ordersChanged');
      })
    );

    const launch = $('hudLaunch');
    launch.disabled = !(s.phase === Phase.PLANNING && s.orders.length > 0);
    launch.textContent = s.orders.length ? `LAUNCH ${s.orders.length}` : 'LAUNCH';

    this._refreshScore();
    this._refreshEnv();
  }

  /** Realistic-only readout: nuclear-winter severity + active fallout plumes. */
  _refreshEnv() {
    if (this.s.mode.id === 'arcade') return;
    const el = this.root.querySelector('#hudEnv');
    if (!el) return;
    const w = this.s.winterIndex;
    const stage = w < 0.15 ? 'STABLE' : w < 0.4 ? 'COOLING' : w < 0.7 ? 'WINTER' : 'SEVERE';
    const wColor = w < 0.15 ? 'var(--text3)' : w < 0.4 ? 'var(--yellow)' : w < 0.7 ? 'var(--orange)' : 'var(--red)';
    const plumes = this.s.fallout.length;
    el.innerHTML = `
      <div class="env-item" title="Nuclear winter severity">
        <span class="env-l mono">CLIMATE</span>
        <span class="env-bar"><i style="width:${Math.round(w * 100)}%;background:${wColor}"></i></span>
        <span class="env-v mono" style="color:${wColor}">${stage}</span>
      </div>
      <div class="env-item" title="Active fallout plumes">
        <span class="env-l mono">FALLOUT</span>
        <span class="env-v mono" style="color:${plumes ? 'var(--orange)' : 'var(--text3)'}">${plumes ? `☢ ${plumes}` : '—'}</span>
      </div>`;
  }

  _refreshScore() {
    if (this.s.mode.id !== 'arcade') return;
    const sc = this.root.querySelector('#hudScore');
    const cb = this.root.querySelector('#hudCombo');
    if (sc) {
      sc.textContent = this.s.score.toLocaleString();
      sc.classList.remove('pop'); void sc.offsetWidth; sc.classList.add('pop'); // restart pulse
    }
    if (cb) cb.textContent = this.s.combo > 1 ? `${this.s.combo}× COMBO` : '';
  }
}
