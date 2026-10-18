# PETRI — Plan

Design a micro-creature, evolve its brain, push rivals out of the dish.

## Concept in one line
Top-down view through a microscope at a petri dish. Creatures are
translucent micro-organisms made of bones, joints and muscles. They *swim*
(no gravity — it's a dish seen from above), and the sumo rule is simple:
**leave the dish rim and you lose.**

## Architecture

```
src/
  sim/        pure, deterministic simulation — no DOM, runs in Node, Worker, browser
    rng.ts      seeded PRNG (Mulberry32)
    physics.ts  Verlet particles + rigid bones + muscle actuators + collisions
    creature.ts creature genome (body) -> physics bodies
    brain.ts    neural network (fixed MLP first, NEAT-style later)
    match.ts    one sumo match: step(), shrinking ring, win/lose, events
  evo/        genetic algorithm: population, selection, crossover, mutation,
              hall of fame, fitness shaping (anti-cheat)
  workers/    Web Worker that runs batches of matches; a pool spreads load
  render/     Canvas2D renderer, trails, particles, screen-shake (reads sim state only)
  ui/         screens: Lab (builder), Evolve, Fight, Notebook panel
  share/      binary packing + base64url for links; replay clip export
  audio/      WebAudio synthesized sounds
tests/        vitest unit tests (headless sim, determinism, evolution proof)
scripts/      Node scripts: screenshots (Playwright), offline roster training
```

The golden rule: **`sim/` never imports from `render/` or `ui/`.** The
renderer only *reads* sim state, so the same match code runs headless at
thousands of steps/second in a worker, or at 60 fps on screen.

A replay = `{creatureA, creatureB, seed}`. Re-running the sim reproduces it.

## Tech choices (and the one deviation)

| Need | Choice | Why |
|---|---|---|
| Language/build | TypeScript + Vite | Fast dev server, built-in Worker bundling, static output for GitHub Pages |
| Physics | **Custom Verlet/position-based physics** (≈300 lines) instead of Rapier/Matter | See below |
| Rendering | Canvas2D | Enough for ~30 glowing parts + particles; no 400 KB WebGL dependency. Glow via pre-rendered sprites + `lighter` blending |
| Neural net + GA | Hand-written, no libraries | Required; also the learning goal |
| Tests | Vitest (unit) + Playwright w/ preinstalled Chromium (screenshots, smoke) | |
| Share links | Quantized int8 weights → bytes → base64url | ~300–500 chars |
| Clip export | `canvas.captureStream()` + `MediaRecorder` (WebM; MP4 where supported) | No server needed |
| Fonts | Instrument Serif (italic labels) + IBM Plex Mono (data) | Specimen-label feel |

**Why custom physics instead of Rapier or Matter.js?**
1. *Cross-browser determinism.* Share links and replays are opened on other
   people's machines. Matter.js uses `Math.sin/cos/atan2`, whose last bits are
   not guaranteed identical across JS engines, so a fight can diverge.
   Rapier has a deterministic build, but its WASM blob (~1.4 MB) is slow to
   start in every worker and overkill for 6–12 parts.
2. Our sim uses only `+ − × ÷ √`, which IEEE-754 guarantees bit-identical
   everywhere. Activation functions are rational (`x / (1+|x|)`), not `tanh`.
3. *Speed.* Tiny creatures, no broadphase needed → 10–50k sim steps/s per core.
4. *Fit.* Micro-organisms in fluid: anisotropic drag on bones (moving
   sideways is harder than lengthwise) gives real swimming — the same trick
   real cilia and eels exploit.

## Simulation model
- **Joint** = point mass. **Bone** = rigid distance constraint between two joints.
- **Muscle** = actuated spring between two joints; the brain sets its target
  length (contract/extend) every tick, scaled by its *strength*.
- **Fluid drag**: per-bone, stronger perpendicular than parallel → thrust.
- **Collisions**: joint-vs-bone capsules between creatures; impulse size feeds
  juice (hit-stop/shake) and touch sensors.
- **Senses** (brain inputs): distance to rim, opponent direction (rotated into
  body frame, as a 2-vector — no trig), opponent distance, touch, own
  muscle lengths, a clock oscillator.
- Fixed tick of 1/40 simulated s (shown at 60 ticks/s, so game time runs 1.5× real), 4 substeps. Matches capped at 30 s; the ring starts
  shrinking at 15 s (sudden death) so every match ends.

## Evolution
- Body is fixed per run (designed in the Lab); **brains** evolve.
- Population ~100, tournament selection, elitism (top 5 survive unchanged),
  uniform crossover, Gaussian mutation with a player-controlled strength.
- **Self-play vs hall of fame:** each individual fights the current
  sparring partner + random past champions → no rock-paper-scissors cycling.
- **Anti-cheat fitness shaping:** win/lose dominates; small bonus for
  pushing the opponent outward; penalties for standing still (zero
  displacement), camping at the centre without contact, and
  physics exploits (any joint speed above a sanity cap = disqualified).
  When a loophole appears anyway, the Notebook turns it into the
  "reward hacking" lesson.
- Later (Stage 6, optional): NEAT-style add-node/add-connection mutations.

## Stages
0 plan + scaffold + deploy + mockup · 1 physics + creature vs dummy, headless
tests · 2 evolution engine + proof chart · 3 Lab builder + fight flow +
Evolve screen · 4 share links, clips, champion roster · 5 polish, brain
visualiser, Notebook, sound, README · 6 extras on request.

## Risks (and what I'll do about them)
1. **Evolution finds nothing interesting** (creatures twitch in place).
   → Start with a good default body; shaping bonuses for pushing; prove with
   a win-rate test in Stage 2 before building UI on top.
2. **Physics explodes** with stiff muscles. → Position-based constraints,
   clamped muscle force, speed sanity cap, substeps; fuzz tests on random bodies.
3. **Training too slow in the browser.** → Worker pool (`navigator.hardwareConcurrency`),
   short matches, early termination when someone exits the ring.
4. **Share URL too long.** → int8 quantization; cap hidden layer size;
   measure in a test (target < 600 chars).
5. **Clip export browser support** (Safari MediaRecorder quirks). → WebM
   first, MP4 fallback, graceful "not supported" message.
6. **"Fun" is unknowable to me.** → Get to a playable fight loop by Stage 3
   and let you judge; keep stages small.
7. **GitHub Pages**: needs Settings → Pages → Source = "GitHub Actions" (one click, by you).
