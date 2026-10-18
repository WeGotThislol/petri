/**
 * A tiny, deterministic 2D physics engine for soft-ish creatures in fluid.
 *
 * Model (top-down view of a petri dish, so there is no gravity):
 *   - Particle (= a creature's JOINT): a point mass with a radius.
 *   - Bone: a rigid stick that keeps two particles at a fixed distance.
 *   - Muscle: a spring between two particles whose target length the brain
 *     controls every tick. Its pulling force is capped by its `strength`.
 *   - Fluid drag on bones: moving a bone sideways is much harder than moving
 *     it lengthwise (like an oar). Wiggling bones therefore produces thrust,
 *     which is how real micro-organisms and eels swim.
 *   - Collisions: joints of one creature against joints and bones of others.
 *
 * Integration scheme: "Position Based Dynamics" (PBD), the same family used
 * in many game engines:
 *     1. apply forces to velocities      v += f/m * h
 *     2. move particles                  x += v * h
 *     3. fix constraints by moving positions directly (bones, collisions)
 *     4. recompute velocity from how far the particle really moved
 * It is very stable even with rigid bones, which is what we need.
 *
 * DETERMINISM: only + - * / and Math.sqrt are used, all in a fixed order,
 * so results are bit-identical on every machine and browser.
 */

export interface Particle {
  x: number; y: number;      // position
  vx: number; vy: number;    // velocity
  px: number; py: number;    // position at the start of the substep
  fx: number; fy: number;    // force accumulator
  r: number;                 // collision radius
  invMass: number;           // 1/mass (0 would mean immovable)
  body: number;              // which creature owns it
}

export interface Bone { a: number; b: number; len: number; body: number }

export interface Muscle {
  a: number; b: number;
  rest: number;       // length at activation 0
  strength: number;   // 0..1, caps the force
  act: number;        // brain command in [-1, 1]: -1 = fully contracted
  body: number;
}

/** A contact that happened this tick, used for touch sensors and visual juice. */
export interface Contact { x: number; y: number; speed: number; bodyA: number; bodyB: number }

// ---- tuning constants (world units: 1 unit ≈ 1 µm on the scale bar) ----
// Kept in one object so tuning scripts can tweak them. Changing any value
// changes every simulation result, so shared replays only match within one version.
export const PHYS = {
  muscleRange: 0.5,   // a muscle can change length by ±50%
  muscleK: 3000,      // spring stiffness (force per unit stretch)
  muscleC: 100,       // spring damping
  muscleFmax: 40000,  // force at strength 1
  dragPerp: 0.4,      // sideways drag per unit bone length
  dragPar: 0.01,      // lengthwise drag per unit bone length
  dragJoint: 0.1,     // small drag on every joint
  density: 0.02,      // mass = density * r^2
  maxSpeed: 900,      // speed cap; anything faster is clamped (anti-exploit)
  iterations: 4,      // constraint solver passes per substep
};

export class World {
  particles: Particle[] = [];
  bones: Bone[] = [];
  muscles: Muscle[] = [];
  /** Contacts found during the last call to step(). */
  contacts: Contact[] = [];
  /** Per-body touch amount during the last step (sum of penetration depth). */
  touch: number[] = [];
  /** Per-body count of speed-cap hits (a symptom of physics exploits). */
  speedCapHits: number[] = [];

  addParticle(x: number, y: number, r: number, body: number): number {
    this.particles.push({ x, y, vx: 0, vy: 0, px: x, py: y, fx: 0, fy: 0, r, invMass: 1 / (PHYS.density * r * r), body });
    while (this.touch.length <= body) { this.touch.push(0); this.speedCapHits.push(0); }
    return this.particles.length - 1;
  }

  addBone(a: number, b: number): void {
    const pa = this.particles[a], pb = this.particles[b];
    this.bones.push({ a, b, len: dist(pa.x, pa.y, pb.x, pb.y), body: pa.body });
  }

