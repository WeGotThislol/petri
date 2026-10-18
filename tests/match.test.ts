import { describe, expect, it } from 'vitest';
import { CRAB, DUMMY, spawn } from '../src/sim/creature';
import { Controller, Match, MATCH_TIME, RING_MIN, RING_RADIUS, ringRadiusAt, SHRINK_START } from '../src/sim/match';
import { DummyController, IdleController, PusherController } from '../src/sim/controllers';
import { World } from '../src/sim/physics';
import { Rng } from '../src/sim/rng';

/** A controller that twitches its muscles randomly (from its own seeded RNG). */
class RandomController implements Controller {
  private rng: Rng;
  constructor(seed: number) { this.rng = new Rng(seed); }
  act(_inp: Float64Array, out: Float64Array): void {
    for (let i = 0; i < out.length; i++) out[i] = this.rng.range(-1, 1);
  }
}

const pusherVsDummy = (seed: number) =>
  new Match(CRAB, DUMMY, [new PusherController(), new DummyController()], seed);

describe('determinism', () => {
  it('same creatures + same seed → bit-identical match', () => {
    const a = pusherVsDummy(7), b = pusherVsDummy(7);
    const ra = a.run(), rb = b.run();
    expect(ra).toEqual(rb);
    expect(a.stateHash()).toBe(b.stateHash());
  });

  it('different seeds → different matches', () => {
    const a = pusherVsDummy(1), b = pusherVsDummy(2);
    for (let i = 0; i < 200; i++) { a.step(); b.step(); }
    expect(a.stateHash()).not.toBe(b.stateHash());
  });

  it('matches a recorded fingerprint (catches any accidental physics change)', () => {
    // If you change physics constants on purpose, update this value
    // (and know that old replays/share links will play out differently).
    const m = pusherVsDummy(1);
    for (let i = 0; i < 400; i++) m.step();
    expect(m.stateHash()).toBe(GOLDEN_HASH_SEED1_400);
  });
});

describe('physics stability', () => {
  it('random muscle spasms never explode or stretch bones', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const m = new Match(CRAB, CRAB, [new RandomController(seed), new RandomController(seed + 100)], seed);
      let worst = 0;
      while (!m.result) {
        m.step();
        for (const b of m.world.bones) {
          const p = m.world.particles[b.a], q = m.world.particles[b.b];
          const L = Math.hypot(q.x - p.x, q.y - p.y);
          worst = Math.max(worst, Math.abs(L - b.len) / b.len);
        }
      }
      for (const p of m.world.particles) { expect(Number.isFinite(p.x)).toBe(true); expect(Number.isFinite(p.y)).toBe(true); }
      expect(worst).toBeLessThan(0.05); // bones stay within 5% of their length
    }
  });

  it('a rhythmic tail beat swims forward (anisotropic drag works)', () => {
    const w = new World();
    const c = spawn(w, CRAB, 0, 0, 0, 0, false);
    for (let t = 0; t < 400; t++) { // 10 simulated seconds
      const beat = 4 * Math.abs((t % 12) / 12 - 0.5) - 1;
      w.muscles[c.muscles[0]].act = -beat;
      w.muscles[c.muscles[1]].act = beat;
      w.step(1 / 40, 4);
    }
    let x = 0; for (const i of c.particles) x += w.particles[i].x;
    expect(x / c.particles.length).toBeGreaterThan(100); // moved >100 µm towards its head (+x)
  });

  it('a creature that does nothing does not drift', () => {
    const m = new Match(CRAB, CRAB, [new IdleController(), new IdleController()], 3);
    const before = m.com(0);
    for (let i = 0; i < 200; i++) m.step();
    const after = m.com(0);
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(1);
  });
});

describe('sumo rules', () => {
  it('the ring shrinks only during sudden death', () => {
    expect(ringRadiusAt(0)).toBe(RING_RADIUS);
    expect(ringRadiusAt(SHRINK_START)).toBe(RING_RADIUS);
    expect(ringRadiusAt(MATCH_TIME)).toBe(RING_MIN);
    expect(ringRadiusAt((SHRINK_START + MATCH_TIME) / 2)).toBeCloseTo((RING_RADIUS + RING_MIN) / 2);
  });

  it('every match ends by the time limit, even if nobody moves', () => {
    const m = new Match(CRAB, DUMMY, [new IdleController(), new IdleController()], 5);
    const r = m.run();
    expect(r.time).toBeLessThanOrEqual(MATCH_TIME + 1e-9);
  });

  it('the hand-built pusher beats the scripted dummy almost always', () => {
    let wins = 0;
    for (let seed = 1; seed <= 20; seed++) if (pusherVsDummy(seed).run().winner === 0) wins++;
    expect(wins).toBeGreaterThanOrEqual(18);
  });

  it('pushes the dummy out by ring-out, not just by surviving the timer', () => {
    const r = pusherVsDummy(1).run();
    expect(r.reason).toBe('ringout');
    expect(r.winner).toBe(0);
  });
});

export const GOLDEN_HASH_SEED1_400 = '512d0462';
