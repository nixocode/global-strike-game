import * as THREE from 'three';
import { EV } from '../core/EventBus.js';
import { Pool } from '../core/pool.js';
import { GLOBE_RADIUS } from './Globe.js';
import { Trail } from './Trail.js';

// A few low-poly fragment shapes, shared across all chunks (geometry is never
// per-chunk — only the pooled meshes are). Flat-shaded for a faceted, rocky read.
const SHAPES = [
  new THREE.IcosahedronGeometry(1, 0),
  new THREE.TetrahedronGeometry(1.2, 0),
  new THREE.DodecahedronGeometry(0.95, 0),
];

const UP = new THREE.Vector3();
const TMP = new THREE.Vector3();

/**
 * Arcade-only planet-chunk debris. On every big blast a burst of crust tears off
 * the surface, tumbles outward under low gravity, glows on launch + re-entry, and
 * either falls back in or sails into space. Pooled rigid bodies — zero per-frame
 * allocation. Inert in realistic mode (chunkBudget 0).
 */
export class ChunkLayer {
  constructor(globe, bus, mode) {
    this.globe = globe;
    this.bus = bus;
    this.mode = mode;
    this.budget = mode.physics.chunkBudget || 0;
    this.gravity = 0.9 * (mode.physics.gravity ?? 1); // accel toward planet center
    this.enabled = this.budget > 0;

    this.group = new THREE.Group();
    globe.group.add(this.group);

    this._live = []; // active chunk records
    this._pool = new Pool(
      () => {
        const geo = SHAPES[(Math.random() * SHAPES.length) | 0];
        const mesh = new THREE.Mesh(
          geo,
          new THREE.MeshStandardMaterial({ color: 0x47403a, roughness: 1.0, metalness: 0.0, flatShading: true, emissive: 0xff4a14, emissiveIntensity: 0 })
        );
        mesh.visible = false;
        return mesh;
      },
      (m) => { m.visible = false; }
    );
    if (this.enabled) this._pool.warm(Math.min(80, this.budget));

    if (this.enabled) bus.on('vfx:bigBlast', (e) => this.burst(e));
  }

  /** Tear a burst of crust off the surface at a blast. */
  burst({ pos, yieldMul = 1, scale = 1 }) {
    const room = this.budget - this._live.length;
    if (room <= 0) return;
    const want = Math.round(18 + yieldMul * 22);
    const count = Math.min(want, room);

    UP.copy(pos).normalize(); // surface normal at the blast
    // build a tangent basis so debris sprays in a cone around the normal
    const tangent = TMP.set(0, 1, 0).cross(UP);
    if (tangent.lengthSq() < 1e-4) tangent.set(1, 0, 0);
    tangent.normalize();
    const bitangent = new THREE.Vector3().crossVectors(UP, tangent).normalize();

    for (let i = 0; i < count; i++) {
      const m = this._pool.acquire();
      m.visible = true;
      m.position.copy(pos);

      const sz = (0.006 + Math.random() * 0.02) * (0.7 + scale * 0.3);
      m.scale.setScalar(sz);
      m.rotation.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);

      // velocity: mostly outward, with a tangential spray cone
      const spread = 0.4 + Math.random() * 0.6;
      const speed = (0.45 + Math.random() * 0.7) * (0.7 + yieldMul * 0.35);
      const ang = Math.random() * Math.PI * 2;
      const vel = new THREE.Vector3()
        .addScaledVector(UP, 1)
        .addScaledVector(tangent, Math.cos(ang) * spread)
        .addScaledVector(bitangent, Math.sin(ang) * spread)
        .normalize()
        .multiplyScalar(speed);

      this.group.add(m);
      const rec = {
        mesh: m,
        vel,
        spin: new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6),
        age: 0,
        life: 4.5 + Math.random() * 3,
        heat: 0.7, // brief launch glow, cools fast to dark rock; reignites on re-entry
      };
      // re-entry streak on a fraction of debris (caps trail count for perf)
      if (Math.random() < 0.18) { rec.trail = new Trail(this.group, 9, 0xff5a1e); rec.trail.push(m.position); }
      this._live.push(rec);
    }
  }

  update(dt) {
    if (!this._live.length) return;
    const keep = [];
    for (const c of this._live) {
      c.age += dt;
      const m = c.mesh;

      // gravity toward planet center (low in arcade → long, floaty arcs)
      const r = m.position.length() || 1e-6;
      c.vel.addScaledVector(m.position, (-this.gravity * dt) / r);
      m.position.addScaledVector(c.vel, dt);

      // tumble
      m.rotation.x += c.spin.x * dt;
      m.rotation.y += c.spin.y * dt;
      m.rotation.z += c.spin.z * dt;

      // glow: hot on launch, cools; reignites when falling fast back into the surface
      const dist = m.position.length();
      const inward = c.vel.dot(m.position) < 0;
      const reentry = inward && dist < GLOBE_RADIUS * 1.25 ? Math.min(0.7, c.vel.length() * 1.0) : 0;
      c.heat = Math.max(c.heat * (1 - dt * 2.0), reentry);
      m.material.emissiveIntensity = c.heat * 0.9;
      if (c.trail) { c.trail.push(m.position); c.trail.setOpacity(0.2 + c.heat * 0.7); }

      // recycle: fell back through the crust, expired, or sailed too far away
      const fellIn = dist < GLOBE_RADIUS * 0.99 && inward;
      if (fellIn || c.age > c.life || dist > 6) {
        if (c.trail) c.trail.dispose();
        this.group.remove(m);
        this._pool.release(m);
        continue;
      }
      keep.push(c);
    }
    this._live = keep;
  }

  /** drop all debris (e.g. on game reset) */
  clear() {
    for (const c of this._live) { this.group.remove(c.mesh); this._pool.release(c.mesh); }
    this._live = [];
  }
}
