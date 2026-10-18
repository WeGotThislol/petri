/**
 * Draws a Match on a <canvas>. It only READS the simulation; it never
 * changes it, so what you see is exactly what the headless sim computes.
 *
 * Look (v2): a dark, deep-sea dish lit from above-left, drifting motes,
 * fine ink measurement marks, and translucent organisms whose sensor lights
 * and neural pulse are driven by their real sensor inputs and brain.
 * Rendering is free to use Math.random/sin/cos: none of it feeds back into
 * the simulation, so determinism is unaffected.
 */
import { drawCreature, Senses } from './creatureArt';
import { Match, RING_RADIUS, S, SHRINK_START } from '../sim/match';
import { Brain } from '../sim/brain';
import { COLOR, FONT, mix, rgba } from '../ui/tokens';

const DISH_RADIUS = RING_RADIUS + 46;

interface Mote { x: number; y: number; vx: number; vy: number; r: number; life: number; max: number; color: string; kind: 'silt' | 'spark' }

/** Per-creature cosmetic state, smoothed so the lights breathe instead of flicker. */
interface Look { senses: Senses; activity: number; drift: { x: number; y: number; vx: number; vy: number } }

export interface View { cx: number; cy: number; fill: number } // dish centre as a fraction of the canvas, and a size factor

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private w = 0; private h = 0; private dpr = 1;
  private scale = 1; private cx = 0; private cy = 0;
  private trails: { x: number; y: number }[][] = [[], []];
  private motes: Mote[] = [];
  private snow = Array.from({ length: 70 }, () => ({ x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, z: Math.random(), p: Math.random() * 6 }));
  private looks: Look[] = [newLook(), newLook()];
  private shake = 0;
  private time = 0;
  private prev: Float64Array = new Float64Array(0);
  /** Which creature (0/1) is the player's, or null. */
  youIndex: number | null = null;
  /** Extra soft light per creature (e.g. amber for your champion). */
  glow: (string | null)[] = [null, null];
  view: View = { cx: 0.5, cy: 0.5, fill: 1 };
  /** Easter egg: dims the room. */
  nightDive = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.resize();
  }

  resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = this.canvas.getBoundingClientRect();
    this.w = r.width; this.h = r.height;
    this.canvas.width = Math.max(1, Math.round(r.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * this.dpr));
    this.scale = (Math.min(this.w, this.h) / (DISH_RADIUS * 2 + 30)) * this.view.fill;
    this.cx = this.w * this.view.cx; this.cy = this.h * this.view.cy;
  }

  setView(v: View): void { this.view = v; this.resize(); }

  /** Call right BEFORE match.step(), so we can interpolate between ticks. */
  snapshot(m: Match): void {
    const ps = m.world.particles;
    if (this.prev.length !== ps.length * 2) this.prev = new Float64Array(ps.length * 2);
    for (let i = 0; i < ps.length; i++) { this.prev[i * 2] = ps[i].x; this.prev[i * 2 + 1] = ps[i].y; }
  }

  /** Call right AFTER match.step(): trails, senses, impact effects. Returns the hardest hit this tick. */
  afterStep(m: Match): { bigHit: number } {
    for (let i = 0; i < 2; i++) {
      const c = m.com(i);
      const t = this.trails[i];
      if (m.tick % 2 === 0) { t.push({ x: c.x, y: c.y }); if (t.length > 36) t.shift(); }
      this.updateLook(m, i);
    }
    let bigHit = 0;
    for (const ct of m.contacts) {
      if (ct.speed > bigHit) bigHit = ct.speed;
      if (ct.speed > 45) this.silt(ct.x, ct.y, 2 + Math.min(6, ct.speed / 45), ct.speed * 0.3);
    }
    if (bigHit > 150) this.shake = Math.min(7, this.shake + bigHit / 80);
    return { bigHit };
  }

  /** Smoothly follow what the creature senses and how hard its brain is working. */
  private updateLook(m: Match, i: number): void {
    const inp = m.inputs[i], L = this.looks[i];
    const target: Senses = {
      opponent: Math.max(0, inp[S.OPP_FWD]) * Math.max(0, 1 - inp[S.OPP_DIST] * 1.4),
      edge: Math.max(0, Math.min(1, 1 - inp[S.RIM] / 0.35)),
      touch: Math.min(1, inp[S.TOUCH] * 4),
    };
    const k = 0.15;
    L.senses.opponent += (target.opponent - L.senses.opponent) * k;
    L.senses.edge += (target.edge - L.senses.edge) * k;
    L.senses.touch += (target.touch - L.senses.touch) * 0.4;
    // Brain activity: average strength of the hidden neurons (if it's an evolved brain),
    // otherwise how hard the muscles are being driven.
    const ctrl = m.controllers[i];
    let a = 0;
    if (ctrl instanceof Brain) { for (const h of ctrl.hidden) a += Math.abs(h); a /= ctrl.hidden.length; }
    else { const out = m.outputs[i]; for (const o of out) a += Math.abs(o); a /= Math.max(1, out.length); }
    L.activity += (Math.min(1, a * 1.4) - L.activity) * 0.08;
  }

  /** A knock-out: a soft burst of light in the winner's colour, silt where the loser fell. */
  knockout(m: Match, loser: number): void {
    const c = m.com(loser);
    this.silt(c.x, c.y, 16, 120);
    const w = m.com(1 - loser);
    const col: string = COLOR[m.creatures[1 - loser].spec.look?.body ?? 'verdigris'];
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 140;
      const max = 1.2 + Math.random() * 1.4;
      this.motes.push({ x: w.x, y: w.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 1 + Math.random() * 1.6, life: max, max, color: i % 3 ? col : COLOR.amber, kind: 'spark' });
    }
    // The loser starts to drift away, limp.
    const L = this.looks[loser];
    const dx = c.x - w.x, dy = c.y - w.y, d = Math.hypot(dx, dy) || 1;
    L.drift.vx = (dx / d) * 22; L.drift.vy = (dy / d) * 22;
    this.shake = 9;
  }

  reset(): void { this.trails = [[], []]; this.motes = []; this.prev = new Float64Array(0); this.looks = [newLook(), newLook()]; }

  private silt(x: number, y: number, n: number, speed: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7);
      const max = 0.6 + Math.random() * 0.6;
      this.motes.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 2 + Math.random() * 4, life: max, max, color: COLOR.bone, kind: 'silt' });
    }
  }

  /** Draw a frame. `alpha` = progress between the previous and current tick (0..1). */
  draw(m: Match | null, alpha: number, dt: number): void {
    const { ctx } = this;
    this.time += dt;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = COLOR.abyss;
    ctx.fillRect(0, 0, this.w, this.h);
    // A faint pool of cool light around the dish, warmer toward the top-left.
    const R = DISH_RADIUS * this.scale;
    const bg = ctx.createRadialGradient(this.cx - R * 0.4, this.cy - R * 0.5, 0, this.cx, this.cy, R * 2.2);
    bg.addColorStop(0, rgba(mix(COLOR.ink, COLOR.rose, 0.12), 1)); bg.addColorStop(0.5, rgba(COLOR.ink, 1)); bg.addColorStop(1, rgba(COLOR.abyss, 1));
    ctx.fillStyle = bg; ctx.fillRect(0, 0, this.w, this.h);

    this.shake *= Math.pow(0.001, dt);
    const sx = (Math.random() - 0.5) * this.shake, sy = (Math.random() - 0.5) * this.shake;
    ctx.save();
    ctx.translate(this.cx + sx, this.cy + sy);
    ctx.scale(this.scale, this.scale);
    this.drawDish(m, dt);
    if (m) {
      for (let i = 0; i < 2; i++) this.drawTrail(m, i);
      const order = m.result && m.result.winner === 0 ? [1, 0] : [0, 1];
      for (const i of order) this.drawOne(m, i, alpha, dt);
    }
    this.drawMotes(dt);
    if (m && this.youIndex !== null) this.drawYou(m, this.youIndex, alpha);
    ctx.restore();
    // Vignette.
    const v = ctx.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.35, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, `rgba(0,0,0,${this.nightDive ? 0.75 : 0.45})`);
    ctx.fillStyle = v; ctx.fillRect(0, 0, this.w, this.h);
  }

  private drawDish(m: Match | null, dt: number): void {
    const { ctx } = this;
    const px = 1 / this.scale;
    // Floor: deep teal-ink, lit softly from the top-left.
    const g = ctx.createRadialGradient(-DISH_RADIUS * 0.35, -DISH_RADIUS * 0.4, 0, 0, 0, DISH_RADIUS);
    g.addColorStop(0, mix(COLOR.dish, COLOR.verdigris, 0.08)); g.addColorStop(0.75, COLOR.dish); g.addColorStop(1, mix(COLOR.dish, COLOR.abyss, 0.6));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, DISH_RADIUS, 0, Math.PI * 2); ctx.fill();
    // Glass lip: a hairline with a long, thin highlight.
    ctx.lineWidth = 1.2 * px; ctx.strokeStyle = rgba(COLOR.bone, 0.14); ctx.stroke();
    ctx.lineWidth = 1.5 * px; ctx.strokeStyle = rgba(COLOR.bone, 0.28);
    ctx.beginPath(); ctx.arc(0, 0, DISH_RADIUS - 6, Math.PI * 1.05, Math.PI * 1.42); ctx.stroke();

    // Marine snow: slow drifting motes at different depths (parallax).
    for (const s of this.snow) {
      s.y += dt * (0.004 + s.z * 0.01); s.p += dt;
      if (s.y > 1) s.y -= 2;
      const x = (s.x + Math.sin(s.p * 0.3) * 0.02) * DISH_RADIUS, y = s.y * DISH_RADIUS;
      if (x * x + y * y > DISH_RADIUS * DISH_RADIUS * 0.95) continue;
      ctx.fillStyle = rgba(COLOR.bone, 0.04 + s.z * 0.08);
      ctx.beginPath(); ctx.arc(x, y, (0.6 + s.z * 1.1), 0, Math.PI * 2); ctx.fill();
    }

    // The arena edge: a fine ink circle with measurement ticks, like a calibrated slide.
    ctx.strokeStyle = rgba(COLOR.bone, 0.22); ctx.lineWidth = 1 * px;
    ctx.beginPath(); ctx.arc(0, 0, RING_RADIUS, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 120; i++) {
      const a = (i / 120) * Math.PI * 2, major = i % 10 === 0;
      ctx.strokeStyle = rgba(COLOR.bone, major ? 0.26 : 0.1);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * (RING_RADIUS + 4), Math.sin(a) * (RING_RADIUS + 4));
      ctx.lineTo(Math.cos(a) * (RING_RADIUS + (major ? 13 : 8)), Math.sin(a) * (RING_RADIUS + (major ? 13 : 8)));
      ctx.stroke();
    }
    ctx.strokeStyle = rgba(COLOR.bone, 0.05);
    ctx.beginPath(); ctx.arc(0, 0, RING_RADIUS * 0.5, 0, Math.PI * 2); ctx.stroke();

    // Sudden death: the contracting rim in ember, a slow dashed crawl.
    if (m && m.time > SHRINK_START) {
      ctx.save();
      ctx.strokeStyle = rgba(COLOR.ember, 0.85); ctx.lineWidth = 1.6 * px;
      ctx.setLineDash([10 * px, 7 * px]); ctx.lineDashOffset = -m.tick * 0.35 * px;
      ctx.shadowColor = rgba(COLOR.ember, 0.7); ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(0, 0, m.ringRadius, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }

  private pos(m: Match, i: number, alpha: number): [number, number] {
    const p = m.world.particles[i];
    if (this.prev.length < (i + 1) * 2) return [p.x, p.y];
    return [this.prev[i * 2] + (p.x - this.prev[i * 2]) * alpha, this.prev[i * 2 + 1] + (p.y - this.prev[i * 2 + 1]) * alpha];
  }

  private drawOne(m: Match, i: number, alpha: number, dt: number): void {
    const c = m.creatures[i];
    const L = this.looks[i];
    let pts = c.particles.map((pi) => this.pos(m, pi, alpha));
    const lost = !!m.result && m.result.winner === 1 - i;
    const won = !!m.result && m.result.winner === i;
    if (lost) {
      // Cosmetic only: the knocked-out body drifts slowly away and stops.
      L.drift.x += L.drift.vx * dt; L.drift.y += L.drift.vy * dt;
      L.drift.vx *= Math.pow(0.4, dt); L.drift.vy *= Math.pow(0.4, dt);
      pts = pts.map(([x, y]) => [x + L.drift.x, y + L.drift.y]);
    }
    const com = m.com(i);
    drawCreature(this.ctx, c.spec, {
      pts, vel: lost ? undefined : { x: com.vx, y: com.vy }, time: this.time + i * 0.37,
      senses: L.senses, activity: L.activity, state: lost ? 'ko' : won ? 'winner' : 'normal', glow: this.glow[i],
    }, this.scale * this.dpr);
  }

  private drawTrail(m: Match, i: number): void {
    const { ctx } = this;
    const t = this.trails[i];
    const col = COLOR[m.creatures[i].spec.look?.body ?? 'verdigris'];
    ctx.lineCap = 'round';
    for (let k = 1; k < t.length; k++) {
      const a = k / t.length;
      ctx.strokeStyle = rgba(col, 0.12 * a * a);
      ctx.lineWidth = (1 + a * 3) / this.scale * 1.2;
      ctx.beginPath(); ctx.moveTo(t[k - 1].x, t[k - 1].y); ctx.lineTo(t[k].x, t[k].y); ctx.stroke();
    }
  }

  private drawMotes(dt: number): void {
    const { ctx } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.motes) {
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= Math.pow(0.12, dt); p.vy *= Math.pow(0.12, dt);
      const a = Math.max(0, p.life / p.max);
      if (p.kind === 'silt') {
        p.r += dt * 10;
        ctx.fillStyle = rgba(p.color, 0.12 * a);
      } else ctx.fillStyle = rgba(p.color, 0.8 * a);
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    this.motes = this.motes.filter((p) => p.life > 0);
  }

  /** Marks the player's specimen: a fine amber bracket and a faint marginal note. */
  private drawYou(m: Match, i: number, alpha: number): void {
    const { ctx } = this;
    const c = m.creatures[i];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const pi of c.particles) { const [x, y] = this.pos(m, pi, alpha); minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    const px = 1 / this.scale, pad = 16;
    const x0 = minX - pad, x1 = maxX + pad, y0 = minY - pad, y1 = maxY + pad, k = 8;
    ctx.strokeStyle = rgba(COLOR.amber, m.result ? 0.35 : 0.6); ctx.lineWidth = 1 * px;
    ctx.beginPath();
    ctx.moveTo(x0, y0 + k); ctx.lineTo(x0, y0); ctx.lineTo(x0 + k, y0);
    ctx.moveTo(x1 - k, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + k);
    ctx.moveTo(x0, y1 - k); ctx.lineTo(x0, y1); ctx.lineTo(x0 + k, y1);
    ctx.moveTo(x1 - k, y1); ctx.lineTo(x1, y1); ctx.lineTo(x1, y1 - k);
    ctx.stroke();
    ctx.fillStyle = rgba(COLOR.amber, 0.75);
    ctx.font = `${15 * px}px ${FONT.hand}`; ctx.textAlign = 'left';
    ctx.fillText('yours', x0, y0 - 5 * px);
  }
}

function newLook(): Look { return { senses: { opponent: 0, edge: 0, touch: 0 }, activity: 0.2, drift: { x: 0, y: 0, vx: 0, vy: 0 } }; }
