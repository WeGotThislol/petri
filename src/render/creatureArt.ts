/**
 * Creature ART: turns a physics skeleton (joint positions) into an elegant,
 * slightly translucent organism. Physics and looks are deliberately separate:
 * the sim only knows points and sticks; this file paints a body over them.
 *
 * Layers (drawn on a scratch canvas, then stamped onto the screen):
 *   1. Silhouette: the core is filled triangles with fat rounded edges; limbs
 *      are tapered capsules. Overlaps merge into one smooth body.
 *   2. Translucent flesh: a soft gradient, darker and denser in the middle.
 *   3. Inner structure: the skeleton itself, faintly visible through the
 *      flesh, like an X-ray of a larva.
 *   4. Gene markings (bands, speckles, stripes, a gradient), clipped to the body
 *      with 'source-atop' so nothing spills outside.
 *   5. Neural pulse: a band of light that travels head → tail when the
 *      brain is active.
 *   6. Rim light: a thin bright edge, stronger toward the top-left light.
 *   7. Sensor nodes: small lights on the body that brighten when that sense
 *      fires (opponent ahead, rim close, touch). You can literally watch it sense.
 * There are no faces: the life is in the motion.
 */
import type { CreatureSpec, Look } from '../sim/creature';
import { Rng } from '../sim/rng';
import { COLOR, mix, rgba } from '../ui/tokens';

/** What the creature is sensing right now, each 0..1 (drives the sensor lights). */
export interface Senses { opponent: number; edge: number; touch: number }

export interface ArtState {
  /** World positions of every joint, in spec order. */
  pts: [number, number][];
  /** Body velocity, for a subtle stretch along the direction of travel. */
  vel?: { x: number; y: number };
  /** Seconds; drives the neural pulse and breathing. */
  time: number;
  senses?: Senses;
  /** Brain activity 0..1: brightness and speed of the travelling pulse. */
  activity?: number;
  /** 'normal', 'winner' (a little more light) or 'ko' (dimmed). */
  state?: 'normal' | 'winner' | 'ko';
  /** Extra soft light around the body (the champion), or null. */
  glow?: string | null;
}

const DEFAULT_LOOK: Look = { body: 'verdigris', accent: 'bone2', pattern: 'plain', seed: 1 };

let scratch: HTMLCanvasElement | null = null;
let rimCanvas: HTMLCanvasElement | null = null;

/** Easter egg: brighter bioluminescence. Returns the new state. */
let lumBoost = 1;
export function toggleBioluminescence(): boolean { lumBoost = lumBoost === 1 ? 1.8 : 1; return lumBoost !== 1; }

/** Precomputed facts about a body's shape (cached per spec). */
interface Anatomy {
  tris: [number, number, number][]; // stiff triangles of bones = the core
  core: boolean[];
  degree: number[];
  /** Joints ordered from head to the far end: the path the neural pulse travels. */
  spine: number[];
  /** Joints that carry sensor lights: [opponent sensor, edge sensors…]. */
  sensors: { opp: number; edges: number[]; touch: number[] };
  /** Widest radius of the swept torso. */
  torsoR: number;
}
const anatomyCache = new WeakMap<CreatureSpec, Anatomy>();

