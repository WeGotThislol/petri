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

/**
 * Appearance genes. They never affect physics; they only tell the renderer
 * how to paint the organism. Colours are pigment names from the design
 * tokens (src/ui/tokens.ts), so any combination stays harmonious.
 */
export type Pigment = 'verdigris' | 'rose' | 'ochre' | 'iris' | 'bone2' | 'kelp';
export interface Look {
  body: Pigment;
  accent: Pigment;
  pattern: 'plain' | 'bands' | 'speckles' | 'stripes' | 'gradient';
  /** Seed for small pattern details (speckle positions etc.). */
  seed: number;
}

export interface CreatureSpec {
  name: string;
  /** A short common name, e.g. "Pincer". */
  nick?: string;
  look?: Look;
  joints: JointSpec[];
  bones: BoneSpec[];
  muscles: MuscleSpec[];
  /** Index of the joint that counts as the "head" (defines which way is forward). */
  head: number;
  /** Which sense organs it has (all on if omitted). Missing senses read as zero. */
  senses?: Senses;
}

export interface Senses { opponent: boolean; edge: boolean; touch: boolean }

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
  nick: 'Pincer',
  look: { body: 'rose', accent: 'bone2', pattern: 'speckles', seed: 3 },
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

/** The Buoy: the scripted sparring dummy, a round, heavy-ish body with a short tail. */
export const DUMMY: CreatureSpec = {
  name: 'Globulus inertis',
  nick: 'Buoy',
  look: { body: 'bone2', accent: 'iris', pattern: 'gradient', seed: 7 },
  head: 0,
  joints: [
    { x: 26, y: 0, r: 10 },   // 0 front
    { x: 0, y: -24, r: 10 },  // 1 left
    { x: 0, y: 24, r: 10 },   // 2 right
    { x: -26, y: 0, r: 10 },  // 3 back
    { x: -50, y: 0, r: 7 },   // 4 tail middle
    { x: -74, y: 0, r: 5 },   // 5 tail tip (a two-part tail swims; a one-part tail just paddles backwards)
  ],
  bones: [
    { a: 0, b: 1 }, { a: 1, b: 3 }, { a: 3, b: 2 }, { a: 2, b: 0 }, { a: 0, b: 3 },
    { a: 3, b: 4 }, { a: 4, b: 5 },
  ],
  muscles: [
    { a: 1, b: 4, strength: 0.5 },
    { a: 2, b: 4, strength: 0.5 },
  ],
};

// ---------------------------------------------------------------------------
// More bodies. Each is "a stiff core + limbs that muscles can swing".
// Muscles always span a joint (they connect two points on either side of it),
// like real muscles, so they can bend it.
// ---------------------------------------------------------------------------

/** A tadpole: small round head, long whippy tail. */
export const TADPOLE: CreatureSpec = {
  name: 'Caudata wriggla',
  nick: 'Lash',
  look: { body: 'verdigris', accent: 'bone2', pattern: 'bands', seed: 11 },
  head: 0,
  joints: [
    { x: 26, y: 0, r: 11 }, { x: 6, y: -14, r: 10 }, { x: 6, y: 14, r: 10 }, { x: -14, y: 0, r: 9 },
    { x: -42, y: 0, r: 7 }, { x: -68, y: 0, r: 5.5 }, { x: -92, y: 0, r: 4.5 },
  ],
  bones: [
    { a: 0, b: 1 }, { a: 0, b: 2 }, { a: 1, b: 2 }, { a: 1, b: 3 }, { a: 2, b: 3 },
    { a: 3, b: 4 }, { a: 4, b: 5 }, { a: 5, b: 6 },
  ],
  muscles: [
    { a: 1, b: 4, strength: 1 }, { a: 2, b: 4, strength: 1 },
    { a: 1, b: 5, strength: 0.5 }, { a: 2, b: 5, strength: 0.5 },
  ],
};

