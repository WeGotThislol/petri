/**
 * The app: a small state machine of screens on top of one shared Stage.
 *
 *   home ──► pick ──► evolve ──► fight
 *             │  ▲       ▲  │      │
 *             ▼  │       │  └──────┘
 *             lab ───────┘
 *
 * First visit: home → pick → evolve → fight, with nothing else in the way.
 * After the first fight the step bar becomes navigation, the Parameters
 * drawer and speed controls appear, and progress is saved in the browser.
 * Rule from docs/DESIGN.md: ONE main (amber) action per screen.
 */
import { ALL_BODIES, CRAB, cloneSpec, CreatureSpec, DUMMY, PADDLER, TADPOLE } from '../sim/creature';
import { Match } from '../sim/match';
import { Brain } from '../sim/brain';
import { DummyController, PusherController } from '../sim/controllers';
import { EvolutionRunner, GenReport } from '../evo/runner';
import { DEFAULT_CONFIG } from '../evo/ga';
import { toggleBioluminescence } from '../render/creatureArt';
import { Stage } from './stage';
import { Pedestal } from './pedestal';
import { drawGraph } from './graph';
import { LabEditor, labMarkup } from './lab';
import { commentFor, isReady, LOADING_LINES } from './commentary';
import { clearSave, loadSave, writeSave } from './save';
import { COLOR } from './tokens';
import { ROSTER, rosterFor } from '../data/roster';
import { decodeCreature, encodeCreature, SharedCreature } from '../share/codec';
import { canRecord, download, startRecording } from '../share/clip';
import { shapeFor } from '../evo/ga';
import type { BrainShape } from '../sim/brain';

type Screen = 'home' | 'challenge' | 'pick' | 'lab' | 'evolve' | 'fight';

interface Starter { spec: CreatureSpec; blurb: string }
const STARTERS: Starter[] = [
  { spec: CRAB, blurb: 'Two forelimbs and a driving tail. Grips first, considers later.' },
  { spec: TADPOLE, blurb: 'Mostly tail. Quick, once it settles which end is the front.' },
  { spec: PADDLER, blurb: 'Rows with two broad paddles. Unhurried, and hard to move.' },
];

