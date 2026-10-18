/**
 * Runs evolution generation after generation in the background and tells
 * the UI what happened. Owns the Evolution (genetic algorithm) and the
 * worker pool.
 */
import type { CreatureSpec } from '../sim/creature';
import { DEFAULT_CONFIG, EvoConfig, Evolution, GenStats } from './ga';
import type { CheatFlags } from './fitness';
import { trainingJob } from './schedule';
import { EvalPool } from './pool';

export interface GenReport extends GenStats {
  /** How many individuals pushed an opponent out at least once. */
  pushers: number;
  /** Anti-cheat flags raised across the whole population this generation. */
  flags: CheatFlags;
  popSize: number;
  seconds: number;
}

export class EvolutionRunner {
  readonly evo: Evolution;
  private pool: EvalPool;
  private running = false;
  onGeneration: (r: GenReport) => void = () => {};

  constructor(readonly spec: CreatureSpec, cfg: Partial<EvoConfig> = {}, seed = Date.now() & 0xffff) {
    this.evo = new Evolution(spec, { ...DEFAULT_CONFIG, ...cfg }, seed);
    this.pool = new EvalPool();
  }

  get isRunning(): boolean { return this.running; }

  /** Change settings; they apply from the next generation on. */
  configure(cfg: Partial<EvoConfig>): void { Object.assign(this.evo.cfg, cfg); }

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.loop();
  }

  stop(): void { this.running = false; }

  dispose(): void { this.stop(); this.pool.terminate(); }

  private async loop(): Promise<void> {
    while (this.running) {
      const t0 = performance.now();
      const job = trainingJob(this.evo);
      const results = await this.pool.evaluate(job, this.evo.pop);
      if (!this.running) break;
      const pushers = results.filter((r) => r.pushes > 0).length;
      const flags: CheatFlags = { exploit: 0, idle: 0, camping: 0 };
      for (const r of results) { flags.exploit += r.flags.exploit; flags.idle += r.flags.idle; flags.camping += r.flags.camping; }
      const stats = this.evo.advance(results);
      this.onGeneration({ ...stats, pushers, flags, popSize: results.length, seconds: (performance.now() - t0) / 1000 });
    }
  }
}
