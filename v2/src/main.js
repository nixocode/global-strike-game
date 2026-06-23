import { GameState, Phase } from './core/GameState.js';
import { EventBus, EV } from './core/EventBus.js';
import { Loop } from './core/Loop.js';
import { RNG } from './core/rng.js';
import { Globe } from './render/Globe.js';
import { MissileLayer } from './render/Missiles.js';
import { ExplosionLayer } from './render/Explosions.js';
import { ChunkLayer } from './render/Chunks.js';
import { CrustShell } from './render/CrustShell.js';
import { CrackLayer } from './render/Cracks.js';
import { RegionLabels } from './render/RegionLabels.js';
import { ShockwaveLayer } from './render/Shockwaves.js';
import { MarkerLayer } from './render/Markers.js';
import { Simulation } from './sim/Simulation.js';
import { showModeSelect } from './ui/modeSelect.js';
import { showSetup } from './ui/setup.js';
import { HUD } from './ui/hud.js';
import { showGameOver } from './ui/gameOver.js';
import { toast } from './ui/toast.js';
import { AudioManager } from './audio/audio.js';

/**
 * Bootstrap. Owns the long-lived singletons and the top-level flow:
 * mode select → setup → play. Sim is authoritative; render/ui ride the EventBus.
 */
class Game {
  constructor() {
    this.state = new GameState();
    this.bus = new EventBus();
    this.globe = new Globe(document.getElementById('globe'));
    this.sim = new Simulation(this.state, this.bus);

    // render systems (subscribe to sim events)
    this.missiles = new MissileLayer(this.globe, this.bus);

    this.loop = new Loop({
      update: (dt) => this.sim.tick(dt),
      render: (dt) => this._render(dt),
      hz: 60,
    });

    this.bus.on(EV.TOAST, ({ msg, kind }) => toast(msg, kind));
    this.bus.on(EV.GAME_OVER, (e) => showGameOver(e));
    this.bus.on('vfx:slowmo', ({ scale }) => this.loop.slowmo(scale));
  }

  _render(dt) {
    this.globe.update(dt);
    this.missiles.update();
    this.crust?.update(dt);
    this.cracks?.update(dt);
    this.shockwaves?.update(dt);
    this.explosions?.update(dt);
    this.chunks?.update(dt);
    this.regions?.update();
    this.markers?.update();
  }

  async start() {
    this.loop.start();

    const mode = await showModeSelect();
    this.state.mode = mode;

    // mode-dependent render systems
    this.crust = new CrustShell(this.globe, this.bus, mode);
    this.cracks = new CrackLayer(this.globe, this.bus, mode);
    this.shockwaves = new ShockwaveLayer(this.globe, this.bus);
    this.audio = new AudioManager(this.bus);
    window.__audio = this.audio; // dev handle (e.g. __audio.toggle())
    this.regions = new RegionLabels(this.globe);
    this.explosions = new ExplosionLayer(this.globe, this.bus, mode);
    this.chunks = new ChunkLayer(this.globe, this.bus, mode);
    this.markers = new MarkerLayer(this.globe, this.state, this.bus, (nationId, cityIdx) => {
      if (this.sim.queueOrder(nationId, cityIdx)) {
        this.markers.refresh();
        this.hud.refresh();
      }
    });
    this.hud = new HUD(this.state, this.bus, this.sim);
    this.bus.on('ui:ordersChanged', () => this.markers.refresh());

    const { nationId, doctrineId } = await showSetup(mode);
    this.state.seed = (Math.random() * 0xffffffff) >>> 0;
    this.state.rng = new RNG(this.state.seed);
    this.missiles.setPlayer(nationId);

    this.sim.startGame(nationId, doctrineId);
    toast(`${mode.icon} Targets: click enemy cities, then LAUNCH`, 'info');
  }
}

const game = new Game();
window.__game = game; // dev handle
game.start();
