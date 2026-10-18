/**
 * The Lab: a drag-and-snap body builder.
 *
 * Tools:
 *   Joint  - click empty space to add a joint; drag a joint to move it
 *   Bone   - drag from one joint to another to join them rigidly
 *   Muscle - drag between two joints to add a muscle (it pulls them together/apart)
 *   Head   - click a joint to make it the head (which way is "forward")
 *   Erase  - click any part to remove it
 * Everything snaps to a 6-unit grid. "Test swim" drives the muscles with a
 * simple rhythm so you can see how the body moves before evolving a brain.
 */
import { ALL_BODIES, cloneSpec, CreatureSpec, LIMITS, Look, spawn, validateSpec } from '../sim/creature';
import { World } from '../sim/physics';
import { speciesName } from '../sim/names';
import { drawCreature } from '../render/creatureArt';
import { COLOR, CREATURE_COLORS, PATTERN_PAIRS, rgba } from './tokens';

type Tool = 'joint' | 'bone' | 'muscle' | 'head' | 'erase';
const GRID = 6;
const TOOL_HELP: Record<Tool, string> = {
  joint: 'Click empty space to add a joint. Drag a joint to move it.',
  bone: 'Drag from one joint to another (or click both) to join them with a rigid bone.',
  muscle: 'Drag between two joints (or click both) to add a muscle. Muscles should span a joint, like a real one.',
  head: 'Click the joint that should lead. The brain\'s sense of "forward" comes from here.',
  erase: 'Click a joint, bone or muscle to remove it.',
};

export class LabEditor {
  spec: CreatureSpec;
  private _tool: Tool = 'joint';
  get tool(): Tool { return this._tool; }
  /** Changing tool drops any half-finished link. */
  set tool(t: Tool) { this._tool = t; this.drag = null; }
  onChange: () => void = () => {};
  private undoStack: string[] = [];
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private scale = 1; private w = 0; private h = 0; private dpr = 1;
  private drag: { kind: 'move' | 'link'; joint: number; x: number; y: number } | null = null;
  private hover: { x: number; y: number } | null = null;
  private preview: { world: World; parts: number[]; muscles: number[]; t: number } | null = null;
  private raf = 0;
  private last = performance.now();
  nameSeed = 0;

  constructor(container: HTMLElement, start: CreatureSpec) {
    this.spec = cloneSpec(start);
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'lab-canvas';
    this.canvas.setAttribute('aria-label', 'Body editor');
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    this.canvas.addEventListener('pointerdown', this.down);
    this.canvas.addEventListener('pointermove', this.move);
    window.addEventListener('pointerup', this.up);
    window.addEventListener('keydown', this.key);
    new ResizeObserver(() => this.resize()).observe(this.canvas);
    this.resize();
    this.raf = requestAnimationFrame(this.frame);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('pointerup', this.up);
    window.removeEventListener('keydown', this.key);
  }

