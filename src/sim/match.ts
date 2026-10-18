/**
 * One sumo match between two creatures in the dish.
 *
 * Rules:
 *   - A creature is OUT when its centre of mass leaves the ring.
 *   - The ring has radius RING_RADIUS until SHRINK_START, then shrinks
 *     steadily ("sudden death") so every match ends.
 *   - At MATCH_TIME, whoever is closer to the centre wins.
 *
 * Every tick, each creature's controller (a scripted behaviour now, an
 * evolved neural network from Stage 2) receives a vector of SENSOR inputs
 * and returns one activation per muscle.
 */
import { CreatureInstance, CreatureSpec, spawn } from './creature';
import { Contact, PHYS, World } from './physics';
import { Rng } from './rng';

// Simulated seconds per tick. The screen shows 60 ticks per real second, so
// "game time" runs 1.5x faster than wall-clock time: lively, but still readable.
export const TICK = 1 / 40;
export const SUBSTEPS = 4;
export const RING_RADIUS = 230;
export const SHRINK_START = 15;        // seconds
export const MATCH_TIME = 30;          // seconds
export const RING_MIN = 70;            // radius at MATCH_TIME
export const CLOCK_PERIOD = 12;       // ticks per beat of the built-in clock
export const START_DIST = 85;         // each creature starts this far from centre

/** Indices into the sensor vector. After these come one value per muscle. */
export const S = {
  OPP_FWD: 0,    // opponent direction, forward component (-1..1)
  OPP_SIDE: 1,   // opponent direction, sideways component (+ = to the right)
  OPP_DIST: 2,   // distance to opponent / ring radius
  RIM: 3,        // my distance to the rim / ring radius (0 = on the edge)
  CTR_FWD: 4,    // direction to the dish centre, forward component
  CTR_SIDE: 5,   // direction to the dish centre, sideways component
  VEL_FWD: 6,    // my speed forward (scaled)
  VEL_SIDE: 7,   // my speed sideways (scaled)
  TOUCH: 8,      // am I touching the opponent? (0..1)
  CLOCK_A: 9,    // a triangle wave (-1..1, period CLOCK_PERIOD ticks): a built-in rhythm
  CLOCK_B: 10,   // the same wave, a quarter period later
  OPP_RIM: 11,   // opponent's distance to the rim / ring radius
} as const;
export const NUM_BASE_SENSORS = 12;

export interface Controller {
  /** Read `inputs`, write one activation in [-1, 1] per muscle into `outputs`. */
  act(inputs: Float64Array, outputs: Float64Array): void;
}

export interface MatchResult {
  winner: 0 | 1 | -1;     // -1 = draw
  reason: 'ringout' | 'timeout';
  time: number;           // seconds
}

export class Match {
  readonly world = new World();
  readonly creatures: CreatureInstance[];
  readonly inputs: Float64Array[];
  readonly outputs: Float64Array[];
  tick = 0;
  result: MatchResult | null = null;
  /** Contacts from the most recent tick (for rendering effects). */
  contacts: Contact[] = [];
  /** Tick of the last contact between the two creatures (-1 = never touched). */
  lastContactTick = -1;

  /**
   * @param opts.jitter scales the random start variation (1 = normal). Training
   *   starts small and grows it (a "randomisation curriculum", see docs/RESEARCH.md).
   */
  constructor(specA: CreatureSpec, specB: CreatureSpec, readonly controllers: [Controller, Controller], seed: number, opts: { jitter?: number } = {}) {
    // The seed adds small random variations to the start, so each match differs
    // slightly while staying perfectly reproducible.
    const rng = new Rng(seed);
    const j = opts.jitter ?? 1;
    const jitter = () => rng.range(-12, 12) * j;
    const turn = () => rng.range(-0.15, 0.15) * j; // rotation parameter, ±17° at full jitter
    this.creatures = [
      spawn(this.world, specA, 0, -START_DIST + jitter(), jitter(), turn(), false),
      spawn(this.world, specB, 1, START_DIST + jitter(), jitter(), turn(), true),
    ];
    this.inputs = this.creatures.map((c) => new Float64Array(NUM_BASE_SENSORS + c.muscles.length));
    this.outputs = this.creatures.map((c) => new Float64Array(c.muscles.length));
  }

  get time(): number { return this.tick * TICK; }

  /** Current ring radius (shrinks during sudden death). */
  get ringRadius(): number { return ringRadiusAt(this.time); }

  /** Advance one tick. Does nothing once the match is decided. */
  step(): void {
    if (this.result) return;
    for (let i = 0; i < 2; i++) {
      this.sense(i);
      this.controllers[i].act(this.inputs[i], this.outputs[i]);
      const c = this.creatures[i];
      for (let m = 0; m < c.muscles.length; m++) this.world.muscles[c.muscles[m]].act = this.outputs[i][m];
    }
    this.world.step(TICK, SUBSTEPS);
    this.contacts = this.world.contacts;
    if (this.contacts.length) this.lastContactTick = this.tick;
    this.tick++;
    this.judge();
  }

  /** Run until the match ends; returns the result. */
  run(): MatchResult {
    while (!this.result) this.step();
    return this.result!;
  }

  /** Centre of mass (mass-weighted average of joint positions). */
  com(i: number): { x: number; y: number; vx: number; vy: number } {
    let x = 0, y = 0, vx = 0, vy = 0, m = 0;
    for (const pi of this.creatures[i].particles) {
      const p = this.world.particles[pi];
      const w = 1 / p.invMass;
      x += p.x * w; y += p.y * w; vx += p.vx * w; vy += p.vy * w; m += w;
    }
    return { x: x / m, y: y / m, vx: vx / m, vy: vy / m };
  }

