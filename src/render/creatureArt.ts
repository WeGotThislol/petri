/**
 * Creature ART: turns a physics skeleton (joint positions) into a lovable
 * little animal. Physics and looks are deliberately separate: the sim only
 * knows points and sticks; this file paints soft skin over them.
 *
 * How the "one continuous blob" works (a classic 2D trick):
 *   1. Draw every bone as a thick round-capped line, every joint as a disc,
 *      and fill the stiff triangles of the core, all in the body colour.
 *      Overlapping shapes merge into one silhouette.
 *   2. Paint patterns with 'source-atop', which only paints where skin
 *      already exists, so spots and stripes never spill outside the body.
 *   3. Draw the same shapes slightly fatter in the outline colour with
 *      'destination-over' (= behind what's there). Only a rim peeks out:
 *      one smooth outline around the whole union.
 * The creature is drawn on a scratch canvas first, then stamped onto the
 * main canvas with a soft drop shadow and a little squash-and-stretch.
 */
import type { CreatureSpec, Look } from '../sim/creature';
import { Rng } from '../sim/rng';
import { COLOR, mix, rgba } from '../ui/tokens';

export type Expression = 'idle' | 'push' | 'scared' | 'dizzy' | 'happy';

export interface ArtState {
  /** World positions of every joint, in spec order. */
  pts: [number, number][];
  /** Where the eyes should look (world coords), e.g. the opponent. */
  lookAt?: { x: number; y: number } | null;
  expression: Expression;
  /** 0 = eyes open, 1 = fully closed. */
  blink: number;
  /** Velocity of the body, for squash-and-stretch. */
  vel?: { x: number; y: number };
  /** Seconds, drives idle breathing. */
  time: number;
  /** Soft champion glow colour, or null. */
  glow?: string | null;
}

const DEFAULT_LOOK: Look = { body: 'peach', accent: 'coral', pattern: 'plain', eyes: 1, seed: 1 };

let scratch: HTMLCanvasElement | null = null;

/** Easter egg: type "blob" in the game for googly eyes. Returns the new state. */
let eyeBoost = 1;
export function setEyeBoost(): boolean { eyeBoost = eyeBoost === 1 ? 1.7 : 1; return eyeBoost !== 1; }

/** Precomputed facts about a body's shape (cached per spec). */
interface Anatomy {
  tris: [number, number, number][]; // stiff triangles of bones = the plump core
  core: boolean[];                  // is joint k part of the core?
  degree: number[];                 // how many bones touch joint k (1 = a limb tip)
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
  a = { tris, core, degree };
  anatomyCache.set(spec, a);
  return a;
}

/** Skin radius at joint k: plump in the core, slimmer on limbs, tapering at the tips. */
function skinR(spec: CreatureSpec, an: Anatomy, k: number): number {
  const r = spec.joints[k].r;
  if (an.core[k]) return r * 1.45;
  return an.degree[k] <= 1 ? r * 0.8 : r * 1.0;
}

/**
 * Trace the skin silhouette, `grow` world units fatter than normal.
 * Uses the current fillStyle. Core = filled triangles + fat rounded edges;
 * limbs = tapered capsules between two circles.
 */
