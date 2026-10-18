/**
 * Who does each generation fight? ("the training schedule")
 *
 * Fighting only the dummy teaches one trick. Fighting only yourself can go
 * in circles (A beats B beats C beats A: rock-paper-scissors forever).
 * So every generation fights:
 *   - Globby the dummy (a stable yardstick),
 *   - the most recent champion (keep up with the latest tricks),
 *   - one random OLDER champion from the hall of fame
 *     (don't forget how to beat old tricks; this is what stops cycling).
 * That's 4 fights per brain per generation (dummy twice). Seeds change
 * every generation so nobody can memorise one fight.
 */
import { DUMMY } from '../sim/creature';
import type { Evolution } from './ga';
import type { EvalJob, Opponent } from './fitness';
import { Rng } from '../sim/rng';

export function trainingJob(evo: Evolution, hallOfFame = true): EvalJob {
  const g = evo.generation;
  const dummy: Opponent = { kind: 'dummy', spec: DUMMY };
  const games: { opp: Opponent; seed: number }[] = [{ opp: dummy, seed: g * 4 + 1 }, { opp: dummy, seed: g * 4 + 2 }];
  const champs = evo.champions;
  if (hallOfFame && champs.length) {
    const brain = (i: number): Opponent => ({ kind: 'brain', spec: evo.spec, shape: evo.shape, genome: champs[i] });
    games.push({ opp: brain(champs.length - 1), seed: g * 4 + 3 });
    if (champs.length > 1) games.push({ opp: brain(new Rng(9000 + g).int(champs.length - 1)), seed: g * 4 + 4 });
  }
  return { spec: evo.spec, shape: evo.shape, games };
}