  /** Unit vector pointing from the centre of mass to the head joint. */
  forward(i: number, com = this.com(i)): { x: number; y: number } {
    const c = this.creatures[i];
    const h = this.world.particles[c.particles[c.spec.head]];
    const dx = h.x - com.x, dy = h.y - com.y;
    const L = Math.sqrt(dx * dx + dy * dy) || 1;
    return { x: dx / L, y: dy / L };
  }

  private sense(i: number): void {
    const inp = this.inputs[i];
    const R = this.ringRadius;
    const me = this.com(i), opp = this.com(1 - i);
    const f = this.forward(i, me);
    const rx = -f.y, ry = f.x; // "right" vector (y points down on screen)

    const dx = opp.x - me.x, dy = opp.y - me.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    inp[S.OPP_FWD] = (dx * f.x + dy * f.y) / d;
    inp[S.OPP_SIDE] = (dx * rx + dy * ry) / d;
    inp[S.OPP_DIST] = d / RING_RADIUS;

    const r = Math.sqrt(me.x * me.x + me.y * me.y);
    inp[S.RIM] = (R - r) / R;
    if (r > 1e-6) {
      inp[S.CTR_FWD] = -(me.x * f.x + me.y * f.y) / r;
      inp[S.CTR_SIDE] = -(me.x * rx + me.y * ry) / r;
    } else { inp[S.CTR_FWD] = 0; inp[S.CTR_SIDE] = 0; }

    inp[S.VEL_FWD] = (me.vx * f.x + me.vy * f.y) / 200;
    inp[S.VEL_SIDE] = (me.vx * rx + me.vy * ry) / 200;
    const t = this.world.touch[i] ?? 0;
    inp[S.TOUCH] = t > 1 ? 1 : t;

    const phase = (this.tick % CLOCK_PERIOD) / CLOCK_PERIOD;
    const phaseB = ((this.tick + CLOCK_PERIOD / 4) % CLOCK_PERIOD) / CLOCK_PERIOD;
    inp[S.CLOCK_A] = 4 * Math.abs(phase - 0.5) - 1;
    inp[S.CLOCK_B] = 4 * Math.abs(phaseB - 0.5) - 1;
    const ro = Math.sqrt(opp.x * opp.x + opp.y * opp.y);
    inp[S.OPP_RIM] = (R - ro) / R;

    // Proprioception: how stretched each of my muscles is (-1..1).
    const c = this.creatures[i];
    for (let m = 0; m < c.muscles.length; m++) {
      const mu = this.world.muscles[c.muscles[m]];
      const a = this.world.particles[mu.a], b = this.world.particles[mu.b];
      const ex = b.x - a.x, ey = b.y - a.y; // (no ** operator: pow() is not exact)
      const L = Math.sqrt(ex * ex + ey * ey);
      inp[NUM_BASE_SENSORS + m] = (L / mu.rest - 1) / PHYS.muscleRange;
    }

    // Sense organs the designer left out read as zero: the brain is blind to them.
    const sn = c.spec.senses;
    if (sn) {
      if (!sn.opponent) { inp[S.OPP_FWD] = 0; inp[S.OPP_SIDE] = 0; inp[S.OPP_DIST] = 0; inp[S.OPP_RIM] = 0; }
      if (!sn.edge) { inp[S.RIM] = 0; inp[S.CTR_FWD] = 0; inp[S.CTR_SIDE] = 0; }
      if (!sn.touch) inp[S.TOUCH] = 0;
    }
  }

  private judge(): void {
    const R = this.ringRadius;
    const dist = [0, 1].map((i) => { const c = this.com(i); return Math.sqrt(c.x * c.x + c.y * c.y); });
    const out = dist.map((d) => d > R);
    if (out[0] || out[1]) {
      // If both are out on the same tick, the one further out loses.
      const loser = out[0] && out[1] ? (dist[0] > dist[1] ? 0 : 1) : out[0] ? 0 : 1;
      this.result = { winner: (1 - loser) as 0 | 1, reason: 'ringout', time: this.time };
    } else if (this.time >= MATCH_TIME) {
      const winner = dist[0] < dist[1] ? 0 : dist[1] < dist[0] ? 1 : -1;
      this.result = { winner, reason: 'timeout', time: this.time };
    }
  }

  /**
   * A fingerprint of the full physical state. Two runs with the same
   * creatures and seed must give the same hash (tested in tests/match.test.ts).
   */
  stateHash(): string {
    let h = 2166136261 >>> 0; // FNV-1a over the raw bits of every coordinate
    const buf = new Float64Array(1);
    const bytes = new Uint8Array(buf.buffer);
    for (const p of this.world.particles) {
      for (const v of [p.x, p.y, p.vx, p.vy]) {
        buf[0] = v;
        for (const byte of bytes) { h ^= byte; h = Math.imul(h, 16777619) >>> 0; }
      }
    }
    return h.toString(16).padStart(8, '0');
  }
}

export function ringRadiusAt(time: number): number {
  if (time <= SHRINK_START) return RING_RADIUS;
  const k = Math.min(1, (time - SHRINK_START) / (MATCH_TIME - SHRINK_START));
  return RING_RADIUS + (RING_MIN - RING_RADIUS) * k;
}