function skin(g: CanvasRenderingContext2D, spec: CreatureSpec, P: [number, number][], grow: number): void {
  const an = anatomy(spec);
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = g.fillStyle;
  for (const [a, b, c] of an.tris) {
    g.beginPath(); g.moveTo(P[a][0], P[a][1]); g.lineTo(P[b][0], P[b][1]); g.lineTo(P[c][0], P[c][1]); g.closePath();
    const rr = (skinR(spec, an, a) + skinR(spec, an, b) + skinR(spec, an, c)) / 3;
    g.lineWidth = rr * 2.3 + grow * 2; // fat rounded edges make the core a soft blob
    g.fill(); g.stroke();
  }
  for (const bone of spec.bones) {
    // Limbs leave the core slim (they shouldn't look like the body is pointy).
    const limb = !(an.core[bone.a] && an.core[bone.b]);
    const ra = (limb && an.core[bone.a] ? spec.joints[bone.a].r : skinR(spec, an, bone.a)) + grow;
    const rb = (limb && an.core[bone.b] ? spec.joints[bone.b].r : skinR(spec, an, bone.b)) + grow;
    capsule(g, P[bone.a][0], P[bone.a][1], ra, P[bone.b][0], P[bone.b][1], rb);
  }
  spec.joints.forEach((_, k) => {
    g.beginPath(); g.arc(P[k][0], P[k][1], skinR(spec, an, k) + grow, 0, Math.PI * 2); g.fill();
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

/** Where the face goes and how big it is: on the core, nudged toward the head. */
function faceGeometry(spec: CreatureSpec, P: [number, number][]) {
  const an = anatomy(spec);
  let cx = 0, cy = 0, n = 0;
  P.forEach(([x, y], k) => { if (an.core[k]) { cx += x; cy += y; n++; } });
  cx /= n; cy /= n;
  let size = 0;
  P.forEach(([x, y], k) => { if (an.core[k]) size += Math.hypot(x - cx, y - cy) + skinR(spec, an, k); });
  size /= n;
  const [hx, hy] = P[spec.head];
  let fx = hx - cx, fy = hy - cy; const fl = Math.hypot(fx, fy) || 1; fx /= fl; fy /= fl;
  const t = Math.min(fl * 0.45, size * 0.45);
  return { cx, cy, fx, fy, size, faceX: cx + fx * t, faceY: cy + fy * t };
}

/**
 * Draw a creature onto `ctx`, whose current transform maps world units to the
 * screen at `pxPerUnit` device pixels per unit.
 */
export function drawCreature(ctx: CanvasRenderingContext2D, spec: CreatureSpec, st: ArtState, pxPerUnit: number): void {
  const look = spec.look ?? DEFAULT_LOOK;
  const P = st.pts;
  const base = COLOR[look.body], accent = COLOR[look.accent];
  const outline = mix(base, COLOR.night, 0.6);
  const ow = Math.max(2.2, 1.6 / pxPerUnit); // outline width, at least ~1.6 px on screen

  // Bounding box of the creature (plus room for outline, glow and sweat drops).
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, maxR = 0;
  P.forEach(([x, y], k) => { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); maxR = Math.max(maxR, spec.joints[k].r); });
  const m = maxR * 1.5 + ow + 16;
  minX -= m; minY -= m; maxX += m; maxY += m;
  const px = Math.min(pxPerUnit, 1024 / Math.max(maxX - minX, maxY - minY)); // cap scratch size
  const W = Math.ceil((maxX - minX) * px), H = Math.ceil((maxY - minY) * px);

  scratch ??= document.createElement('canvas');
  if (scratch.width < W || scratch.height < H) { scratch.width = Math.max(W, scratch.width); scratch.height = Math.max(H, scratch.height); }
  const g = scratch.getContext('2d')!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, W + 2, H + 2);
  g.setTransform(px, 0, 0, px, -minX * px, -minY * px);

  // 1. Skin.
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = base;
  skin(g, spec, P, 0);

  // 2. Patterns, then a soft light from the top-left, all clipped to the skin.
  g.globalCompositeOperation = 'source-atop';
  const fg = faceGeometry(spec, P);
  paintPattern(g, spec, P, look, base, accent, fg);
  const hl = g.createRadialGradient(fg.cx - fg.size * 0.35, fg.cy - fg.size * 0.45, 0, fg.cx - fg.size * 0.35, fg.cy - fg.size * 0.45, fg.size * 1.1);
  hl.addColorStop(0, rgba(COLOR.cream, 0.32)); hl.addColorStop(1, rgba(COLOR.cream, 0));
  g.fillStyle = hl; g.fillRect(minX, minY, maxX - minX, maxY - minY);
  const sh = g.createRadialGradient(fg.cx + fg.size * 0.5, fg.cy + fg.size * 0.7, 0, fg.cx + fg.size * 0.5, fg.cy + fg.size * 0.7, fg.size * 1.6);
  sh.addColorStop(0, rgba(COLOR.night, 0.16)); sh.addColorStop(1, rgba(COLOR.night, 0));
  g.fillStyle = sh; g.fillRect(minX, minY, maxX - minX, maxY - minY);

  // 3. One continuous outline behind everything.
  g.globalCompositeOperation = 'destination-over';
  g.fillStyle = outline;
  skin(g, spec, P, ow);

  // 4. Face on top.
  g.globalCompositeOperation = 'source-over';
  drawFace(g, fg, look, st);

  // Stamp onto the main canvas with shadow + squash-and-stretch + breathing.
  let cx = 0, cy = 0; for (const [x, y] of P) { cx += x; cy += y; } cx /= P.length; cy /= P.length;
  ctx.save();
  ctx.translate(cx, cy);
  const v = st.vel ?? { x: 0, y: 0 };
  const sp = Math.hypot(v.x, v.y);
  const k = Math.min(0.12, sp / 1400);
  const breathe = 1 + 0.018 * Math.sin(st.time * 2.6 + look.seed);
  if (k > 0.002) {
    const a = Math.atan2(v.y, v.x);
    ctx.rotate(a); ctx.scale(1 + k, 1 - k * 0.7); ctx.rotate(-a);
  }
  ctx.scale(breathe, 1 / breathe);
  ctx.translate(-cx, -cy);
  const dw = W / px, dh = H / px;
  if (st.glow) {
    ctx.shadowColor = rgba(st.glow, 0.8); ctx.shadowBlur = 26 * pxPerUnit; ctx.shadowOffsetY = 0;
    ctx.drawImage(scratch, 0, 0, W, H, minX, minY, dw, dh);
  }
  ctx.shadowColor = rgba(COLOR.night, 0.55);
  ctx.shadowBlur = 10 * pxPerUnit;
  ctx.shadowOffsetX = 2 * pxPerUnit; ctx.shadowOffsetY = 7 * pxPerUnit;
  ctx.drawImage(scratch, 0, 0, W, H, minX, minY, dw, dh);
  ctx.restore();
}

function paintPattern(
  g: CanvasRenderingContext2D, spec: CreatureSpec, P: [number, number][], look: Look,
  base: string, accent: string, fg: ReturnType<typeof faceGeometry>,
): void {
  const rng = new Rng(look.seed * 7919 + 1);
  const col = mix(accent, base, 0.12);
  const an = anatomy(spec);
  switch (look.pattern) {
    case 'belly': {
      // A paler oval under the face, like a frog's tummy seen from above.
      g.fillStyle = mix(base, COLOR.cream, 0.55);
      g.beginPath();
      g.ellipse(fg.cx - fg.fx * fg.size * 0.25, fg.cy - fg.fy * fg.size * 0.25, fg.size * 0.62, fg.size * 0.82, Math.atan2(fg.fy, fg.fx) + Math.PI / 2, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'stripes': {
      // Bands across the body, perpendicular to "forward", behind the face (clipped to skin).
      g.strokeStyle = col; g.lineCap = 'round';
      const w = Math.max(3, fg.size * 0.22);
      g.lineWidth = w;
      const px = -fg.fy, py = fg.fx;
      for (let d = fg.size * 0.55; d < fg.size * 9; d += w * 2.1) {
        const mx = fg.cx - fg.fx * d, my = fg.cy - fg.fy * d;
        g.beginPath(); g.moveTo(mx - px * 400, my - py * 400); g.lineTo(mx + px * 400, my + py * 400); g.stroke();
      }
      break;
    }
    case 'spots': {
      g.fillStyle = col;
      spec.joints.forEach((j, k) => {
        if (k === spec.head || Math.hypot(P[k][0] - fg.faceX, P[k][1] - fg.faceY) < fg.size * 0.7) return;
        const n = an.core[k] ? 2 : 1;
        for (let i = 0; i < n; i++) {
          const R = skinR(spec, an, k);
          const ox = rng.range(-0.55, 0.55) * R, oy = rng.range(-0.55, 0.55) * R;
          g.beginPath(); g.arc(P[k][0] + ox, P[k][1] + oy, j.r * rng.range(0.3, 0.45), 0, Math.PI * 2); g.fill();
        }
      });
      break;
    }
    case 'freckles': {
      g.fillStyle = rgba(mix(accent, COLOR.night, 0.3), 0.7);
      spec.joints.forEach((j, k) => {
        const n = an.core[k] ? 5 : 2;
        for (let i = 0; i < n; i++) {
          g.beginPath(); g.arc(P[k][0] + rng.range(-1, 1) * j.r, P[k][1] + rng.range(-1, 1) * j.r, rng.range(0.9, 1.6), 0, Math.PI * 2); g.fill();
        }
      });
      break;
    }
    default: break;
  }
}

function drawFace(g: CanvasRenderingContext2D, fg: ReturnType<typeof faceGeometry>, look: Look, st: ArtState): void {
  const { fx, fy } = fg;
  const hx = fg.faceX, hy = fg.faceY;
  const eyeR = Math.max(3.2, fg.size * 0.24 * look.eyes * eyeBoost);
  const sep = eyeR * 1.12;

  g.save();
  // Local frame: origin at the head, "up" (−y) points forward.
  g.translate(hx, hy);
  // The face stays upright on screen (like a sticker), whichever way the body turns:
  // it reads as a face from any angle. It just slides toward the head.
  const ang = 0;
  void fx; void fy;

  // Pupil direction in local coords.
  let px = 0, py = -1;
  if (st.lookAt) {
    const dx = st.lookAt.x - hx, dy = st.lookAt.y - hy;
    const c = Math.cos(-ang), s = Math.sin(-ang);
    px = dx * c - dy * s; py = dx * s + dy * c;
    const l = Math.hypot(px, py) || 1; px /= l; py /= l;
  }
  const ink = COLOR.night, white = COLOR.cream;
  const lw = Math.max(1.2, eyeR * 0.32);

  for (const side of [-1, 1]) {
    const ex = side * sep, ey = 0;
    switch (st.expression) {
      case 'happy': {
        g.strokeStyle = ink; g.lineWidth = lw; g.lineCap = 'round';
        g.beginPath(); g.arc(ex, ey + eyeR * 0.35, eyeR * 0.75, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
        g.fillStyle = rgba(COLOR.coral, 0.55);
        g.beginPath(); g.arc(ex + side * eyeR * 0.9, ey + eyeR * 1.3, eyeR * 0.5, 0, Math.PI * 2); g.fill();
        break;
      }
      case 'dizzy': {
        g.fillStyle = white; g.beginPath(); g.arc(ex, ey, eyeR, 0, Math.PI * 2); g.fill();
        g.strokeStyle = ink; g.lineWidth = Math.max(1, lw * 0.6);
        g.beginPath();
        const spin = st.time * 6 * side;
        for (let t = 0; t < 9.5; t += 0.4) {
          const r = (t / 9.5) * eyeR * 0.8, a = t + spin;
          const x = ex + Math.cos(a) * r, y = ey + Math.sin(a) * r;
          t === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
        }
        g.stroke();
        break;
      }
      default: {
        const big = st.expression === 'scared' ? 1.22 : 1;
        const er = eyeR * big;
        let open = 1 - st.blink;
        if (st.expression === 'push') open = Math.min(open, 0.55);
        open = Math.max(0.1, open);
        // Eye white (an ellipse that closes from top and bottom when blinking).
        g.fillStyle = white;
        g.beginPath(); g.ellipse(ex, ey, er, er * open, 0, 0, Math.PI * 2); g.fill();
        if (open > 0.2) {
          const pr = st.expression === 'scared' ? er * 0.3 : er * 0.56;
          const reach = er - pr - er * 0.08;
          g.save();
          g.beginPath(); g.ellipse(ex, ey, er, er * open, 0, 0, Math.PI * 2); g.clip();
          g.fillStyle = ink;
          g.beginPath(); g.arc(ex + px * reach, ey + py * reach * open, pr, 0, Math.PI * 2); g.fill();
          g.fillStyle = white;
          g.beginPath(); g.arc(ex + px * reach - pr * 0.35, ey + py * reach * open - pr * 0.4, Math.max(0.8, pr * 0.32), 0, Math.PI * 2); g.fill();
          g.restore();
        }
        if (st.expression === 'push') {
          // Determined brows, slanting down toward the middle.
          g.strokeStyle = ink; g.lineWidth = lw; g.lineCap = 'round';
          g.beginPath(); g.moveTo(ex + side * er * 0.95, ey - er * 1.05); g.lineTo(ex - side * er * 0.55, ey - er * 0.55); g.stroke();
        }
        break;
      }
    }
  }

  // Mouth, a little behind the eyes.
  const my = eyeR * 1.55;
  g.strokeStyle = COLOR.night; g.fillStyle = COLOR.night; g.lineWidth = Math.max(1, eyeR * 0.26); g.lineCap = 'round';
  switch (st.expression) {
    case 'happy':
      g.beginPath(); g.arc(0, my - eyeR * 0.2, eyeR * 0.55, 0.1 * Math.PI, 0.9 * Math.PI); g.closePath(); g.fill();
      break;
    case 'scared':
      g.beginPath(); g.ellipse(0, my, eyeR * 0.28, eyeR * 0.36, 0, 0, Math.PI * 2); g.fill();
      // Sweat drop.
      g.fillStyle = COLOR.sky;
      g.beginPath(); g.arc(sep + eyeR * 1.6, -eyeR * 0.2, eyeR * 0.38, 0, Math.PI); g.lineTo(sep + eyeR * 1.6, -eyeR * 1.1); g.closePath(); g.fill();
      break;
    case 'push':
      g.beginPath(); g.moveTo(-eyeR * 0.45, my); g.lineTo(eyeR * 0.45, my); g.stroke();
      break;
    case 'dizzy':
      g.beginPath();
      for (let i = 0; i <= 6; i++) { const x = -eyeR * 0.6 + (i / 6) * eyeR * 1.2, y = my + (i % 2 ? 1 : -1) * eyeR * 0.15; i ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
      break;
    default:
      g.beginPath(); g.arc(0, my - eyeR * 0.35, eyeR * 0.38, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke();
  }
  g.restore();
}
