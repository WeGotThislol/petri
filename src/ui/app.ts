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
import { setEyeBoost } from '../render/creatureArt';
import { Stage } from './stage';
import { Pedestal } from './pedestal';
import { drawGraph } from './graph';
import { commentFor, isReady, LOADING_LINES } from './commentary';
import { COLOR } from './tokens';

type Screen = 'home' | 'pick' | 'evolve' | 'fight';

interface Starter { spec: CreatureSpec; blurb: string }
const STARTERS: Starter[] = [
  { spec: CRAB, blurb: 'Grabby. Has claws and uses them for hugs. Aggressive hugs.' },
  { spec: TADPOLE, blurb: 'All tail, no plan. Surprisingly fast once it figures out which end is the front.' },
  { spec: PADDLER, blurb: 'Rows with two big flippers. Very polite, until it isn\'t.' },
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
      <canvas id="stage" aria-label="Two little creatures sumo wrestling in a petri dish"></canvas>
      <header class="bar">
        <button class="wordmark" id="wordmark" aria-label="Petri, home">Petri</button>
        <ol class="steps" id="steps" hidden aria-label="Your progress">
          <li data-step="pick">pick</li><li data-step="evolve">evolve</li><li data-step="fight">fight</li>
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
    this.layoutDish('side');
    // The background fight: two actors, hand-scripted (the note says so!).
    this.stage.onEnd = null;
    this.stage.play(() => new Match(CRAB, DUMMY, [new PusherController(), new DummyController()], this.fightSeed++), 2.2);
    el.innerHTML = `
      <div class="hero frame pop">
        <h1>Petri</h1>
        <p class="lede">Grow a tiny fighter. Teach it by <em>evolution</em>. Push everyone out of the dish.</p>
        <button class="btn big" id="start">Meet your first creature</button>
        <p class="fine">about a minute · no sign-up · works on your phone</p>
      </div>
      <aside class="maker-note hand pop" style="animation-delay:.25s">
        hi! I made this in my second year of uni. The creatures you train really learn by themselves.*
        <span class="sig">— the maker</span>
        <small>*except the two in the background. They're actors.</small>
      </aside>`;
    $(el, '#start').onclick = () => this.go('pick');
  }

  // ------------------------------------------------------------------ pick
  private pick(el: HTMLElement): void {
    this.layoutDish('back');
    el.innerHTML = `
      <div class="panel frame pop pick">
        <button class="btn-quiet back" id="back">← back</button>
        <h2>Who's your first little fighter?</h2>
        <p class="hint hand" id="hint">tap one ↓</p>
        <div class="pedestals" id="peds"></div>
        <p class="blurb" id="blurb">They all start out knowing nothing. Promise.</p>
        <button class="btn big" id="choose" disabled>Tap a creature first</button>
      </div>`;
    const peds = $(el, '#peds');
    const small = window.innerWidth < 560;
    this.pedestals = STARTERS.map((st, i) => {
      const p = new Pedestal(st.spec, small ? 92 : 150);
      const b = document.createElement('button');
      b.className = 'pedestal'; b.style.setProperty('--tilt', `${(i - 1) * 1.5}deg`);
      b.setAttribute('aria-label', `${st.spec.nick}: ${st.blurb}`);
      b.appendChild(p.canvas);
      b.insertAdjacentHTML('beforeend', `<span class="sticker"><b>${st.spec.nick}</b></span>`);
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
    this.pedestals.forEach((p, k) => { p.mood = k === i ? 'happy' : 'idle'; });
    $(el, '#blurb').textContent = this.chosen.blurb;
    $(el, '#hint').style.visibility = 'hidden';
    const btn = $<HTMLButtonElement>(el, '#choose');
    btn.disabled = false;
    btn.textContent = `Let's go with ${this.chosen.spec.nick}`;
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
          <h2>${nick}'s brain is brand new</h2>
          <p>Right now it's random wiring, so ${nick} mostly twitches (that's ${nick} on the left).
             Press the button and I'll breed <b>${DEFAULT_CONFIG.popSize} brains at a time</b>: the best fighters get to have babies,
             the babies get tiny random changes, repeat.</p>
          <button class="btn big" id="go">Evolve!</button>
        </div>
        <div id="live" ${this.reports.length ? '' : 'hidden'}>
          <p class="gen"><span id="gen">Generation 1</span> <span class="num" id="genSpeed"></span></p>
          <p class="commentary" id="comment">${LOADING_LINES[Math.floor(Math.random() * LOADING_LINES.length)]}</p>
          <p class="tip" id="tip" hidden></p>
          <canvas class="graph" id="graph" aria-label="Fitness over generations"></canvas>
          <div class="pop-dots" id="dots" aria-label="Brains that can push Globby out"></div>
          <p class="fine" id="dotsLabel">each dot is one brain. Mint = it pushed Globby out in testing.</p>
          <p class="wait hand" id="wait">I'll tell you when it's ready. Usually 20–40 seconds.</p>
          <button class="btn big" id="fight" hidden>Fight!</button>
          <button class="btn-quiet" id="tinkerToggle" ${this.evolvedOnce ? '' : 'hidden'}>Tinker</button>
          <div class="tinker" id="tinker" hidden>
            <label>How wild are the mutations? <input type="range" id="mut" min="0.05" max="1" step="0.05" value="${this.runner.evo.cfg.mutationSize}"><span class="num" id="mutVal"></span></label>
            <label>Brains per generation <select id="popSel"><option>24</option><option>48</option><option>96</option></select></label>
            <label>Watch speed <select id="spd"><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select></label>
            <button class="btn-quiet" id="defaults">Undo my tinkering</button>
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
    const label = () => { const v = +mut.value; $(el, '#mutVal').textContent = v < 0.2 ? 'gentle' : v < 0.5 ? 'medium' : 'wild!'; };
    popSel.value = String(runner.evo.cfg.popSize); spd.value = String(this.stage.speed); label();
    $(el, '#tinkerToggle').onclick = () => { const t = $(el, '#tinker'); t.hidden = !t.hidden; };
    mut.oninput = () => { runner.configure({ mutationSize: +mut.value }); label(); };
    popSel.onchange = () => runner.configure({ popSize: +popSel.value });
    spd.onchange = () => { this.stage.speed = +spd.value; };
    $(el, '#defaults').onclick = () => {
      runner.configure({ mutationSize: DEFAULT_CONFIG.mutationSize, popSize: DEFAULT_CONFIG.popSize });
      this.stage.speed = 1;
      mut.value = String(DEFAULT_CONFIG.mutationSize); popSel.value = String(DEFAULT_CONFIG.popSize); spd.value = '1'; label();
      this.toast('Back to the defaults. Nothing broke.');
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

  /** Loop the current champion vs Globby on the stage, picking up newer champions each round. */
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
    r.youIndex = 0; r.glow = [COLOR.butter, null];
    el.innerHTML = `
      <div class="versus pop">
        <span class="sticker" style="--tilt:-2deg"><b>${nick}</b><i>you · ${gens} generations of evolution</i></span>
        <span class="vs hand">vs</span>
        <span class="sticker" style="--tilt:2deg"><b>Globby</b><i>a sleepy dummy. Be gentle.</i></span>
      </div>
      <div class="result frame" id="result" hidden></div>`;
    this.stage.play(() => new Match(st.spec, DUMMY, [new Brain(evo.shape, champ), new DummyController()], 1000 + this.fightSeed++), null);
    this.stage.onEnd = (m) => {
      const res = m.result!;
      const box = $(el, '#result');
      const won = res.winner === 0;
      box.innerHTML = won
        ? `<h2>${nick} wins!</h2><p>${res.reason === 'ringout' ? `Pushed Globby out in ${res.time.toFixed(1)} s.` : 'Closer to the middle when the bell rang.'}
             ${gens} generations ago, ${nick} couldn't even swim straight.</p>`
        : `<h2>Globby wins?!</h2><p>Globby literally does nothing. ${nick} needs a few more generations, that's all.</p>`;
      box.insertAdjacentHTML('beforeend', `<div class="row-btns">
          <button class="btn big" id="again">${won ? 'Fight again' : 'Evolve more'}</button>
          <button class="btn-quiet" id="other">${won ? 'Evolve more' : 'Rematch'}</button></div>`);
      box.hidden = false; box.classList.add('pop');
      const again = () => { box.hidden = true; this.stage.restart(); };
      $(box, '#again').onclick = won ? again : () => this.go('evolve');
      $(box, '#other').onclick = won ? () => this.go('evolve') : again;
    };
  }

  // ------------------------------------------------------------------ helpers
  /** Where the dish sits for each screen. On phones it always sits on top. */
  private layoutDish(mode: 'side' | 'center' | 'back'): void {
    const phone = window.innerWidth < 760;
    const r = this.stage.renderer;
    if (phone) r.setView(mode === 'center' ? { cx: 0.5, cy: 0.45, fill: 1 } : { cx: 0.5, cy: 0.3, fill: 0.95 });
    else if (mode === 'side') r.setView({ cx: 0.64, cy: 0.53, fill: 0.95 });
    else if (mode === 'back') r.setView({ cx: 0.5, cy: 0.5, fill: 1.15 });
    else r.setView({ cx: 0.5, cy: 0.54, fill: 0.92 });
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
        const r = this.stage.renderer; r.partyHats = !r.partyHats;
        this.toast(r.partyHats ? 'Party mode. Obviously.' : 'Party\'s over. Back to science.');
      } else if (clicks === 1 && this.screen !== 'home' && this.screen !== 'evolve') {
        timer = window.setTimeout(() => { if (clicks === 1) this.go('home'); clicks = 0; }, 400);
      }
    };
    let typed = '';
    window.addEventListener('keydown', (e) => {
      typed = (typed + e.key.toLowerCase()).slice(-4);
      if (typed === 'blob') { const on = setEyeBoost(); this.toast(on ? 'Googly eyes: ON' : 'Googly eyes: off. Dignity restored.'); }
    });
  }
}