  /** Ctrl/Cmd+Z undoes; Escape stops a test swim. */
  private key = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); this.undo(); }
    if (e.key === 'Escape') this.stopTest();
  };

  get errors(): string[] { return validateSpec(this.spec); }
  /** A short message explaining why an edit didn't happen (shown instead of the tool help). */
  private notice = '';
  private noticeUntil = 0;
  get help(): string { return performance.now() < this.noticeUntil ? this.notice : TOOL_HELP[this.tool]; }
  private tell(msg: string): void {
    this.notice = msg; this.noticeUntil = performance.now() + 3500; this.onChange();
    setTimeout(() => this.onChange(), 3600);   // put the tool help back afterwards
  }
  get testing(): boolean { return !!this.preview; }

  // ------------------------------------------------------------- edits
  private commit(mutate: () => void): void {
    this.undoStack.push(JSON.stringify(this.spec));
    if (this.undoStack.length > 60) this.undoStack.shift();
    if (this.drag?.kind === 'link') this.drag = null;   // joint indices may be about to change
    mutate();
    this.spec.name = speciesName(this.spec, this.nameSeed);
    this.onChange();
  }
  undo(): void {
    const s = this.undoStack.pop();
    if (s) { this.drag = null; this.spec = JSON.parse(s); this.onChange(); }
  }
  get canUndo(): boolean { return this.undoStack.length > 0; }

  loadTemplate(t: CreatureSpec): void { this.stopTest(); this.commit(() => { this.spec = cloneSpec(t); }); this.spec.name = t.name; this.onChange(); }
  clear(): void {
    this.stopTest();
    this.commit(() => { this.spec = { ...this.spec, joints: [{ x: 0, y: 0, r: 9 }], bones: [], muscles: [], head: 0 }; });
  }
  setLook(patch: Partial<Look>): void {
    this.commit(() => {
      const look = { ...(this.spec.look ?? { body: 'verdigris', accent: 'bone2', pattern: 'plain', seed: 1 }), ...patch } as Look;
      if (patch.body) look.accent = PATTERN_PAIRS[look.body][0];
      this.spec.look = look;
    });
  }
  setSense(k: 'opponent' | 'edge' | 'touch', on: boolean): void {
    this.commit(() => { this.spec.senses = { opponent: true, edge: true, touch: true, ...this.spec.senses, [k]: on }; });
  }
  rerollName(): void { this.nameSeed++; this.spec.name = speciesName(this.spec, this.nameSeed); this.onChange(); }

  private addJoint(x: number, y: number): void {
    if (this.spec.joints.length >= LIMITS.maxJoints) { this.tell(`That's the limit: ${LIMITS.maxJoints} joints. Erase one to add another.`); return; }
    this.commit(() => { this.spec.joints.push({ x, y, r: 8 }); });
  }
  private link(a: number, b: number, kind: 'bone' | 'muscle'): void {
    if (a === b) return;
    const has = (list: { a: number; b: number }[]) => list.some((l) => (l.a === a && l.b === b) || (l.a === b && l.b === a));
    if (has(this.spec.bones) || has(this.spec.muscles)) { this.tell('Those two joints are already connected.'); return; }
    if (kind === 'bone' && this.spec.bones.length >= LIMITS.maxBones) { this.tell(`That's the limit: ${LIMITS.maxBones} bones.`); return; }
    if (kind === 'muscle' && this.spec.muscles.length >= LIMITS.maxMuscles) { this.tell(`That's the limit: ${LIMITS.maxMuscles} muscles.`); return; }
    this.commit(() => {
      if (kind === 'bone') this.spec.bones.push({ a, b });
      else this.spec.muscles.push({ a, b, strength: 0.8 });
    });
  }
  private eraseAt(x: number, y: number): void {
    const j = this.jointAt(x, y);
    if (j >= 0) {
      if (this.spec.joints.length <= 1) { this.tell('A body needs at least one joint. Use "Blank" to start over.'); return; }
      const wasHead = this.spec.head === j;
      this.commit(() => {
        const s = this.spec;
        const old = s.joints[j];
        const re = (i: number) => (i > j ? i - 1 : i);
        s.joints.splice(j, 1);
        s.bones = s.bones.filter((b) => b.a !== j && b.b !== j).map((b) => ({ a: re(b.a), b: re(b.b) }));
        s.muscles = s.muscles.filter((m) => m.a !== j && m.b !== j).map((m) => ({ ...m, a: re(m.a), b: re(m.b) }));
        if (wasHead) {
          // The head moves to the nearest remaining joint, so "forward" stays roughly where it was.
          let best = 0, bd = Infinity;
          s.joints.forEach((q, k) => { const d = Math.hypot(q.x - old.x, q.y - old.y); if (d < bd) { bd = d; best = k; } });
          s.head = best;
        } else s.head = re(s.head);
      });
      if (wasHead) this.tell('The head moved to the nearest joint. Use the Head tool to choose another.');
      return;
    }
    const m = this.segmentAt(this.spec.muscles, x, y);
    if (m >= 0) { this.commit(() => { this.spec.muscles.splice(m, 1); }); return; }
    const b = this.segmentAt(this.spec.bones, x, y);
    if (b >= 0) this.commit(() => { this.spec.bones.splice(b, 1); });
  }

  // ------------------------------------------------------------- test swim
  startTest(): void {
    if (this.errors.length) { this.tell(`Can't swim yet: ${this.errors[0]}`); return; }
    const world = new World();
    const c = spawn(world, this.spec, 0, 0, 0, 0, false);
    this.preview = { world, parts: c.particles, muscles: c.muscles, t: 0 };
    this.onChange();
  }
  stopTest(): void { if (this.preview) { this.preview = null; this.onChange(); } }

  // ------------------------------------------------------------- input
  private toWorld(e: PointerEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left - this.w / 2) / this.scale, y: (e.clientY - r.top - this.h / 2) / this.scale };
  }
  private snap(v: number): number { return Math.round(v / GRID) * GRID; }
  private jointAt(x: number, y: number): number {
    let best = -1, bd = Infinity;
    this.spec.joints.forEach((j, k) => { const d = Math.hypot(j.x - x, j.y - y); if (d < j.r + 6 / Math.min(1, this.scale) && d < bd) { bd = d; best = k; } });
    return best;
  }
  private segmentAt(list: { a: number; b: number }[], x: number, y: number): number {
    const J = this.spec.joints;
    for (let i = list.length - 1; i >= 0; i--) {
      const a = J[list[i].a], b = J[list[i].b];
      const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / L2));
      if (Math.hypot(a.x + t * dx - x, a.y + t * dy - y) < 6) return i;
    }
    return -1;
  }

  private down = (e: PointerEvent) => {
    if (this.preview) return;
    this.canvas.setPointerCapture(e.pointerId);
    const p = this.toWorld(e);
    const j = this.jointAt(p.x, p.y);
    switch (this.tool) {
      case 'joint':
        if (j >= 0) { this.undoStack.push(JSON.stringify(this.spec)); this.drag = { kind: 'move', joint: j, ...p }; }
        else if (Math.hypot(p.x, p.y) < LIMITS.radius) this.addJoint(this.snap(p.x), this.snap(p.y));
        else this.tell('Joints go inside the circle.');
        break;
      case 'bone': case 'muscle':
        // Second click of a click-click link: finish it on a joint, cancel anywhere else.
        if (this.drag?.kind === 'link') {
          const from = this.drag.joint; this.drag = null;
          if (j >= 0 && j !== from) this.link(from, j, this.tool);
          break;
        }
        if (j >= 0) this.drag = { kind: 'link', joint: j, ...p };
        break;
      case 'head':
        if (j >= 0) this.commit(() => { this.spec.head = j; });
        break;
      case 'erase': this.eraseAt(p.x, p.y); break;
    }
  };
  private move = (e: PointerEvent) => {
    const p = this.toWorld(e);
    this.hover = p;
    if (!this.drag) return;
    this.drag.x = p.x; this.drag.y = p.y;
    if (this.drag.kind === 'move') {
      const j = this.spec.joints[this.drag.joint];
      const r = Math.hypot(p.x, p.y), lim = LIMITS.radius;
      const k = r > lim ? lim / r : 1;
      j.x = this.snap(p.x * k); j.y = this.snap(p.y * k);
      this.spec.name = speciesName(this.spec, this.nameSeed);
      this.onChange();
    }
  };
  private up = (e: PointerEvent) => {
    const d = this.drag;
    if (!d) return;
    if (d.kind === 'link') {
      const p = this.toWorld(e);
      const j = this.jointAt(p.x, p.y);
      // Released on the joint it started from: that was a click, so keep the link pending
      // and let the next click choose the other end (drag OR click-click both work).
      if (j === d.joint) return;
      this.drag = null;
      if (j >= 0) this.link(d.joint, j, this.tool === 'muscle' ? 'muscle' : 'bone');
      return;
    }
    this.drag = null;
  };

  // ------------------------------------------------------------- drawing
  private resize(): void {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, devicePixelRatio || 1);
    this.w = r.width; this.h = r.height;
    this.canvas.width = Math.max(1, r.width * this.dpr); this.canvas.height = Math.max(1, r.height * this.dpr);
    this.scale = Math.min(this.w, this.h) / (LIMITS.radius * 2 + 30);
  }

  private frame = (now: number) => {
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    // Schedule the next frame FIRST, so one bad frame can never freeze the editor.
    this.raf = requestAnimationFrame(this.frame);
    try { this.draw(dt); }
    catch (e) { if (!this.drawFailed) { this.drawFailed = true; console.error('Lab draw failed', e); } }
  };
  private drawFailed = false;

  private draw(dt: number): void {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = COLOR.dish; g.fillRect(0, 0, this.w, this.h);
    g.translate(this.w / 2, this.h / 2); g.scale(this.scale, this.scale);
    const px = 1 / this.scale;
    // Build area and grid dots.
    g.strokeStyle = rgba(COLOR.bone, 0.1); g.lineWidth = px;
    g.beginPath(); g.arc(0, 0, LIMITS.radius, 0, Math.PI * 2); g.stroke();
    g.fillStyle = rgba(COLOR.bone, 0.07);
    for (let x = -LIMITS.radius; x <= LIMITS.radius; x += GRID * 4) for (let y = -LIMITS.radius; y <= LIMITS.radius; y += GRID * 4)
      if (x * x + y * y < LIMITS.radius * LIMITS.radius) { g.beginPath(); g.arc(x, y, 0.9 * px * 1.4, 0, Math.PI * 2); g.fill(); }

    const s = this.spec;
    if (this.preview) {
      // Test swim: alternate the muscles with a travelling rhythm and follow the body.
      const pv = this.preview;
      pv.t += dt;
      pv.muscles.forEach((m, i) => { pv.world.muscles[m].act = Math.sin(pv.t * 7 - i * 1.4); });
      pv.world.step(1 / 60, 4);
      const pts = pv.parts.map((i) => [pv.world.particles[i].x, pv.world.particles[i].y] as [number, number]);
      let cx = 0, cy = 0; for (const [x, y] of pts) { cx += x; cy += y; } cx /= pts.length; cy /= pts.length;
      g.save(); g.translate(-cx, -cy);
      drawCreature(g, s, { pts, time: pv.t, activity: 0.7 }, this.scale * this.dpr);
      g.restore();
      return;
    }

    const pts = s.joints.map((j) => [j.x, j.y] as [number, number]);
    if (s.joints.length >= 2) drawCreature(g, s, { pts, time: performance.now() / 1000, activity: 0.2 }, this.scale * this.dpr);
    // Skeleton overlay so you can see what you're editing.
    g.lineCap = 'round';
    g.strokeStyle = rgba(COLOR.bone, 0.75); g.lineWidth = 1.6 * px;
    for (const b of s.bones) { g.beginPath(); g.moveTo(pts[b.a][0], pts[b.a][1]); g.lineTo(pts[b.b][0], pts[b.b][1]); g.stroke(); }
    g.strokeStyle = rgba(COLOR.amber, 0.9); g.lineWidth = 1.4 * px; g.setLineDash([4 * px, 3 * px]);
    for (const m of s.muscles) { g.beginPath(); g.moveTo(pts[m.a][0], pts[m.a][1]); g.lineTo(pts[m.b][0], pts[m.b][1]); g.stroke(); }
    g.setLineDash([]);
    s.joints.forEach((j, k) => {
      g.fillStyle = rgba(COLOR.ink, 0.8); g.strokeStyle = k === s.head ? COLOR.amber : rgba(COLOR.bone, 0.85);
      g.lineWidth = (k === s.head ? 2 : 1.2) * px;
      g.beginPath(); g.arc(j.x, j.y, Math.max(3.5, j.r * 0.45), 0, Math.PI * 2); g.fill(); g.stroke();
    });
    if (this.drag?.kind === 'link') {
      const a = s.joints[this.drag.joint] ?? s.joints[0];
      g.strokeStyle = this.tool === 'muscle' ? COLOR.amber : COLOR.bone; g.lineWidth = 1.2 * px; g.setLineDash([3 * px, 3 * px]);
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(this.drag.x, this.drag.y); g.stroke(); g.setLineDash([]);
    }
    if (this.hover && this.tool === 'joint' && !this.drag && this.jointAt(this.hover.x, this.hover.y) < 0) {
      g.strokeStyle = rgba(COLOR.bone, 0.3); g.lineWidth = px;
      g.beginPath(); g.arc(this.snap(this.hover.x), this.snap(this.hover.y), 4, 0, Math.PI * 2); g.stroke();
    }
  }
}

