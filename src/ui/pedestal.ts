/**
 * A little animated portrait of a creature (used on the pick screen):
 * it moves gently in place, and its sensor light brightens as your pointer comes near.
 */
import type { CreatureSpec } from '../sim/creature';
import { spawn } from '../sim/creature';
import { World } from '../sim/physics';
import { drawCreature, Senses } from '../render/creatureArt';

export class Pedestal {
  readonly canvas = document.createElement('canvas');
  /** Selected specimens light up as if they'd noticed you. */
  selected = false;
  private senses: Senses = { opponent: 0, edge: 0, touch: 0 };
  private world = new World();
  private parts: number[];
  private muscles: number[];
  private t = Math.random() * 10;
  private pointer: { x: number; y: number } | null = null;

  constructor(readonly spec: CreatureSpec, private size = 150) {
    const c = spawn(this.world, spec, 0, 0, 0, 0, false);
    this.parts = c.particles; this.muscles = c.muscles;
    this.canvas.className = 'pedestal-canvas';
    window.addEventListener('pointermove', (e) => {
      const r = this.canvas.getBoundingClientRect();
      this.pointer = { x: e.clientX - (r.left + r.width / 2), y: e.clientY - (r.top + r.height / 2) };
    });
  }

  /** Advance the idle animation and redraw. */
  tick(dt: number): void {
    this.t += dt;
    // A slow, gentle muscle wave so it looks alive without swimming away.
    this.muscles.forEach((m, i) => { this.world.muscles[m].act = 0.35 * Math.sin(this.t * 2.2 + i * 1.3); });
    this.world.step(1 / 60, 2);
    // Its "opponent" sense brightens when your pointer is near, as if it noticed you.
    const near = this.pointer ? Math.max(0, 1 - Math.hypot(this.pointer.x, this.pointer.y) / 260) : 0;
    const want = this.selected ? 1 : near;
    this.senses.opponent += (want - this.senses.opponent) * Math.min(1, dt * 4);

    const dpr = Math.min(2, devicePixelRatio || 1);
    const S = this.size;
    if (this.canvas.width !== S * dpr) { this.canvas.width = S * dpr; this.canvas.height = S * dpr; this.canvas.style.width = this.canvas.style.height = `${S}px`; }
    const g = this.canvas.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const pts = this.parts.map((pi) => [this.world.particles[pi].x, this.world.particles[pi].y] as [number, number]);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of pts) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const k = (S * 0.86) / Math.max(maxX - minX + 30, maxY - minY + 30);
    g.setTransform(k * dpr, 0, 0, k * dpr, (S / 2 - cx * k) * dpr, (S / 2 - cy * k) * dpr);
    drawCreature(g, this.spec, { pts, time: this.t, senses: this.senses, activity: this.selected ? 0.8 : 0.3, state: this.selected ? 'winner' : 'normal' }, k * dpr);
  }
}
