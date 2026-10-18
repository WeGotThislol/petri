/**
 * The built-in champion roster: one evolved champion per body plan, trained
 * offline (scripts/train-all.sh → scripts/build-roster.ts) and shipped as data.
 * They are opponents, the background actors on the home screen, and examples
 * of what a well-evolved specimen of each species looks like.
 */
import raw from './roster.json';
import { ALL_BODIES, CreatureSpec } from '../sim/creature';
import { BrainShape } from '../sim/brain';
import { shapeFor } from '../evo/ga';

export interface RosterEntry {
  nick: string;
  rank: number;
  generations: number;
  blurb: string;
  vsBuoy: { wins: number; pushes: number; avgWinTime: number };
  vsRoster: number;
  spec: CreatureSpec;
  shape: BrainShape;
  genome: number[];
}

interface Raw { nick: string; rank: number; generations: number; hidden: number; genome: number[]; blurb: string; vsBuoy: RosterEntry['vsBuoy']; vsRoster: number }

export const ROSTER: RosterEntry[] = (raw as Raw[]).flatMap((r) => {
  const spec = ALL_BODIES.find((b) => b.nick === r.nick);
  return spec ? [{ ...r, spec, shape: shapeFor(spec, r.hidden) }] : [];
});

/** The trained champion for a body plan, if the roster has one. */
export function rosterFor(spec: CreatureSpec): RosterEntry | undefined {
  return ROSTER.find((e) => e.spec === spec || e.nick === spec.nick && e.spec.name === spec.name);
}