/** Who you can fight. Brain opponents come from your own lineage's hall of fame. */
interface Opponent {
  id: string; label: string; small: string; spec: CreatureSpec;
  genome?: number[]; shape?: BrainShape; blurb?: string;
  kind: 'buoy' | 'self' | 'roster' | 'challenger';
}

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
  private editor: LabEditor | null = null;
  private labDraft: CreatureSpec | null = null;
  /** A genome the player explicitly adopted as champion (else: latest best). */
  private adopted: { genome: number[]; gen: number } | null = null;
  /** Which variant the stage is showing on the Evolve screen (-1 = the champion). */
  private watching = -1;
  private opponentId = 'buoy';
  /** A creature that arrived through a share link (#c=…). */
  private challenger: SharedCreature | null = null;
  private boutSeed = 1000;
  private recording = false;
  private clipEndAt: number | null = null;

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
    $(root, '#steps').addEventListener('click', (e) => {
      const li = (e.target as HTMLElement).closest('li');
      if (li?.classList.contains('nav')) this.go(li.dataset.step as Screen);
    });
    // A share link (#c=…) carries a creature and its brain: open with the challenge.
    const link = location.hash.match(/^#c=([A-Za-z0-9_-]+)/);
    let linkError = '';
    if (link) {
      try { this.challenger = decodeCreature(link[1]); this.opponentId = 'challenger'; }
      catch (e) { linkError = (e as Error).message; }
    }
    this.go(this.challenger ? 'challenge' : 'home');
    if (linkError) this.toast(linkError);
  }

  /** For automated tests: step the stage manually. */
  advance(dt: number): void { this.stage.advance(dt); this.pedestals.forEach((p) => p.tick(dt)); }
  get currentScreen(): Screen { return this.screen; }
  get match(): Match | null { return this.stage.match; }
  get generations(): number { return this.reports.length; }

  private get champion(): { genome: number[]; gen: number } | null {
    if (this.adopted) return this.adopted;
    const evo = this.runner?.evo;
    if (!evo || !evo.champions.length) return null;
    return { genome: evo.champions[evo.champions.length - 1], gen: evo.champions.length };
  }

  private go(s: Screen): void {
    if (this.screen === 'lab' && s !== 'lab') { this.labDraft = this.editor?.spec ?? this.labDraft; this.editor?.dispose(); this.editor = null; }
    if (s !== 'evolve' && this.runner?.isRunning && s !== 'fight') this.runner.stop();
    this.screen = s;
    cancelAnimationFrame(this.pedLoop);
    this.pedestals = [];
    this.stage.speed = 1;
    const el = $(this.root, '#screen');
    el.className = `screen screen-${s}`;
    this.updateSteps();
    this[s](el);
  }

  /** The step bar: a progress indicator on the first run, navigation afterwards. */
  private updateSteps(): void {
    const s = this.screen;
    const steps = $(this.root, '#steps');
    steps.hidden = s === 'home' || s === 'challenge';
    const order = ['pick', 'evolve', 'fight'];
    const at = s === 'lab' ? 'pick' : s;
    steps.querySelectorAll('li').forEach((li) => {
      const step = li.dataset.step!;
      li.classList.toggle('done', order.indexOf(step) < order.indexOf(at));
      li.classList.toggle('now', step === at);
      const reachable = this.evolvedOnce && (step === 'pick' || (step === 'evolve' && !!this.chosen) || (step === 'fight' && !!this.champion));
      li.classList.toggle('nav', reachable && step !== at);
      li.setAttribute('role', reachable ? 'button' : 'listitem');
    });
  }

  // ------------------------------------------------------------------ home
  private home(el: HTMLElement): void {
    const r = this.stage.renderer;
    r.youIndex = null; r.glow = [null, null];
    this.layoutDish('hero');
    // The background fight: two champions from the shipped roster, really evolved.
    // (Falls back to the hand-scripted pair if the roster is missing.)
    this.stage.onEnd = null;
    let bout = 0;
    this.stage.play(() => {
      if (ROSTER.length < 2) return new Match(CRAB, DUMMY, [new PusherController(), new DummyController()], this.fightSeed++);
      const a = ROSTER[bout % ROSTER.length], b = ROSTER[(bout * 3 + 1) % ROSTER.length === bout % ROSTER.length ? (bout + 1) % ROSTER.length : (bout * 3 + 1) % ROSTER.length];
      bout++;
      return new Match(a.spec, b.spec, [new Brain(a.shape, a.genome), new Brain(b.shape, b.genome)], this.fightSeed++);
    }, 2.2);
    const save = !this.chosen ? loadSave() : null;
    const resume = this.chosen ? this.chosen.spec : save?.spec;
    el.innerHTML = `
      <div class="hero pop">
        <span class="eyebrow">A study in natural selection</span>
        <h1>Petri</h1>
        <p class="lede">Choose an organism. Let selection write its nervous system, one generation at a time.
          Then put it in the dish and see what it has learned.</p>
        <button class="btn big" id="start">${resume ? `Continue with ${resume.nick}` : 'Begin'}</button>
        ${resume ? '<button class="btn-quiet" id="fresh">Start a new lineage</button>' : '<p class="fine">About a minute. Runs entirely in your browser.</p>'}
      </div>
      <aside class="field-note hand pop" style="animation-delay:.4s">
        Nothing in the dish is scripted. The two behind this text evolved for seventy generations before you arrived.
        <span class="sig">field journal, p. 1</span>
      </aside>`;
    $(el, '#start').onclick = () => {
      if (this.chosen) this.go(this.champion ? 'fight' : 'evolve');
      else if (save) this.restore(save);
      else this.go('pick');
    };
    const fresh = el.querySelector<HTMLButtonElement>('#fresh');
    if (fresh) fresh.onclick = () => { clearSave(); this.resetLineage(null); this.go('pick'); };
  }

  /** Continue from a saved lineage: the population is seeded from the saved champion. */
  private restore(save: NonNullable<ReturnType<typeof loadSave>>): void {
    const keepOpp = this.opponentId;
    this.resetLineage({ spec: save.spec, blurb: '' });
    if (keepOpp === 'challenger') this.opponentId = keepOpp;
    this.runner!.evo.seedWith(save.champion);
    this.adopted = { genome: save.champion, gen: save.generations }; // keep its real age
    this.evolvedOnce = true;
    this.toast(`Resumed ${save.spec.nick} after ${save.generations} generations.`);
    this.go('fight');
  }

  /** Start a new lineage for `starter` (or none). Drops the old population. */
  private resetLineage(starter: Starter | null): void {
    this.runner?.dispose();
    this.runner = null; this.reports = []; this.adopted = null; this.watching = -1; this.opponentId = this.challenger ? 'challenger' : 'buoy';
    this.chosen = starter;
    if (starter) {
      this.runner = new EvolutionRunner(starter.spec);
      this.runner.onGeneration = (rep) => this.onGeneration(rep);
    }
  }

  // ------------------------------------------------------------------ challenge (opened from a share link)
  private challenge(el: HTMLElement): void {
    const c = this.challenger!;
    const name = c.spec.nick ?? c.spec.name.split(' ')[0];
    const shape = shapeFor(c.spec, c.hidden);
    this.layoutDish('hero');
    this.stage.renderer.youIndex = null; this.stage.renderer.glow = [null, null];
    this.stage.onEnd = null;
    this.stage.play(() => new Match(c.spec, DUMMY, [new Brain(shape, c.genome), new DummyController()], this.fightSeed++), 2);
    const save = loadSave();
    const mine = this.chosen?.spec ?? save?.spec;
    el.innerHTML = `
      <div class="hero pop">
        <span class="eyebrow">A challenge</span>
        <h1 class="challenge-name">${name}</h1>
        <p class="lede"><i>${c.spec.name}</i> arrived by link, nervous system intact. It is working on the Buoy behind this text.
          Decide whether you have something that can beat it.</p>
        <button class="btn big" id="accept">${mine ? `Fight it with ${mine.nick}` : 'Evolve a challenger'}</button>
        <button class="btn-quiet" id="later">Not now</button>
      </div>`;
    $(el, '#accept').onclick = () => {
      this.opponentId = 'challenger';
      if (this.chosen && this.champion) this.go('fight');
      else if (save) this.restore(save);
      else this.go('pick');
    };
    $(el, '#later').onclick = () => this.go('home');
  }

  /** Behind the pick panel: what a well-trained specimen of this species does. */
  private showTrainedExample(spec: CreatureSpec): string {
    const e = rosterFor(spec);
    if (!e) return '';
    this.stage.renderer.youIndex = null;
    this.stage.onEnd = null;
    this.stage.play(() => new Match(e.spec, DUMMY, [new Brain(e.shape, e.genome), new DummyController()], this.fightSeed++), 1.5);
    return `In the dish: a trained ${e.nick} after ${e.generations} generations. Yours starts from nothing.`;
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
        <p class="fine example hand" id="example"></p>
        <div class="row-btns">
          <button class="btn big" id="choose" disabled>Select a specimen</button>
          <button class="btn-quiet" id="toLab">Or design your own</button>
        </div>
      </div>`;
    const peds = $(el, '#peds');
    const small = window.innerWidth < 560;
    let picked = this.chosen && STARTERS.includes(this.chosen) ? STARTERS.indexOf(this.chosen) : -1;
    this.pedestals = STARTERS.map((st, i) => {
      const p = new Pedestal(st.spec, small ? 84 : 176);
      const b = document.createElement('button');
      b.className = 'pedestal';
      b.setAttribute('aria-label', `${st.spec.nick}: ${st.blurb}`);
      b.appendChild(p.canvas);
      b.insertAdjacentHTML('beforeend', `<span class="label"><b>${st.spec.nick}</b><i>${st.spec.name}</i></span>`);
      b.onclick = () => { picked = i; this.highlightPick(i, el); };
      peds.appendChild(b);
      return p;
    });
    if (picked >= 0) this.highlightPick(picked, el);
    $(el, '#back').onclick = () => this.go('home');
    $(el, '#toLab').onclick = () => this.go('lab');
    $(el, '#choose').onclick = () => {
      if (picked < 0) return;
      if (this.chosen !== STARTERS[picked]) this.resetLineage(STARTERS[picked]);
      this.go('evolve');
    };
    this.animatePedestals();
  }

  private highlightPick(i: number, el: HTMLElement): void {
    const st = STARTERS[i];
    el.querySelectorAll('.pedestal').forEach((b, k) => b.classList.toggle('picked', k === i));
    this.pedestals.forEach((p, k) => { p.selected = k === i; });
    $(el, '#blurb').textContent = st.blurb + (this.chosen && this.chosen !== st && this.reports.length ? ' (Choosing it starts a new lineage.)' : '');
    $(el, '#example').textContent = this.showTrainedExample(st.spec);
    const btn = $<HTMLButtonElement>(el, '#choose');
    btn.disabled = false;
    btn.textContent = `Continue with ${st.spec.nick}`;
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

  // ------------------------------------------------------------------ lab
  private lab(el: HTMLElement): void {
    this.layoutDish('back');
    this.stage.onEnd = null;
    el.innerHTML = labMarkup();
    const start = this.labDraft ?? (this.chosen ? this.chosen.spec : CRAB);
    const ed = new LabEditor($(el, '#labCanvas'), start);
    this.editor = ed;
    const refresh = () => {
      const s = ed.spec, errs = ed.errors;
      $(el, '#labName').innerHTML = `<i>${s.name}</i>`;
      $(el, '#counts').textContent = `${s.joints.length} joints · ${s.bones.length} bones · ${s.muscles.length} muscles (max 12 · 18 · 8)`;
      $(el, '#help').textContent = ed.testing ? 'Test swim: every muscle follows a simple rhythm. An evolved brain will do far better.' : ed.help;
      $(el, '#errors').innerHTML = errs.map((e) => `<li>${e}</li>`).join('');
      $<HTMLButtonElement>(el, '#evolveBody').disabled = errs.length > 0;
      $<HTMLButtonElement>(el, '#undo').disabled = !ed.canUndo;
      $<HTMLButtonElement>(el, '#test').textContent = ed.testing ? 'Stop' : 'Test swim';
      el.querySelectorAll<HTMLButtonElement>('.tool').forEach((b) => b.classList.toggle('on', b.dataset.tool === ed.tool));
      el.querySelectorAll<HTMLInputElement>('[data-sense]').forEach((c) => { c.checked = s.senses?.[c.dataset.sense as 'edge'] ?? true; });
      el.querySelectorAll<HTMLButtonElement>('.swatch').forEach((b) => b.classList.toggle('on', b.dataset.pigment === s.look?.body));
      $<HTMLSelectElement>(el, '#pattern').value = s.look?.pattern ?? 'plain';
    };
    ed.onChange = refresh;
    el.querySelectorAll<HTMLButtonElement>('.tool').forEach((b) => { b.onclick = () => { ed.stopTest(); ed.tool = b.dataset.tool as LabEditor['tool']; refresh(); }; });
    el.querySelectorAll<HTMLButtonElement>('.tpl').forEach((b) => { b.onclick = () => ed.loadTemplate(ALL_BODIES[+b.dataset.i!]); });
    el.querySelectorAll<HTMLInputElement>('[data-sense]').forEach((c) => { c.onchange = () => ed.setSense(c.dataset.sense as 'edge', c.checked); });
    el.querySelectorAll<HTMLButtonElement>('.swatch').forEach((b) => { b.onclick = () => ed.setLook({ body: b.dataset.pigment as 'rose' }); });
    $<HTMLSelectElement>(el, '#pattern').onchange = (e) => ed.setLook({ pattern: (e.target as HTMLSelectElement).value as 'bands' });
    $(el, '#undo').onclick = () => ed.undo();
    $(el, '#clear').onclick = () => ed.clear();
    $(el, '#reroll').onclick = () => ed.rerollName();
    $(el, '#test').onclick = () => (ed.testing ? ed.stopTest() : ed.startTest());
    $(el, '#labBack').onclick = () => this.go('pick');
    $(el, '#evolveBody').onclick = () => {
      if (ed.errors.length) return;
      const spec = cloneSpec(ed.spec);
      spec.nick = spec.name.split(' ')[0];
      this.labDraft = null;
      this.resetLineage({ spec, blurb: '' });
      this.go('evolve');
    };
    refresh();
  }

  // ------------------------------------------------------------------ evolve
  private evolve(el: HTMLElement): void {
    const st = this.chosen!;
    const nick = st.spec.nick!;
    const runner = this.runner!;
    this.layoutDish('side');
    const r = this.stage.renderer;
    r.youIndex = 0; r.glow = [null, null];
    this.watching = -1;
    this.showWatchLoop();
    const advanced = this.evolvedOnce;

    el.innerHTML = `
      <div class="panel frame pop evolve">
        <button class="btn-quiet back" id="back">← back</button>
        <div id="pre" ${this.reports.length ? 'hidden' : ''}>
          <span class="eyebrow">Step II</span>
          <h2>An untrained nervous system</h2>
          <p>${nick}'s brain is random wiring for now; the twitching on the left is the result.
             Evolution will test <b>${runner.evo.cfg.popSize} variants at a time</b>, keep the best,
             and breed them with small random changes.</p>
          <button class="btn big" id="go">Evolve</button>
        </div>
        <div id="live" ${this.reports.length ? '' : 'hidden'}>
          <p class="gen"><span id="gen">Generation 1</span> <span class="num" id="genSpeed"></span></p>
          <p class="commentary" id="comment">${LOADING_LINES[Math.floor(Math.random() * LOADING_LINES.length)]}</p>
          <p class="tip" id="tip" hidden></p>
          <canvas class="graph" id="graph" aria-label="Fitness over generations: best in amber, average faint"></canvas>
          <div class="pop-dots ${advanced ? 'pickable' : ''}" id="dots" aria-label="Variants of the last generation, best first"></div>
          <p class="fine" id="dotsLabel">${advanced ? 'One mark per variant, best first. Lit: it pushed an opponent out. Click one to watch it.' : 'One mark per variant. Lit: it pushed an opponent out during testing.'}</p>
          <div class="watching" id="watching" hidden></div>
          <p class="wait" id="wait">Usually ready within 20–40 seconds.</p>
          <button class="btn big" id="fight" hidden>Fight</button>
          <div class="evo-controls" ${advanced ? '' : 'hidden'}>
            <div class="seg" id="speed" role="group" aria-label="Watch speed">
              ${[1, 5, 20, 50].map((v) => `<button class="btn-quiet ${v === 1 ? 'on' : ''}" data-speed="${v}">${v}×</button>`).join('')}
            </div>
            <button class="btn-quiet" id="pause">Pause evolution</button>
            <button class="btn-quiet" id="tinkerToggle">Parameters</button>
            ${rosterFor(st.spec) ? '<button class="btn-quiet" id="trained">Watch a trained one</button>' : ''}
          </div>
          <div class="tinker" id="tinker" hidden>
            <label>Mutation strength <input type="range" id="mut" min="0.05" max="1" step="0.05" value="${runner.evo.cfg.mutationSize}"><span class="num" id="mutVal"></span></label>
            <label>Variants per generation <select id="popSel"><option>24</option><option>48</option><option>96</option></select></label>
            <button class="btn-quiet" id="defaults">Restore defaults</button>
          </div>
        </div>
      </div>`;
    $(el, '#back').onclick = () => this.go('pick');
    $(el, '#go').onclick = () => {
      $(el, '#pre').hidden = true; $(el, '#live').hidden = false;
      runner.start();
      this.renderLive();
    };
    $(el, '#fight').onclick = () => this.go('fight');
    el.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((b) => {
      b.onclick = () => {
        this.stage.speed = +b.dataset.speed!;
        el.querySelectorAll('[data-speed]').forEach((x) => x.classList.toggle('on', x === b));
      };
    });
    $(el, '#pause').onclick = () => {
      if (runner.isRunning) runner.stop(); else runner.start();
      $(el, '#pause').textContent = runner.isRunning ? 'Pause evolution' : 'Resume evolution';
    };
    $(el, '#dots').onclick = (e) => {
      const i = (e.target as HTMLElement).dataset.rank;
      if (!advanced || i === undefined) return;
      this.watchVariant(+i);
    };
    const trained = el.querySelector<HTMLButtonElement>('#trained');
    if (trained) trained.onclick = () => {
      const showing = trained.dataset.on === '1';
      trained.dataset.on = showing ? '0' : '1';
      trained.textContent = showing ? 'Watch a trained one' : 'Back to yours';
      if (showing) { this.stage.renderer.youIndex = 0; this.showWatchLoop(); } else this.toast(this.showTrainedExample(st.spec));
    };
    if (this.reports.length) { runner.start(); this.renderLive(); }
    this.wireTinker(el);
  }

  private wireTinker(el: HTMLElement): void {
    const runner = this.runner!;
    const mut = $<HTMLInputElement>(el, '#mut'), popSel = $<HTMLSelectElement>(el, '#popSel');
    const label = () => { const v = +mut.value; $(el, '#mutVal').textContent = v < 0.2 ? 'conservative' : v < 0.5 ? 'moderate' : 'reckless'; };
    popSel.value = String(runner.evo.cfg.popSize); label();
    $(el, '#tinkerToggle').onclick = () => { const t = $(el, '#tinker'); t.hidden = !t.hidden; };
    mut.oninput = () => { runner.configure({ mutationSize: +mut.value }); label(); };
    popSel.onchange = () => runner.configure({ popSize: +popSel.value });
    $(el, '#defaults').onclick = () => {
      runner.configure({ mutationSize: DEFAULT_CONFIG.mutationSize, popSize: DEFAULT_CONFIG.popSize });
      mut.value = String(DEFAULT_CONFIG.mutationSize); popSel.value = String(DEFAULT_CONFIG.popSize); label();
      this.toast('Defaults restored.');
    };
  }

  private onGeneration(rep: GenReport): void {
    this.reports.push(rep);
    if (this.screen === 'evolve') this.renderLive();
    if (this.evolvedOnce) this.persist();
  }

  /** Last generation's variants, best first: [index into lastPop, fitness, pushed?]. */
  private ranked(): { i: number; fit: number; pushed: boolean }[] {
    const evo = this.runner!.evo;
    return evo.results.map((r, i) => ({ i, fit: r.fitness, pushed: r.pushes > 0 })).sort((a, b) => b.fit - a.fit);
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
    $(el, '#dots').innerHTML = this.ranked().map((v, rank) =>
      `<i class="${v.pushed ? 'on' : ''}" data-rank="${rank}" title="Variant ${rank + 1}: fitness ${v.fit.toFixed(2)}"></i>`).join('');
    if (isReady(this.reports) || this.evolvedOnce) {
      $(el, '#wait').hidden = true;
      const f = $(el, '#fight');
      if (f.hidden) { f.hidden = false; f.classList.add('pop'); }
    }
  }

  /** Watch one variant of the last generation, with the option to adopt it. */
  private watchVariant(rank: number): void {
    const el = $(this.root, '#screen');
    const v = this.ranked()[rank];
    if (!v) return;
    const evo = this.runner!.evo;
    const genome = evo.lastPop[v.i].slice();
    const gen = evo.champions.length;
    this.watching = rank; void this.watching;
    this.stage.onEnd = null;
    this.stage.play(() => new Match(this.chosen!.spec, DUMMY, [new Brain(evo.shape, genome), new DummyController()], this.fightSeed++), 1.5);
    const w = $(el, '#watching');
    w.hidden = false;
    w.innerHTML = `<span>Watching variant ${rank + 1} of generation ${gen} · fitness ${v.fit.toFixed(2)}</span>
      <button class="btn-quiet" id="adopt">Adopt as champion</button><button class="btn-quiet" id="unwatch">Back to the champion</button>`;
    $(w, '#adopt').onclick = () => {
      this.adopted = { genome, gen };
      this.toast(`Variant ${rank + 1} adopted. It will fight for you.`);
      this.persist();
    };
    $(w, '#unwatch').onclick = () => { w.hidden = true; this.watching = -1; this.showWatchLoop(); };
  }

  /** Loop the current champion vs the Buoy on the stage, picking up newer champions each round. */
  private showWatchLoop(): void {
    this.stage.onEnd = null;
    this.stage.play(() => {
      const evo = this.runner!.evo;
      const champ = this.champion?.genome ?? evo.pop[0];
      return new Match(this.chosen!.spec, DUMMY, [new Brain(evo.shape, champ), new DummyController()], this.fightSeed++);
    }, 1.5);
  }

  // ------------------------------------------------------------------ fight
  private opponents(): Opponent[] {
    const evo = this.runner!.evo, spec = this.chosen!.spec;
    const list: Opponent[] = [{ id: 'buoy', label: DUMMY.nick!, small: 'Control specimen', spec: DUMMY, kind: 'buoy' }];
    if (this.challenger) {
      const c = this.challenger;
      list.push({ id: 'challenger', label: c.spec.nick ?? c.spec.name.split(' ')[0], small: 'Challenger, from a link', spec: c.spec, genome: c.genome, shape: shapeFor(c.spec, c.hidden), kind: 'challenger' });
    }
    const n = evo.champions.length;
    if (n >= 3) {
      const g = Math.max(1, n - 5);
      list.push({ id: 'spar', label: 'Sparring partner', small: `Your generation ${g}`, spec, genome: evo.champions[g - 1], kind: 'self' });
    }
    if (n >= 8) list.push({ id: 'first', label: 'The ancestor', small: 'Your generation 1', spec, genome: evo.champions[0], kind: 'self' });
    for (const e of ROSTER) list.push({ id: `roster-${e.nick}`, label: e.nick, small: `Roster No. ${e.rank} · ${e.generations} generations`, spec: e.spec, genome: e.genome, shape: e.shape, kind: 'roster', blurb: e.blurb });
    return list;
  }

  private fight(el: HTMLElement): void {
    const st = this.chosen!;
    const nick = st.spec.nick!;
    const evo = this.runner!.evo;
    const champ = this.champion!;
    this.runner!.stop();
    if (!this.evolvedOnce) { this.evolvedOnce = true; this.updateSteps(); }
    this.persist();
    this.layoutDish('center');
    const r = this.stage.renderer;
    r.youIndex = 0; r.glow = [COLOR.amber, null];
    const opps = this.opponents();
    const opp = opps.find((o) => o.id === this.opponentId) ?? opps[0];
    const group = (k: Opponent['kind'], label: string) => {
      const items = opps.filter((o) => o.kind === k);
      return items.length ? `<optgroup label="${label}">${items.map((o) => `<option value="${o.id}" ${o.id === opp.id ? 'selected' : ''}>${o.label}</option>`).join('')}</optgroup>` : '';
    };
    el.innerHTML = `
      <div class="versus pop">
        <span class="label"><small>Yours · ${champ.gen} generation${champ.gen === 1 ? '' : 's'}</small><b>${nick}</b><i>${st.spec.name}</i></span>
        <span class="vs">versus</span>
        <span class="label right"><small>${opp.small}</small><b>${opp.label}</b><i>${opp.spec.name}</i></span>
      </div>
      <div class="fight-bar pop">
        <label class="opp-select"><span class="eyebrow">Opponent</span>
          <select id="opp">${group('buoy', 'Control')}${group('challenger', 'From a link')}${group('self', 'Your lineage')}${group('roster', 'Champion roster')}</select></label>
        ${opp.blurb ? `<p class="opp-blurb">${opp.blurb}</p>` : ''}
      </div>
      <div class="fight-tools pop">
        <div class="seg" role="group" aria-label="Speed">${[1, 3].map((v) => `<button class="btn-quiet ${v === 1 ? 'on' : ''}" data-speed="${v}">${v}×</button>`).join('')}</div>
        <button class="btn-quiet" id="share">Share ${nick}</button>
      </div>
      <div class="share-box frame" id="shareBox" hidden></div>
      <div class="result frame" id="result" hidden></div>`;
    $<HTMLSelectElement>(el, '#opp').onchange = (e) => { this.opponentId = (e.target as HTMLSelectElement).value; this.go('fight'); };
    el.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((b) => {
      b.onclick = () => { this.stage.speed = +b.dataset.speed!; el.querySelectorAll('[data-speed]').forEach((x) => x.classList.toggle('on', x === b)); };
    });
    $(el, '#share').onclick = () => this.showShare(el);
    const oppCtrl = () => (opp.genome ? new Brain(opp.shape ?? evo.shape, opp.genome) : new DummyController());
    // One fixed seed per bout, so "Record a clip" can replay exactly what you just saw.
    const seed = 1000 + this.fightSeed++;
    this.boutSeed = seed;
    const makeMatch = () => new Match(st.spec, opp.spec, [new Brain(evo.shape, champ.genome), oppCtrl()], this.boutSeed);
    this.stage.play(makeMatch, null);
    this.stage.onEnd = (m) => {
      if (this.recording) return; // the clip handler deals with the end of a recorded replay
      const res = m.result!;
      const box = $(el, '#result');
      const won = res.winner === 0;
      const name = opp.kind === 'buoy' ? 'The Buoy' : opp.label;
      const how = res.reason === 'ringout' ? `${name} left the ring after ${res.time.toFixed(1)} s.` : 'It was nearer the centre when time ran out.';
      const lose: Record<Opponent['kind'], string> = {
        buoy: 'It does nothing at all, which was enough this time. A few more generations should change that.',
        self: 'An earlier version of itself. Selection is not a straight line.',
        roster: `${opp.label} trained for ${opp.small.split('· ')[1] ?? 'a long time'}. It shows.`,
        challenger: 'Someone else\'s lineage, someone else\'s ideas. Back to the dish.',
      };
      box.innerHTML = won
        ? `<span class="eyebrow">Result</span><h2>${nick} holds the dish</h2><p>${how} ${opp.kind === 'buoy' ? `${champ.gen} generations ago it could not swim in a straight line.` : 'Evolution remembers what it learned.'}</p>`
        : `<span class="eyebrow">Result</span><h2>${opp.kind === 'buoy' ? 'The Buoy holds' : `${opp.label} wins`}</h2><p>${lose[opp.kind]}</p>`;
      box.insertAdjacentHTML('beforeend', `<div class="row-btns">
          <button class="btn" id="again">${won ? 'Rematch' : 'Keep evolving'}</button>
          <button class="btn-quiet" id="other">${won ? 'Keep evolving' : 'Rematch'}</button>
          ${canRecord() ? '<button class="btn-quiet" id="clip">Record a clip</button>' : ''}</div>`);
      box.hidden = false; box.classList.add('pop');
      const again = () => { box.hidden = true; this.boutSeed = 1000 + this.fightSeed++; this.stage.restart(); };
      $(box, '#again').onclick = won ? again : () => this.go('evolve');
      $(box, '#other').onclick = won ? () => this.go('evolve') : again;
      const clip = box.querySelector<HTMLButtonElement>('#clip');
      if (clip) clip.onclick = () => this.recordClip(box, `${nick} vs ${opp.label}`, `${st.spec.name} · ${champ.gen} generations`);
    };
  }

  /** Replay the bout that just ended (same seed) while recording the canvas. */
  private async recordClip(box: HTMLElement, title: string, sub: string): Promise<void> {
    box.hidden = true;
    const r = this.stage.renderer;
    r.caption = { title, sub };
    this.recording = true;
    this.root.classList.add('recording');
    this.stage.speed = 1;
    this.stage.restart(); // same boutSeed → the identical fight
    this.toast('Recording the replay…');
    const rec = startRecording(this.stage.canvas);
    const t0 = performance.now();
    await new Promise<void>((resolve) => {
      const check = () => {
        const m = this.stage.match;
        const elapsed = (performance.now() - t0) / 1000;
        // Stop 1.5 s after the knock-out, or at 20 s.
        if ((m?.result && elapsed > 0 && (this.clipEndAt ??= elapsed + 1.5) <= elapsed) || elapsed > 20) resolve();
        else requestAnimationFrame(check);
      };
      this.clipEndAt = null;
      requestAnimationFrame(check);
    });
    const { blob, ext } = await rec.stop();
    r.caption = null;
    this.recording = false;
    this.root.classList.remove('recording');
    download(blob, `petri-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.${ext}`);
    this.toast(`Clip saved (${ext.toUpperCase()}, ${(blob.size / 1e6).toFixed(1)} MB).`);
    box.hidden = false;
  }

  /** The share panel: a link that carries this creature and its brain. */
  private showShare(el: HTMLElement): void {
    const box = $(el, '#shareBox');
    if (!box.hidden) { box.hidden = true; return; }
    const champ = this.champion!;
    const code = encodeCreature({ spec: this.chosen!.spec, genome: champ.genome, hidden: this.runner!.evo.shape.hidden });
    const url = `${location.origin}${location.pathname}#c=${code}`;
    box.innerHTML = `<span class="eyebrow">Share</span>
      <p>Anyone who opens this link can fight your ${this.chosen!.spec.nick}. The body and brain travel inside the link itself; nothing is uploaded.</p>
      <input class="share-url" id="shareUrl" readonly value="${url}" aria-label="Share link">
      <div class="row-btns"><button class="btn" id="copy">Copy link</button><span class="fine">${url.length} characters</span></div>`;
    box.hidden = false; box.classList.add('pop');
    const input = $<HTMLInputElement>(box, '#shareUrl');
    input.onfocus = () => input.select();
    $(box, '#copy').onclick = async () => {
      try { await navigator.clipboard.writeText(url); this.toast('Link copied.'); }
      catch { input.focus(); input.select(); this.toast('Select the link and copy it.'); }
    };
  }

  private persist(): void {
    const c = this.champion;
    if (!c || !this.chosen) return;
    writeSave({ spec: this.chosen.spec, champion: c.genome, generations: c.gen, hidden: this.runner!.evo.shape.hidden });
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

  /** Two small secrets. */
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
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      typed = (typed + e.key.toLowerCase()).slice(-4);
      if (typed === 'sims') { const on = toggleBioluminescence(); this.toast(on ? 'Bioluminescence up. For Karl Sims, 1994.' : 'Bioluminescence down.'); }
    });
  }
}

