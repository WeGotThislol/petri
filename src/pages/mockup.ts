/**
 * Design mockup (static): the main game screen as it will look once the
 * Lab Notebook, brain visualiser and "Why did it do that?" arrive (Stage 5).
 * The dish and creatures are drawn by the REAL renderer from a real match.
 */
import '../ui/base.css';
import '../ui/mockup.css';
import { CRAB, TADPOLE } from '../sim/creature';
import { Match } from '../sim/match';
import { PusherController } from '../sim/controllers';
import { Brain } from '../sim/brain';
import { shapeFor } from '../evo/ga';
import { Rng } from '../sim/rng';
import { Renderer } from '../render/renderer';
import { drawGraph } from '../ui/graph';
import { applyTokens, COLOR, loadFonts } from '../ui/tokens';

applyTokens(); loadFonts();
document.getElementById('app')!.innerHTML = `
  <header class="mk-bar"><span class="mk-word">Petri</span>
    <nav><a>Lab</a><a class="on">Evolve</a><a>Fight</a><a>Share</a></nav></header>
  <main class="mk">
    <section class="mk-dish">
      <canvas id="dish"></canvas>
      <div class="mk-hud">
        <span class="sticker" style="--tilt:-2deg"><b>Bloop</b><i>yours · gen 23</i></span>
        <span class="mk-clock num">00:12.4</span>
        <span class="sticker" style="--tilt:1.5deg"><b>Wriggle</b><i>hall of fame #4</i></span>
      </div>
      <p class="mk-annot hand">← it learned to tuck its claws in, gen 19</p>
      <div class="mk-controls frame">
        <button class="btn-quiet">❚❚</button><button class="btn-quiet on">1×</button><button class="btn-quiet">5×</button><button class="btn-quiet">20×</button>
        <span class="divider"></span>
        <button class="btn">Adopt as champion</button>
      </div>
    </section>
    <aside class="mk-notebook frame">
      <h2>Lab notebook</h2>
      <p class="hand mk-page">page 7 · generation 19</p>
      <article class="lesson">
        <h3>A sudden jump!</h3>
        <p>At generation 19 the best score leapt <b>+0.11</b>. One mutation linked the <i>touch</i> sense to the claw muscle, so now it grabs the moment it bumps into someone.</p>
      </article>
      <article class="lesson lav">
        <h3>Mutation strength</h3>
        <p>How far babies wander from their parents. Drag it and watch the same parent's kids:</p>
        <input type="range" value="30" aria-label="mutation strength demo">
        <canvas id="g1" class="mk-mini"></canvas>
      </article>
      <button class="btn mk-why">Why did it do that?</button>
      <div class="mk-brain">
        <p class="fine">its brain, live · 17 senses → 10 → 5 muscles</p>
        <canvas id="brain"></canvas>
      </div>
    </aside>
  </main>`;

// Real match frame.
const cv = document.getElementById('dish') as HTMLCanvasElement;
const rng = new Rng(4);
const shape = shapeFor(TADPOLE, 10);
const g = Array.from({ length: (shape.inputs + 1) * 10 + 11 * shape.outputs }, () => rng.gauss() * 0.6);
const m = new Match(CRAB, TADPOLE, [new PusherController(), new Brain(shape, g)], 3);
for (let i = 0; i < 300; i++) m.step();
const r = new Renderer(cv);
r.youIndex = 0; r.glow = [COLOR.butter, null];
r.draw(m, 1, 0.016);
window.addEventListener('resize', () => { r.resize(); r.draw(m, 1, 0); });

drawGraph(document.getElementById('g1') as HTMLCanvasElement, [0.3, 0.5, 0.52, 0.6, 0.62, 0.8, 0.83, 0.85], [0.1, 0.2, 0.3, 0.33, 0.4, 0.5, 0.55, 0.6]);

// Brain sketch: three columns of neurons, a few connections lit.
const b = document.getElementById('brain') as HTMLCanvasElement;
const dpr = Math.min(2, devicePixelRatio || 1); const W = b.clientWidth, H = b.clientHeight;
b.width = W * dpr; b.height = H * dpr;
const x = b.getContext('2d')!; x.scale(dpr, dpr);
const cols = [7, 6, 4].map((n, c) => Array.from({ length: n }, (_, i) => ({ x: 20 + c * (W - 40) / 2, y: 14 + (i + 0.5) * (H - 28) / n })));
const br = new Rng(2);
for (let c = 0; c < 2; c++) for (const a of cols[c]) for (const d of cols[c + 1]) {
  const w = br.range(-1, 1); if (Math.abs(w) < 0.5) continue;
  x.strokeStyle = w > 0 ? 'rgba(143,227,192,.55)' : 'rgba(255,138,122,.45)'; x.lineWidth = Math.abs(w) * 2.5;
  x.beginPath(); x.moveTo(a.x, a.y); x.bezierCurveTo((a.x + d.x) / 2, a.y, (a.x + d.x) / 2, d.y, d.x, d.y); x.stroke();
}
cols.flat().forEach((p, i) => { x.fillStyle = i % 3 === 0 ? COLOR.butter : COLOR.cream; x.beginPath(); x.arc(p.x, p.y, 5, 0, Math.PI * 2); x.fill(); });
