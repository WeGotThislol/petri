/**
 * The Stage: owns the big background canvas and the game loop.
 *
 * Game loop = "fixed timestep with accumulator": the simulation always
 * advances in whole, identical ticks (deterministic), while drawing happens
 * at the screen's refresh rate and interpolates between ticks.
 */
import { Match } from '../sim/match';
import { Renderer } from '../render/renderer';

const TICKS_PER_SECOND = 60; // ticks shown per real second at 1x

export class Stage {
  readonly renderer: Renderer;
  match: Match | null = null;
  speed = 1;
  paused = false;
  /** Called once when a match ends. */
  onEnd: ((m: Match) => void) | null = null;
  /** If set, a new match is made this many seconds after one ends. */
  loopAfter: number | null = null;
  private factory: (() => Match) | null = null;
  private acc = 0;
  private hitStop = 0;
  private endTimer = 0;
  private last = performance.now();
  private ended = false;

  constructor(readonly canvas: HTMLCanvasElement, manual = false) {
    this.renderer = new Renderer(canvas);
    window.addEventListener('resize', () => this.renderer.resize());
    if (!manual) requestAnimationFrame(this.frame);
  }

  /** Show matches made by `factory` (called again for every loop). */
  play(factory: () => Match, loopAfter: number | null = 2.5): void {
    this.factory = factory;
    this.loopAfter = loopAfter;
    this.restart();
  }

  restart(): void {
    if (!this.factory) return;
    this.renderer.reset();
    this.match = this.factory();
    this.ended = false; this.endTimer = 0; this.acc = 0;
  }

  private frame = (now: number) => {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.advance(dt);
    requestAnimationFrame(this.frame);
  };

  /** Advance by `dt` real seconds and draw (public so tests can drive it). */
  advance(dt: number): void {
    const m = this.match;
    if (m && !this.paused) {
      if (this.hitStop > 0) this.hitStop -= dt;
      else this.acc += dt * TICKS_PER_SECOND * this.speed;
      while (this.acc >= 1 && !m.result) {
        this.acc -= 1;
        this.renderer.snapshot(m);
        m.step();
        const { bigHit } = this.renderer.afterStep(m);
        if (bigHit > 220 && this.speed === 1) this.hitStop = 0.05; // freeze-frame on big hits
      }
      if (m.result) {
        this.acc = 0;
        if (!this.ended) {
          this.ended = true;
          if (m.result.winner >= 0) this.renderer.knockout(m, 1 - m.result.winner);
          this.onEnd?.(m);
        }
        this.endTimer += dt;
        if (this.loopAfter !== null && this.endTimer > this.loopAfter) this.restart();
      }
    }
    this.renderer.draw(this.match, this.match?.result ? 1 : Math.min(1, this.acc), this.paused ? 0 : dt);
  }
}
