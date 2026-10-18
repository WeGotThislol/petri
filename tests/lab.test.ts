import { describe, expect, it } from 'vitest';
import { ALL_BODIES, CRAB, cloneSpec, DUMMY, validateSpec } from '../src/sim/creature';
import { Match, S } from '../src/sim/match';
import { IdleController } from '../src/sim/controllers';
import { speciesName } from '../src/sim/names';
import { Evolution } from '../src/evo/ga';

describe('Lab rules', () => {
  it('every built-in body is valid', () => {
    for (const b of ALL_BODIES) expect(validateSpec(b), b.nick).toEqual([]);
  });
  it('rejects a body with no muscles', () => {
    const s = cloneSpec(CRAB); s.muscles = [];
    expect(validateSpec(s).join(' ')).toMatch(/muscle/);
  });
  it('rejects a joint that is not attached by bones', () => {
    const s = cloneSpec(CRAB); s.joints.push({ x: 100, y: 100, r: 8 });
    expect(validateSpec(s).join(' ')).toMatch(/not connected/);
  });
  it('rejects too many joints', () => {
    const s = cloneSpec(CRAB);
    for (let i = 0; i < 6; i++) { s.joints.push({ x: -100 - i * 10, y: 0, r: 6 }); s.bones.push({ a: s.joints.length - 2, b: s.joints.length - 1 }); }
    expect(validateSpec(s).join(' ')).toMatch(/At most 12 joints/);
  });
});

describe('sense organs', () => {
  it('a body without opponent or edge senses gets zeros for them', () => {
    const blind = cloneSpec(CRAB); blind.senses = { opponent: false, edge: false, touch: true };
    const m = new Match(blind, DUMMY, [new IdleController(), new IdleController()], 1);
    m.step();
    const inp = m.inputs[0];
    for (const k of [S.OPP_FWD, S.OPP_SIDE, S.OPP_DIST, S.OPP_RIM, S.RIM, S.CTR_FWD, S.CTR_SIDE]) expect(inp[k]).toBe(0);
    expect(m.inputs[1][S.OPP_DIST]).toBeGreaterThan(0); // the other creature still sees
  });
});

describe('species names', () => {
  it('are deterministic two-word Latin-style names', () => {
    for (const b of ALL_BODIES) {
      const n = speciesName(b, 3);
      expect(n).toBe(speciesName(b, 3));
      expect(n).toMatch(/^[A-Z][a-z]+ [a-z]+$/);
    }
  });
});

describe('resuming a lineage', () => {
  it('seeds the population from a saved champion', () => {
    const e = new Evolution(CRAB, undefined, 4);
    const champ = e.pop[5].map((w) => w + 1);
    e.seedWith(champ);
    expect(e.pop[0]).toEqual(champ);
    expect(e.champions).toEqual([champ]);
    expect(e.pop[1]).not.toEqual(champ); // the rest are mutated copies
  });
});
