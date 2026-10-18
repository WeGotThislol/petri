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

/** A brain's exam: a list of (opponent, seed) fights. */
export interface EvalJob {
  spec: CreatureSpec;
  shape: BrainShape;
  games: { opp: Opponent; seed: number }[];
  /** Weight of the dense shaping bonuses (1 = full, annealed toward 0 during training). */
  shaping?: number;
  /** Start-position randomness (1 = normal). */
  jitter?: number;
}

/** Helper: every opponent × every seed. */
export function allPairs(spec: CreatureSpec, shape: BrainShape, opponents: Opponent[], seeds: number[]): EvalJob {
  return { spec, shape, games: opponents.flatMap((opp) => seeds.map((seed) => ({ opp, seed }))) };
}

/**
 * `pushes` = wins by a real push-out. `flags` counts anti-cheat penalties,
 * which the Lab Notebook uses to talk about reward hacking.
 */
export interface EvalResult { fitness: number; wins: number; games: number; pushes: number; flags: CheatFlags }
export interface CheatFlags { exploit: number; idle: number; camping: number }

export function makeController(o: Opponent): Controller {
  return o.kind === 'dummy' ? new DummyController() : new Brain(o.shape, o.genome);
}

/** Score one brain over all the fights in its exam. */
export function evaluate(job: EvalJob, genome: ArrayLike<number>): EvalResult {
  let total = 0, wins = 0, games = 0, pushes = 0;
  const flags: CheatFlags = { exploit: 0, idle: 0, camping: 0 };
  for (const { opp, seed } of job.games) {
    const s = scoreMatch(job, genome, opp, seed);
    total += s.score; if (s.won) wins++; if (s.pushed) pushes++; games++;
    if (s.flag) flags[s.flag]++;
  }
  return { fitness: total / games, wins, games, pushes, flags };
}

// ---- anti-cheat thresholds ----
const EXPLOIT_HITS = 3;        // speed-cap hits in one match → it found a physics glitch
const IDLE_PATH = 0.6;         // travelled less than 0.6 × ring radius in a whole match → couch potato
const CAMP_FRACTION = 0.7;     // spent >70% of the match in the middle third…
const CAMP_RADIUS = 0.33;      // …(this fraction of the ring radius) without ever touching anyone

/**
 * Points for one match (0 … ~1.4), with anti-cheat rules applied.
 *
 * Evolution optimises exactly what we score, loopholes included ("reward
 * hacking"). The three rules below close loopholes we've seen or expect:
 *   exploit: absurd speeds mean a physics glitch → the match scores 0.
 *   idle:    doing nothing and hoping the opponent falls out → −0.2.
 *   camping: parking in the middle and waiting for the rim to shrink,
 *            without ever engaging → −0.2.
 * Plus a small effort cost for twitching (see below).
 */
export function scoreMatch(job: EvalJob, genome: ArrayLike<number>, opp: Opponent, seed: number): MatchScore {
  const me = new Brain(job.shape, genome);
  const m = new Match(job.spec, opp.spec, [me, makeController(opp)], seed, { jitter: job.jitter ?? 1 });
  const start = m.com(1);
  const oppStartR = Math.hypot(start.x, start.y);
  let closeness = 0, samples = 0, path = 0, inMiddle = 0, twitch = 0;
  let last = m.com(0);
  const prevOut = new Float64Array(m.outputs[0].length);
  while (!m.result) {
    m.step();
    // Effort: how abruptly the muscle commands change from tick to tick.
    const out = m.outputs[0];
    let d = 0;
    for (let k = 0; k < out.length; k++) { d += Math.abs(out[k] - prevOut[k]); prevOut[k] = out[k]; }
    twitch += d / Math.max(1, out.length);
    if (m.tick % 4 === 0) {
      const a = m.com(0), b = m.com(1);
      samples++;
      // Shaping: being near the opponent (you can't push from across the dish).
      closeness += Math.max(0, 1 - Math.hypot(a.x - b.x, a.y - b.y) / RING_RADIUS);
      path += Math.hypot(a.x - last.x, a.y - last.y);
      if (Math.hypot(a.x, a.y) < CAMP_RADIUS * RING_RADIUS) inMiddle++;
      last = a;
    }
  }
  const r = m.result;
  if (m.world.speedCapHits[0] >= EXPLOIT_HITS) return { score: 0, won: false, pushed: false, flag: 'exploit' };

  const end = m.com(1);
  const pushed = (Math.hypot(end.x, end.y) - oppStartR) / RING_RADIUS; // how far I moved them outward
  let score = 0;
  if (r.winner === 0) {
    // A real push is worth much more than outlasting the shrinking rim,
    // which even a brain that does nothing can sometimes do.
    score += isPush(m) ? 1 : 0.45;
  } else if (r.winner === -1) score += 0.2;
  // Dense "shaping" bonuses help clueless early generations, then fade out so
  // the real goal (winning) dominates: an exploration curriculum (docs/RESEARCH.md).
  const shaping = job.shaping ?? 1;
  score += shaping * 0.25 * clamp(pushed, -0.5, 1);
  score += shaping * 0.15 * (closeness / Math.max(1, samples));
  // A small cost for frantic twitching: smoother, more natural motion, and less
  // incentive to farm integration error the way Karl Sims' swimmers did.
  score -= 0.1 * (twitch / Math.max(1, m.tick));

  let flag: MatchScore['flag'] = null;
  if (path < IDLE_PATH * RING_RADIUS) { score -= 0.2; flag = 'idle'; }
  else if (m.lastContactTick < 0 && inMiddle > CAMP_FRACTION * samples) { score -= 0.2; flag = 'camping'; }
  return { score, won: r.winner === 0, pushed: r.winner === 0 && isPush(m), flag };
}

export interface MatchScore { score: number; won: boolean; pushed: boolean; flag: keyof CheatFlags | null }

/** A win counts as a real push-out if the loser left the ring within 1.5 s of being touched. */
export function isPush(m: Match): boolean {
  return m.result?.reason === 'ringout' && m.lastContactTick >= 0 && m.tick - m.lastContactTick <= 60;
}

const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);

/**
 * Head-to-head: how often does brain A beat brain B? Each seed is played
 * twice with sides swapped, so neither gets the "left side" every time.
 * Draws count as half a win.
 */
export function headToHead(spec: CreatureSpec, shape: BrainShape, a: ArrayLike<number>, b: ArrayLike<number>, seeds: number[]): number {
  let score = 0;
  for (const seed of seeds) {
    const r1 = new Match(spec, spec, [new Brain(shape, a), new Brain(shape, b)], seed).run();
    const r2 = new Match(spec, spec, [new Brain(shape, b), new Brain(shape, a)], seed).run();
    score += r1.winner === 0 ? 1 : r1.winner === -1 ? 0.5 : 0;
    score += r2.winner === 1 ? 1 : r2.winner === -1 ? 0.5 : 0;
  }
  return score / (seeds.length * 2);
}
