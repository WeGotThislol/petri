/**
 * Web Worker: scores a batch of genomes off the main thread, so the page
 * stays smooth while evolution runs. Several of these run in parallel
 * (see pool.ts), one per CPU core.
 */
import { evaluate, EvalJob } from './fitness';

self.onmessage = (e: MessageEvent<{ id: number; job: EvalJob; genomes: number[][] }>) => {
  const { id, job, genomes } = e.data;
  const results = genomes.map((g) => evaluate(job, g));
  (self as unknown as Worker).postMessage({ id, results });
};
