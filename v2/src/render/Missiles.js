import * as THREE from 'three';
import { EV } from '../core/EventBus.js';
import { Pool } from '../core/pool.js';
import { latLngToVec3, GLOBE_RADIUS } from './Globe.js';

const TRAIL_PTS = 48;

/**
 * Visual missiles. Subscribes to sim events and mirrors the authoritative munition
 * state (reads each munition's `t`). Trails + dots are pooled — no per-launch GC.
 */
export class MissileLayer {
  constructor(globe, bus) {
    this.globe = globe;
    this.bus = bus;
    this.group = new THREE.Group();
    globe.group.add(this.group);

    this._active = new Map(); // munitionId -> renderObj

    this._linePool = new Pool(
      () => {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_PTS * 3), 3));
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ transparent: true, opacity: 0.7 }));
        line.frustumCulled = false;
        return line;
      },
      (l) => {
        l.visible = false;
      }
    );
    this._dotPool = new Pool(
      () => new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 8), new THREE.MeshBasicMaterial()),
      (d) => {
        d.visible = false;
      }
    );

    bus.on(EV.MISSILE_LAUNCH, (m) => this._spawn(m));
    bus.on(EV.MISSILE_INTERCEPT, (m) => this._remove(m.id, true));
    bus.on(EV.MISSILE_IMPACT, (m) => this._remove(m.id, false));
  }

  _spawn(m) {
    const start = latLngToVec3(m.fromLat, m.fromLng, GLOBE_RADIUS * 1.002);
    const end = latLngToVec3(m.toLat, m.toLng, GLOBE_RADIUS * 1.002);
    const mid = start.clone().add(end).multiplyScalar(0.5).normalize().multiplyScalar(GLOBE_RADIUS * m.arc);
    const curve = new THREE.QuadraticBezierCurve3(start, mid, end);

    const line = this._linePool.acquire();
    line.visible = true;
    const enemy = m.ownerId !== this.globe._playerId;
    const color = enemy ? 0xff5544 : 0x66ccff;
    line.material.color.setHex(color);
    line.material.opacity = enemy ? 0.55 : 0.7;
    this.group.add(line);

    const dot = this._dotPool.acquire();
    dot.visible = true;
    dot.material.color.setHex(enemy ? 0xffaa66 : 0xaaddff);
    this.group.add(dot);

    this._active.set(m.id, { m, curve, line, dot });
  }

  _remove(id, intercepted) {
    const o = this._active.get(id);
    if (!o) return;
    if (intercepted) this.bus.emit('vfx:interceptFlash', o.curve.getPoint(o.m.intercept.t));
    this.group.remove(o.line);
    this.group.remove(o.dot);
    this._linePool.release(o.line);
    this._dotPool.release(o.dot);
    this._active.delete(id);
  }

  /** set which nation is the player so we can colour outgoing vs incoming */
  setPlayer(id) {
    this.globe._playerId = id;
  }

  update() {
    const tmp = new THREE.Vector3();
    for (const o of this._active.values()) {
      const head = o.m.intercept.intercepted ? Math.min(o.m.t, o.m.intercept.t) : o.m.t;
      // draw the trail from launch up to the current head
      const pos = o.line.geometry.attributes.position;
      for (let i = 0; i < TRAIL_PTS; i++) {
        const tt = (i / (TRAIL_PTS - 1)) * head;
        o.curve.getPoint(tt, tmp);
        pos.setXYZ(i, tmp.x, tmp.y, tmp.z);
      }
      pos.needsUpdate = true;
      o.curve.getPoint(head, tmp);
      o.dot.position.copy(tmp);
    }
  }
}