  addMuscle(a: number, b: number, strength: number): number {
    const pa = this.particles[a], pb = this.particles[b];
    this.muscles.push({ a, b, rest: dist(pa.x, pa.y, pb.x, pb.y), strength, act: 0, body: pa.body });
    return this.muscles.length - 1;
  }

  /** Advance the world by `dt` seconds, split into `substeps` small steps. */
  step(dt: number, substeps: number): void {
    this.contacts.length = 0;
    for (let i = 0; i < this.touch.length; i++) this.touch[i] = 0;
    const h = dt / substeps;
    for (let s = 0; s < substeps; s++) this.substep(h, s === substeps - 1);
  }

  private substep(h: number, recordContacts: boolean): void {
    const ps = this.particles;
    for (const p of ps) { p.fx = 0; p.fy = 0; }
    this.applyMuscles();
    this.applyDrag();

    // Steps 1 + 2: integrate.
    for (const p of ps) {
      p.vx += p.fx * p.invMass * h;
      p.vy += p.fy * p.invMass * h;
      p.px = p.x; p.py = p.y;
      p.x += p.vx * h;
      p.y += p.vy * h;
    }

    // Step 3: satisfy constraints.
    for (let it = 0; it < PHYS.iterations; it++) {
      this.solveBones();
      this.solveCollisions(recordContacts && it === 0);
    }

    // Step 4: velocity = displacement / time, with a hard speed cap.
    for (const p of ps) {
      p.vx = (p.x - p.px) / h;
      p.vy = (p.y - p.py) / h;
      const v2 = p.vx * p.vx + p.vy * p.vy;
      if (v2 > PHYS.maxSpeed * PHYS.maxSpeed) {
        const k = PHYS.maxSpeed / Math.sqrt(v2);
        p.vx *= k; p.vy *= k;
        this.speedCapHits[p.body]++;
      }
    }
  }

  private applyMuscles(): void {
    const ps = this.particles;
    for (const m of this.muscles) {
      const a = ps[m.a], b = ps[m.b];
      const dx = b.x - a.x, dy = b.y - a.y;
      const L = Math.sqrt(dx * dx + dy * dy);
      if (L < 1e-9) continue;
      const ux = dx / L, uy = dy / L;
      const act = m.act < -1 ? -1 : m.act > 1 ? 1 : m.act;
      const target = m.rest * (1 + PHYS.muscleRange * act);
      const relVel = (b.vx - a.vx) * ux + (b.vy - a.vy) * uy;
      let f = PHYS.muscleK * (L - target) + PHYS.muscleC * relVel;
      const fmax = PHYS.muscleFmax * m.strength;
      if (f > fmax) f = fmax; else if (f < -fmax) f = -fmax;
      // Positive f = muscle too long = pull the ends together.
      a.fx += f * ux; a.fy += f * uy;
      b.fx -= f * ux; b.fy -= f * uy;
    }
  }

  private applyDrag(): void {
    const ps = this.particles;
    for (const p of ps) { p.fx -= PHYS.dragJoint * p.vx; p.fy -= PHYS.dragJoint * p.vy; }
    for (const bone of this.bones) {
      const a = ps[bone.a], b = ps[bone.b];
      const dx = b.x - a.x, dy = b.y - a.y;
      const L = Math.sqrt(dx * dx + dy * dy);
      if (L < 1e-9) continue;
      const tx = dx / L, ty = dy / L;
      const half = 0.5 * L;
      dragEnd(a, tx, ty, half);
      dragEnd(b, tx, ty, half);
    }
  }

  private solveBones(): void {
    const ps = this.particles;
    for (const bone of this.bones) {
      const a = ps[bone.a], b = ps[bone.b];
      const dx = b.x - a.x, dy = b.y - a.y;
      const L = Math.sqrt(dx * dx + dy * dy);
      const w = a.invMass + b.invMass;
      if (L < 1e-9 || w === 0) continue;
      // Move both ends along the bone so the length becomes bone.len again,
      // the lighter end moving more.
      const k = (L - bone.len) / (L * w);
      a.x += dx * k * a.invMass; a.y += dy * k * a.invMass;
      b.x -= dx * k * b.invMass; b.y -= dy * k * b.invMass;
    }
  }

