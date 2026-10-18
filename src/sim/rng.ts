/**
 * Seeded pseudo-random number generator (Mulberry32).
 *
 * Why not Math.random()? Because the whole game relies on DETERMINISM:
 * the same seed must produce the exact same fight on every machine, so a
 * replay can be stored as just "two creatures + one seed".
 *
 * Mulberry32 only uses 32-bit integer operations (Math.imul, shifts, xor),
 * which behave identically in every JavaScript engine.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    // `>>> 0` forces the number into an unsigned 32-bit integer.
    this.state = seed >>> 0;
  }

  /** Next 32-bit unsigned integer. */
  nextU32(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    return this.nextU32() / 4294967296;
  }

  /** Uniform float in [lo, hi). */
  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next();
  }

  /** Integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  /**
   * Approximately normal (bell-curve) value with mean 0, std-dev 1.
   * Sums 4 uniforms (Irwin–Hall) instead of Box–Muller, because Box–Muller
   * needs Math.log/Math.cos, whose last bits can differ between browsers.
   */
  gauss(): number {
    const s = this.next() + this.next() + this.next() + this.next();
    // Sum of 4 uniforms has mean 2 and variance 4/12 → rescale.
    return (s - 2) * 1.7320508075688772;
  }
}
