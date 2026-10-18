/**
 * Anatomy: facts about a body's SHAPE that the renderer needs, derived from the
 * spec (no DOM, so it can be unit-tested in Node):
 *   - the stiff core (triangles of bones),
 *   - the spine (head → far end, found by breadth-first search along bones),
 *   - which joints carry sensor lights.
 */
import type { CreatureSpec } from '../sim/creature';

/** Precomputed facts about a body's shape. */
export interface Anatomy {
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
/**
 * Cache keyed by the spec object AND a signature of its contents. The Lab edits
 * specs in place (erasing a joint renumbers everything), so an identity-only
 * cache would hand back triangles and spines that point at joints which no
 * longer exist. That stale cache once crashed the Lab's drawing loop.
 */
const anatomyCache = new WeakMap<CreatureSpec, { sig: string; a: Anatomy }>();

function signature(spec: CreatureSpec): string {
  let s = `${spec.head}|`;
  for (const j of spec.joints) s += `${j.x},${j.y},${j.r};`;
  s += '|';
  for (const b of spec.bones) s += `${b.a}-${b.b};`;
  return s;
}

export function anatomy(spec: CreatureSpec): Anatomy {
  const sig = signature(spec);
  const hit = anatomyCache.get(spec);
  if (hit && hit.sig === sig) return hit.a;
  const a = computeAnatomy(spec);
  anatomyCache.set(spec, { sig, a });
  return a;
}

/** Pure computation; safe for any body, including half-built ones from the Lab. */
export function computeAnatomy(spec: CreatureSpec): Anatomy {
  const key = (i: number, j: number) => `${Math.min(i, j)}-${Math.max(i, j)}`;
  const has = new Set(spec.bones.map((b) => key(b.a, b.b)));
  const n = spec.joints.length;
  const head = spec.head >= 0 && spec.head < n ? spec.head : 0;
  const tris: [number, number, number][] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++)
    if (has.has(key(i, j)) && has.has(key(j, k)) && has.has(key(i, k))) tris.push([i, j, k]);
  const core = new Array(n).fill(false);
  for (const t of tris) for (const k of t) core[k] = true;
  if (!tris.length && n) core[head] = true;
  const degree = new Array(n).fill(0);
  for (const b of spec.bones) if (b.a < n && b.b < n) { degree[b.a]++; degree[b.b]++; }
  // Spine: breadth-first distances from the head, then the longest chain to a far joint.
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const b of spec.bones) if (b.a < n && b.b < n) { adj[b.a].push(b.b); adj[b.b].push(b.a); }
  const dist = new Array(n).fill(-1), prev = new Array(n).fill(-1);
  if (!n) return { tris, core, degree, spine: [], sensors: { opp: 0, edges: [], touch: [] }, torsoR: 0 };
  dist[head] = 0;
  const q = [head];
  while (q.length) { const u = q.shift()!; for (const v of adj[u]) if (dist[v] < 0) { dist[v] = dist[u] + 1; prev[v] = u; q.push(v); } }
  // The far end: the reachable joint furthest from the head (a half-built body may
  // have loose joints; the spine only follows bones).
  const h = spec.joints[head];
  let far = head, best = -1;
  spec.joints.forEach((j, k) => { const d = Math.hypot(j.x - h.x, j.y - h.y); if (dist[k] >= 0 && d > best) { best = d; far = k; } });
  const spine: number[] = [];
  for (let k = far; k >= 0; k = prev[k]) spine.unshift(k);
  // Sensors: opponent sense at the head; edge senses on the two core joints furthest sideways.
  const side = spec.joints.map((j, k) => ({ k, y: j.y })).filter((o) => core[o.k] && o.k !== head).sort((p, q2) => p.y - q2.y);
  const edges = side.length >= 2 ? [side[0].k, side[side.length - 1].k] : side.map((o) => o.k);
  const touch = spec.joints.map((_, k) => k).filter((k) => degree[k] === 1).slice(0, 2);
  const torsoR = Math.max(0, ...spec.joints.map((j, k) => (core[k] ? j.r : 0))) * 1.75;
  return { tris, core, degree, spine, sensors: { opp: head, edges, touch }, torsoR };
}

