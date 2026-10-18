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
import { applyTokens, COLOR, loadFonts, rgba } from '../ui/tokens';

applyTokens(); loadFonts();
document.getElementById('app')!.innerHTML = `
  <header class="mk-bar"><span class="mk-word">Petri</span>
    <nav><a><span>I</span> Lab</a><a class="on"><span>II</span> Evolve</a><a><span>III</span> Fight</a><a><span>IV</span> Share</a></nav></header>
  <main class="mk">
    <section class="mk-dish">
      <canvas id="dish"></canvas>
      <div class="mk-hud">
        <span class="label"><small>Yours · generation 23</small><b>Pincer</b><i>Brachiopus vorax</i></span>
        <span class="mk-clock num">00:12.4</span>
        <span class="label right"><small>Hall of fame · No. 4</small><b>Lash</b><i>Caudata wriggla</i></span>
      </div>
      <p class="mk-annot hand">learned to fold its forelimbs before contact, gen. 19</p>
      <div class="mk-controls frame">
        <button class="btn-quiet">Pause</button><button class="btn-quiet on">1×</button><button class="btn-quiet">5×</button><button class="btn-quiet">20×</button>
        <span class="divider"></span>
        <button class="btn">Adopt as champion</button>
      </div>
    </section>
    <aside class="mk-notebook frame">
      <span class="eyebrow">Lab notebook · p. 7</span>
      <h2>Generation 19</h2>
      <article class="lesson">
        <h3>A sudden improvement</h3>
        <p>Best fitness rose by <b>0.11</b> in one generation. A single mutation linked the touch sense to the forelimb muscles: it now grips the moment it makes contact.</p>
      </article>
      <article class="lesson">
        <h3>Mutation strength</h3>
        <p>How far offspring stray from their parents. Drag it and watch the same parent's offspring diverge.</p>
        <input type="range" value="30" aria-label="mutation strength demo">
        <canvas id="g1" class="mk-mini"></canvas>
      </article>
      <button class="btn-quiet mk-why">Why did it do that?</button>
      <div class="mk-brain">
        <p class="fine">Nervous system, live · 17 senses → 10 → 5 muscles</p>
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
r.youIndex = 0; r.glow = [COLOR.amber, null];
r.draw(m, 1, 0.016);
window.addEventListener('resize', () => { r.resize(); r.draw(m, 1, 0); });
void document.fonts.ready.then(() => r.draw(m, 1, 0)); // redraw once the marginalia font has arrived

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
  x.strokeStyle = w > 0 ? rgba(COLOR.amber, 0.45) : rgba(COLOR.verdigris, 0.4); x.lineWidth = Math.abs(w) * 1.6;
  x.beginPath(); x.moveTo(a.x, a.y); x.bezierCurveTo((a.x + d.x) / 2, a.y, (a.x + d.x) / 2, d.y, d.x, d.y); x.stroke();
}
cols.flat().forEach((p, i) => { x.fillStyle = i % 3 === 0 ? COLOR.amber : rgba(COLOR.bone, 0.7); x.beginPath(); x.arc(p.x, p.y, 3, 0, Math.PI * 2); x.fill(); });
