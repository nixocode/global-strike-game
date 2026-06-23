import { Store } from '../core/storage.js';

/**
 * Pause + settings overlay, toggled with Esc (or the ⚙ button). Owns its own DOM
 * layer so it never collides with the #overlay used by menus / game-over. Halts
 * the loop while open and restores it on resume. Sound preference persists.
 */
export class PauseMenu {
  /**
   * @param {object} o
   * @param {import('../core/Loop.js').Loop} o.loop
   * @param {import('../audio/audio.js').AudioManager} o.audio
   * @param {() => boolean} o.canPause  guard: false during menus / game-over
   */
  constructor({ loop, audio, canPause }) {
    this.loop = loop;
    this.audio = audio;
    this.canPause = canPause;
    this.open = false;

    // apply the persisted sound preference up front
    this.soundOn = Store.prefs().sound !== false;
    if (this.audio) this.audio.enabled = this.soundOn;

    this.el = document.createElement('div');
    this.el.id = 'pause';
    this.el.style.display = 'none';
    document.body.appendChild(this.el);

    // a small always-visible settings button (also the touch entry point)
    this.btn = document.createElement('button');
    this.btn.id = 'pauseBtn';
    this.btn.title = 'Pause / settings (Esc)';
    this.btn.textContent = '⚙';
    this.btn.addEventListener('click', () => this.toggle());
    document.body.appendChild(this.btn);

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); this.toggle(); }
    });
  }

  toggle() {
    if (this.open) return this.resume();
    if (!this.canPause || this.canPause()) this.show();
  }

  show() {
    this.open = true;
    this.loop?.stop();
    this.el.style.display = 'flex';
    this._render();
  }

  resume() {
    this.open = false;
    this.el.style.display = 'none';
    this.loop?.start();
  }

  _setSound(on) {
    this.soundOn = on;
    Store.setPref('sound', on);
    if (this.audio) this.audio.enabled = on;
    if (this.audio?.master) this.audio.master.gain.value = on ? 0.4 : 0;
    this._render();
  }

  _render() {
    this.el.innerHTML = `
      <div class="pause-card">
        <div class="pause-title">PAUSED</div>
        <div class="pause-row">
          <span>Sound</span>
          <button class="toggle ${this.soundOn ? 'on' : ''}" id="pauseSound">
            <span class="knob"></span><span class="lbl">${this.soundOn ? 'ON' : 'OFF'}</span>
          </button>
        </div>
        <button class="btn primary" id="pauseResume">Resume</button>
        <button class="btn" id="pauseRestart">Restart — new war</button>
        <div class="pause-hint mono">Esc to resume · drag to rotate · scroll to zoom</div>
      </div>`;
    this.el.querySelector('#pauseSound').addEventListener('click', () => this._setSound(!this.soundOn));
    this.el.querySelector('#pauseResume').addEventListener('click', () => this.resume());
    this.el.querySelector('#pauseRestart').addEventListener('click', () => location.reload());
  }
}
