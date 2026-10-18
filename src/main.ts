/**
 * Browser entry point. Applies the design tokens, loads fonts, starts the app.
 * With ?manual in the URL the game loop doesn't run by itself; automated
 * tests call window.petri.advance(dt) to step it deterministically.
 */
import './ui/base.css';
import './ui/app.css';
import { applyTokens, loadFonts } from './ui/tokens';
import { App } from './ui/app';
import { Match } from './sim/match';
import { CRAB, DUMMY } from './sim/creature';
import { DummyController, PusherController } from './sim/controllers';

applyTokens();
loadFonts();
const manual = new URLSearchParams(location.search).has('manual');
const app = new App(document.getElementById('app')!, manual);
(window as unknown as { petri: unknown }).petri = {
  app,
  get match() { return app.match; },
  advance: (dt: number) => app.advance(dt),
  // For the cross-engine determinism check (scripts/e2e.mjs): the same match as tests/match.test.ts.
  goldenMatch: () => new Match(CRAB, DUMMY, [new PusherController(), new DummyController()], 1),
};
