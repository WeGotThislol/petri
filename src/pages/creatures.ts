/**
 * The creature sheet: every body at three sizes, plus the four states a
 * creature shows in a fight (resting, sensing, winning, knocked out).
 * Used to judge the art, and as a design reference. Open /creatures.html.
 */
import '../ui/base.css';
import { ALL_BODIES, CreatureSpec, spawn } from '../sim/creature';
import { World } from '../sim/physics';
import { ArtState, drawCreature } from '../render/creatureArt';
import { applyTokens, loadFonts } from '../ui/tokens';

applyTokens(); loadFonts();

const SIZES = [{ name: 'study', px: 2.1 }, { name: 'dish', px: 1.3 }, { name: 'phone', px: 0.75 }];
type Pose = Pick<ArtState, 'senses' | 'activity' | 'state'>;
const STATES: [string, Pose][] = [
  ['resting', { activity: 0.25 }],
  ['sensing', { activity: 0.9, senses: { opponent: 1, edge: 0.8, touch: 0.6 } }],
  ['winner', { activity: 0.6, state: 'winner' }],
  ['knocked out', { activity: 0, state: 'ko' }],
];

const app = document.getElementById('app')!;
app.innerHTML = `
  <main class="sheet">
    <header class="sheet-head">
      <span class="eyebrow">Plate I · Specimens</span>
      <h1>Field guide to the dish</h1>
      <p>Eight body plans, three magnifications. Colour and markings come from each specimen's genes;
         the small lights are its senses, and the drifting glow is its nervous system at work.</p>
    </header>
    <section id="rows"></section>
    <section class="moods frame">
      <span class="eyebrow">Plate II · States</span>
      <h2>Reading a specimen</h2>
      <p>Amber light: it sees the opponent ahead. Ember: the rim is close. Pale: touch.
         Winners carry a little more light; the knocked-out go dim.</p>
      <div id="moods" class="mood-row"></div>
    </section>
  </main>`;

/** A posed skeleton: spawn the body and let its muscles flex briefly, so limbs settle naturally. */
function pose(spec: CreatureSpec, flex: number): [number, number][] {
  const w = new World();
  const c = spawn(w, spec, 0, 0, 0, 0, false);
  for (let t = 0; t < 8; t++) {
    c.muscles.forEach((m, i) => { w.muscles[m].act = (i % 2 ? -1 : 1) * flex; });
    w.step(1 / 40, 4);
  }
  return c.particles.map((pi) => [w.particles[pi].x, w.particles[pi].y]);
}

function canvasFor(spec: CreatureSpec, px: number, caption: string, p: Pose, t: number, flex: number): HTMLElement {
  const pts = pose(spec, flex);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of pts) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  const pad = 30, dpr = Math.min(2, devicePixelRatio || 1);
  const w = (maxX - minX + pad * 2) * px, h = (maxY - minY + pad * 2) * px;
  const cv = document.createElement('canvas');
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  cv.style.width = `${w}px`; cv.style.height = `${h}px`;
  const g = cv.getContext('2d')!;
  g.setTransform(px * dpr, 0, 0, px * dpr, (-minX + pad) * px * dpr, (-minY + pad) * px * dpr);
  drawCreature(g, spec, { pts, time: t, ...p }, px * dpr);
  const fig = document.createElement('figure');
  fig.appendChild(cv);
  fig.insertAdjacentHTML('beforeend', `<figcaption>${caption}</figcaption>`);
  return fig;
}

const rows = document.getElementById('rows')!;
ALL_BODIES.forEach((spec, i) => {
  const row = document.createElement('article');
  row.className = 'row frame';
  row.innerHTML = `<div class="label"><small>No. ${String(i + 1).padStart(2, '0')}</small><b>${spec.nick}</b><i>${spec.name}</i></div><div class="sizes"></div>`;
  const sizes = row.querySelector('.sizes')!;
  SIZES.forEach((s, k) => sizes.appendChild(canvasFor(spec, s.px, `${s.name} ×${s.px}`, STATES[k === 1 ? 1 : 0][1], 0.3 + i * 0.17, 0.25 - k * 0.1)));
  rows.appendChild(row);
});
const moods = document.getElementById('moods')!;
for (const [name, p] of STATES) moods.appendChild(canvasFor(ALL_BODIES[1], 1.7, name, p, 0.45, 0.3));
