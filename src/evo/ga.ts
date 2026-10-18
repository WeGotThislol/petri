/**
 * The GENETIC ALGORITHM: natural selection for neural networks.
 *
 * One GENERATION:
 *   1. Evaluate: every genome (= brain) fights and gets a fitness score.
 *   2. Select: better genomes are more likely to become parents
 *      (tournament selection: pick 3 at random, the fittest wins).
 *   3. Crossover: a child takes each weight from one parent or the other.
 *   4. Mutate: a few of the child's weights get nudged by a random amount.
 *   5. Elitism: the very best few are copied unchanged, so the
 *      population never forgets its best idea.
 */
import type { CreatureSpec } from '../sim/creature';
import { BrainShape, genomeLength } from '../sim/brain';
import { NUM_BASE_SENSORS } from '../sim/match';
import { Rng } from '../sim/rng';
import type { EvalResult } from './fitness';

export interface EvoConfig {
  popSize: number;
  elite: number;          // copied unchanged each generation
  tournament: number;     // tournament size for selection
  mutationRate: number;   // chance that each weight mutates
  mutationSize: number;   // std-dev of a mutation ("mutation strength")
  crossover: number;      // chance a child has two parents (else it's a mutated clone)
  hidden: number;         // hidden neurons
}

export const DEFAULT_CONFIG: EvoConfig = {
  popSize: 48, elite: 3, tournament: 3, mutationRate: 0.12, mutationSize: 0.35, crossover: 0.6, hidden: 10,
};

export interface GenStats {
  generation: number;
  best: number;
  mean: number;
  bestWins: number;
  bestGames: number;
  bestPushes: number;
}

export function shapeFor(spec: CreatureSpec, hidden: number): BrainShape {
  return { inputs: NUM_BASE_SENSORS + spec.muscles.length, hidden, outputs: spec.muscles.length };
}

export class Evolution {
  readonly shape: BrainShape;
  pop: number[][];
  results: EvalResult[] = [];
  generation = 0;
  history: GenStats[] = [];
  /** Best genome of each finished generation (champions). */
  champions: number[][] = [];
  private rng: Rng;

  constructor(readonly spec: CreatureSpec, public cfg: EvoConfig = { ...DEFAULT_CONFIG }, seed = 1) {
    this.rng = new Rng(seed);
    this.shape = shapeFor(spec, cfg.hidden);
    const n = genomeLength(this.shape);
    // Generation 0: completely random brains.
    this.pop = Array.from({ length: cfg.popSize }, () => Array.from({ length: n }, () => this.rng.gauss() * 0.6));
  }

  /** Index of the best genome of the last evaluation. */
  get bestIndex(): number {
    let b = 0;
    for (let i = 1; i < this.results.length; i++) if (this.results[i].fitness > this.results[b].fitness) b = i;
    return b;
  }

  get best(): number[] { return this.pop[this.bestIndex]; }

  /** Record fitness for the current population (from any evaluator), then breed the next one. */
  advance(results: EvalResult[]): GenStats {
    this.results = results;
    const bi = this.bestIndex;
    const stats: GenStats = {
      generation: this.generation,
      best: results[bi].fitness,
      mean: results.reduce((s, r) => s + r.fitness, 0) / results.length,
      bestWins: results[bi].wins,
      bestGames: results[bi].games,
      bestPushes: results[bi].pushes,
    };
    this.history.push(stats);
    this.champions.push(this.pop[bi].slice());
    this.pop = this.breed();
    this.generation++;
    return stats;
  }

  private breed(): number[][] {
    const { cfg, rng } = this;
    const order = this.results.map((_, i) => i).sort((a, b) => this.results[b].fitness - this.results[a].fitness);
    const next: number[][] = order.slice(0, cfg.elite).map((i) => this.pop[i].slice());
    while (next.length < cfg.popSize) {
      const a = this.pop[this.tournament()];
      let child: number[];
      if (rng.next() < cfg.crossover) {
        const b = this.pop[this.tournament()];
        child = a.map((w, i) => (rng.next() < 0.5 ? w : b[i]));
      } else child = a.slice();
      for (let i = 0; i < child.length; i++) {
        if (rng.next() < cfg.mutationRate) child[i] += rng.gauss() * cfg.mutationSize;
      }
      next.push(child);
    }
    return next;
  }

  private tournament(): number {
    let best = this.rng.int(this.pop.length);
    for (let k = 1; k < this.cfg.tournament; k++) {
      const c = this.rng.int(this.pop.length);
      if (this.results[c].fitness > this.results[best].fitness) best = c;
    }
    return best;
  }
}
