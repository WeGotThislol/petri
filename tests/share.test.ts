import { describe, expect, it } from 'vitest';
import { ALL_BODIES, CRAB, DUMMY } from '../src/sim/creature';
import { decodeCreature, encodeCreature, quantise } from '../src/share/codec';
import { genomeLength } from '../src/sim/brain';
import { shapeFor } from '../src/evo/ga';
import { Match } from '../src/sim/match';
import { Brain } from '../src/sim/brain';
import { DummyController } from '../src/sim/controllers';
import { Rng } from '../src/sim/rng';

const randomGenome = (n: number, seed: number) => { const r = new Rng(seed); return Array.from({ length: n }, () => r.gauss() * 1.5); };

describe('share codes', () => {
  it('round-trip every body and keep links short', () => {
    for (const [i, spec] of ALL_BODIES.entries()) {
      const shape = shapeFor(spec, 10);
      const genome = randomGenome(genomeLength(shape), i);
      const code = encodeCreature({ spec, genome, hidden: 10 });
      expect(code.length, spec.nick).toBeLessThan(600);   // fits comfortably in a chat message
      expect(code).toMatch(/^[A-Za-z0-9_-]+$/);           // URL-safe, no escaping needed
      const back = decodeCreature(code);
      expect(back.spec.name).toBe(spec.name);
      expect(back.spec.bones).toEqual(spec.bones);
      expect(back.spec.joints.length).toBe(spec.joints.length);
      back.spec.joints.forEach((j, k) => { expect(Math.abs(j.x - spec.joints[k].x)).toBeLessThanOrEqual(0.25); });
      const { scale } = quantise(genome);
      back.genome.forEach((w, k) => expect(Math.abs(w - genome[k])).toBeLessThanOrEqual(scale / 2 + 1e-6));
    }
  });

  it('decoding is stable: re-sharing a shared creature gives the same code', () => {
    const genome = randomGenome(genomeLength(shapeFor(CRAB, 10)), 9);
    const once = encodeCreature({ spec: CRAB, genome, hidden: 10 });
    const twice = encodeCreature(decodeCreature(once));
    expect(twice).toBe(once);
  });

  it('a decoded creature fights identically wherever it is decoded', () => {
    const shape = shapeFor(CRAB, 10);
    const code = encodeCreature({ spec: CRAB, genome: randomGenome(genomeLength(shape), 3), hidden: 10 });
    const run = () => { const c = decodeCreature(code); const m = new Match(c.spec, DUMMY, [new Brain(shape, c.genome), new DummyController()], 4); m.run(); return m.stateHash(); };
    expect(run()).toBe(run());
  });

  it('rejects damaged codes with a readable message', () => {
    expect(() => decodeCreature('AQ')).toThrow(/cut short/);
    expect(() => decodeCreature('Bw')).toThrow(/different version/);
  });
});
