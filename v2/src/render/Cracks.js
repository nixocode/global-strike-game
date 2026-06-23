import * as THREE from 'three';
import { EV } from '../core/EventBus.js';
import { latLngToVec3, GLOBE_RADIUS } from './Globe.js';

/**
 * Arcade-only molten fissures. Each blast splinters glowing magma cracks that
 * propagate across the planet surface from the impact — a bright yellow core in
 * an orange halo, revealed progressively then left to pulse. Cracks accumulate
 * across the game so the fracture pattern is unique to where the player struck.
 *
 * Cracks are built on demand (only at impacts, never per-frame) and capped; the
 * oldest are disposed when the budget is hit, so memory stays bounded.
 */

const SURFACE_R = GLOBE_RADIUS * 1.0135; // just above the crust shell
const MAX_CRACKS = 48;

/** A jagged great-circle-ish walk from (lat,lng) along a heading, as vec3 path. */
function walkPath(lat, lng, headingDeg, steps, stepDeg) {
  const pts = [];
  let la = lat, ln = lng, h = headingDeg;
  for (let i = 0; i <= steps; i++) {
    pts.push(latLngToVec3(la, ln, SURFACE_R));
    h += (Math.random() - 0.5) * 42; // wander
    const hr = (h * Math.PI) / 180;
    la += Math.cos(hr) * stepDeg;
    ln += (Math.sin(hr) * stepDeg) / Math.max(0.25, Math.cos((la * Math.PI) / 180));
    la = Math.max(-88, Math.min(88, la));
  }
  return pts;
}

export class CrackLayer {
  constructor(globe, bus, mode) {
    this.globe = globe;
    this.mode = mode;
    this.active = mode.id === 'arcade';
    this._t = 0;
    this._cracks = [];
    if (!this.active) return;

    this.group = new THREE.Group();
    globe.group.add(this.group);

    this.coreMat = () => new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.haloMat = () => new THREE.MeshBasicMaterial({ color: 0xff4a0e, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });

    bus.on('vfx:bigBlast', (e) => this.splinter(e));
  }

  splinter({ lat, lng, yieldMul = 1 }) {
    if (!this.active) return;
    const arms = 4 + Math.floor(Math.random() * 4);
    for (let a = 0; a < arms; a++) {
      const heading = Math.random() * 360;
      const steps = 14 + Math.floor(Math.random() * 12);
      const stepDeg = 2.8 + Math.random() * 2.4;
      const pts = walkPath(lat, lng, heading, steps, stepDeg);
      this._addCrack(pts, yieldMul);
    }
  }

  _addCrack(pts, yieldMul) {
    const curve = new THREE.CatmullRomCurve3(pts);
    const segs = pts.length * 4;
    const coreGeo = new THREE.TubeGeometry(curve, segs, 0.0045 * (0.8 + yieldMul * 0.15), 6, false);
    const haloGeo = new THREE.TubeGeometry(curve, segs, 0.015 * (0.8 + yieldMul * 0.15), 6, false);
    const core = new THREE.Mesh(coreGeo, this.coreMat());
    const halo = new THREE.Mesh(haloGeo, this.haloMat());
    this.group.add(halo);
    this.group.add(core);

    const crack = { core, halo, coreGeo, haloGeo, age: 0, grow: 0.5 + Math.random() * 0.3,
      coreCount: coreGeo.index.count, haloCount: haloGeo.index.count };
    coreGeo.setDrawRange(0, 0);
    haloGeo.setDrawRange(0, 0);
    this._cracks.push(crack);

    // budget: dispose the oldest
    while (this._cracks.length > MAX_CRACKS) {
      const old = this._cracks.shift();
      this.group.remove(old.core); this.group.remove(old.halo);
      old.coreGeo.dispose(); old.haloGeo.dispose();
      old.core.material.dispose(); old.halo.material.dispose();
    }
  }

  update(dt) {
    if (!this.active || !this._cracks.length) return;
    this._t += dt;
    const pulse = 0.82 + Math.sin(this._t * 3) * 0.18;
    for (const c of this._cracks) {
      c.age += dt;
      const p = Math.min(1, c.age / c.grow); // reveal progress 0..1
      c.coreGeo.setDrawRange(0, Math.floor(c.coreCount * p));
      c.haloGeo.setDrawRange(0, Math.floor(c.haloCount * p));
      c.core.material.opacity = pulse;
      c.halo.material.opacity = 0.55 * pulse;
    }
  }
}