/** A paddler (the "hopper"): a round body that rows with two big flippers. */
export const PADDLER: CreatureSpec = {
  name: 'Remipes saltator',
  nick: 'Oar',
  look: { body: 'ochre', accent: 'rose', pattern: 'stripes', seed: 5 },
  head: 0,
  joints: [
    { x: 22, y: 0, r: 10 }, { x: 0, y: -17, r: 10 }, { x: 0, y: 17, r: 10 }, { x: -22, y: 0, r: 10 },
    { x: -18, y: -50, r: 7 }, { x: -18, y: 50, r: 7 },
  ],
  bones: [
    { a: 0, b: 1 }, { a: 0, b: 2 }, { a: 1, b: 3 }, { a: 2, b: 3 }, { a: 1, b: 2 },
    { a: 1, b: 4 }, { a: 2, b: 5 },
  ],
  muscles: [
    { a: 0, b: 4, strength: 0.8 }, { a: 3, b: 4, strength: 0.8 },
    { a: 0, b: 5, strength: 0.8 }, { a: 3, b: 5, strength: 0.8 },
  ],
};

/** A spinner: a triangular core with three swinging arms. */
export const SPINNER: CreatureSpec = {
  name: 'Trirotor giddius',
  nick: 'Rotor',
  look: { body: 'iris', accent: 'verdigris', pattern: 'speckles', seed: 9 },
  head: 0,
  joints: [
    { x: 16, y: 0, r: 11 }, { x: -8, y: -14, r: 11 }, { x: -8, y: 14, r: 11 },
    { x: 34, y: 24, r: 6 }, { x: 4, y: -40, r: 6 }, { x: -38, y: 14, r: 6 },
  ],
  bones: [
    { a: 0, b: 1 }, { a: 1, b: 2 }, { a: 2, b: 0 },
    { a: 0, b: 3 }, { a: 1, b: 4 }, { a: 2, b: 5 },
  ],
  muscles: [
    { a: 2, b: 3, strength: 0.9 }, { a: 0, b: 4, strength: 0.9 }, { a: 1, b: 5, strength: 0.9 },
  ],
};

/** A big-clawed crab variant with a stubby tail. */
export const SNIPPER: CreatureSpec = {
  name: 'Forcipula grandis',
  nick: 'Shears',
  look: { body: 'kelp', accent: 'ochre', pattern: 'bands', seed: 13 },
  head: 0,
  joints: [
    { x: 28, y: 0, r: 10 }, { x: 0, y: -20, r: 9 }, { x: 0, y: 20, r: 9 }, { x: -20, y: 0, r: 8 },
    { x: -46, y: 0, r: 6 }, { x: 56, y: -40, r: 8 }, { x: 56, y: 40, r: 8 },
  ],
  bones: [
    { a: 0, b: 1 }, { a: 0, b: 2 }, { a: 1, b: 2 }, { a: 1, b: 3 }, { a: 2, b: 3 },
    { a: 3, b: 4 }, { a: 1, b: 5 }, { a: 2, b: 6 },
  ],
  muscles: [
    { a: 1, b: 4, strength: 0.8 }, { a: 2, b: 4, strength: 0.8 },
    { a: 0, b: 5, strength: 1 }, { a: 0, b: 6, strength: 1 },
  ],
};

/** A jelly: a plump five-sided bell with two trailing tentacles. */
export const JELLY: CreatureSpec = {
  name: 'Medusella pufficans',
  nick: 'Bell',
  look: { body: 'iris', accent: 'rose', pattern: 'gradient', seed: 17 },
  head: 0,
  joints: [
    { x: 22, y: 0, r: 11 }, { x: 6, y: -20, r: 11 }, { x: -16, y: -13, r: 11 }, { x: -16, y: 13, r: 11 }, { x: 6, y: 20, r: 11 },
    { x: -46, y: -16, r: 6 }, { x: -46, y: 16, r: 6 },
  ],
  bones: [
    { a: 0, b: 1 }, { a: 1, b: 2 }, { a: 2, b: 3 }, { a: 3, b: 4 }, { a: 4, b: 0 }, { a: 0, b: 2 }, { a: 0, b: 3 },
    { a: 2, b: 5 }, { a: 3, b: 6 },
  ],
  muscles: [
    { a: 1, b: 5, strength: 0.7 }, { a: 3, b: 5, strength: 0.7 },
    { a: 4, b: 6, strength: 0.7 }, { a: 2, b: 6, strength: 0.7 },
  ],
};

