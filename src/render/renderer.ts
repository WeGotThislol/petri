/**
 * Draws a Match on a <canvas>. It only READS the simulation; it never
 * changes it, so what you see is exactly what the headless sim computes.
 *
 * Look: a warm, dusky dish with a slightly wobbly hand-drawn rim, soft
 * creatures with faces that react to the fight, dust puffs and confetti.
 * Rendering is free to use Math.random/sin/cos: none of it feeds back into
 * the simulation, so determinism is unaffected.
 */
import { drawCreature, Expression } from './creatureArt';
import { Match, RING_RADIUS, S, SHRINK_START } from '../sim/match';
import { COLOR, CREATURE_COLORS, FONT, mix, rgba } from '../ui/tokens';

const DISH_RADIUS = RING_RADIUS + 46;

interface Puff { x: number; y: number; vx: number; vy: number; r: number; life: number; max: number; color: string; kind: 'dust' | 'confetti'; rot: number }

/** Per-creature cosmetic state (blinking, mood with a little hysteresis). */
interface Face { blinkIn: number; blinkT: number; mood: Expression; moodHold: number }

export interface View { cx: number; cy: number; fill: number } // dish centre as fraction of canvas, and size factor

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private w = 0; private h = 0; private dpr = 1;
  private scale = 1; private cx = 0; private cy = 0;
  private trails: { x: number; y: number }[][] = [[], []];
  private puffs: Puff[] = [];
  private faces: Face[] = [newFace(), newFace()];
  private shake = 0;
  private time = 0;
  private prev: Float64Array = new Float64Array(0);
  private wobble = Array.from({ length: 64 }, () => Math.random());
  /** Which creature (0/1) gets a little "you" note, or null. */
  youIndex: number | null = null;
  /** Soft glow per creature (e.g. butter for a champion). */
  glow: (string | null)[] = [null, null];
  view: View = { cx: 0.5, cy: 0.5, fill: 1 };
  /** Easter egg. */
  partyHats = false;

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

  /** Call right AFTER match.step(): trails and impact effects. Returns the hardest hit this tick. */
  afterStep(m: Match): { bigHit: number } {
    for (let i = 0; i < 2; i++) {
      const c = m.com(i);
      const t = this.trails[i];
      if (m.tick % 2 === 0) { t.push({ x: c.x, y: c.y }); if (t.length > 40) t.shift(); }
    }
    let bigHit = 0;
    for (const ct of m.contacts) {
      if (ct.speed > bigHit) bigHit = ct.speed;
      if (ct.speed > 45) this.dust(ct.x, ct.y, 2 + Math.min(6, ct.speed / 50), ct.speed * 0.35);
    }
    if (bigHit > 150) this.shake = Math.min(9, this.shake + bigHit / 70);
    return { bigHit };
  }

  /** A knock-out: dust cloud + palette confetti. */
  knockout(m: Match, loser: number): void {
    const c = m.com(loser);
    this.dust(c.x, c.y, 18, 160);
    const w = m.com(1 - loser);
    for (let i = 0; i < 46; i++) {
      const a = Math.random() * Math.PI * 2, s = 80 + Math.random() * 220;
      this.puffs.push({
        x: w.x, y: w.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, r: 2.5 + Math.random() * 2.5,
        life: 1.4 + Math.random(), max: 2.4, color: COLOR[CREATURE_COLORS[i % CREATURE_COLORS.length]], kind: 'confetti', rot: Math.random() * 6,
      });
    }
    this.shake = 12;
  }

  reset(): void { this.trails = [[], []]; this.puffs = []; this.prev = new Float64Array(0); this.faces = [newFace(), newFace()]; }

  private dust(x: number, y: number, n: number, speed: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7);
      const max = 0.5 + Math.random() * 0.5;
      this.puffs.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 3 + Math.random() * 5, life: max, max, color: COLOR.cream, kind: 'dust', rot: 0 });
    }
  }

  /** Draw a frame. `alpha` = progress between the previous and current tick (0..1). */
  draw(m: Match | null, alpha: number, dt: number): void {
    const { ctx } = this;
    this.time += dt;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // Background: dusk with a soft warm pool of light where the dish is.
    ctx.fillStyle = COLOR.dusk;
    ctx.fillRect(0, 0, this.w, this.h);
    const glowR = DISH_RADIUS * this.scale * 1.6;
    const bg = ctx.createRadialGradient(this.cx, this.cy, 0, this.cx, this.cy, glowR);
    bg.addColorStop(0, rgba(mix(COLOR.dusk, COLOR.peach, 0.12), 1)); bg.addColorStop(1, rgba(COLOR.dusk, 0));
    ctx.fillStyle = bg; ctx.fillRect(0, 0, this.w, this.h);

    this.shake *= Math.pow(0.0008, dt);
    const sx = (Math.random() - 0.5) * this.shake, sy = (Math.random() - 0.5) * this.shake;
    ctx.save();
    ctx.translate(this.cx + sx, this.cy + sy);
    ctx.scale(this.scale, this.scale);
    this.drawDish(m);
    if (m) {
      for (let i = 0; i < 2; i++) this.drawTrail(m, i);
      // Draw the loser first so the winner is on top.
      const order = m.result && m.result.winner === 0 ? [1, 0] : [0, 1];
      for (const i of order) this.drawOne(m, i, alpha, dt);
    }
    this.drawPuffs(dt);
    if (m && this.youIndex !== null) this.drawYou(m, this.youIndex, alpha);
    ctx.restore();
  }

  /** A wobbly circle, like it was drawn by hand (two passes = pencil feel). */
  private wobblyCircle(r: number, amp: number, phase = 0): void {
    const { ctx } = this;
    const n = 90;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const k = (i % n) / n * this.wobble.length;
      const j = Math.floor(k), f = k - j;
      const w0 = this.wobble[j % this.wobble.length], w1 = this.wobble[(j + 1) % this.wobble.length];
      const rr = r + amp * (Math.sin(a * 3 + phase) * 0.5 + (w0 * (1 - f) + w1 * f - 0.5));
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
  }

  private drawDish(m: Match | null): void {
    const { ctx } = this;
    const px = 1 / this.scale;
    // Dish floor.
    const g = ctx.createRadialGradient(-DISH_RADIUS * 0.3, -DISH_RADIUS * 0.35, 0, 0, 0, DISH_RADIUS);
    g.addColorStop(0, mix(COLOR.surface, COLOR.peach, 0.08)); g.addColorStop(0.7, COLOR.surface); g.addColorStop(1, mix(COLOR.surface, COLOR.night, 0.35));
    ctx.fillStyle = g;
    this.wobblyCircle(DISH_RADIUS, 2.5); ctx.fill();
    // Glass lip: a soft cream rim with a highlight arc.
    ctx.lineWidth = 3 * px; ctx.strokeStyle = rgba(COLOR.cream, 0.18); ctx.stroke();
    ctx.lineWidth = 2 * px; ctx.strokeStyle = rgba(COLOR.cream, 0.35);
    ctx.beginPath(); ctx.arc(0, 0, DISH_RADIUS - 8, Math.PI * 1.08, Math.PI * 1.45); ctx.stroke();

    // The arena edge: a hand-drawn double line.
    ctx.strokeStyle = rgba(COLOR.inkFaint, 0.55); ctx.lineWidth = 2 * px;
    this.wobblyCircle(RING_RADIUS, 1.6, 0.4); ctx.stroke();
    ctx.strokeStyle = rgba(COLOR.inkFaint, 0.25); ctx.lineWidth = 1.2 * px;
    this.wobblyCircle(RING_RADIUS + 3, 1.6, 2.1); ctx.stroke();
    // Little hand-drawn ticks every 30°.
    ctx.strokeStyle = rgba(COLOR.inkFaint, 0.4); ctx.lineWidth = 1.6 * px; ctx.lineCap = 'round';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.05 * this.wobble[i];
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * (RING_RADIUS + 10), Math.sin(a) * (RING_RADIUS + 10));
      ctx.lineTo(Math.cos(a) * (RING_RADIUS + 18), Math.sin(a) * (RING_RADIUS + 18)); ctx.stroke();
    }

    // Sudden death: the shrinking rim, in coral, crawling.
    if (m && m.time > SHRINK_START) {
      ctx.save();
      ctx.strokeStyle = COLOR.coral; ctx.lineWidth = 3 * px;
      ctx.setLineDash([12 * px, 9 * px]); ctx.lineDashOffset = -m.tick * 0.5 * px;
      ctx.shadowColor = rgba(COLOR.coral, 0.6); ctx.shadowBlur = 10;
      this.wobblyCircle(m.ringRadius, 1.2, 1.3); ctx.stroke();
      ctx.restore();
    }
  }

  private pos(m: Match, i: number, alpha: number): [number, number] {
    const p = m.world.particles[i];
    if (this.prev.length < (i + 1) * 2) return [p.x, p.y];
    return [this.prev[i * 2] + (p.x - this.prev[i * 2]) * alpha, this.prev[i * 2 + 1] + (p.y - this.prev[i * 2 + 1]) * alpha];
  }

  /** Pick a facial expression from what's happening in the fight. */
  private moodFor(m: Match, i: number): Expression {
    if (m.result) return m.result.winner === i ? 'happy' : m.result.winner === -1 ? 'idle' : 'dizzy';
    const inp = m.inputs[i];
    if (inp[S.RIM] < 0.16) return 'scared';
    if (inp[S.TOUCH] > 0.05 && inp[S.OPP_FWD] > 0.2) return 'push';
    return 'idle';
  }

  private drawOne(m: Match, i: number, alpha: number, dt: number): void {
    const c = m.creatures[i];
    const pts = c.particles.map((pi) => this.pos(m, pi, alpha));
    const f = this.faces[i];
    // Blinking: every 2–5 s, for 0.14 s.
    f.blinkIn -= dt;
    if (f.blinkIn <= 0) { f.blinkT = 0.14; f.blinkIn = 2 + Math.random() * 3; }
    f.blinkT = Math.max(0, f.blinkT - dt);
    const blink = f.blinkT > 0 ? Math.sin((f.blinkT / 0.14) * Math.PI) : 0;
    // Mood with a short hold so faces don't flicker.
    const want = this.moodFor(m, i);
    f.moodHold -= dt;
    if (want !== f.mood && (f.moodHold <= 0 || m.result)) { f.mood = want; f.moodHold = 0.45; }
    const com = m.com(i), opp = m.com(1 - i);
    const ctx = this.ctx;
    drawCreature(ctx, c.spec, {
      pts, lookAt: { x: opp.x, y: opp.y }, expression: f.mood, blink,
      vel: { x: com.vx, y: com.vy }, time: this.time + i * 1.7, glow: this.glow[i],
    }, this.scale * this.dpr);
    if (this.partyHats) this.drawHat(c.spec.head, pts, c.spec.joints[c.spec.head].r);
  }

  private drawHat(head: number, pts: [number, number][], r: number): void {
    const { ctx } = this;
    let cx = 0, cy = 0; for (const [x, y] of pts) { cx += x; cy += y; } cx /= pts.length; cy /= pts.length;
    const [hx, hy] = pts[head];
    const x = (hx + cx) / 2, y = (hy + cy) / 2 - r * 1.6;
    ctx.fillStyle = COLOR.butter; ctx.strokeStyle = mix(COLOR.butter, COLOR.night, 0.6); ctx.lineWidth = 1.5 / this.scale;
    ctx.beginPath(); ctx.moveTo(x - r, y + r * 0.6); ctx.lineTo(x, y - r * 1.6); ctx.lineTo(x + r, y + r * 0.6); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = COLOR.coral; ctx.beginPath(); ctx.arc(x, y - r * 1.6, r * 0.35, 0, Math.PI * 2); ctx.fill();
  }

  private drawTrail(m: Match, i: number): void {
    const { ctx } = this;
    const t = this.trails[i];
    const col = COLOR[m.creatures[i].spec.look?.body ?? 'peach'];
    for (let k = 1; k < t.length; k++) {
      const a = k / t.length;
      ctx.fillStyle = rgba(col, 0.22 * a * a);
      ctx.beginPath(); ctx.arc(t[k].x, t[k].y, 2.2 + a * 1.5, 0, Math.PI * 2); ctx.fill();
    }
  }

  private drawPuffs(dt: number): void {
    const { ctx } = this;
    for (const p of this.puffs) {
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
      const a = Math.max(0, p.life / p.max);
      if (p.kind === 'dust') {
        p.vx *= 0.9; p.vy *= 0.9; p.r += dt * 14;
        ctx.fillStyle = rgba(p.color, 0.35 * a);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      } else {
        p.vx *= 0.96; p.vy = p.vy * 0.96 + 120 * dt; p.rot += dt * 8;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = rgba(p.color, Math.min(1, a * 1.5));
        ctx.fillRect(-p.r, -p.r * 0.5, p.r * 2, p.r);
        ctx.restore();
      }
    }
    this.puffs = this.puffs.filter((p) => p.life > 0);
  }

  /** A handwritten "you!" with a little arrow over the player's creature. */
  private drawYou(m: Match, i: number, alpha: number): void {
    const { ctx } = this;
    const c = m.creatures[i];
    let minY = Infinity, sx = 0;
    for (const pi of c.particles) { const [x, y] = this.pos(m, pi, alpha); minY = Math.min(minY, y); sx += x; }
    const x = sx / c.particles.length, y = minY - 34 + Math.sin(this.time * 3) * 2.5;
    const px = 1 / this.scale;
    ctx.fillStyle = COLOR.mint; ctx.strokeStyle = COLOR.mint;
    ctx.font = `700 ${21 * px}px ${FONT.hand}`; ctx.textAlign = 'center';
    ctx.fillText('you!', x, y);
    ctx.lineWidth = 2 * px; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - 2, y + 5); ctx.quadraticCurveTo(x + 6, y + 13, x + 1, y + 20); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 4, y + 15); ctx.lineTo(x + 1, y + 20); ctx.lineTo(x + 6, y + 16); ctx.stroke();
  }
}

function newFace(): Face { return { blinkIn: 1 + Math.random() * 2, blinkT: 0, mood: 'idle', moodHold: 0 }; }
