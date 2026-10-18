/**
 * The creature sheet: every body at three sizes with different moods.
 * Used to judge whether the creatures look charming (and as a design reference).
 * Open /creatures.html.
 */
import '../ui/base.css';
import { ALL_BODIES, CreatureSpec, spawn } from '../sim/creature';
import { World } from '../sim/physics';
import { drawCreature, Expression } from '../render/creatureArt';
import { applyTokens, COLOR, loadFonts } from '../ui/tokens';

applyTokens(); loadFonts();

const MOODS: Expression[] = ['idle', 'push', 'happy', 'scared', 'dizzy'];
const SIZES = [{ name: 'big', px: 2.4 }, { name: 'medium', px: 1.3 }, { name: 'phone', px: 0.7 }];

const app = document.getElementById('app')!;
app.innerHTML = `
  <main class="sheet">
    <header class="sheet-head">
      <h1>The creature sheet</h1>
      <p class="hand">eight little weirdos, three sizes each. say hi!</p>
    </header>
    <section id="rows"></section>
    <section class="moods frame">
      <h2>Moods</h2>
      <p>Same blob, five feelings: just chilling, pushing hard, winning, near the edge, knocked out.</p>
      <div id="moods" class="mood-row"></div>
    </section>
  </main>`;

/** A posed skeleton: spawn the body and let its muscles flex for a moment, so tails curl naturally. */
function pose(spec: CreatureSpec, flex: number): [number, number][] {
  const w = new World();
  const c = spawn(w, spec, 0, 0, 0, 0, false);
  for (let t = 0; t < 8; t++) {
    c.muscles.forEach((m, i) => { w.muscles[m].act = (i % 2 ? -1 : 1) * flex; });
    w.step(1 / 40, 4);
  }
  return c.particles.map((pi) => [w.particles[pi].x, w.particles[pi].y]);
}

function canvasFor(spec: CreatureSpec, px: number, mood: Expression, t: number, flex: number, label = true): HTMLElement {
  const pts = pose(spec, flex);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of pts) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  const pad = 26, dpr = Math.min(2, devicePixelRatio || 1);
  const w = (maxX - minX + pad * 2) * px, h = (maxY - minY + pad * 2) * px;
  const cv = document.createElement('canvas');
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  cv.style.width = `${w}px`; cv.style.height = `${h}px`;
  const g = cv.getContext('2d')!;
  g.setTransform(px * dpr, 0, 0, px * dpr, (-minX + pad) * px * dpr, (-minY + pad) * px * dpr);
  // Look slightly up-right, like posing for the camera.
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  drawCreature(g, spec, { pts, lookAt: { x: cx + 200, y: cy - 120 }, expression: mood, blink: 0, time: t }, px * dpr);
  const fig = document.createElement('figure');
  fig.appendChild(cv);
  if (label) fig.insertAdjacentHTML('beforeend', `<figcaption>${mood}</figcaption>`);
  return fig;
}

const rows = document.getElementById('rows')!;
ALL_BODIES.forEach((spec, i) => {
  const row = document.createElement('article');
  row.className = 'row frame';
  row.innerHTML = `<div class="tag sticker" style="--tilt:${(i % 2 ? 1 : -1) * 1.2}deg"><b>${spec.nick}</b><i>${spec.name}</i></div><div class="sizes"></div>`;
  const sizes = row.querySelector('.sizes')!;
  SIZES.forEach((s, k) => sizes.appendChild(canvasFor(spec, s.px, MOODS[(i + k) % 3], i, 0.25 - k * 0.1)));
  rows.appendChild(row);
});
const moods = document.getElementById('moods')!;
for (const m of MOODS) moods.appendChild(canvasFor(ALL_BODIES[0], 1.6, m, 1, 0.4));

void COLOR;
