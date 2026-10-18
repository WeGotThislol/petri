# Changelog

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
