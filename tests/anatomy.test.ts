import { describe, it, expect } from 'vitest';
import { anatomy } from '../src/render/anatomy';
import { ALL_BODIES, cloneSpec, type CreatureSpec } from '../src/sim/creature';

/** Every index the renderer will look up must point at a real joint. */
function allValid(spec: CreatureSpec): boolean {
  const a = anatomy(spec), n = spec.joints.length;
  const ok = (i: number) => Number.isInteger(i) && i >= 0 && i < n;
  return a.spine.every(ok) && ok(a.sensors.opp) && a.sensors.edges.every(ok)
    && a.core.length === n && a.degree.length === n && a.sensors.touch.every(ok) && a.tris.flat().every(ok);
}

describe('anatomy (render-side body analysis)', () => {
  it('recomputes after the spec is edited in place (the Lab erase-head crash)', () => {
    for (const body of ALL_BODIES) {
      const s = cloneSpec(body);
      anatomy(s);                                   // warm the cache
      const j = s.head;                             // erase the head exactly like the Lab does
      const re = (i: number) => (i > j ? i - 1 : i);
      s.joints.splice(j, 1);
      s.bones = s.bones.filter((b) => b.a !== j && b.b !== j).map((b) => ({ a: re(b.a), b: re(b.b) }));
      s.muscles = s.muscles.filter((m) => m.a !== j && m.b !== j).map((m) => ({ ...m, a: re(m.a), b: re(m.b) }));
      s.head = 0;
      expect(allValid(s), body.nick).toBe(true);
    }
  });

  it('copes with half-built bodies: one joint, no bones, a bad head index', () => {
    const s: CreatureSpec = { ...cloneSpec(ALL_BODIES[0]), joints: [{ x: 0, y: 0, r: 9 }], bones: [], muscles: [], head: 0 };
    expect(allValid(s)).toBe(true);
    s.head = 5;                                     // out of range must not throw
    expect(() => anatomy(s)).not.toThrow();
    s.joints.push({ x: 40, y: 0, r: 7 });           // disconnected joint
    expect(() => anatomy(s)).not.toThrow();
  });
});
