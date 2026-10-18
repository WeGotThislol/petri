# Changelog

## Stage 2: evolution engine, anti-cheat, proof
- Self-play vs a hall of fame (`src/evo/schedule.ts`): each brain fights Globby ×2, the latest champion, and one random older champion; fresh seeds every generation.
- Anti-cheat in fitness: `exploit` (speed-cap abuse → 0), `idle` (−0.2), `camping` (−0.2), plus push-out vs rim-survival scoring. Flags reported per generation; commentary introduces "reward hacking".
- Proof: `scripts/proof.ts` → `docs/img/stage2-proof.svg` + `docs/data/stage2-proof.json`. Wriggle, 30 gens, 20 fresh seeds: champions beat gen 0 in 100% of fights from gen 1; push-outs vs Globby 0% → 35% (gen 9+).
- `tests/evolution.test.ts`: brain, GA reproducibility, elitism, schedule, idle flag, and the proof test (gen 7 beats gen 0: 100%).
- Collision broadphase: ~2.5× faster training, bit-identical results.
- `headToHead()` for fair A-vs-B win rates (both sides).

## Design pass: warm, handmade, obvious from the first minute
- New design language (`docs/DESIGN.md`). **All colours, fonts, spacing, radii, shadows and easing live in one file: `src/ui/tokens.ts`**, shared by CSS (custom properties) and canvas.
- Dusky plum palette with peach/coral/butter/mint/lavender/sky; Fraunces + Nunito + Caveat (+ mono for tiny numbers); hand-cut frames, stickers, paper grain, squishy buttons.
- Creatures redrawn as soft blobs over the physics skeleton (`src/render/creatureArt.ts`): one continuous outline, palette-only colours and patterns from "look" genes, upright faces with eyes that track the opponent, blinking, five moods (idle, push, happy, scared, dizzy), squash-and-stretch, soft shadow, dust puffs, confetti.
- Eight bodies (`ALL_BODIES`): Bloop (crab), Wriggle (tadpole), Hop (paddler), Whirl (spinner), Globby (dummy), Snip, Puff, Longboi (snake). Creature sheet page: `/creatures.html`.
- Guided first run: home (live fight + one button + maker's note) → pick a starter → one big Evolve button with live commentary, jargon tips, fitness graph and population dots → Fight → result. Tinker drawer (mutation strength, population, watch speed, undo) appears after the first fight.
- A minimal real evolution engine was needed for that flow, so it landed here: neural-net brain (`src/sim/brain.ts`), genetic algorithm (`src/evo/ga.ts`), fitness (`src/evo/fitness.ts`), Web Worker pool (`src/evo/pool.ts`).
- Gameplay tuning found while doing this: smaller dish (r=230), closer start, Globby now sits still (its old wiggle made it drift out on its own, so random brains "won" for free), and a win only counts as a real push if the loser left within 1.5 s of contact.
- New redesigned mockup: `/mockup.html`. Easter eggs: click the logo 5 times; type "blob".
- `scripts/first-run.mjs`: Playwright "first-time visitor" test with screenshots. Desktop: first fight at 16.6 s; phone: 14.2 s; production build: 19.3 s.

## Stage 1: physics ring, hand-built creature vs scripted dummy
- Custom deterministic PBD physics (`src/sim/physics.ts`): rigid bones, force-capped muscles, anisotropic fluid drag (swimming), joint/bone collisions, speed cap.
- Creature data model + spawn with trig-free rotation (`src/sim/creature.ts`); hand-built *Brachiopus vorax* and the dummy *Globulus inertis*.
- Sumo match (`src/sim/match.ts`): ring-out by centre of mass, sudden-death shrinking rim from 15 s, timeout at 30 s; 12 base sensors + muscle proprioception.
- Scripted controllers (`src/sim/controllers.ts`). The pusher wins 20/20 seeds against the dummy.
- Canvas renderer: darkfield dish, glowing creatures, trails, specimen labels, scale bar, contact sparks, KO burst, screen-shake, hit-stop. Phone layout.
- The game starts fighting immediately on page load and loops with new seeds.
- Tests: 10 new (determinism, golden fingerprint, stability, swimming, rules, pusher win-rate). `npm run e2e` verifies browser == Node simulation.
- GitHub Pages now deploys from the default branch `claude/epic-carson-walyhr`.

## Stage 0 — plan & scaffold
- `docs/PLAN.md`: architecture, tech choices (custom deterministic physics instead of Rapier/Matter, and why), risks.
- Vite + TypeScript scaffold, Vitest, Playwright screenshot script (uses the preinstalled Chromium).
- Seeded PRNG `src/sim/rng.ts` with tests (determinism, distribution).
- GitHub Pages deploy workflow (`.github/workflows/deploy.yml`).
- Static design mockup of the main screen: `public/mockup.html` (desktop + phone layout).
- `docs/LEARN.md` started.
