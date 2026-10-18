/**
 * Draws a Match on a <canvas>. It only READS the simulation; it never
 * changes it, so what you see is exactly what the headless sim computes.
 *
 * Visual language: darkfield microscopy. Near-black glass, bioluminescent
 * creatures (additive "lighter" blending makes overlapping glow add up),
 * measurement ticks and a scale bar.
 */
import type { CreatureSpec } from '../sim/creature';
import { Match, RING_RADIUS, SHRINK_START } from '../sim/match';

export const COLORS = {
  ground: '#060a12',
  glassEdge: '#22324a',
  hair: '#1d2a3b',
  tick: '#2c3d52',
  ink: '#c9d6e3',
  inkDim: '#5d6f84',
  accent: '#6ff2c8',   // the player's creature, UI highlights
  pale: '#e9f1ff',     // opponents
  warn: '#ff7a45',     // danger: the contracting rim, knockouts
};
const SERIF = '"Instrument Serif", Georgia, serif';
const MONO = '"IBM Plex Mono", ui-monospace, monospace';

const DISH_RADIUS = RING_RADIUS + 50; // the glass extends past the arena edge
const TRAIL_LEN = 50;

interface Spark { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string }

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private w = 0; private h = 0; private dpr = 1;
  private scale = 1; private cx = 0; private cy = 0;
  private trails: { x: number; y: number }[][] = [[], []];
  private sparks: Spark[] = [];
  private shake = 0;
  /** Previous-tick particle positions, for smooth interpolation between ticks. */
  private prev: Float64Array = new Float64Array(0);
  labels: [string, string] = ['', ''];
  colors: [string, string] = [COLORS.accent, COLORS.pale];

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.resize();
  }

  resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = this.canvas.getBoundingClientRect();
    this.w = r.width; this.h = r.height;
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
    // Fit the dish into the canvas with a small margin for labels.
    this.scale = Math.min(this.w, this.h) / (DISH_RADIUS * 2 + 40);
    this.cx = this.w / 2; this.cy = this.h / 2;
  }

  /** Call right BEFORE match.step() so we can interpolate from old to new positions. */
  snapshot(m: Match): void {
    const ps = m.world.particles;
    if (this.prev.length !== ps.length * 2) this.prev = new Float64Array(ps.length * 2);
    for (let i = 0; i < ps.length; i++) { this.prev[i * 2] = ps[i].x; this.prev[i * 2 + 1] = ps[i].y; }
  }

  /** Call right AFTER match.step(): records trails and spawns effects for this tick. */
  afterStep(m: Match): { bigHit: number } {
    for (let i = 0; i < 2; i++) {
      const c = m.creatures[i];
      // Trail follows the joint farthest from the head (usually a tail tip): it shows the swimming stroke.
      const tip = m.world.particles[c.particles[farthestFromHead(c.spec)]];
      const t = this.trails[i];
      t.push({ x: tip.x, y: tip.y });
      if (t.length > TRAIL_LEN) t.shift();
    }
    let bigHit = 0;
    for (const ct of m.contacts) {
      if (ct.speed > bigHit) bigHit = ct.speed;
      if (ct.speed > 60) this.burst(ct.x, ct.y, 3 + Math.min(10, ct.speed / 40), COLORS.pale, ct.speed * 0.6);
    }
    if (bigHit > 160) this.shake = Math.min(10, this.shake + bigHit / 60);
    return { bigHit };
  }

  /** A knockout: a big burst at the loser's position. */
  knockout(m: Match, loser: number): void {
    const c = m.com(loser);
    this.burst(c.x, c.y, 70, COLORS.warn, 420);
    this.burst(c.x, c.y, 40, this.colors[loser], 260);
    this.shake = 14;
  }

  reset(): void { this.trails = [[], []]; this.sparks = []; this.prev = new Float64Array(0); }

  private burst(x: number, y: number, n: number, color: string, speed: number): void {
    for (let i = 0; i < n; i++) {
      // Rendering may use Math.random/cos: it never feeds back into the sim.
      const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7);
      const max = 0.4 + Math.random() * 0.6;
      this.sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: max, max, color });
    }
  }

  /** Draw a frame. `alpha` (0..1) = how far we are between the previous tick and the current one. */
  draw(m: Match, alpha: number, dt: number): void {
    const { ctx } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = COLORS.ground;
    ctx.fillRect(0, 0, this.w, this.h);

    // Screen shake decays quickly.
    this.shake *= Math.pow(0.0005, dt);
    const sx = (Math.random() - 0.5) * this.shake, sy = (Math.random() - 0.5) * this.shake;
    ctx.save();
    ctx.translate(this.cx + sx, this.cy + sy);
    ctx.scale(this.scale, this.scale);

    this.drawDish(m);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 2; i++) this.drawTrail(i);
    for (let i = 0; i < 2; i++) this.drawCreature(m, i, alpha);
    this.drawSparks(dt);
    ctx.globalCompositeOperation = 'source-over';
    this.drawLabels(m, alpha);
    ctx.restore();
    this.drawScaleBar();
  }

  private drawDish(m: Match): void {
    const { ctx } = this;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, DISH_RADIUS);
    g.addColorStop(0, '#0f1a2b'); g.addColorStop(0.85, '#0a1220'); g.addColorStop(1, '#16243a');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, DISH_RADIUS, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 2 / this.scale; ctx.strokeStyle = COLORS.glassEdge; ctx.stroke();

    // 72 measurement ticks around the glass, longer every 30°.
    ctx.lineWidth = 1.2 / this.scale;
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2, long = i % 6 === 0;
      const r0 = DISH_RADIUS - 8, r1 = DISH_RADIUS - (long ? 20 : 13);
      ctx.strokeStyle = long ? '#3a5372' : COLORS.glassEdge;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); ctx.stroke();
    }
    // Faint cross-hair and guide circle.
    ctx.strokeStyle = '#111c2c'; ctx.lineWidth = 1 / this.scale;
    ctx.beginPath(); ctx.moveTo(-RING_RADIUS, 0); ctx.lineTo(RING_RADIUS, 0); ctx.moveTo(0, -RING_RADIUS); ctx.lineTo(0, RING_RADIUS); ctx.stroke();

    // The arena edge. During sudden death the shrinking rim glows in the warning colour.
    const R = m.ringRadius;
    ctx.strokeStyle = '#3a5372'; ctx.lineWidth = 1.5 / this.scale;
    ctx.beginPath(); ctx.arc(0, 0, RING_RADIUS, 0, Math.PI * 2); ctx.stroke();
    if (m.time > SHRINK_START) {
      ctx.save();
      ctx.strokeStyle = COLORS.warn; ctx.lineWidth = 2 / this.scale;
      ctx.setLineDash([14 / this.scale, 6 / this.scale]);
      ctx.lineDashOffset = -m.tick * 0.6 / this.scale;
      ctx.shadowColor = COLORS.warn; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }

  private pos(m: Match, i: number, alpha: number): [number, number] {
    const p = m.world.particles[i];
    if (this.prev.length < (i + 1) * 2) return [p.x, p.y];
    return [this.prev[i * 2] + (p.x - this.prev[i * 2]) * alpha, this.prev[i * 2 + 1] + (p.y - this.prev[i * 2 + 1]) * alpha];
  }

  private drawCreature(m: Match, ci: number, alpha: number): void {
    const { ctx } = this;
    const c = m.creatures[ci];
    const col = this.colors[ci];
    const P = c.particles.map((pi) => this.pos(m, pi, alpha));
    const lost = m.result && m.result.winner === 1 - ci;

    // Soft body halo around the centre.
    let mx = 0, my = 0; for (const [x, y] of P) { mx += x; my += y; } mx /= P.length; my /= P.length;
    const halo = ctx.createRadialGradient(mx, my, 0, mx, my, 80);
    halo.addColorStop(0, hexA(col, lost ? 0.03 : 0.10)); halo.addColorStop(1, hexA(col, 0));
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(mx, my, 80, 0, Math.PI * 2); ctx.fill();

    // Muscles: thin dashed strands, brighter when contracting.
    ctx.setLineDash([3, 3]); ctx.lineWidth = 1.4;
    for (const mi of c.muscles) {
      const mu = m.world.muscles[mi];
      const a = P[c.particles.indexOf(mu.a)], b = P[c.particles.indexOf(mu.b)];
      ctx.strokeStyle = hexA(col, 0.25 + 0.5 * Math.max(0, -mu.act));
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }
    ctx.setLineDash([]);

    // Bones: a wide faint stroke (glow) under a thin bright one (core).
    ctx.lineCap = 'round';
    for (const pass of [{ w: 14, a: 0.07, blur: 0 }, { w: 6, a: 0.16, blur: 0 }, { w: 2.4, a: 0.95, blur: 12 }]) {
      ctx.lineWidth = pass.w; ctx.strokeStyle = hexA(col, pass.a * (lost ? 0.5 : 1));
      ctx.shadowColor = col; ctx.shadowBlur = pass.blur;
      ctx.beginPath();
      for (const b of c.spec.bones) { ctx.moveTo(P[b.a][0], P[b.a][1]); ctx.lineTo(P[b.b][0], P[b.b][1]); }
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    // Joints: hollow cells with a glowing membrane.
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineWidth = 1.8;
    c.spec.joints.forEach((j, k) => {
      ctx.fillStyle = COLORS.ground; ctx.strokeStyle = hexA(col, 0.95);
      ctx.beginPath(); ctx.arc(P[k][0], P[k][1], j.r * 0.75, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    });
    // The head gets an "eye" (sense organ).
    const hd = P[c.spec.head];
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(hd[0], hd[1], 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
  }

  private drawTrail(i: number): void {
    const { ctx } = this;
    const t = this.trails[i];
    for (let k = 1; k < t.length; k++) {
      const a = k / t.length;
      ctx.fillStyle = hexA(this.colors[i], 0.35 * a * a);
      ctx.beginPath(); ctx.arc(t[k].x, t[k].y, 1.6, 0, Math.PI * 2); ctx.fill();
    }
  }

  private drawSparks(dt: number): void {
    const { ctx } = this;
    for (const s of this.sparks) {
      s.life -= dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= 0.92; s.vy *= 0.92;
      const a = Math.max(0, s.life / s.max);
      ctx.fillStyle = hexA(s.color, a);
      ctx.beginPath(); ctx.arc(s.x, s.y, 1 + 2 * a, 0, Math.PI * 2); ctx.fill();
    }
    this.sparks = this.sparks.filter((s) => s.life > 0);
  }

  /** Specimen labels with a hand-drawn leader line to each creature. */
  private drawLabels(m: Match, alpha: number): void {
    const { ctx } = this;
    for (let i = 0; i < 2; i++) {
      if (!this.labels[i]) continue;
      const c = m.creatures[i];
      const [hx, hy] = this.pos(m, c.particles[c.spec.head], alpha);
      // Labels sit outside the dish so they never cover the action: to the sides
      // on a wide screen, above/below the dish on a tall (phone) screen.
      const portrait = this.h > this.w * 1.25;
      const side = i === 0 ? -1 : 1;
      const lx = portrait ? side * DISH_RADIUS * 0.45 : side * (DISH_RADIUS - 30);
      const ly = portrait ? -side * (DISH_RADIUS + 28 / this.scale) : -side * (DISH_RADIUS - 110);
      ctx.strokeStyle = hexA(COLORS.ink, 0.35); ctx.lineWidth = 1 / this.scale;
      ctx.setLineDash([4 / this.scale, 4 / this.scale]);
      ctx.beginPath(); ctx.moveTo(lx, ly);
      ctx.quadraticCurveTo(lx * 0.6, hy + (ly - hy) * 0.2, hx, hy); ctx.stroke();
      ctx.setLineDash([]);
      const fs = 20 / Math.max(this.scale, 0.6);
      ctx.font = `italic ${fs}px ${SERIF}`;
      ctx.textAlign = portrait ? 'center' : i === 0 ? 'right' : 'left';
      ctx.fillStyle = this.colors[i];
      ctx.fillText(this.labels[i], lx, ly - 6 / this.scale);
    }
  }

  private drawScaleBar(): void {
    const { ctx } = this;
    const len = 100 * this.scale; // 100 world units = "100 µm"
    const narrow = this.w < 600; // on phones the bottom edge holds the controls
    const x = this.w - len - 90, y = narrow ? 70 : this.h - 26;
    ctx.strokeStyle = COLORS.ink; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + len, y);
    for (const k of [0, 0.5, 1]) { const tl = k === 0.5 ? 3 : 5; ctx.moveTo(x + len * k, y - tl); ctx.lineTo(x + len * k, y + tl); }
    ctx.stroke();
    ctx.fillStyle = COLORS.inkDim; ctx.font = `11px ${MONO}`; ctx.textAlign = 'left';
    ctx.fillText('100 µm', x + len + 10, y + 4);
  }
}

/** '#rrggbb' + alpha → 'rgba(...)'. */
function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a.toFixed(3)})`;
}

function farthestFromHead(spec: CreatureSpec): number {
  const h = spec.joints[spec.head];
  let best = 0, bestD = -1;
  spec.joints.forEach((j, k) => { const d = (j.x - h.x) ** 2 + (j.y - h.y) ** 2; if (d > bestD) { bestD = d; best = k; } });
  return best;
}
