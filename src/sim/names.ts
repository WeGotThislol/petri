/**
 * Latin-style species names, generated from what a body actually looks like.
 * The genus comes from its anatomy (tail, forelimbs, paddles, many arms…),
 * the epithet from its pigment or proportions, plus a dash of the seed.
 * Pure function: the same body always gets the same name.
 */
import type { CreatureSpec } from './creature';
import { Rng } from './rng';

const PIGMENT: Record<string, string[]> = {
  verdigris: ['aeruginosa', 'viridis'], rose: ['rosea', 'rubella'], ochre: ['ochracea', 'fulva'],
  iris: ['iridis', 'violacea'], bone2: ['eburnea', 'pallida'], kelp: ['algosa', 'olivacea'],
};
const TRAIT = ['vorax', 'tenax', 'celer', 'lenta', 'audax', 'obstinata', 'errans', 'gravis', 'inquieta', 'modesta'];

export function speciesName(spec: CreatureSpec, seed = 0): string {
  const n = spec.joints.length;
  const degree = new Array(n).fill(0);
  for (const b of spec.bones) { degree[b.a]++; degree[b.b]++; }
  const tips = degree.filter((d) => d === 1).length;
  const h = spec.joints[spec.head] ?? { x: 0, y: 0 };
  let length = 0;
  for (const j of spec.joints) length = Math.max(length, Math.hypot(j.x - h.x, j.y - h.y));
  const forward = spec.joints.filter((j) => j.x > h.x - 10 && Math.abs(j.y - h.y) > 20).length;

  const rng = new Rng(seed * 31 + n * 7 + spec.bones.length * 13 + spec.muscles.length);
  let roots: string[];
  if (forward >= 2) roots = ['Brachi', 'Forcip', 'Chel'];
  else if (length > 125) roots = ['Longissim', 'Serpent', 'Anguill'];
  else if (tips >= 3) roots = ['Trirot', 'Polybrachi', 'Stell'];
  else if (tips === 2) roots = ['Remig', 'Pinn', 'Natant'];
  else roots = ['Caud', 'Glob', 'Medus'];
  const endings = ['opus', 'ella', 'ura', 'ix', 'ina', 'odon'];
  let root = roots[rng.int(roots.length)], end = endings[rng.int(endings.length)];
  if (/[aeiou]$/.test(root) && /^[aeiou]/.test(end)) root = root.slice(0, -1); // Brachi+opus → Brachopus
  const genus = root + end;
  const epithets = [...(PIGMENT[spec.look?.body ?? ''] ?? []), ...TRAIT];
  return `${genus} ${epithets[rng.int(epithets.length)]}`;
}
