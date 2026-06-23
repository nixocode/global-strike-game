import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { EV } from '../core/EventBus.js';
import { latLngToVec3, GLOBE_RADIUS, EARTH_TEX } from './Globe.js';
import { Trail } from './Trail.js';

/**
 * Arcade-only layered, fracturable planet. Two shells over the base globe:
 *   • a glowing molten MANTLE just above the surface (occludes the base earth), and
 *   • a CRUST built from a grid of lat/lng tiles, each textured with the real
 *     Blue-Marble via sphere-matched UVs so assembled it looks like the planet.
 *
 * Every big blast tears off the crust tiles within an angular radius — real
 * continents fly off as tumbling rigid bodies with molten edges, exposing the
 * glowing mantle beneath. Damage accumulates from wherever the player strikes,
 * so the planet shatters differently every game (sandbox, never scripted).
 *
 * The tile set is fixed (allocated once); detached tiles animate then hide — no
 * per-frame allocation. Inert in realistic mode.
 */

const LNG_SEG = 20; // tiles around the equator
const LAT_SEG = 10; // tiles pole-to-pole
const TILE_SUB = 2; // subdivisions per tile (curvature)
const CRUST_R = GLOBE_RADIUS * 1.012;
const MANTLE_R = GLOBE_RADIUS * 1.003;

/** Procedural molten-rock texture: dark basalt shot through with glowing veins,
 *  so the exposed mantle reads as turbulent lava instead of a flat orange field. */
function makeLavaTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#120300';
  x.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 220; i++) {
    const r = 8 + Math.random() * 64;
    const px = Math.random() * 512, py = Math.random() * 512;
    const hot = Math.random();
    const col = hot > 0.72 ? '255,224,130' : hot > 0.42 ? '255,120,32' : '150,34,8';
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, `rgba(${col},${0.45 + Math.random() * 0.5})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.beginPath();
    x.arc(px, py, r, 0, 7);
    x.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 2);
  return tex;
}

/** Curved sphere-patch geometry for one lat/lng tile, with equirectangular UVs
 *  matching THREE.SphereGeometry so the texture registers with the base globe.
 *  Vertices are recentred on the tile so the mesh can tumble about its own centre. */
function makeTileGeo(lat0, lat1, lng0, lng1, R, sub) {
  const n = sub + 1;
  const pos = [], uv = [], norm = [], idx = [];
  for (let r = 0; r < n; r++) {
    const lat = lat0 + (lat1 - lat0) * (r / (n - 1));
    for (let c = 0; c < n; c++) {
      const lng = lng0 + (lng1 - lng0) * (c / (n - 1));
      const v = latLngToVec3(lat, lng, R);
      pos.push(v.x, v.y, v.z);
      const u = v.clone().normalize();
      norm.push(u.x, u.y, u.z);
      uv.push((lng + 180) / 360, (lat + 90) / 180);
    }
  }
  for (let r = 0; r < n - 1; r++)
    for (let c = 0; c < n - 1; c++) {
      const a = r * n + c, b = a + 1, d = a + n, e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
  const center = latLngToVec3((lat0 + lat1) / 2, (lng0 + lng1) / 2, R);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.translate(-center.x, -center.y, -center.z); // recentre on tile
  return { geo: g, center };
}

export class CrustShell {
  constructor(globe, bus, mode) {
    this.globe = globe;
    this.bus = bus;
    this.mode = mode;
    this.active = mode.id === 'arcade';
    this._t = 0;
    if (!this.active) return;

    this.shell = new THREE.Group();
    globe.group.add(this.shell);

    // brighten the planet (lit, dramatic) + warm molten underglow
    globe.scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x551a05, 0.7));

    // molten mantle — sits above the base earth so it shows through crust gaps
    const lava = makeLavaTexture();
    this.mantleMat = new THREE.MeshStandardMaterial({
      color: 0x140400, map: lava, emissive: 0xffffff, emissiveMap: lava,
      emissiveIntensity: 1.15, roughness: 1, metalness: 0,
    });
    this.shell.add(new THREE.Mesh(new THREE.SphereGeometry(MANTLE_R, 64, 48), this.mantleMat));

    // escalation state
    this.stress = 0; // 0..1 cumulative planetary devastation
    this.shock = 0; // transient pulse impulse (set when crust tears off)
    this.dead = false; // endgame: planet has collapsed
    this.deathT = 0; // seconds since collapse

    // crust tiles
    this.tiles = []; // attached: { mesh, mat, center, dir, dmg }
    this.detached = []; // flying: { mesh, vel, spin, age, life, heat, mat }
    for (let iy = 0; iy < LAT_SEG; iy++) {
      const lat0 = 90 - iy * (180 / LAT_SEG);
      const lat1 = 90 - (iy + 1) * (180 / LAT_SEG);
      for (let ix = 0; ix < LNG_SEG; ix++) {
        const lng0 = -180 + ix * (360 / LNG_SEG);
        const lng1 = -180 + (ix + 1) * (360 / LNG_SEG);
        const { geo, center } = makeTileGeo(lat0, lat1, lng0, lng1, CRUST_R, TILE_SUB);
        const mat = new THREE.MeshStandardMaterial({
          color: 0x2b3a4a, roughness: 0.92, metalness: 0, side: THREE.DoubleSide,
          emissive: 0xff3000, emissiveIntensity: 0,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(center);
        this.shell.add(mesh);
        this.tiles.push({ mesh, mat, center: center.clone(), dir: center.clone().normalize(), dmg: 0 });
      }
    }

    // drop the real Blue-Marble onto every tile once it loads
    this.crustTex = null;
    new THREE.TextureLoader().setCrossOrigin('anonymous').load(EARTH_TEX, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      this.crustTex = tex;
      for (const t of this.tiles) {
        t.mat.map = tex;
        t.mat.color.set(0xffffff);
        t.mat.needsUpdate = true;
      }
    });

    bus.on('vfx:bigBlast', (e) => this.impact(e));
  }

  /**
   * A detonation damages the crust around it. Routine hits only scorch + heat the
   * surface; the crust only TEARS OFF where accumulated damage crosses a threshold
   * (i.e. a region that's been heavily, repeatedly struck). Each tear-off pulses
   * the whole planet. Cumulative stress makes the crust give way ever more easily.
   */
  impact({ pos, yieldMul = 1 }) {
    if (!this.active) return;
    const dir = pos.clone().normalize();
    const cosR = Math.cos(0.16 + yieldMul * 0.06); // damage footprint (wider than a single tile)
    const ejectAt = 3.0 * (1 - this.stress * 0.5); // crust gives way sooner as the planet falls apart

    this.stress = Math.min(1, this.stress + 0.025 * yieldMul);

    const critical = [];
    for (let i = this.tiles.length - 1; i >= 0; i--) {
      const t = this.tiles[i];
      const d = t.dir.dot(dir);
      if (d < cosR) continue;
      const prox = (d - cosR) / (1 - cosR); // 0 at edge → 1 at centre
      t.dmg += (0.8 + yieldMul * 0.6) * (0.3 + 0.7 * prox);
      this._scorch(t, ejectAt);
      if (t.dmg >= ejectAt) {
        this.tiles.splice(i, 1);
        critical.push(t);
      }
    }

    if (critical.length) {
      this._ejectPlate(critical, yieldMul);
      this.shock = Math.min(1.6, this.shock + 0.7 + critical.length * 0.08); // planet-wide pulse
      this.stress = Math.min(1, this.stress + 0.03 * critical.length); // losing crust accelerates collapse
      this.globe.addShake(0.5 + critical.length * 0.12);
      this.globe.addPunch(0.12 + critical.length * 0.03);
      this.globe.addFxPulse(0.3 + critical.length * 0.05);
    }
  }

  /** Endgame: the planet comes apart — core ignites, all crust ejects, the largest
   *  plates settle into orbit around the glowing core. Fires once. */
  _planetDeath() {
    this.dead = true;
    this.deathT = 0;
    this.shock = 1.6;
    this.globe.addShake(2.2);
    // pull the camera back to reveal the shattered world + debris ring, and let it spin
    this.globe.targetDist = Math.max(this.globe.targetDist, 3.6);
    this.globe.autoRotate = true;
    this.globe.addPunch(0.5);
    this.globe.addFxPulse(1.3);
    this.bus.emit('vfx:slowmo', { scale: 0.32 });
    this.bus.emit('vfx:collapse');
    this.bus.emit(EV.TOAST, { msg: '☄ PLANETARY COLLAPSE — the crust is flung into orbit', kind: 'danger' });

    // cluster every remaining tile into large plates; the first few go to orbit
    const pool = this.tiles.splice(0);
    let orbited = 0;
    while (pool.length) {
      const seed = pool.pop();
      const cluster = [seed];
      for (let i = pool.length - 1; i >= 0; i--) {
        if (pool[i].dir.dot(seed.dir) > Math.cos(0.55)) cluster.push(pool.splice(i, 1)[0]);
      }
      const toOrbit = orbited < 4 && cluster.length >= 2;
      if (toOrbit) orbited++;
      this._ejectPlate(cluster, 2.0, toOrbit ? { orbit: 1.8 + Math.random() * 0.8, speedMul: 1.5 } : { speedMul: 1.3 });
    }

    // debris + fissure storm for the ejecta burst
    for (let i = 0; i < 8; i++) {
      const lat = Math.random() * 160 - 80, lng = Math.random() * 360 - 180;
      this.bus.emit('vfx:bigBlast', { pos: latLngToVec3(lat, lng, GLOBE_RADIUS * 1.01), lat, lng, yieldMul: 2.2, scale: 2.5 });
    }
  }

  /** Char + heat a damaged-but-still-attached tile (telegraphs the coming break). */
  _scorch(t, ejectAt) {
    const f = Math.min(1, t.dmg / ejectAt);
    if (this.crustTex) t.mat.color.setRGB(1 - f * 0.82, 1 - f * 0.86, 1 - f * 0.9); // darken toward charred
    t.mat.emissive.setHex(0xff3a00);
    t.mat.emissiveIntensity = f * f * 0.8; // glows hotter the closer it is to giving way
  }

  /** Merge a cluster of critical tiles into one continental plate and blast it off.
   *  opts.orbit (radius) → the plate circularizes into orbit instead of falling away. */
  _ejectPlate(tiles, yieldMul, opts = {}) {
    const geos = [];
    for (const t of tiles) {
      const g = t.mesh.geometry.clone();
      g.translate(t.center.x, t.center.y, t.center.z);
      geos.push(g);
      this.shell.remove(t.mesh);
      t.mesh.geometry.dispose();
      t.mat.dispose();
    }
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) return;
    merged.computeBoundingSphere();
    const c = merged.boundingSphere.center.clone();
    merged.translate(-c.x, -c.y, -c.z);

    const mat = new THREE.MeshStandardMaterial({
      map: this.crustTex || null, color: this.crustTex ? 0xffffff : 0x2b3a4a,
      roughness: 0.9, metalness: 0, side: THREE.DoubleSide, emissive: 0xff5a1e, emissiveIntensity: 1.1,
    });
    const plate = new THREE.Mesh(merged, mat);
    plate.position.copy(c);
    this.shell.add(plate);

    const speed = (opts.speedMul ?? 1) * (0.18 + Math.random() * 0.28) * (0.7 + yieldMul * 0.3);
    const vel = c.clone().normalize().multiplyScalar(speed).add(
      new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.08)
    );
    const item = {
      mesh: plate, mat, vel,
      spin: new THREE.Vector3((Math.random() - 0.5) * 1.3, (Math.random() - 0.5) * 1.3, (Math.random() - 0.5) * 1.3),
      age: 0, life: opts.orbit ? Infinity : 9 + Math.random() * 6, heat: 1.1,
    };
    if (opts.orbit) item.orbit = { radius: opts.orbit, w: 0.18 + Math.random() * 0.22, axis: null, locked: false };
    item.trail = new Trail(this.shell, 14, 0xff7a2a); // re-entry streak
    item.trail.push(c);
    this.detached.push(item);
  }

  update(dt) {
    if (!this.active) return;
    this._t += dt;

    // transient shock pulse decays fast (a "thump" when crust tears off)
    this.shock = Math.max(0, this.shock - dt * 4);

    // endgame trigger: total devastation, or the crust is nearly stripped bare
    if (!this.dead && (this.stress >= 1 || this.tiles.length <= 25)) this._planetDeath();
    if (this.dead) this.deathT += dt;

    // the whole planet pulsates + glows hotter with cumulative stress, flares on each
    // tear-off, and after collapse becomes a throbbing white-hot core.
    const breathe = Math.sin(this._t * 1.4) * 0.18;
    if (this.dead) {
      // a fierce molten core that throbs — but stays ORANGE so bloom glows, not whites out
      this.mantleMat.emissiveIntensity = 1.5 + this.shock * 0.7 + Math.sin(this._t * 4) * 0.25;
      this.mantleMat.emissive.lerp(new THREE.Color(0xff6a1e), Math.min(1, this.deathT * 0.5));
    } else {
      this.mantleMat.emissiveIntensity = 1.0 + breathe + this.stress * 0.8 + this.shock * 1.0;
    }
    const s = 1 + this.shock * 0.05 + (this.dead ? 0 : this.stress * Math.sin(this._t * 3.2) * 0.006);
    this.shell.scale.setScalar(s);

    if (!this.detached.length) return;
    const g = 0.9 * (this.mode.physics.gravity ?? 1);
    const keep = [];
    for (const d of this.detached) {
      d.age += dt;
      const m = d.mesh;

      // captured into orbit: revolve around the core, slow tumble, never culled
      if (d.orbit && d.orbit.locked) {
        m.position.applyAxisAngle(d.orbit.axis, d.orbit.w * dt);
        m.rotation.x += d.spin.x * dt * 0.3;
        m.rotation.y += d.spin.y * dt * 0.3;
        d.heat = Math.max(0, d.heat - dt * 0.4);
        d.mat.emissiveIntensity = 0.12 + d.heat * 0.3;
        d.trail.push(m.position);
        d.trail.setOpacity(0.25 + d.heat * 0.4);
        keep.push(d);
        continue;
      }

      const r = m.position.length() || 1e-6;
      d.vel.addScaledVector(m.position, (-g * dt) / r); // gravity toward core
      m.position.addScaledVector(d.vel, dt);
      m.rotation.x += d.spin.x * dt;
      m.rotation.y += d.spin.y * dt;
      m.rotation.z += d.spin.z * dt;

      d.heat = Math.max(0, d.heat - dt * 0.7);
      d.mat.emissiveIntensity = d.heat;
      d.trail.push(m.position);
      d.trail.setOpacity(0.3 + d.heat * 0.6);

      const dist = m.position.length();

      // circularize once a would-be moon climbs to its orbit radius
      if (d.orbit && dist >= d.orbit.radius) {
        d.orbit.locked = true;
        d.orbit.axis = m.position.clone().cross(d.vel).normalize();
        if (!isFinite(d.orbit.axis.x) || d.orbit.axis.lengthSq() < 1e-6) d.orbit.axis.set(0, 1, 0);
        keep.push(d);
        continue;
      }

      const inward = d.vel.dot(m.position) < 0;
      if (!d.orbit && ((dist < GLOBE_RADIUS * 0.9 && inward) || d.age > d.life || dist > 6)) {
        this.shell.remove(m); // dynamically built plate — dispose to free memory
        m.geometry.dispose();
        d.mat.dispose();
        d.trail.dispose();
        continue;
      }
      keep.push(d);
    }
    this.detached = keep;
  }
}