function anatomy(spec: CreatureSpec): Anatomy {
  let a = anatomyCache.get(spec);
  if (a) return a;
  const key = (i: number, j: number) => `${Math.min(i, j)}-${Math.max(i, j)}`;
  const has = new Set(spec.bones.map((b) => key(b.a, b.b)));
  const n = spec.joints.length;
  const tris: [number, number, number][] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++)
    if (has.has(key(i, j)) && has.has(key(j, k)) && has.has(key(i, k))) tris.push([i, j, k]);
  const core = new Array(n).fill(false);
  for (const t of tris) for (const k of t) core[k] = true;
  if (!tris.length) core[spec.head] = true;
  const degree = new Array(n).fill(0);
  for (const b of spec.bones) { degree[b.a]++; degree[b.b]++; }
  // Spine: breadth-first distances from the head, then the longest chain to a far joint.
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const b of spec.bones) { adj[b.a].push(b.b); adj[b.b].push(b.a); }
  const dist = new Array(n).fill(-1), prev = new Array(n).fill(-1);
  dist[spec.head] = 0;
  const q = [spec.head];
  while (q.length) { const u = q.shift()!; for (const v of adj[u]) if (dist[v] < 0) { dist[v] = dist[u] + 1; prev[v] = u; q.push(v); } }
  const h = spec.joints[spec.head];
  let far = spec.head, best = -1;
  spec.joints.forEach((j, k) => { const d = Math.hypot(j.x - h.x, j.y - h.y); if (d > best) { best = d; far = k; } });
  const spine: number[] = [];
  for (let k = far; k >= 0; k = prev[k]) spine.unshift(k);
  // Sensors: opponent sense at the head; edge senses on the two core joints furthest sideways.
  const side = spec.joints.map((j, k) => ({ k, y: j.y })).filter((o) => core[o.k] && o.k !== spec.head).sort((p, q2) => p.y - q2.y);
  const edges = side.length >= 2 ? [side[0].k, side[side.length - 1].k] : side.map((o) => o.k);
  const touch = spec.joints.map((_, k) => k).filter((k) => degree[k] === 1).slice(0, 2);
  const torsoR = Math.max(...spec.joints.map((j, k) => (core[k] ? j.r : 0))) * 1.75;
  a = { tris, core, degree, spine, sensors: { opp: spec.head, edges, touch }, torsoR };
  anatomyCache.set(spec, a);
  return a;
}

/** Skin radius at joint k: full in the core, slimmer on limbs, tapering at tips. */
function skinR(spec: CreatureSpec, an: Anatomy, k: number): number {
  const r = spec.joints[k].r;
  if (an.core[k]) return r * 1.25;
  return an.degree[k] <= 1 ? r * 0.55 : r * 0.85;
}

