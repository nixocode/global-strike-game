import * as THREE from 'three';
import { feature, mesh } from 'topojson-client';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// Chromatic aberration (radial RGB split) + vignette. Strength pulses on big hits.
const ImpactFXShader = {
  uniforms: { tDiffuse: { value: null }, uAmount: { value: 0.0 }, uVignette: { value: 0.5 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uAmount; uniform float uVignette; varying vec2 vUv;
    void main(){
      vec2 c = vUv - 0.5;
      float a = uAmount * (0.35 + dot(c,c)); // stronger toward the edges
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + c * a).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - c * a).b;
      float vig = 1.0 - smoothstep(0.35, 0.85, length(c)) * uVignette;
      gl_FragColor = vec4(col * vig, 1.0);
    }`,
};

export const EARTH_TEX = 'https://unpkg.com/three-globe@2.31.1/example/img/earth-blue-marble.jpg';
const BUMP_TEX = 'https://unpkg.com/three-globe@2.31.1/example/img/earth-topology.png';
const ATLAS = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

export const GLOBE_RADIUS = 1;

/** lat/lng (degrees) → world-space position on a sphere of radius r */
export function latLngToVec3(lat, lng, r = GLOBE_RADIUS, target = new THREE.Vector3()) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return target.set(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta)
  );
}

/**
 * The 3D earth: textured sphere, atmosphere, stars, lights, vector borders,
 * and orbit-style controls (drag inertia + zoom). Pure rendering — knows nothing
 * about game rules. The game group rotates as one so markers/missiles ride along.
 */
export class Globe {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
    this.camera.position.set(0, 0, 3);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // filmic, photographic look + correct colour
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.group = new THREE.Group(); // everything that rotates with the earth
    this.scene.add(this.group);

    // ── rotation / zoom state (spherical) ──
    this.rotLon = 20;
    this.rotLat = -10;
    this.targetLon = 20;
    this.targetLat = -10;
    this.dist = 3;
    this.targetDist = 3;
    this.velLon = 0;
    this.velLat = 0;
    this.autoRotate = true;

    // screen shake (set by VFX)
    this.shake = 0;

    this._buildScene();
    this._setupPostFX();
    this._bindControls();
    this._resize();
    window.addEventListener('resize', () => this._resize());

    this._raycaster = new THREE.Raycaster();
    this._tmp = new THREE.Vector3();
  }

  /** Post-processing: bloom makes lava/cracks/explosions genuinely glow. */
  _setupPostFX() {
    const w = window.innerWidth, h = window.innerHeight;
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.6, 0.5, 0.72);
    // strength, radius, threshold — high threshold + modest strength so cracks &
    // fireballs glow without the white-hot core washing the whole screen out.
    // Bloom needs half-float render targets — unavailable under software WebGL
    // (SwiftShader), where it renders black. Escape hatch: load with ?nobloom.
    if (!/[?&]nobloom/.test(location.search)) this.composer.addPass(this.bloom);
    this.fxPass = new ShaderPass(ImpactFXShader);
    this.composer.addPass(this.fxPass);
    this.composer.addPass(new OutputPass());
  }

  /** transient camera zoom-punch (decays) */
  addPunch(a) { this.punch = Math.min(0.9, (this.punch || 0) + a); }
  /** transient chromatic-aberration / vignette pulse (decays) */
  addFxPulse(a) { this.fxPulse = Math.min(1.5, (this.fxPulse || 0) + a); }

  _buildScene() {
    // stars
    const starGeo = new THREE.BufferGeometry();
    const N = 1800;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const r = 40 + Math.random() * 40;
      const t = Math.random() * Math.PI * 2;
      const p = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(p) * Math.cos(t);
      pos[i * 3 + 1] = r * Math.sin(p) * Math.sin(t);
      pos[i * 3 + 2] = r * Math.cos(p);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.scene.add(
      new THREE.Points(
        starGeo,
        new THREE.PointsMaterial({ color: 0x8899bb, size: 0.06, sizeAttenuation: true, transparent: true, opacity: 0.7 })
      )
    );

    // earth (placeholder color until texture loads)
    const geo = new THREE.SphereGeometry(GLOBE_RADIUS, 96, 64);
    const mat = new THREE.MeshPhongMaterial({ color: 0x16263a, emissive: 0x0a121c, specular: 0x223355, shininess: 12 });
    this.earth = new THREE.Mesh(geo, mat);
    this.group.add(this.earth);
    this._loadEarthTexture(mat);

    // atmosphere glow
    const atmGeo = new THREE.SphereGeometry(GLOBE_RADIUS * 1.02, 64, 32);
    const atmMat = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.BackSide,
      uniforms: {},
      vertexShader: `varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying vec3 vN; void main(){ float i = pow(0.7 - dot(vN, vec3(0,0,1.0)), 2.0); gl_FragColor = vec4(0.35,0.55,1.0,1.0) * i; }`,
    });
    this.scene.add(new THREE.Mesh(atmGeo, atmMat));

    // lights
    this.scene.add(new THREE.AmbientLight(0x8899aa, 0.9));
    const key = new THREE.DirectionalLight(0xddeeff, 1.15);
    key.position.set(3, 2, 4);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x4466aa, 0.4);
    fill.position.set(-4, -1, -2);
    this.scene.add(fill);

    this._loadBorders();
  }

  _loadEarthTexture(mat) {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(EARTH_TEX, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      mat.map = tex;
      mat.color.set(0xffffff);
      mat.emissive.set(0x0a0e14);
      mat.needsUpdate = true;
    });
    loader.load(BUMP_TEX, (tex) => {
      mat.bumpMap = tex;
      mat.bumpScale = 0.01;
      mat.needsUpdate = true;
    });
  }

  async _loadBorders() {
    try {
      const world = await fetch(ATLAS).then((r) => r.json());
      const borders = mesh(world, world.objects.countries, (a, b) => a !== b);
      const pts = [];
      for (const line of borders.coordinates) {
        for (let i = 0; i < line.length - 1; i++) {
          latLngToVec3(line[i][1], line[i][0], GLOBE_RADIUS * 1.001, this._tmp);
          pts.push(this._tmp.x, this._tmp.y, this._tmp.z);
          latLngToVec3(line[i + 1][1], line[i + 1][0], GLOBE_RADIUS * 1.001, this._tmp);
          pts.push(this._tmp.x, this._tmp.y, this._tmp.z);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const lines = new THREE.LineSegments(
        geo,
        new THREE.LineBasicMaterial({ color: 0x5fd0ff, transparent: true, opacity: 0.22 })
      );
      this.group.add(lines);
    } catch (e) {
      console.warn('[Globe] borders failed to load:', e);
    }
  }

  // ── controls ──
  _bindControls() {
    const el = this.canvas;
    let down = false;
    let lastX = 0;
    let lastY = 0;

    el.addEventListener('pointerdown', (e) => {
      down = true;
      lastX = e.clientX;
      lastY = e.clientY;
      this.autoRotate = false;
      this.velLon = this.velLat = 0;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!down) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      this.targetLon += dx * 0.3;
      this.targetLat = Math.max(-85, Math.min(85, this.targetLat + dy * 0.3));
      this.velLon = dx * 0.3;
      this.velLat = dy * 0.3;
    });
    const up = () => {
      down = false;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointerleave', up);
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.targetDist = Math.max(1.4, Math.min(6, this.targetDist + e.deltaY * 0.0016));
      },
      { passive: false }
    );
  }

  /** screen → globe surface hit { lat, lng } or null */
  pickLatLng(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    this._raycaster.setFromCamera(ndc, this.camera);
    const hit = this._raycaster.intersectObject(this.earth, false)[0];
    if (!hit) return null;
    const local = this.earth.worldToLocal(hit.point.clone());
    const lat = 90 - (Math.acos(local.y / GLOBE_RADIUS) * 180) / Math.PI;
    const lng = ((Math.atan2(local.z, -local.x) * 180) / Math.PI) - 180;
    return { lat, lng: ((lng + 540) % 360) - 180 };
  }

  /** project a world-space point to screen pixels (for HTML markers) */
  project(vec3, out = { x: 0, y: 0, visible: false }) {
    this._tmp.copy(vec3).applyMatrix4(this.group.matrixWorld);
    const cam = this._tmp.clone().project(this.camera);
    const rect = this.canvas.getBoundingClientRect();
    out.x = ((cam.x + 1) / 2) * rect.width;
    out.y = ((-cam.y + 1) / 2) * rect.height;
    // visible if in front of the globe (z toward camera)
    const dot = this._tmp.clone().sub(this.camera.position).normalize().dot(this._tmp.clone().normalize());
    out.visible = cam.z < 1 && dot < 0.2;
    return out;
  }

  _resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.bloom?.setSize(w, h);
  }

  /** called every render frame */
  update(dt) {
    if (this.autoRotate) this.targetLon -= 2.5 * dt;
    // inertia after drag
    if (Math.abs(this.velLon) > 0.01 || Math.abs(this.velLat) > 0.01) {
      this.targetLon += this.velLon;
      this.targetLat = Math.max(-85, Math.min(85, this.targetLat + this.velLat));
      this.velLon *= 0.92;
      this.velLat *= 0.92;
    }
    this.rotLon += (this.targetLon - this.rotLon) * 0.12;
    this.rotLat += (this.targetLat - this.rotLat) * 0.12;
    this.dist += (this.targetDist - this.dist) * 0.12;

    this.group.rotation.y = THREE.MathUtils.degToRad(this.rotLon);
    this.group.rotation.x = THREE.MathUtils.degToRad(this.rotLat);

    // screen shake decays
    let sx = 0;
    let sy = 0;
    if (this.shake > 0.001) {
      sx = (Math.random() - 0.5) * this.shake * 0.06;
      sy = (Math.random() - 0.5) * this.shake * 0.06;
      this.shake *= 0.86;
    }
    // zoom-punch: a quick dolly-in that decays back out
    this.punch = (this.punch || 0) * 0.86;
    this.camera.position.set(sx, sy, this.dist - this.punch);
    this.camera.lookAt(0, 0, 0);

    // chromatic aberration + vignette: a baseline + a decaying pulse on big hits
    this.fxPulse = (this.fxPulse || 0) * 0.9;
    if (this.fxPass) {
      this.fxPass.uniforms.uAmount.value = 0.0012 + this.fxPulse * 0.012;
      this.fxPass.uniforms.uVignette.value = 0.42 + this.fxPulse * 0.3;
    }

    this.group.updateMatrixWorld();
    this.composer.render();
  }

  addShake(amount) {
    this.shake = Math.min(1.5, this.shake + amount);
  }
}