/** A long eel (the "snake"): tiny head, very long body. */
export const EEL: CreatureSpec = {
  name: 'Longissimus maximus',
  nick: 'Lamprey',
  look: { body: 'ochre', accent: 'kelp', pattern: 'bands', seed: 19 },
  head: 0,
  joints: [
    { x: 30, y: 0, r: 9 }, { x: 12, y: -11, r: 8.5 }, { x: 12, y: 11, r: 8.5 }, { x: -6, y: 0, r: 8.5 },
    { x: -32, y: 0, r: 8 }, { x: -58, y: 0, r: 7 }, { x: -84, y: 0, r: 6 }, { x: -108, y: 0, r: 4.5 },
  ],
  bones: [
    { a: 0, b: 1 }, { a: 0, b: 2 }, { a: 1, b: 2 }, { a: 1, b: 3 }, { a: 2, b: 3 },
    { a: 3, b: 4 }, { a: 4, b: 5 }, { a: 5, b: 6 }, { a: 6, b: 7 },
  ],
  muscles: [
    { a: 1, b: 4, strength: 1 }, { a: 2, b: 4, strength: 1 },
    { a: 1, b: 5, strength: 0.6 }, { a: 2, b: 5, strength: 0.6 },
  ],
};

/** Every body, for the creature sheet and (later) the Lab's template picker. */
export const ALL_BODIES: CreatureSpec[] = [CRAB, TADPOLE, PADDLER, SPINNER, DUMMY, SNIPPER, JELLY, EEL];

// ---------------------------------------------------------------------------
// Rules for player-built bodies (the Lab).
// ---------------------------------------------------------------------------
export const LIMITS = { minJoints: 3, maxJoints: 12, maxBones: 18, minMuscles: 1, maxMuscles: 8, minLen: 8, maxLen: 110, radius: 140 };

/** Problems that stop a body from being evolved, in plain language (empty = fine). */
export function validateSpec(spec: CreatureSpec): string[] {
  const errs: string[] = [];
  const n = spec.joints.length;
  if (n < LIMITS.minJoints) errs.push(`Needs at least ${LIMITS.minJoints} joints.`);
  if (n > LIMITS.maxJoints) errs.push(`At most ${LIMITS.maxJoints} joints.`);
  if (spec.bones.length > LIMITS.maxBones) errs.push(`At most ${LIMITS.maxBones} bones.`);
  if (spec.muscles.length < LIMITS.minMuscles) errs.push('Needs at least one muscle, or it can never move.');
  if (spec.muscles.length > LIMITS.maxMuscles) errs.push(`At most ${LIMITS.maxMuscles} muscles.`);
  const len = (a: number, b: number) => Math.hypot(spec.joints[a].x - spec.joints[b].x, spec.joints[a].y - spec.joints[b].y);
  for (const b of [...spec.bones, ...spec.muscles]) {
    const L = len(b.a, b.b);
    if (L < LIMITS.minLen) { errs.push('Two connected joints are too close together.'); break; }
    if (L > LIMITS.maxLen) { errs.push('A bone or muscle is too long.'); break; }
  }
  // Every joint must be held by bones into one body (muscles alone don't count).
  if (n) {
    const seen = new Set([0]); const stack = [0];
    while (stack.length) {
      const u = stack.pop()!;
      for (const b of spec.bones) {
        const v = b.a === u ? b.b : b.b === u ? b.a : -1;
        if (v >= 0 && !seen.has(v)) { seen.add(v); stack.push(v); }
      }
    }
    if (seen.size < n) errs.push('Some joints are not connected to the body by bones.');
  }
  if (spec.head < 0 || spec.head >= n) errs.push('Choose a head joint.');
  return errs;
}

/** A deep copy (specs are plain data, so JSON round-tripping is enough). */
export function cloneSpec(spec: CreatureSpec): CreatureSpec { return JSON.parse(JSON.stringify(spec)); }
