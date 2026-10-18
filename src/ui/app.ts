/**
 * The app: a tiny state machine of screens on top of one shared Stage.
 *
 *   home ──► pick ──► evolve ──► fight ──┐
 *                       ▲                │
 *                       └── evolve more ─┘
 *
 * Rule of thumb from docs/DESIGN.md: ONE main (mint) action per screen.
 */
import { CRAB, CreatureSpec, DUMMY, PADDLER, TADPOLE } from '../sim/creature';
import { Match } from '../sim/match';
import { Brain } from '../sim/brain';
import { DummyController, PusherController } from '../sim/controllers';
import { EvolutionRunner, GenReport } from '../evo/runner';
import { DEFAULT_CONFIG } from '../evo/ga';
import { toggleBioluminescence } from '../render/creatureArt';
import { Stage } from './stage';
import { Pedestal } from './pedestal';
import { drawGraph } from './graph';
import { commentFor, isReady, LOADING_LINES } from './commentary';
import { COLOR } from './tokens';

type Screen = 'home' | 'pick' | 'evolve' | 'fight';

interface Starter { spec: CreatureSpec; blurb: string }
const STARTERS: Starter[] = [
  { spec: CRAB, blurb: 'Two forelimbs and a driving tail. Grips first, considers later.' },
  { spec: TADPOLE, blurb: 'Mostly tail. Quick, once it settles which end is the front.' },
  { spec: PADDLER, blurb: 'Rows with two broad paddles. Unhurried, and hard to move.' },
];

const $ = <T extends HTMLElement = HTMLElement>(root: ParentNode, sel: string) => root.querySelector<T>(sel)!;

export class App {
  private stage: Stage;
  private screen: Screen = 'home';
  private chosen: Starter | null = null;
  private runner: EvolutionRunner | null = null;
  private reports: GenReport[] = [];
  private seenTips = new Set<string>();
  private fightSeed = 1;
  private evolvedOnce = false;
  private pedestals: Pedestal[] = [];
  private pedLoop = 0;

  constructor(private root: HTMLElement, manual = false) {
    root.innerHTML = `
      <canvas id="stage" aria-label="Two organisms wrestling in a petri dish"></canvas>
      <header class="bar">
        <button class="wordmark" id="wordmark" aria-label="Petri, home">Petri</button>
        <ol class="steps" id="steps" hidden aria-label="Your progress">
          <li data-step="pick"><span>I</span> Specimen</li><li data-step="evolve"><span>II</span> Evolve</li><li data-step="fight"><span>III</span> Fight</li>
        </ol>
      </header>
      <div id="screen"></div>
      <div id="toast" class="toast" role="status" hidden></div>`;
    this.stage = new Stage($(root, '#stage'), manual);
    this.easterEggs();
    this.go('home');
  }

  /** For automated tests: step the stage manually. */
  advance(dt: number): void { this.stage.advance(dt); this.pedestals.forEach((p) => p.tick(dt)); }
  get currentScreen(): Screen { return this.screen; }
  get match(): Match | null { return this.stage.match; }
  get generations(): number { return this.reports.length; }

  private go(s: Screen): void {
    this.screen = s;
    cancelAnimationFrame(this.pedLoop);
    this.pedestals = [];
    const el = $(this.root, '#screen');
    el.className = `screen screen-${s}`;
    const steps = $(this.root, '#steps');
    steps.hidden = s === 'home';
    steps.querySelectorAll('li').forEach((li) => {
      const order = ['pick', 'evolve', 'fight'];
      li.classList.toggle('done', order.indexOf(li.dataset.step!) < order.indexOf(s));
      li.classList.toggle('now', li.dataset.step === s);
    });
    this[s](el);
  }

  // ------------------------------------------------------------------ home
  private home(el: HTMLElement): void {
    const r = this.stage.renderer;
    r.youIndex = null; r.glow = [null, null];
    this.layoutDish('hero');
    // The background fight: two hand-scripted specimens (the field note admits it).
    this.stage.onEnd = null;
    this.stage.play(() => new Match(CRAB, DUMMY, [new PusherController(), new DummyController()], this.fightSeed++), 2.2);
    el.innerHTML = `
      <div class="hero pop">
        <span class="eyebrow">A study in natural selection</span>
        <h1>Petri</h1>
        <p class="lede">Choose an organism. Let selection write its nervous system, one generation at a time.
          Then put it in the dish and see what it has learned.</p>
        <button class="btn big" id="start">Begin</button>
        <p class="fine">About a minute. Runs entirely in your browser.</p>
      </div>
      <aside class="field-note hand pop" style="animation-delay:.4s">
        Nothing you evolve here is scripted. The two in the background are, and they know it.
        <span class="sig">field journal, p. 1</span>
      </aside>`;
    $(el, '#start').onclick = () => this.go('pick');
  }

