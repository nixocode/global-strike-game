import * as THREE from 'three';
import { Pool } from '../core/pool.js';
import { GLOBE_RADIUS } from './Globe.js';

/**
 * Surface shockwaves: each detonation sends a bright blast ring racing OUTWARD
 * across the curved planet surface (a glowing annulus at a growing angular radius
 * around the impact axis, hugging the sphere). Pooled, additive, bloom-friendly.
 */
const SEG = 72; // segments around the ring
const WAVE_R = GLOBE_RADIUS * 1.016; // just above the crust, below the atmosphere

/** Build a reusable annulus strip (two concentric rings) on the unit sphere. */
function makeBandGeo() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((SEG + 1) * 2 * 3), 3));
  const idx = [];
  for (let i = 0; i < SEG; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, b, c, b, d, c);
  }
  g.setIndex(idx);
  return g;
}

export class ShockwaveLayer {
  constructor(globe, bus) {
    this.globe = globe;
    this.group = new THREE.Group();
    globe.group.add(this.group);
    this._waves = [];
    this._pool = new Pool(
      () => {
        const m = new THREE.Mesh(
          makeBandGeo(),
          new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
        );
        m.frustumCulled = false;
        m.visible = false;
        return m;
      },
      (m) => { m.visible = false; }
    ).warm(12);

    bus.on('vfx:bigBlast', (e) => this.spawn(e));
  }

  spawn({ pos, yieldMul = 1 }) {
    const axis = pos.clone().normalize();
    // orthonormal basis in the tangent plane
    let u = new THREE.Vector3(0, 1, 0).cross(axis);
    if (u.lengthSq() < 1e-4) u.set(1, 0, 0);
    u.normalize();
    const v = new THREE.Vector3().crossVectors(axis, u).normalize();

    const m = this._pool.acquire();
    m.visible = true;
    this.group.add(m);
    this._waves.push({ mesh: m, axis, u, v, age: 0, life: 1.0 + yieldMul * 0.25, maxTheta: 1.1 + yieldMul * 0.25 });
  }

  update(dt) {
    if (!this._waves.length) return;
    const keep = [];
    const inner = new THREE.Vector3(), outer = new THREE.Vector3();
    for (const w of this._waves) {
      w.age += dt;
      const a = w.age / w.life;
      if (a >= 1) { this.group.remove(w.mesh); this._pool.release(w.mesh); continue; }

      const theta = (1 - (1 - a) * (1 - a)) * w.maxTheta; // ease-out sweep
      const width = (0.04 + a * 0.06); // band thickens as it travels
      const t0 = theta, t1 = Math.min(Math.PI, theta + width);
      const pos = w.mesh.geometry.attributes.position;
      for (let i = 0; i <= SEG; i++) {
        const phi = (i / SEG) * Math.PI * 2;
        const radial = w.u.clone().multiplyScalar(Math.cos(phi)).add(w.v.clone().multiplyScalar(Math.sin(phi)));
        inner.copy(w.axis).multiplyScalar(Math.cos(t0)).addScaledVector(radial, Math.sin(t0)).multiplyScalar(WAVE_R);
        outer.copy(w.axis).multiplyScalar(Math.cos(t1)).addScaledVector(radial, Math.sin(t1)).multiplyScalar(WAVE_R);
        pos.setXYZ(i * 2, inner.x, inner.y, inner.z);
        pos.setXYZ(i * 2 + 1, outer.x, outer.y, outer.z);
      }
      pos.needsUpdate = true;
      w.mesh.material.opacity = (1 - a) * (1 - a) * 0.9;
      keep.push(w);
    }
    this._waves = keep;
  }
}
