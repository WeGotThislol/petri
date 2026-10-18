/**
 * Who does each generation fight? ("the training schedule")
 *
 * Fighting only the dummy teaches one trick. Fighting only the newest
 * champion can go in circles (A beats B beats C beats A) and lets one lineage
 * "run away". So every generation fights:
 *   - the Buoy, the dummy (a stable yardstick), twice;
 *   - a random champion from the more recent half of the hall of fame;
 *   - a random champion from the whole history (don't forget old defences).
 * OpenAI's sumo agents learned best with exactly this kind of sampling
 * (Bansal et al. 2017, see docs/RESEARCH.md). Seeds change every generation
 * so nobody can memorise one fight.
 *
 * Two curricula ramp up over the first CURRICULUM generations:
 *   - shaping bonuses fade from 1 to a floor of 0.3 (learn to move first, then to win).
 *     OpenAI faded theirs to 0; in our runs that made champions stop bothering to
 *     push the Buoy late in training (push rate fell from 35% to ~10%), so we keep a floor;
 *   - start-position randomness grows from 30% to 100%.
 */
import { DUMMY } from '../sim/creature';
import type { Evolution } from './ga';
import type { EvalJob, Opponent } from './fitness';
import { Rng } from '../sim/rng';

export const CURRICULUM = 20;

export function trainingJob(evo: Evolution, hallOfFame = true): EvalJob {
  const g = evo.generation;
  const dummy: Opponent = { kind: 'dummy', spec: DUMMY };
  const games: { opp: Opponent; seed: number }[] = [{ opp: dummy, seed: g * 4 + 1 }, { opp: dummy, seed: g * 4 + 2 }];
  const champs = evo.champions;
  if (hallOfFame && champs.length) {
    const brain = (i: number): Opponent => ({ kind: 'brain', spec: evo.spec, shape: evo.shape, genome: champs[i] });
    const pick = new Rng(9000 + g);
    const n = champs.length;
    const recentFrom = Math.floor(n / 2);
    games.push({ opp: brain(recentFrom + pick.int(n - recentFrom)), seed: g * 4 + 3 });
    if (n > 1) games.push({ opp: brain(pick.int(n)), seed: g * 4 + 4 });
  }
  const t = Math.min(1, g / CURRICULUM);
  return { spec: evo.spec, shape: evo.shape, games, shaping: 1 - 0.7 * t, jitter: 0.3 + 0.7 * t };
}
