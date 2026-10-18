# Changelog

## Stage 0 — plan & scaffold
- `docs/PLAN.md`: architecture, tech choices (custom deterministic physics instead of Rapier/Matter, and why), risks.
- Vite + TypeScript scaffold, Vitest, Playwright screenshot script (uses the preinstalled Chromium).
- Seeded PRNG `src/sim/rng.ts` with tests (determinism, distribution).
- GitHub Pages deploy workflow (`.github/workflows/deploy.yml`).
- Static design mockup of the main screen: `public/mockup.html` (desktop + phone layout).
- `docs/LEARN.md` started.
