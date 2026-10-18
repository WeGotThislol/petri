/**
 * FITNESS: how good is a brain? We find out by making it fight.
 *
 * A brain plays a few short matches against a set of opponents (both sides
 * of the dish, different seeds) and earns points. Winning dominates; a few
 * small "shaping" bonuses reward progress toward winning, so that early,
 * clueless generations still have something to climb.
 *
 * This file is pure: no DOM, no workers. It runs the same in Node tests,
 * in a Web Worker, or on the main thread.
 */
import type { CreatureSpec } from '../sim/creature';
import { Brain, BrainShape } from '../sim/brain';
import { DummyController } from '../sim/controllers';
import { Controller, Match, RING_RADIUS } from '../sim/match';

/** An opponent is either the scripted dummy or another evolved brain. */
export type Opponent =
  | { kind: 'dummy'; spec: CreatureSpec }
  | { kind: 'brain'; spec: CreatureSpec; shape: BrainShape; genome: number[] };

export interface EvalJob {
  spec: CreatureSpec;
  shape: BrainShape;
  opponents: Opponent[];
  seeds: number[];
}

/** `pushes` = wins by a real push-out before sudden death. */
export interface EvalResult { fitness: number; wins: number; games: number; pushes: number }

export function makeController(o: Opponent): Controller {
  return o.kind === 'dummy' ? new DummyController() : new Brain(o.shape, o.genome);
}

/** Score one brain. Each (opponent, seed) pair is one match. */
export function evaluate(job: EvalJob, genome: ArrayLike<number>): EvalResult {
  let total = 0, wins = 0, games = 0, pushes = 0;
  for (const opp of job.opponents) {
    for (const seed of job.seeds) {
      const s = scoreMatch(job, genome, opp, seed);
      total += s.score; if (s.won) wins++; if (s.pushed) pushes++; games++;
    }
  }
  return { fitness: total / games, wins, games, pushes };
}

/** Points for one match (0 … ~1.4). */
export function scoreMatch(job: EvalJob, genome: ArrayLike<number>, opp: Opponent, seed: number): { score: number; won: boolean; pushed: boolean } {
  const me = new Brain(job.shape, genome);
  const m = new Match(job.spec, opp.spec, [me, makeController(opp)], seed);
  const start = m.com(1);
  const oppStartR = Math.hypot(start.x, start.y);
  let closeness = 0;
  while (!m.result) {
    m.step();
    // Shaping: being near the opponent (you can't push from across the dish).
    if (m.tick % 4 === 0) {
      const a = m.com(0), b = m.com(1);
      closeness += Math.max(0, 1 - Math.hypot(a.x - b.x, a.y - b.y) / RING_RADIUS);
    }
  }
  const r = m.result;
  const end = m.com(1);
  const pushed = (Math.hypot(end.x, end.y) - oppStartR) / RING_RADIUS; // how far I moved them outward
  let score = 0;
  if (r.winner === 0) {
    // A real push is worth much more than outlasting the shrinking rim,
    // which even a brain that does nothing can sometimes do.
    score += isPush(m) ? 1 : 0.45;
  } else if (r.winner === -1) score += 0.2;
  score += 0.25 * clamp(pushed, -0.5, 1);
  score += 0.15 * (closeness / Math.max(1, m.tick / 4));
  return { score, won: r.winner === 0, pushed: r.winner === 0 && isPush(m) };
}

/** A win counts as a real push-out if the loser left the ring within 1.5 s of being touched. */
export function isPush(m: Match): boolean {
  return m.result?.reason === 'ringout' && m.lastContactTick >= 0 && m.tick - m.lastContactTick <= 60;
}

const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);