  // ------------------------------------------------------------------ pick
  private pick(el: HTMLElement): void {
    this.layoutDish('back');
    el.innerHTML = `
      <div class="panel frame pop pick">
        <button class="btn-quiet back" id="back">← back</button>
        <span class="eyebrow">Step I</span>
        <h2>Choose a specimen</h2>
        <div class="pedestals" id="peds"></div>
        <p class="blurb" id="blurb">All three begin with random nervous systems. None of them can swim yet.</p>
        <button class="btn big" id="choose" disabled>Select a specimen</button>
      </div>`;
    const peds = $(el, '#peds');
    const small = window.innerWidth < 560;
    this.pedestals = STARTERS.map((st, i) => {
      const p = new Pedestal(st.spec, small ? 84 : 176);
      const b = document.createElement('button');
      b.className = 'pedestal'; b.style.setProperty('--tilt', `${(i - 1) * 1.5}deg`);
      b.setAttribute('aria-label', `${st.spec.nick}: ${st.blurb}`);
      b.appendChild(p.canvas);
      b.insertAdjacentHTML('beforeend', `<span class="label"><b>${st.spec.nick}</b><i>${st.spec.name}</i></span>`);
      b.onclick = () => this.choose(i, el);
      peds.appendChild(b);
      return p;
    });
    if (this.chosen) this.choose(STARTERS.indexOf(this.chosen), el);
    $(el, '#back').onclick = () => this.go('home');
    $(el, '#choose').onclick = () => { if (this.chosen) this.go('evolve'); };
    this.animatePedestals();
  }

  private choose(i: number, el: HTMLElement): void {
    this.chosen = STARTERS[i];
    el.querySelectorAll('.pedestal').forEach((b, k) => b.classList.toggle('picked', k === i));
    this.pedestals.forEach((p, k) => { p.selected = k === i; });
    $(el, '#blurb').textContent = this.chosen.blurb;
    const btn = $<HTMLButtonElement>(el, '#choose');
    btn.disabled = false;
    btn.textContent = `Continue with ${this.chosen.spec.nick}`;
  }

