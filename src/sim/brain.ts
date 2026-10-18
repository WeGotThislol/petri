/**
 * A tiny neural network: the creature's brain.
 *
 *   inputs (sensors) ──► hidden layer ──► outputs (one per muscle)
 *
 * Each arrow is a full set of weighted connections plus a bias. A neuron
 * adds up (input × weight) for all its inputs, adds its bias, and squashes
 * the sum with an activation function so it stays in a sane range.
 *
 * The network is never "trained" with gradients here. Its weights are a
 * GENOME that evolution mutates and recombines (see src/evo/ga.ts).
 *
 * Activation: softsign, x / (1 + |x|). We avoid tanh() because Math.tanh can
 * differ in the last bit between browsers; softsign uses only + and ÷,
 * which are exact everywhere, so fights stay deterministic.
 */
import type { Controller } from './match';

export interface BrainShape { inputs: number; hidden: number; outputs: number }

/** How many numbers a genome for this shape needs (weights + biases). */
export function genomeLength(s: BrainShape): number {
  return (s.inputs + 1) * s.hidden + (s.hidden + 1) * s.outputs;
}

export const softsign = (x: number) => x / (1 + (x < 0 ? -x : x));

export class Brain implements Controller {
  /** Last activations, kept for the brain visualiser and "why did it do that?". */
  readonly hidden: Float64Array;
  readonly lastInputs: Float64Array;
  readonly lastOutputs: Float64Array;

  constructor(readonly shape: BrainShape, readonly genome: ArrayLike<number>) {
    if (genome.length !== genomeLength(shape)) throw new Error(`genome has ${genome.length} numbers, expected ${genomeLength(shape)}`);
    this.hidden = new Float64Array(shape.hidden);
    this.lastInputs = new Float64Array(shape.inputs);
    this.lastOutputs = new Float64Array(shape.outputs);
  }

  act(inp: Float64Array, out: Float64Array): void {
    const { inputs: I, hidden: H, outputs: O } = this.shape;
    const w = this.genome;
    let k = 0;
    // Layer 1: weights stored neuron by neuron: [w_0 .. w_{I-1}, bias].
    for (let h = 0; h < H; h++) {
      let sum = 0;
      for (let i = 0; i < I; i++) sum += inp[i] * w[k++];
      sum += w[k++];
      this.hidden[h] = softsign(sum);
    }
    // Layer 2.
    for (let o = 0; o < O; o++) {
      let sum = 0;
      for (let h = 0; h < H; h++) sum += this.hidden[h] * w[k++];
      sum += w[k++];
      // ×2 then clamp: lets outputs actually reach full contraction (±1).
      const v = 2 * softsign(sum);
      out[o] = v > 1 ? 1 : v < -1 ? -1 : v;
    }
    this.lastInputs.set(inp.subarray(0, I));
    this.lastOutputs.set(out);
  }
}
