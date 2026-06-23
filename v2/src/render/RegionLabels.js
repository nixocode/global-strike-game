import { latLngToVec3, GLOBE_RADIUS } from './Globe.js';

/**
 * Faint floating region names projected onto the globe (e.g. "ASIAN STEPPES"),
 * for the cinematic, map-like feel of the reference. Non-interactive HTML, like
 * MarkerLayer but coarser — projected each frame, hidden on the far side.
 */
const REGIONS = [
  { name: 'NORTH AMERICA', lat: 44, lng: -100 },
  { name: 'SOUTH AMERICA', lat: -12, lng: -60 },
  { name: 'NORTH ATLANTIC', lat: 38, lng: -42 },
  { name: 'EUROPE', lat: 50, lng: 14 },
  { name: 'SAHARA', lat: 22, lng: 12 },
  { name: 'CENTRAL AFRICA', lat: -2, lng: 22 },
  { name: 'ARABIAN', lat: 23, lng: 45 },
  { name: 'SIBERIA', lat: 62, lng: 100 },
  { name: 'ASIAN STEPPES', lat: 48, lng: 76 },
  { name: 'EAST ASIA', lat: 34, lng: 112 },
  { name: 'SOUTH ASIA', lat: 21, lng: 79 },
  { name: 'OCEANIA', lat: -26, lng: 134 },
  { name: 'PACIFIC', lat: 5, lng: -160 },
];

export class RegionLabels {
  constructor(globe) {
    this.globe = globe;
    this.host = document.createElement('div');
    this.host.id = 'regions';
    document.getElementById('ui').appendChild(this.host);
    this.items = REGIONS.map((r) => {
      const el = document.createElement('div');
      el.className = 'region-label';
      el.textContent = r.name;
      this.host.appendChild(el);
      return { el, vec: latLngToVec3(r.lat, r.lng, GLOBE_RADIUS * 1.02) };
    });
    this._out = { x: 0, y: 0, visible: false };
  }

  update() {
    for (const it of this.items) {
      this.globe.project(it.vec, this._out);
      if (this._out.visible) {
        it.el.style.display = '';
        it.el.style.transform = `translate(-50%,-50%) translate(${this._out.x}px,${this._out.y}px)`;
      } else {
        it.el.style.display = 'none';
      }
    }
  }
}
