/**
 * Browser entry point (Stage 1).
 *
 * The first thing a visitor sees is a live fight: the hand-built crab
 * against a scripted dummy, looping forever with a new seed each round.
 *
 * Game loop: a classic "fixed timestep with accumulator". The simulation
 * always advances in exact ticks (so it stays deterministic), while drawing
 * happens at whatever rate the screen refreshes, interpolating in between.
 */
import './style.css';
import { CRAB, DUMMY } from './sim/creature';
import { Match } from './sim/match';
import { PusherController, DummyController } from './sim/controllers';
import { Renderer } from './render/renderer';

const TICKS_PER_SECOND = 60; // ticks shown per real second at 1x speed

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header class="top">
    <div class="wordmark">Petri <small>SPECIMEN 0001 · ×40 · DARKFIELD</small></div>
    <nav><span class="on">Fight</span><span class="soon">Lab</span><span class="soon">Evolve</span><span class="soon">Share</span></nav>
  </header>
  <main class="stage">
    <canvas id="dish" aria-label="Two micro-creatures sumo wrestling in a petri dish"></canvas>
    <div class="hud tl"><div class="clock" id="clock">00:00.0</div><div class="warn" id="rimNote">&nbsp;</div></div>
    <div class="hud tr" id="info"></div>
    <div class="banner" id="banner" hidden></div>
    <div class="hud bl">
      <div class="controls">
        <button id="pause" title="Pause (space)">pause</button>
        <button id="next" title="Next match (n)">next match</button>
        <button id="speed" title="Toggle speed (s)">1×</button>
      </div>
      <div class="caption">Stage 1 · hand-built <i>Brachiopus</i> vs scripted dummy. Push it past the rim.</div>
    </div>
  </main>
`;

const canvas = document.querySelector<HTMLCanvasElement>('#dish')!;
const renderer = new Renderer(canvas);
renderer.labels = [CRAB.name, DUMMY.name];
const $ = (id: string) => document.getElementById(id)!;

let seed = 1;
let paused = false;
let speed = 1;
let hitStop = 0;       // seconds of frozen time after a big collision ("hit-stop")
let endTimer = 0;      // seconds since the match ended
let acc = 0;           // fractional ticks waiting to be simulated
let last = performance.now();
let match = newMatch();

function newMatch(): Match {
  renderer.reset();
  $('banner').hidden = true;
  endTimer = 0;
  return new Match(CRAB, DUMMY, [new PusherController(), new DummyController()], seed);
}

function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  advance(dt);
  requestAnimationFrame(frame);
}

/** Advance the game by `dt` real seconds and draw one frame. */
function advance(dt: number): void {
  if (!paused) {
    if (hitStop > 0) hitStop -= dt;
    else acc += dt * TICKS_PER_SECOND * speed;
    while (acc >= 1) {
      acc -= 1;
      if (match.result) break;
      renderer.snapshot(match);
      match.step();
      const { bigHit } = renderer.afterStep(match);
      if (bigHit > 220 && speed === 1) hitStop = 0.06;
      if (match.result) onEnd();
    }
    if (match.result) {
      acc = 0;
      endTimer += dt;
      if (endTimer > 3) { seed++; match = newMatch(); }
    }
  }
  renderer.draw(match, match.result ? 1 : acc, paused ? 0 : dt);
  updateHud();
}

function onEnd(): void {
  const r = match.result!;
  if (r.winner >= 0) renderer.knockout(match, 1 - r.winner);
  const winner = r.winner === 0 ? CRAB.name : r.winner === 1 ? DUMMY.name : null;
  const loser = r.winner === 0 ? DUMMY.name : CRAB.name;
  const b = $('banner');
  b.innerHTML = winner
    ? `<em>${loser}</em><span>${r.reason === 'ringout' ? 'pushed out of the dish' : 'drifted furthest from centre'} at ${r.time.toFixed(1)} s</span>`
    : `<em>Stalemate</em><span>perfectly equal at the bell</span>`;
  b.hidden = false;
}

function updateHud(): void {
  const t = match.time;
  const mm = Math.floor(t / 60).toString().padStart(2, '0');
  const ss = (t % 60).toFixed(1).padStart(4, '0');
  $('clock').textContent = `${mm}:${ss}`;
  const R = match.ringRadius;
  $('rimNote').textContent = R < 280 ? `rim contracting — ${(R / 280).toFixed(2)} r` : `sudden death in ${Math.max(0, 15 - t).toFixed(0)} s`;
  $('info').innerHTML = `match <b>${seed}</b> · seed <b>0x${seed.toString(16).toUpperCase().padStart(4, '0')}</b><br>tick <b>${match.tick}</b>`;
}

$('pause').onclick = () => { paused = !paused; $('pause').textContent = paused ? 'play' : 'pause'; };
$('next').onclick = () => { seed++; match = newMatch(); };
$('speed').onclick = () => { speed = speed === 1 ? 5 : speed === 5 ? 20 : 1; $('speed').textContent = `${speed}×`; };
window.addEventListener('keydown', (e) => {
  if (e.key === ' ') { e.preventDefault(); $('pause').click(); }
  if (e.key === 'n') $('next').click();
  if (e.key === 's') $('speed').click();
});
window.addEventListener('resize', () => renderer.resize());

// A tiny hook for automated browser tests (Playwright). With ?manual in the
// URL the game does not run by itself; the test calls petri.advance(dt) to
// step it frame by frame, which makes screenshots and GIFs reproducible.
const manual = new URLSearchParams(location.search).has('manual');
(window as unknown as { petri: object }).petri = {
  get match() { return match; },
  advance: (dt: number) => advance(dt),
};
if (!manual) requestAnimationFrame(frame);
