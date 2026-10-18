import { describe, expect, it } from 'vitest';
import { Rng } from '../src/sim/rng';

describe('Rng', () => {
  it('is deterministic for the same seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 1000; i++) expect(a.nextU32()).toBe(b.nextU32());
  });

  it('differs for different seeds', () => {
    expect(new Rng(1).nextU32()).not.toBe(new Rng(2).nextU32());
  });

  it('produces floats in [0,1) with a sensible mean', () => {
    const r = new Rng(7);
    let sum = 0;
    for (let i = 0; i < 10000; i++) {
      const x = r.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      sum += x;
    }
    expect(sum / 10000).toBeCloseTo(0.5, 1);
  });

  it('gauss has mean ~0 and std-dev ~1', () => {
    const r = new Rng(99);
    const n = 20000;
    let s = 0, s2 = 0;
    for (let i = 0; i < n; i++) { const g = r.gauss(); s += g; s2 += g * g; }
    const mean = s / n;
    expect(mean).toBeCloseTo(0, 1);
    expect(Math.sqrt(s2 / n - mean * mean)).toBeCloseTo(1, 1);
  });
});
