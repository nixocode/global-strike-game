import * as THREE from 'three';
import { EV } from '../core/EventBus.js';
import { Pool } from '../core/pool.js';
import { latLngToVec3, GLOBE_RADIUS } from './Globe.js';

const SPHERE = new THREE.SphereGeometry(1, 16, 16);
const RING = new THREE.RingGeometry(0.6, 1, 32);
const CYL = new THREE.CylinderGeometry(1, 0.7, 1, 14); // mushroom stem (axis = +Y)

const _Y = new THREE.Vector3(0, 1, 0);

/**
 * Pooled detonation VFX: flash, shockwave rings, fireball, rising smoke, plus
 * the interceptor kill-flash. Everything is recycled — no allocation in the burst.
 * Emits a 'vfx:bigBlast' so the arcade chunk system (M4) can react.
 */
export class ExplosionLayer {
  constructor(globe, bus, mode) {
    this.globe = globe;
    this.bus = bus;
    this.mode = mode;
    this.group = new THREE.Group();
    globe.group.add(this.group);

    this._fx = [];
    this._sphere = new Pool(
      () => new THREE.Mesh(SPHERE, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })),
      (m) => { m.visible = false; }
    ).warm(40);
    this._ring = new Pool(
      () => new THREE.Mesh(RING, new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })),
      (m) => { m.visible = false; }
    ).warm(16);
    this._smoke = new Pool(
      () => new THREE.Mesh(SPHERE, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false })),
      (m) => { m.visible = false; m.quaternion.identity(); }
    ).warm(48);
    this._stem = new Pool(
      () => new THREE.Mesh(CYL, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false })),
      (m) => { m.visible = false; m.quaternion.identity(); }
    ).warm(12);

    bus.on(EV.CITY_HIT, (e) => this.blast(e.lat, e.lng, e.yieldMul || 1));
    bus.on('vfx:interceptFlash', (pos) => this.interceptFlash(pos));
  }

  _spawn(pool, { pos, scale, color, opacity, kind, life, ...extra }) {
    const m = pool.acquire();
    m.visible = true;
    m.position.copy(pos);
    m.scale.setScalar(scale);
    m.material.color.setHex(color);
    m.material.opacity = opacity;
    this.group.add(m);
    this._fx.push({ mesh: m, pool, kind, age: 0, life, basePos: pos.clone(), normal: pos.clone().normalize(), startScale: scale, opacity, ...extra });
    return m;
  }

  blast(lat, lng, yieldMul) {
    const scale = (this.mode.physics.yieldScale || 1) * (0.6 + yieldMul * 0.5);
    const pos = latLngToVec3(lat, lng, GLOBE_RADIUS * 1.01);

    // flash
    this._spawn(this._sphere, { pos, scale: 0.02 * scale, color: 0xffffff, opacity: 1, kind: 'flash', life: 0.35 });
    // fireball
    this._spawn(this._sphere, { pos, scale: 0.03 * scale, color: 0xff6a1a, opacity: 0.95, kind: 'fireball', life: 1.4 });
    // shockwave rings (more in arcade)
    const rings = this.mode.id === 'arcade' ? 3 : 2;
    for (let i = 0; i < rings; i++) {
      const r = this._spawn(this._ring, { pos: pos.clone(), scale: 0.02 * scale, color: i === 0 ? 0xffdd88 : 0xff7744, opacity: 0.8, kind: 'ring', life: 1.0 + i * 0.25, delay: i * 0.08 });
      r.lookAt(pos.clone().multiplyScalar(2));
    }
    // a few faint low puffs at the base
    const puffs = this.mode.id === 'arcade' ? 4 : 3;
    for (let i = 0; i < puffs; i++) {
      const jitter = new THREE.Vector3((Math.random() - 0.5) * 0.02, (Math.random() - 0.5) * 0.02, (Math.random() - 0.5) * 0.02);
      this._spawn(this._smoke, {
        pos: pos.clone().add(jitter), scale: 0.012 * scale, color: 0x9a8f86, opacity: 0.0, kind: 'smoke',
        life: 2.4 + Math.random(), rise: 0.03 + Math.random() * 0.04, grow: 0.02 * scale,
      });
    }

    // iconic mushroom cloud: rising stem + billowing cap
    this._mushroom(pos, scale);

    this.globe.addShake((this.mode.physics.screenShake || 0.3) * (0.4 + yieldMul * 0.3));
    this.globe.addFxPulse(0.06 + yieldMul * 0.04);
    this.bus.emit('vfx:bigBlast', { pos, lat, lng, yieldMul, scale });
  }

  interceptFlash(pos) {
    this._spawn(this._sphere, { pos: pos.clone(), scale: 0.012, color: 0xccffff, opacity: 1, kind: 'flash', life: 0.4 });
    const r = this._spawn(this._ring, { pos: pos.clone(), scale: 0.01, color: 0x88ddff, opacity: 0.9, kind: 'ring', life: 0.5, delay: 0 });
    r.lookAt(pos.clone().multiplyScalar(2));
  }

  /** Rising stem + billowing cap, oriented to the surface normal. */
  _mushroom(pos, scale) {
    const normal = pos.clone().normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(_Y, normal);
    const stemH = (0.07 + 0.03 * Math.random()) * scale;
    const stemR = 0.012 * scale;
    const capR = 0.05 * scale;

    const stem = this._stem.acquire();
    stem.visible = true;
    stem.quaternion.copy(q);
    stem.material.color.setHex(0xb0a89e); // grey-brown smoke
    stem.material.opacity = 0;
    this.group.add(stem);
    this._fx.push({ mesh: stem, pool: this._stem, kind: 'mushStem', age: 0, life: 3.0, base: pos.clone(), normal, q, stemH, stemR });

    const cap = this._smoke.acquire();
    cap.visible = true;
    cap.quaternion.copy(q);
    cap.material.color.setHex(0xc9bfb4);
    cap.material.opacity = 0;
    this.group.add(cap);
    this._fx.push({ mesh: cap, pool: this._smoke, kind: 'mushCap', age: 0, life: 3.4, base: pos.clone(), normal, q, stemH, capR });

    // a couple of billow puffs around the cap for a fuller head
    for (let i = 0; i < 2; i++) {
      const p = this._smoke.acquire();
      p.visible = true;
      p.material.color.setHex(0xb8ada2);
      p.material.opacity = 0;
      this.group.add(p);
      this._fx.push({
        mesh: p, pool: this._smoke, kind: 'mushBillow', age: 0, life: 3.0, base: pos.clone(), normal,
        stemH, capR, off: (Math.random() - 0.5) * 2, side: i === 0 ? 1 : -1,
      });
    }
  }

  update(dt) {
    for (const fx of this._fx) {
      fx.age += dt;
      if (fx.delay && fx.age < fx.delay) continue;
      const a = (fx.age - (fx.delay || 0)) / fx.life;
      const m = fx.mesh;
      if (a >= 1) { fx.done = true; continue; }

      if (fx.kind === 'flash') {
        m.scale.setScalar(fx.startScale * (1 + a * 16));
        m.material.opacity = (1 - a) * (1 - a);
      } else if (fx.kind === 'fireball') {
        m.scale.setScalar(fx.startScale * (1 + a * 4));
        const r = a < 0.4 ? 1 : Math.max(0.2, 1 - (a - 0.4));
        m.material.color.setRGB(r, Math.max(0, 0.45 - a * 0.45), 0);
        m.material.opacity = Math.max(0, 0.95 - a);
        m.position.copy(fx.basePos).add(fx.normal.clone().multiplyScalar(a * 0.03));
      } else if (fx.kind === 'ring') {
        m.scale.setScalar(fx.startScale * (1 + a * 22));
        m.material.opacity = Math.max(0, 0.8 * (1 - a));
      } else if (fx.kind === 'smoke') {
        const grow = fx.startScale + a * fx.grow;
        m.scale.setScalar(grow);
        m.position.copy(fx.basePos).add(fx.normal.clone().multiplyScalar(a * fx.rise));
        m.material.opacity = Math.sin(Math.min(1, a * 1.5) * Math.PI) * 0.5;
      } else if (fx.kind === 'mushStem') {
        // column grows up the normal from the surface
        const grow = Math.min(1, a * 2.2);
        const h = fx.stemH * grow;
        m.scale.set(fx.stemR * (0.7 + a * 0.5), h, fx.stemR * (0.7 + a * 0.5));
        m.position.copy(fx.base).addScaledVector(fx.normal, h * 0.5);
        m.material.opacity = Math.sin(Math.min(1, a * 1.4) * Math.PI) * 0.6;
      } else if (fx.kind === 'mushCap') {
        // billowing head rises off the stem and flattens (flatten axis = normal)
        const rise = fx.stemH + fx.capR * a * 1.4;
        const r = fx.capR * (0.35 + Math.min(1, a * 1.6));
        m.scale.set(r, r * 0.55, r);
        m.position.copy(fx.base).addScaledVector(fx.normal, rise);
        m.material.opacity = Math.sin(Math.min(1, a * 1.3) * Math.PI) * 0.62;
      } else if (fx.kind === 'mushBillow') {
        const rise = fx.stemH + fx.capR * (0.6 + a * 1.2);
        const r = fx.capR * (0.25 + a * 0.7);
        m.scale.setScalar(r);
        // sit to the side of the cap, drifting outward as it rises
        const tan = new THREE.Vector3(fx.normal.z, 0, -fx.normal.x).normalize();
        m.position.copy(fx.base).addScaledVector(fx.normal, rise).addScaledVector(tan, fx.side * fx.capR * (0.5 + a * 0.6) * fx.off);
        m.material.opacity = Math.sin(Math.min(1, a * 1.3) * Math.PI) * 0.5;
      }
    }
    // recycle finished
    if (this._fx.length) {
      const keep = [];
      for (const fx of this._fx) {
        if (fx.done) { this.group.remove(fx.mesh); fx.pool.release(fx.mesh); }
        else keep.push(fx);
      }
      this._fx = keep;
    }
  }
}