/** Trace the silhouette, `grow` units fatter (negative = thinner). Uses the current fillStyle. */
function skin(g: CanvasRenderingContext2D, spec: CreatureSpec, P: [number, number][], grow: number): void {
  const an = anatomy(spec);
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = g.fillStyle;
  for (const [a, b, c] of an.tris) {
    g.beginPath(); g.moveTo(P[a][0], P[a][1]); g.lineTo(P[b][0], P[b][1]); g.lineTo(P[c][0], P[c][1]); g.closePath();
    const rr = (skinR(spec, an, a) + skinR(spec, an, b) + skinR(spec, an, c)) / 3;
    g.lineWidth = Math.max(0.1, rr * 1.6 + grow * 2);
    g.fill(); g.stroke();
  }
  // The torso: circles swept along the spine with a tapering profile (full just
  // behind the head, thin at the tail), so the body is fusiform and bends as it swims.
  if (an.spine.length > 1) {
    let total = 0; const seg: number[] = [];
    for (let i = 1; i < an.spine.length; i++) { const d = Math.hypot(P[an.spine[i]][0] - P[an.spine[i - 1]][0], P[an.spine[i]][1] - P[an.spine[i - 1]][1]); seg.push(d); total += d; }
    const rMax = an.torsoR;
    for (let s = 0; s <= total; s += 2.5) {
      const t = s / total;
      const prof = t < 0.28 ? 0.72 + 0.28 * (t / 0.28) : Math.pow(1 - (t - 0.28) / 0.72, 0.85) * 0.92 + 0.08;
      const r = rMax * prof + grow;
      if (r <= 0.1) continue;
      const [x, y] = alongSpine(an.spine, P, t);
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
  }
  for (const bone of spec.bones) {
    const limb = !(an.core[bone.a] && an.core[bone.b]);
    const ra = (limb && an.core[bone.a] ? spec.joints[bone.a].r * 0.85 : skinR(spec, an, bone.a)) + grow;
    const rb = (limb && an.core[bone.b] ? spec.joints[bone.b].r * 0.85 : skinR(spec, an, bone.b)) + grow;
    capsule(g, P[bone.a][0], P[bone.a][1], Math.max(0.1, ra), P[bone.b][0], P[bone.b][1], Math.max(0.1, rb));
  }
  spec.joints.forEach((_, k) => {
    const r = skinR(spec, an, k) + grow;
    if (r > 0.1) { g.beginPath(); g.arc(P[k][0], P[k][1], r, 0, Math.PI * 2); g.fill(); }
  });
}

/** A tapered capsule: the shape between two circles of different radii. */
function capsule(g: CanvasRenderingContext2D, ax: number, ay: number, ra: number, bx: number, by: number, rb: number): void {
  const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
  if (L < 1e-6) return;
  const nx = -dy / L, ny = dx / L;
  g.beginPath();
  g.moveTo(ax + nx * ra, ay + ny * ra); g.lineTo(bx + nx * rb, by + ny * rb);
  g.lineTo(bx - nx * rb, by - ny * rb); g.lineTo(ax - nx * ra, ay - ny * ra);
  g.closePath(); g.fill();
}

function ensure(c: HTMLCanvasElement | null, W: number, H: number): HTMLCanvasElement {
  c ??= document.createElement('canvas');
  if (c.width < W || c.height < H) { c.width = Math.max(W, c.width); c.height = Math.max(H, c.height); }
  return c;
}

/**
 * Draw a creature onto `ctx`, whose current transform maps world units to the
 * screen at `pxPerUnit` device pixels per unit.
 */
export function drawCreature(ctx: CanvasRenderingContext2D, spec: CreatureSpec, st: ArtState, pxPerUnit: number): void {
  const look = spec.look ?? DEFAULT_LOOK;
  const an = anatomy(spec);
  const P = st.pts;
  const base = COLOR[look.body], accent = COLOR[look.accent];
  const ko = st.state === 'ko', win = st.state === 'winner';

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, maxR = 0;
  P.forEach(([x, y], k) => { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); maxR = Math.max(maxR, spec.joints[k].r); });
  const m = maxR * 1.5 + 12;
  minX -= m; minY -= m; maxX += m; maxY += m;
  const px = Math.min(pxPerUnit, 1024 / Math.max(maxX - minX, maxY - minY));
  const W = Math.ceil((maxX - minX) * px), H = Math.ceil((maxY - minY) * px);
  const view = (c: CanvasRenderingContext2D) => { c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, W + 2, H + 2); c.setTransform(px, 0, 0, px, -minX * px, -minY * px); };

  scratch = ensure(scratch, W, H);
  const g = scratch.getContext('2d')!;
  view(g);

  // Axis of the body (head → far end), used by markings and the pulse.
  const head = P[spec.head], tail = P[an.spine[an.spine.length - 1]];
  let ax = head[0] - tail[0], ay = head[1] - tail[1];
  const alen = Math.hypot(ax, ay) || 1; ax /= alen; ay /= alen;

  // 1–2. Translucent flesh. Stacked, ever-thinner silhouettes: the edge stays pale and
  // thin (light passes through), the middle gets denser and deeper, like glass or a jelly.
  const edgeCol = mix(base, COLOR.bone, 0.25), deep = mix(base, COLOR.abyss, 0.55);
  g.fillStyle = rgba(edgeCol, 0.38);
  skin(g, spec, P, 0);
  for (let i = 1; i <= 4; i++) {
    g.fillStyle = rgba(i < 3 ? base : deep, 0.2 + i * 0.04);
    skin(g, spec, P, -i * 1.6);
  }
  // A cool sheen along the body (lighter at the head end).
  const sheen = g.createLinearGradient(head[0], head[1], tail[0], tail[1]);
  sheen.addColorStop(0, rgba(COLOR.bone, 0.12)); sheen.addColorStop(1, rgba(COLOR.abyss, 0.18));
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = sheen; g.fillRect(minX, minY, maxX - minX, maxY - minY);
  // 3. Inner structure: faint skeleton and joint nuclei seen through the flesh.
  g.strokeStyle = rgba(mix(base, COLOR.bone, 0.55), 0.2); g.lineWidth = 0.9; g.lineCap = 'round';
  g.beginPath();
  for (const b of spec.bones) { g.moveTo(P[b.a][0], P[b.a][1]); g.lineTo(P[b.b][0], P[b.b][1]); }
  g.stroke();
  g.fillStyle = rgba(mix(base, COLOR.abyss, 0.3), 0.45);
  spec.joints.forEach((j, k) => { g.beginPath(); g.arc(P[k][0], P[k][1], Math.max(1.2, j.r * 0.32), 0, Math.PI * 2); g.fill(); });

  // 4. Gene markings.
  paintMarkings(g, spec, an, P, look, base, accent, { ax, ay, head, tail, alen });

  // 5. Neural pulse: light travelling head → tail.
  const act = (st.activity ?? 0.3) * (ko ? 0.15 : 1);
  if (act > 0.02 && an.spine.length > 1) {
    const phase = (st.time * (0.6 + act * 1.4)) % 1;
    const pt = alongSpine(an.spine, P, phase);
    const r = maxR * 2.6;
    const pg = g.createRadialGradient(pt[0], pt[1], 0, pt[0], pt[1], r);
    pg.addColorStop(0, rgba(COLOR.bone, 0.32 * act * lumBoost)); pg.addColorStop(1, rgba(COLOR.bone, 0));
    g.fillStyle = pg; g.fillRect(minX, minY, maxX - minX, maxY - minY);
  }

  // 6. Rim light: (body) minus (body shrunk and nudged toward the light) leaves a crescent edge.
  rimCanvas = ensure(rimCanvas, W, H);
  const rg = rimCanvas.getContext('2d')!;
  view(rg);
  rg.globalCompositeOperation = 'source-over';
  rg.fillStyle = rgba(mix(base, COLOR.bone, 0.75), win ? 0.85 : 0.6);
  skin(rg, spec, P, 0);
  rg.globalCompositeOperation = 'destination-out';
  rg.save(); rg.translate(0.7, 1.0); rg.fillStyle = '#000'; skin(rg, spec, P, -0.9); rg.restore();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-over';
  g.drawImage(rimCanvas, 0, 0, W, H, 0, 0, W, H);
  g.setTransform(px, 0, 0, px, -minX * px, -minY * px);

  // 7. Sensor nodes (additive light, can sit on the edge of the body).
  const s = st.senses ?? { opponent: 0, edge: 0, touch: 0 };
  g.globalCompositeOperation = 'lighter';
  const node = (k: number, level: number, col: string) => {
    const [x, y] = P[k];
    const l = (0.12 + 0.88 * level) * (ko ? 0.2 : 1) * lumBoost;
    const r = 2.2 + level * 2.5;
    const ng = g.createRadialGradient(x, y, 0, x, y, r * 3.2);
    ng.addColorStop(0, rgba(col, Math.min(1, l))); ng.addColorStop(0.35, rgba(col, 0.35 * l)); ng.addColorStop(1, rgba(col, 0));
    g.fillStyle = ng; g.beginPath(); g.arc(x, y, r * 3.2, 0, Math.PI * 2); g.fill();
  };
  node(an.sensors.opp, s.opponent, COLOR.amber);
  for (const k of an.sensors.edges) node(k, s.edge, COLOR.ember);
  for (const k of an.sensors.touch) node(k, s.touch, COLOR.bone);
  g.globalCompositeOperation = 'source-over';

  // Stamp onto the main canvas: floor shadow, soft bioluminescent glow, body.
  let cx = 0, cy = 0; for (const [x, y] of P) { cx += x; cy += y; } cx /= P.length; cy /= P.length;
  ctx.save();
  ctx.translate(cx, cy);
  const v = st.vel ?? { x: 0, y: 0 };
  const k = Math.min(0.06, Math.hypot(v.x, v.y) / 2500); // a whisper of stretch, not cartoon squash
  if (k > 0.002) { const a = Math.atan2(v.y, v.x); ctx.rotate(a); ctx.scale(1 + k, 1 - k * 0.6); ctx.rotate(-a); }
  ctx.translate(-cx, -cy);
  const dw = W / px, dh = H / px;
  if (ko) ctx.globalAlpha = 0.42;
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 14 * pxPerUnit;
  ctx.shadowOffsetX = 3 * pxPerUnit; ctx.shadowOffsetY = 9 * pxPerUnit;
  ctx.drawImage(scratch, 0, 0, W, H, minX, minY, dw, dh);
  ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  const glowCol = st.glow ?? (win ? COLOR.amber : base);
  ctx.shadowColor = rgba(glowCol, (win || st.glow ? 0.55 : 0.22) * (ko ? 0.3 : 1) * Math.min(1.4, lumBoost));
  ctx.shadowBlur = (win || st.glow ? 30 : 16) * pxPerUnit;
  ctx.drawImage(scratch, 0, 0, W, H, minX, minY, dw, dh);
  ctx.restore();
}