  private solveCollisions(record: boolean): void {
    const ps = this.particles;
    // Joint vs joint (different bodies only).
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const p = ps[i], q = ps[j];
        if (p.body === q.body) continue;
        const dx = p.x - q.x, dy = p.y - q.y;
        const minD = p.r + q.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= minD * minD || d2 < 1e-12) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d, ny = dy / d, pen = minD - d;
        const w = p.invMass + q.invMass;
        if (record) this.record(p.vx - q.vx, p.vy - q.vy, p.body, q.body, nx, ny, pen, (q.x + p.x) * 0.5, (q.y + p.y) * 0.5);
        const lam = pen / w;
        p.x += nx * lam * p.invMass; p.y += ny * lam * p.invMass;
        q.x -= nx * lam * q.invMass; q.y -= ny * lam * q.invMass;
      }
    }
    // Joint vs bone (capsule) of a different body.
    for (const p of ps) {
      for (const bone of this.bones) {
        if (bone.body === p.body) continue;
        const a = ps[bone.a], b = ps[bone.b];
        const abx = b.x - a.x, aby = b.y - a.y;
        const ab2 = abx * abx + aby * aby;
        if (ab2 < 1e-12) continue;
        let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / ab2;
        if (t <= 0 || t >= 1) continue; // ends are handled by joint-vs-joint
        const cx = a.x + t * abx, cy = a.y + t * aby;
        const rc = a.r + t * (b.r - a.r);
        const dx = p.x - cx, dy = p.y - cy;
        const minD = p.r + rc * 0.7; // bones are a bit thinner than joints
        const d2 = dx * dx + dy * dy;
        if (d2 >= minD * minD || d2 < 1e-12) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d, ny = dy / d, pen = minD - d;
        const wa = (1 - t) * a.invMass, wb = t * b.invMass;
        const w = p.invMass + (1 - t) * wa + t * wb;
        if (record) {
          // Velocity of the touched point on the bone, interpolated.
          const qvx = a.vx + t * (b.vx - a.vx), qvy = a.vy + t * (b.vy - a.vy);
          this.record(p.vx - qvx, p.vy - qvy, p.body, bone.body, nx, ny, pen, cx, cy);
        }
        const lam = pen / w;
        p.x += nx * lam * p.invMass; p.y += ny * lam * p.invMass;
        a.x -= nx * lam * wa; a.y -= ny * lam * wa;
        b.x -= nx * lam * wb; b.y -= ny * lam * wb;
      }
    }
  }

  /** Remember a contact. (rvx, rvy) = velocity of body A's point relative to body B's. */
  private record(
    rvx: number, rvy: number, bodyA: number, bodyB: number,
    nx: number, ny: number, pen: number, x: number, y: number,
  ): void {
    // Closing speed along the contact normal: how hard they hit.
    const closing = -(rvx * nx + rvy * ny);
    this.contacts.push({ x, y, speed: closing > 0 ? closing : 0, bodyA, bodyB });
    this.touch[bodyA] += pen;
    this.touch[bodyB] += pen;
  }
}

/** Fluid drag on one end of a bone with direction (tx, ty): cheap lengthwise, expensive sideways. */
function dragEnd(p: Particle, tx: number, ty: number, len: number): void {
  const vPar = p.vx * tx + p.vy * ty;
  const parX = vPar * tx, parY = vPar * ty;
  const perpX = p.vx - parX, perpY = p.vy - parY;
  p.fx -= (PHYS.dragPar * parX + PHYS.dragPerp * perpX) * len;
  p.fy -= (PHYS.dragPar * parY + PHYS.dragPerp * perpY) * len;
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}