  private animatePedestals(): void {
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      this.pedestals.forEach((p) => p.tick(dt));
      this.pedLoop = requestAnimationFrame(loop);
    };
    this.pedLoop = requestAnimationFrame(loop);
  }

  // ------------------------------------------------------------------ evolve
  private evolve(el: HTMLElement): void {
    const st = this.chosen!;
    const nick = st.spec.nick!;
    this.layoutDish('side');
    const r = this.stage.renderer;
    r.youIndex = 0; r.glow = [null, null];
    if (!this.runner) {
      this.runner = new EvolutionRunner(st.spec);
      this.runner.onGeneration = (rep) => this.onGeneration(rep);
    }
    // Show what the creature can do right now: a random brain at first, later the champion.
    this.showChampionLoop();

    el.innerHTML = `
      <div class="panel frame pop evolve">
        <button class="btn-quiet back" id="back">← back</button>
        <div id="pre" ${this.reports.length ? 'hidden' : ''}>
          <span class="eyebrow">Step II</span>
          <h2>An untrained nervous system</h2>
          <p>${nick}'s brain is random wiring for now; the twitching on the left is the result.
             Evolution will test <b>${DEFAULT_CONFIG.popSize} variants at a time</b>, keep the best,
             and breed them with small random changes.</p>
          <button class="btn big" id="go">Evolve</button>
        </div>
        <div id="live" ${this.reports.length ? '' : 'hidden'}>
          <p class="gen"><span id="gen">Generation 1</span> <span class="num" id="genSpeed"></span></p>
          <p class="commentary" id="comment">${LOADING_LINES[Math.floor(Math.random() * LOADING_LINES.length)]}</p>
          <p class="tip" id="tip" hidden></p>
          <canvas class="graph" id="graph" aria-label="Fitness over generations"></canvas>
          <div class="pop-dots" id="dots" aria-label="Variants that pushed an opponent out"></div>
          <p class="fine" id="dotsLabel">One mark per variant. Lit: it pushed an opponent out during testing.</p>
          <p class="wait" id="wait">Usually ready within 20–40 seconds.</p>
          <button class="btn big" id="fight" hidden>Fight</button>
          <button class="btn-quiet" id="tinkerToggle" ${this.evolvedOnce ? '' : 'hidden'}>Parameters</button>
          <div class="tinker" id="tinker" hidden>
            <label>Mutation strength <input type="range" id="mut" min="0.05" max="1" step="0.05" value="${this.runner.evo.cfg.mutationSize}"><span class="num" id="mutVal"></span></label>
            <label>Variants per generation <select id="popSel"><option>24</option><option>48</option><option>96</option></select></label>
            <label>Watch speed <select id="spd"><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select></label>
            <button class="btn-quiet" id="defaults">Restore defaults</button>
          </div>
        </div>
      </div>`;
    $(el, '#back').onclick = () => { this.runner?.stop(); this.go('pick'); };
    $(el, '#go').onclick = () => {
      $(el, '#pre').hidden = true; $(el, '#live').hidden = false;
      this.runner!.start();
      this.renderLive();
    };
    $(el, '#fight').onclick = () => this.go('fight');
    if (this.reports.length) { this.runner.start(); this.renderLive(); }
    this.wireTinker(el);
  }

  private wireTinker(el: HTMLElement): void {
    const runner = this.runner!;
    const mut = $<HTMLInputElement>(el, '#mut'), popSel = $<HTMLSelectElement>(el, '#popSel'), spd = $<HTMLSelectElement>(el, '#spd');
    const label = () => { const v = +mut.value; $(el, '#mutVal').textContent = v < 0.2 ? 'conservative' : v < 0.5 ? 'moderate' : 'reckless'; };
    popSel.value = String(runner.evo.cfg.popSize); spd.value = String(this.stage.speed); label();
    $(el, '#tinkerToggle').onclick = () => { const t = $(el, '#tinker'); t.hidden = !t.hidden; };
    mut.oninput = () => { runner.configure({ mutationSize: +mut.value }); label(); };
    popSel.onchange = () => runner.configure({ popSize: +popSel.value });
    spd.onchange = () => { this.stage.speed = +spd.value; };
    $(el, '#defaults').onclick = () => {
      runner.configure({ mutationSize: DEFAULT_CONFIG.mutationSize, popSize: DEFAULT_CONFIG.popSize });
      this.stage.speed = 1;
      mut.value = String(DEFAULT_CONFIG.mutationSize); popSel.value = String(DEFAULT_CONFIG.popSize); spd.value = '1'; label();
      this.toast('Defaults restored.');
    };
  }

  private onGeneration(rep: GenReport): void {
    this.reports.push(rep);
    if (this.screen === 'evolve') this.renderLive();
  }

  private renderLive(): void {
    const el = $(this.root, '#screen');
    const last = this.reports[this.reports.length - 1];
    if (!last) return;
    const nick = this.chosen!.spec.nick!;
    $(el, '#gen').textContent = `Generation ${last.generation + 1}`;
    $(el, '#genSpeed').textContent = `${last.seconds.toFixed(1)} s/gen`;
    const line = commentFor(last, this.reports, nick);
    const c = $(el, '#comment');
    c.textContent = line.text; c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop');
    const tip = $(el, '#tip');
    if (line.tip && !this.seenTips.has(line.tip.word)) {
      this.seenTips.add(line.tip.word);
      tip.innerHTML = `<b>${line.tip.word}</b> = ${line.tip.meaning}`;
      tip.hidden = false; tip.classList.remove('pop'); void tip.offsetWidth; tip.classList.add('pop');
    }
    drawGraph($(el, '#graph'), this.reports.map((r) => r.best), this.reports.map((r) => r.mean));
    $(el, '#dots').innerHTML = Array.from({ length: last.popSize }, (_, i) => `<i class="${i < last.pushers ? 'on' : ''}"></i>`).join('');
    if (isReady(this.reports)) {
      $(el, '#wait').hidden = true;
      const f = $(el, '#fight');
      if (f.hidden) { f.hidden = false; f.classList.add('pop'); }
    }
  }

  /** Loop the current champion vs the Buoy on the stage, picking up newer champions each round. */
  private showChampionLoop(): void {
    this.stage.onEnd = null;
    this.stage.play(() => {
      const champ = this.runner!.evo.champions[this.runner!.evo.champions.length - 1] ?? this.runner!.evo.pop[0];
      return new Match(this.chosen!.spec, DUMMY, [new Brain(this.runner!.evo.shape, champ), new DummyController()], this.fightSeed++);
    }, 1.5);
  }

  // ------------------------------------------------------------------ fight
  private fight(el: HTMLElement): void {
    const st = this.chosen!;
    const nick = st.spec.nick!;
    const evo = this.runner!.evo;
    const champ = evo.champions[evo.champions.length - 1];
    const gens = evo.champions.length;
    this.runner!.stop();
    this.evolvedOnce = true;
    this.layoutDish('center');
    const r = this.stage.renderer;
    r.youIndex = 0; r.glow = [COLOR.amber, null];
    el.innerHTML = `
      <div class="versus pop">
        <span class="label"><small>Yours · ${gens} generations</small><b>${nick}</b><i>${st.spec.name}</i></span>
        <span class="vs">versus</span>
        <span class="label right"><small>Control specimen</small><b>${DUMMY.nick}</b><i>${DUMMY.name}</i></span>
      </div>
      <div class="result frame" id="result" hidden></div>`;
    this.stage.play(() => new Match(st.spec, DUMMY, [new Brain(evo.shape, champ), new DummyController()], 1000 + this.fightSeed++), null);
    this.stage.onEnd = (m) => {
      const res = m.result!;
      const box = $(el, '#result');
      const won = res.winner === 0;
      box.innerHTML = won
        ? `<span class="eyebrow">Result</span><h2>${nick} holds the dish</h2><p>${res.reason === 'ringout' ? `The Buoy left the ring after ${res.time.toFixed(1)} s.` : 'It was nearer the centre when time ran out.'}
             ${gens} generations ago it could not swim in a straight line.</p>`
        : `<span class="eyebrow">Result</span><h2>The Buoy holds</h2><p>It does nothing at all, which was enough this time. A few more generations should change that.</p>`;
      box.insertAdjacentHTML('beforeend', `<div class="row-btns">
          <button class="btn" id="again">${won ? 'Rematch' : 'Keep evolving'}</button>
          <button class="btn-quiet" id="other">${won ? 'Keep evolving' : 'Rematch'}</button></div>`);
      box.hidden = false; box.classList.add('pop');
      const again = () => { box.hidden = true; this.stage.restart(); };
      $(box, '#again').onclick = won ? again : () => this.go('evolve');
      $(box, '#other').onclick = won ? () => this.go('evolve') : again;
    };
  }

  // ------------------------------------------------------------------ helpers
  /** Where the dish sits for each screen. On phones it always sits on top. */
  private layoutDish(mode: 'hero' | 'side' | 'center' | 'back'): void {
    const phone = window.innerWidth < 760;
    const r = this.stage.renderer;
    if (phone) r.setView(mode === 'center' ? { cx: 0.5, cy: 0.45, fill: 1.05 } : mode === 'hero' ? { cx: 0.5, cy: 0.3, fill: 1.15 } : { cx: 0.5, cy: 0.3, fill: 1 });
    else if (mode === 'hero') r.setView({ cx: 0.68, cy: 0.5, fill: 1.35 });
    else if (mode === 'side') r.setView({ cx: 0.64, cy: 0.53, fill: 1.02 });
    else if (mode === 'back') r.setView({ cx: 0.5, cy: 0.5, fill: 1.2 });
    else r.setView({ cx: 0.5, cy: 0.575, fill: 0.9 });
  }

  private toast(msg: string): void {
    const t = $(this.root, '#toast');
    t.textContent = msg; t.hidden = false; t.classList.remove('pop'); void t.offsetWidth; t.classList.add('pop');
    clearTimeout((t as unknown as { _h: number })._h);
    (t as unknown as { _h: number })._h = window.setTimeout(() => { t.hidden = true; }, 2600);
  }

  /** Two small secrets. Shh. */
  private easterEggs(): void {
    let clicks = 0, timer = 0;
    $(this.root, '#wordmark').onclick = () => {
      clicks++; clearTimeout(timer); timer = window.setTimeout(() => { clicks = 0; }, 900);
      if (clicks >= 5) {
        clicks = 0;
        const r = this.stage.renderer; r.nightDive = !r.nightDive;
        this.toast(r.nightDive ? 'Night dive. Lights down.' : 'Surfacing.');
      } else if (clicks === 1 && this.screen !== 'home' && this.screen !== 'evolve') {
        timer = window.setTimeout(() => { if (clicks === 1) this.go('home'); clicks = 0; }, 400);
      }
    };
    let typed = '';
    window.addEventListener('keydown', (e) => {
      typed = (typed + e.key.toLowerCase()).slice(-4);
      if (typed === 'sims') { const on = toggleBioluminescence(); this.toast(on ? 'Bioluminescence up. For Karl Sims, 1994.' : 'Bioluminescence down.'); }
    });
  }
}
