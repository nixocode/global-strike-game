import * as THREE from 'three';

/**
 * A short glowing re-entry streak that follows a moving body. Stores the last N
 * world positions as a line whose colour fades to black down the tail (additive,
 * so black = invisible → a comet-like trail). Cheap: one Line, N verts, no pool.
 */
export class Trail {
  constructor(group, n = 12, color = 0xff7a2a) {
    this.group = group;
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    const col = new Float32Array(n * 3);
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      const f = 1 - i / (n - 1); // 1 at head → 0 at tail
      col[i * 3] = c.r * f; col[i * 3 + 1] = c.g * f; col[i * 3 + 2] = c.b * f;
    }
    this.geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.line = new THREE.Line(this.geo, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.line.frustumCulled = false;
    this._primed = false;
    group.add(this.line);
  }

  push(p) {
    if (!this._primed) { // fill the whole trail with the first point (no streak from origin)
      for (let i = 0; i < this.n; i++) { this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z; }
      this._primed = true;
    } else {
      for (let i = this.n - 1; i > 0; i--) {
        this.pos[i * 3] = this.pos[(i - 1) * 3];
        this.pos[i * 3 + 1] = this.pos[(i - 1) * 3 + 1];
        this.pos[i * 3 + 2] = this.pos[(i - 1) * 3 + 2];
      }
      this.pos[0] = p.x; this.pos[1] = p.y; this.pos[2] = p.z;
    }
    this.geo.attributes.position.needsUpdate = true;
  }

  setOpacity(o) { this.line.material.opacity = o; }

  dispose() {
    this.group.remove(this.line);
    this.geo.dispose();
    this.line.material.dispose();
  }
}