/** A point `t` (0..1) of the way along a chain of joints. */
function alongSpine(spine: number[], P: [number, number][], t: number): [number, number] {
  const seg: number[] = []; let total = 0;
  for (let i = 1; i < spine.length; i++) { const d = Math.hypot(P[spine[i]][0] - P[spine[i - 1]][0], P[spine[i]][1] - P[spine[i - 1]][1]); seg.push(d); total += d; }
  let goal = t * total;
  for (let i = 0; i < seg.length; i++) {
    if (goal <= seg[i] || i === seg.length - 1) {
      const f = seg[i] > 0 ? Math.min(1, goal / seg[i]) : 0;
      const a = P[spine[i]], b = P[spine[i + 1]];
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    }
    goal -= seg[i];
  }
  return P[spine[0]];
}

function paintMarkings(
  g: CanvasRenderingContext2D, spec: CreatureSpec, an: Anatomy, P: [number, number][], look: Look,
  base: string, accent: string, axis: { ax: number; ay: number; head: [number, number]; tail: [number, number]; alen: number },
): void {
  const rng = new Rng(look.seed * 7919 + 1);
  const { ax, ay, head } = axis;
  const px = -ay, py = ax; // across the body
  switch (look.pattern) {
    case 'bands': {
      // Soft transverse bands that fade toward the tail.
      for (let d = 10, i = 0; d < axis.alen + 30; d += 13, i++) {
        const mx = head[0] - ax * d, my = head[1] - ay * d;
        g.strokeStyle = rgba(accent, 0.34 * (1 - d / (axis.alen + 40)));
        g.lineWidth = 4.5 - Math.min(3, d / 40);
        g.beginPath(); g.moveTo(mx - px * 200, my - py * 200); g.lineTo(mx + px * 200, my + py * 200); g.stroke();
      }
      break;
    }
    case 'speckles': {
      spec.joints.forEach((_, k) => {
        const n = an.core[k] ? 7 : 3;
        for (let i = 0; i < n; i++) {
          const R = skinR(spec, an, k);
          g.fillStyle = rgba(rng.next() < 0.7 ? accent : mix(base, COLOR.abyss, 0.5), rng.range(0.35, 0.7));
          g.beginPath(); g.arc(P[k][0] + rng.range(-0.8, 0.8) * R, P[k][1] + rng.range(-0.8, 0.8) * R, rng.range(0.5, 1.5), 0, Math.PI * 2); g.fill();
        }
      });
      break;
    }
    case 'stripes': {
      // Fine lines running along every limb, like grain in wood or muscle fibre.
      g.strokeStyle = rgba(accent, 0.4); g.lineWidth = 0.8;
      for (const b of spec.bones) {
        const [x1, y1] = P[b.a], [x2, y2] = P[b.b];
        const L = Math.hypot(x2 - x1, y2 - y1); if (L < 1) continue;
        const nx = -(y2 - y1) / L, ny = (x2 - x1) / L;
        for (const o of [-0.45, 0, 0.45]) {
          const w = Math.min(spec.joints[b.a].r, spec.joints[b.b].r) * o;
          g.beginPath(); g.moveTo(x1 + nx * w, y1 + ny * w); g.lineTo(x2 + nx * w, y2 + ny * w); g.stroke();
        }
      }
      break;
    }
    case 'gradient': {
      const gr = g.createLinearGradient(axis.head[0], axis.head[1], axis.tail[0], axis.tail[1]);
      gr.addColorStop(0, rgba(accent, 0)); gr.addColorStop(1, rgba(accent, 0.55));
      g.fillStyle = gr; g.fillRect(-1e4, -1e4, 2e4, 2e4);
      break;
    }
    default: break;
  }
}
