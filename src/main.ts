/**
 * Browser entry point. Applies the design tokens, loads fonts, starts the app.
 * With ?manual in the URL the game loop doesn't run by itself; automated
 * tests call window.petri.advance(dt) to step it deterministically.
 */
import './ui/base.css';
import './ui/app.css';
import { applyTokens, loadFonts } from './ui/tokens';
import { App } from './ui/app';

applyTokens();
loadFonts();
const manual = new URLSearchParams(location.search).has('manual');
const app = new App(document.getElementById('app')!, manual);
(window as unknown as { petri: unknown }).petri = {
  app,
  get match() { return app.match; },
  advance: (dt: number) => app.advance(dt),
};