/** The Lab screen's HTML; App wires the controls (see app.ts). */
export function labMarkup(): string {
  const tools: [Tool, string][] = [['joint', 'Joint'], ['bone', 'Bone'], ['muscle', 'Muscle'], ['head', 'Head'], ['erase', 'Erase']];
  return `
    <div class="lab pop">
      <section class="lab-stage frame">
        <div class="lab-tools" role="toolbar" aria-label="Tools">
          ${tools.map(([t, l]) => `<button class="tool" data-tool="${t}">${l}</button>`).join('')}
          <span class="divider"></span>
          <button class="btn-quiet" id="undo">Undo</button>
          <button class="btn-quiet" id="test">Test swim</button>
        </div>
        <div class="lab-canvas-wrap" id="labCanvas"></div>
        <p class="lab-help" id="help"></p>
      </section>
      <aside class="lab-side frame">
        <span class="eyebrow">The Lab</span>
        <h2 id="labName"></h2>
        <p class="fine" id="counts"></p>
        <div class="lab-block">
          <h3>Start from</h3>
          <div class="templates">${ALL_BODIES.map((b, i) => `<button class="btn-quiet tpl" data-i="${i}">${b.nick}</button>`).join('')}
            <button class="btn-quiet" id="clear">Blank</button></div>
        </div>
        <div class="lab-block">
          <h3>Senses</h3>
          <label class="sense"><input type="checkbox" data-sense="opponent"> <span><b>Opponent</b> where the other organism is</span></label>
          <label class="sense"><input type="checkbox" data-sense="edge"> <span><b>Edge</b> how close the rim is</span></label>
          <label class="sense"><input type="checkbox" data-sense="touch"> <span><b>Touch</b> contact with the other body</span></label>
        </div>
        <div class="lab-block">
          <h3>Pigment &amp; markings</h3>
          <div class="swatches">${CREATURE_COLORS.map((c) => `<button class="swatch" data-pigment="${c}" style="--sw:${COLOR[c]}" aria-label="${c}"></button>`).join('')}</div>
          <select id="pattern"><option value="plain">plain</option><option value="bands">bands</option><option value="speckles">speckles</option><option value="stripes">stripes</option><option value="gradient">gradient</option></select>
          <button class="btn-quiet" id="reroll">New name</button>
        </div>
        <ul class="lab-errors" id="errors"></ul>
        <button class="btn big" id="evolveBody">Evolve this body</button>
        <button class="btn-quiet back-link" id="labBack">Back to the specimens</button>
      </aside>
    </div>`;
}
