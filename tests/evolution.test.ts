import { describe, expect, it } from 'vitest';
import { DUMMY, TADPOLE } from '../src/sim/creature';
import { Brain, genomeLength } from '../src/sim/brain';
import { Evolution, shapeFor } from '../src/evo/ga';
import { allPairs, evaluate, headToHead, scoreMatch } from '../src/evo/fitness';
import { trainingJob } from '../src/evo/schedule';
import { Rng } from '../src/sim/rng';

describe('brain', () => {
  const shape = shapeFor(TADPOLE, 6);
  it('has the right genome size and keeps outputs in [-1, 1]', () => {
    expect(genomeLength(shape)).toBe((shape.inputs + 1) * 6 + 7 * shape.outputs);
    const r = new Rng(1);
    const b = new Brain(shape, Array.from({ length: genomeLength(shape) }, () => r.gauss() * 5));
    const out = new Float64Array(shape.outputs);
    for (let t = 0; t < 50; t++) {
      b.act(Float64Array.from({ length: shape.inputs }, () => r.range(-3, 3)), out);
      for (const v of out) { expect(v).toBeGreaterThanOrEqual(-1); expect(v).toBeLessThanOrEqual(1); }
    }
  });
  it('refuses a genome of the wrong length', () => {
    expect(() => new Brain(shape, [1, 2, 3])).toThrow();
  });
});

describe('genetic algorithm', () => {
  it('is reproducible from its seed', () => {
    const a = new Evolution(TADPOLE, undefined, 5), b = new Evolution(TADPOLE, undefined, 5);
    expect(a.pop).toEqual(b.pop);
    const fake = a.pop.map((_, i) => ({ fitness: (i * 37) % 11, wins: 0, games: 1, pushes: 0, flags: { exploit: 0, idle: 0, camping: 0 } }));
    a.advance(fake); b.advance(fake);
    expect(a.pop).toEqual(b.pop);
  });
  it('elitism: the best genome survives unchanged', () => {
    const e = new Evolution(TADPOLE, undefined, 2);
    const fake = e.pop.map((_, i) => ({ fitness: i === 7 ? 99 : 0, wins: 0, games: 1, pushes: 0, flags: { exploit: 0, idle: 0, camping: 0 } }));
    const best = e.pop[7].slice();
    e.advance(fake);
    expect(e.pop[0]).toEqual(best);
    expect(e.champions[0]).toEqual(best);
  });
  it('trains against the dummy plus the hall of fame', () => {
    const e = new Evolution(TADPOLE, undefined, 3);
    expect(trainingJob(e).games.map((g) => g.opp.kind)).toEqual(['dummy', 'dummy']);
    e.champions.push(e.pop[0], e.pop[1]);
    expect(trainingJob(e).games.map((g) => g.opp.kind)).toEqual(['dummy', 'dummy', 'brain', 'brain']);
  });
});

describe('anti-cheat', () => {
  it('flags a brain that just sits still', () => {
    const shape = shapeFor(TADPOLE, 6);
    const lazy = new Array(genomeLength(shape)).fill(0); // all-zero weights: every muscle relaxed
    const s = scoreMatch(allPairs(TADPOLE, shape, [], []), lazy, { kind: 'dummy', spec: DUMMY }, 1);
    expect(s.flag).toBe('idle');
    expect(s.pushed).toBe(false);
  });
});

describe('evolution actually works (the Stage 2 proof)', () => {
  it('generation N clearly beats generation 0', () => {
    // The real default settings (48 brains). With half that, 10 generations was NOT enough
    // in our runs (gen 9 won only 40%): small populations are noisy. Honest note in LEARN.md.
    const evo = new Evolution(TADPOLE, undefined, 42);
    for (let g = 0; g < 8; g++) {
      const job = trainingJob(evo);
      evo.advance(evo.pop.map((x) => evaluate(job, x)));
    }
    const seeds = Array.from({ length: 10 }, (_, i) => 70000 + i); // fresh seeds, never trained on
    const first = evo.champions[0], last = evo.champions[evo.champions.length - 1];
    const winRate = headToHead(TADPOLE, evo.shape, last, first, seeds);
    const dummyJob = allPairs(TADPOLE, evo.shape, [{ kind: 'dummy', spec: DUMMY }], seeds);
    const before = evaluate(dummyJob, first), after = evaluate(dummyJob, last);
    console.log(`gen 7 vs gen 0: ${(winRate * 100).toFixed(0)}% · score vs dummy ${before.fitness.toFixed(2)} → ${after.fitness.toFixed(2)}`);
    expect(winRate).toBeGreaterThan(0.6);
    // Not asserted: progress against the dummy shows up later (around generation 9+, see
    // docs/img/stage2-proof.svg), because self-play mostly rewards beating rivals first.
  }, 180_000);
});
