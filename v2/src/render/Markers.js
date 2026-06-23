import { EV } from '../core/EventBus.js';
import { latLngToVec3, GLOBE_RADIUS } from './Globe.js';

/**
 * HTML overlay city markers projected from the globe each frame. Enemy cities are
 * clickable targets; the player's cities are friendly. Reflects live population,
 * destruction, and queued target counts.
 */
export class MarkerLayer {
  constructor(globe, state, bus, onTarget) {
    this.globe = globe;
    this.s = state;
    this.bus = bus;
    this.onTarget = onTarget;
    this.host = document.createElement('div');
    this.host.id = 'markers';
    document.getElementById('ui').appendChild(this.host);
    this.markers = []; // {el, nation, cityIdx, vec}

    bus.on(EV.GAME_START, () => this.build());
    bus.on(EV.CITY_HIT, () => this.refresh());
    bus.on(EV.NATION_DESTROYED, () => this.refresh());
  }

  build() {
    this.host.innerHTML = '';
    this.markers = [];
    for (const nation of this.s.nations) {
      const enemy = nation !== this.s.player;
      nation.cities.forEach((city, idx) => {
        const el = document.createElement('div');
        el.className = 'cmark ' + (enemy ? 'enemy' : 'friendly');
        el.innerHTML = `<span class="dot"></span><span class="lbl"></span><span class="badge"></span>`;
        if (enemy) {
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            this.onTarget(nation.id, idx);
          });
        }
        this.host.appendChild(el);
        this.markers.push({ el, nation, cityIdx: idx, city, enemy, vec: latLngToVec3(city.lat, city.lng, GLOBE_RADIUS * 1.01) });
      });
    }
    this.refresh();
  }

  refresh() {
    const counts = {};
    for (const o of this.s.orders) counts[o.targetNationId + ':' + o.cityIdx] = (counts[o.targetNationId + ':' + o.cityIdx] || 0) + 1;
    for (const m of this.markers) {
      const dead = m.city.pop <= 0;
      m.el.classList.toggle('dead', dead);
      m.el.querySelector('.lbl').textContent = dead ? '' : m.city.name;
      const n = counts[m.nation.id + ':' + m.cityIdx] || 0;
      const badge = m.el.querySelector('.badge');
      badge.textContent = n > 0 ? '×' + n : '';
      badge.style.display = n > 0 ? 'inline-flex' : 'none';
      m.el.style.setProperty('--c', m.nation.color);
    }
  }

  update() {
    const out = { x: 0, y: 0, visible: false };
    for (const m of this.markers) {
      this.globe.project(m.vec, out);
      if (out.visible) {
        m.el.style.display = '';
        m.el.style.transform = `translate(-50%,-50%) translate(${out.x}px,${out.y}px)`;
      } else {
        m.el.style.display = 'none';
      }
    }
  }
}
