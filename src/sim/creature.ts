/**
 * Creature bodies: the "genome" of the body, and how to place it in a World.
 *
 * A CreatureSpec is pure data (easy to save, share in a URL, mutate).
 * Coordinates are local: the creature faces +x, centred roughly on (0,0).
 */
import { World } from './physics';

export interface JointSpec { x: number; y: number; r: number }
export interface BoneSpec { a: number; b: number }
export interface MuscleSpec { a: number; b: number; strength: number }

export interface CreatureSpec {
  name: string;
  joints: JointSpec[];
  bones: BoneSpec[];
  muscles: MuscleSpec[];
  /** Index of the joint that counts as the "head" (defines which way is forward). */
  head: number;
}

/** A creature placed in a world: which particle/muscle indices belong to it. */
export interface CreatureInstance {
  spec: CreatureSpec;
  body: number;
  particles: number[];
  muscles: number[];
}

/**
 * Put a creature into the world at (x, y), rotated by the "rotation
 * parameter" t. We use the rational rotation formula
 *     cos = (1 - t²) / (1 + t²),  sin = 2t / (1 + t²)
 * instead of Math.cos/Math.sin, because those may differ in the last bit
 * between browsers, which would break determinism. t = 0 → no rotation,
 * t = 1 → 90°, t → ∞ → 180°. Use `flip` for an exact 180°.
 */
export function spawn(world: World, spec: CreatureSpec, body: number, x: number, y: number, t: number, flip: boolean): CreatureInstance {
  const d = 1 + t * t;
  let c = (1 - t * t) / d, s = (2 * t) / d;
  if (flip) { c = -c; s = -s; }
  const particles = spec.joints.map((j) =>
    world.addParticle(x + j.x * c - j.y * s, y + j.x * s + j.y * c, j.r, body));
  for (const b of spec.bones) world.addBone(particles[b.a], particles[b.b]);
  const muscles = spec.muscles.map((m) => world.addMuscle(particles[m.a], particles[m.b], m.strength));
  return { spec, body, particles, muscles };
}

/**
 * The hand-built Stage 1 creature: a small "crab-fish".
 * A rigid diamond body, two claws in front, and a two-part tail behind.
 *
 *            6 (left claw)
 *           /
 *     1 ---+--- 0 (head)
 *   / |  \     /
 *  5-4-3  \   /        (diagram is approximate)
 *   \ |  /   \
 *     2 ---+--- 7 (right claw)
 */
export const CRAB: CreatureSpec = {
  name: 'Brachiopus vorax',
  head: 0,
  joints: [
    { x: 30, y: 0, r: 9 },    // 0 head
    { x: 0, y: -20, r: 7 },   // 1 left shoulder
    { x: 0, y: 20, r: 7 },    // 2 right shoulder
    { x: -22, y: 0, r: 7 },   // 3 tail base
    { x: -52, y: 0, r: 6 },   // 4 tail middle
    { x: -82, y: 0, r: 5 },   // 5 tail tip
    { x: 48, y: -30, r: 6 },  // 6 left claw
    { x: 48, y: 30, r: 6 },   // 7 right claw
  ],
  bones: [
    { a: 0, b: 1 }, { a: 0, b: 2 }, { a: 1, b: 2 }, { a: 1, b: 3 }, { a: 2, b: 3 }, // rigid body
    { a: 3, b: 4 }, { a: 4, b: 5 },   // tail
    { a: 1, b: 6 }, { a: 2, b: 7 },   // claws
  ],
  muscles: [
    { a: 1, b: 4, strength: 1 },    // 0 tail left
    { a: 2, b: 4, strength: 1 },    // 1 tail right
    { a: 3, b: 5, strength: 0.6 },  // 2 tail curl
    { a: 0, b: 6, strength: 0.7 },  // 3 left claw
    { a: 0, b: 7, strength: 0.7 },  // 4 right claw
  ],
};

/** The scripted sparring dummy: a round, heavy-ish blob with a short tail. */
export const DUMMY: CreatureSpec = {
  name: 'Globulus inertis',
  head: 0,
  joints: [
    { x: 26, y: 0, r: 10 },   // 0 front
    { x: 0, y: -24, r: 10 },  // 1 left
    { x: 0, y: 24, r: 10 },   // 2 right
    { x: -26, y: 0, r: 10 },  // 3 back
    { x: -54, y: 0, r: 6 },   // 4 tail tip
  ],
  bones: [
    { a: 0, b: 1 }, { a: 1, b: 3 }, { a: 3, b: 2 }, { a: 2, b: 0 }, { a: 0, b: 3 },
    { a: 3, b: 4 },
  ],
  muscles: [
    { a: 1, b: 4, strength: 0.5 },
    { a: 2, b: 4, strength: 0.5 },
  ],
};
