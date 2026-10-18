/**
 * Share codes: a creature (body + brain) packed into a short string that fits
 * in a URL, e.g.  https://…/petri/#c=AQgCAP…
 *
 * Binary layout (version 1), then base64url-encoded:
 *   u8 version
 *   u8 nameLen, name (UTF-8) · u8 nickLen, nick
 *   u8 joints, then per joint: i16 x×2, i16 y×2, u8 r×4
 *   u8 head
 *   u8 bones, then per bone: u8 (a<<4 | b)         (≤ 16 joints fit in 4 bits each)
 *   u8 muscles, then per muscle: u8 (a<<4 | b), u8 strength×255
 *   u8 senses bits (1 opponent, 2 edge, 4 touch)
 *   u8 body pigment, u8 accent pigment, u8 pattern, u8 look seed
 *   u8 hidden neurons, u16 genome length, f32 scale, then i8 per weight
 *
 * Weights are QUANTISED to 8 bits (w ≈ q × scale). That makes the code ~4×
 * shorter. The shared brain is therefore very slightly different from the
 * original; fights are replayed from the decoded version, so everyone who
 * opens the link sees exactly the same thing.
 */
import type { CreatureSpec, Look } from '../sim/creature';

const PIGMENTS: Look['body'][] = ['verdigris', 'rose', 'ochre', 'iris', 'bone2', 'kelp'];
const PATTERNS: Look['pattern'][] = ['plain', 'bands', 'speckles', 'stripes', 'gradient'];
const VERSION = 1;

export interface SharedCreature { spec: CreatureSpec; genome: number[]; hidden: number }

/** Round a genome to what survives 8-bit quantisation (so sender and receiver match). */
export function quantise(genome: ArrayLike<number>): { q: Int8Array; scale: number } {
  let max = 0;
  for (let i = 0; i < genome.length; i++) max = Math.max(max, Math.abs(genome[i]));
  const scale = Math.fround(max / 127 || 1);
  const q = new Int8Array(genome.length);
  for (let i = 0; i < genome.length; i++) q[i] = Math.max(-127, Math.min(127, Math.round(genome[i] / scale)));
  return { q, scale };
}

export function encodeCreature(c: SharedCreature): string {
  const bytes: number[] = [];
  const u8 = (v: number) => bytes.push(v & 255);
  const i16 = (v: number) => { const x = Math.max(-32768, Math.min(32767, Math.round(v))) & 0xffff; bytes.push(x >> 8, x & 255); };
  const str = (s: string, max: number) => { const b = new TextEncoder().encode(s.slice(0, max)); u8(b.length); bytes.push(...b); };
  const s = c.spec;
  u8(VERSION);
  str(s.name, 48); str(s.nick ?? '', 24);
  u8(s.joints.length);
  for (const j of s.joints) { i16(j.x * 2); i16(j.y * 2); u8(Math.round(j.r * 4)); }
  u8(s.head);
  u8(s.bones.length); for (const b of s.bones) u8((b.a << 4) | b.b);
  u8(s.muscles.length); for (const m of s.muscles) { u8((m.a << 4) | m.b); u8(Math.round(m.strength * 255)); }
  const sn = s.senses ?? { opponent: true, edge: true, touch: true };
  u8((sn.opponent ? 1 : 0) | (sn.edge ? 2 : 0) | (sn.touch ? 4 : 0));
  const look = s.look ?? { body: 'verdigris', accent: 'bone2', pattern: 'plain', seed: 1 };
  u8(PIGMENTS.indexOf(look.body)); u8(PIGMENTS.indexOf(look.accent)); u8(PATTERNS.indexOf(look.pattern)); u8(look.seed);
  u8(c.hidden);
  const { q, scale } = quantise(c.genome);
  bytes.push((q.length >> 8) & 255, q.length & 255);
  const f = new DataView(new ArrayBuffer(4)); f.setFloat32(0, scale);
  for (let i = 0; i < 4; i++) bytes.push(f.getUint8(i));
  for (const v of q) bytes.push(v & 255);
  return toBase64Url(Uint8Array.from(bytes));
}

export function decodeCreature(code: string): SharedCreature {
  const b = fromBase64Url(code);
  let p = 0;
  const need = (n: number) => { if (p + n > b.length) throw new Error('This share code is cut short.'); };
  const u8 = () => { need(1); return b[p++]; };
  const i16 = () => { need(2); const v = (b[p] << 8) | b[p + 1]; p += 2; return v & 0x8000 ? v - 0x10000 : v; };
  const str = () => { const n = u8(); need(n); const s = new TextDecoder().decode(b.subarray(p, p + n)); p += n; return s; };
  if (u8() !== VERSION) throw new Error('This share code is from a different version of Petri.');
  const name = str(), nick = str();
  const nj = u8();
  const joints = Array.from({ length: nj }, () => ({ x: i16() / 2, y: i16() / 2, r: u8() / 4 }));
  const head = u8();
  const bones = Array.from({ length: u8() }, () => { const v = u8(); return { a: v >> 4, b: v & 15 }; });
  const muscles = Array.from({ length: u8() }, () => { const v = u8(); return { a: v >> 4, b: v & 15, strength: u8() / 255 }; });
  const sb = u8();
  const look: Look = { body: PIGMENTS[u8()] ?? 'verdigris', accent: PIGMENTS[u8()] ?? 'bone2', pattern: PATTERNS[u8()] ?? 'plain', seed: u8() };
  const hidden = u8();
  need(6);
  const len = (b[p] << 8) | b[p + 1]; p += 2;
  const scale = new DataView(b.buffer, b.byteOffset + p, 4).getFloat32(0); p += 4;
  need(len);
  const genome = Array.from({ length: len }, (_, i) => ((b[p + i] << 24) >> 24) * scale);
  const spec: CreatureSpec = { name, nick: nick || undefined, joints, bones, muscles, head, look,
    senses: { opponent: !!(sb & 1), edge: !!(sb & 2), touch: !!(sb & 4) } };
  for (const l of [...bones, ...muscles]) if (l.a >= nj || l.b >= nj) throw new Error('This share code is damaged.');
  if (head >= nj) throw new Error('This share code is damaged.');
  return { spec, genome, hidden };
}

function toBase64Url(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromBase64Url(code: string): Uint8Array {
  const s = atob(code.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((code.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}
