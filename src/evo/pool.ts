/**
 * A pool of Web Workers that evaluates a whole population in parallel.
 * Genomes are dealt out round-robin so every worker gets a similar mix.
 * If workers are unavailable, it falls back to the main thread.
 */
import { evaluate, EvalJob, EvalResult } from './fitness';

export class EvalPool {
  private workers: Worker[] = [];
  private nextId = 1;
  private pending = new Map<number, (r: EvalResult[]) => void>();

  constructor(size = defaultSize()) {
    try {
      for (let i = 0; i < size; i++) {
        const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
        w.onmessage = (e: MessageEvent<{ id: number; results: EvalResult[] }>) => {
          const cb = this.pending.get(e.data.id);
          this.pending.delete(e.data.id);
          cb?.(e.data.results);
        };
        this.workers.push(w);
      }
    } catch {
      this.workers = []; // no workers: we'll evaluate on the main thread
    }
  }

  get size(): number { return Math.max(1, this.workers.length); }

  async evaluate(job: EvalJob, genomes: number[][]): Promise<EvalResult[]> {
    if (!this.workers.length) return genomes.map((g) => evaluate(job, g));
    const n = this.workers.length;
    const chunks: number[][] = Array.from({ length: n }, () => []);
    genomes.forEach((_, i) => chunks[i % n].push(i));
    const parts = await Promise.all(chunks.map((idx, w) => new Promise<EvalResult[]>((resolve) => {
      if (!idx.length) return resolve([]);
      const id = this.nextId++;
      this.pending.set(id, resolve);
      this.workers[w].postMessage({ id, job, genomes: idx.map((i) => genomes[i]) });
    })));
    const out: EvalResult[] = new Array(genomes.length);
    chunks.forEach((idx, w) => idx.forEach((gi, k) => { out[gi] = parts[w][k]; }));
    return out;
  }

  terminate(): void { this.workers.forEach((w) => w.terminate()); this.workers = []; }
}

function defaultSize(): number {
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
  return Math.max(1, Math.min(8, cores - 1));
}
