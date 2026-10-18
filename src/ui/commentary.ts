/**
 * Plain-language commentary for the evolution screen. Short, warm, first
 * person, and based on what actually happened in this generation.
 */
import type { GenReport } from '../evo/runner';

export interface Line { text: string; tip?: { word: string; meaning: string } }

const SHRUGS = [
  'tiny improvements. That is honestly how evolution usually goes.',
  'the dice got rolled again. Some babies are worse, a few are better.',
  'the best brains are getting a little bit pushier.',
  'still tinkering. Nobody planned any of this, by the way.',
];

/** Picks a line for generation report `r`, given everything before it. */
export function commentFor(r: GenReport, history: GenReport[], nick: string): Line {
  const g = r.generation + 1; // people count from 1
  const prev = history[history.length - 2];
  const firstPushGen = history.findIndex((h) => h.pushers > 0);
  if (g === 1) {
    return {
      text: `Generation 1: totally random brains. Lots of flailing. That's normal, babies are bad at everything.`,
      tip: { word: 'generation', meaning: 'one round of: test every brain, keep the best, let them have babies.' },
    };
  }
  if (r.pushers > 0 && firstPushGen === history.length - 1) {
    return {
      text: `Generation ${g}: one of them pushed Globby out! Somebody frame this. Its babies get extra copies.`,
      tip: { word: 'selection', meaning: 'better fighters are more likely to become parents. That\'s the whole trick.' },
    };
  }
  if (prev && r.best > prev.best + 0.08) {
    return {
      text: `Generation ${g}: big jump! A lucky mutation made someone noticeably better.`,
      tip: { word: 'mutation', meaning: 'a small random change to a baby\'s brain wiring. Usually useless, sometimes brilliant.' },
    };
  }
  if (r.pushers >= r.popSize * 0.5) {
    return { text: `Generation ${g}: ${r.pushers} of ${r.popSize} can push Globby out now. I think ${nick} is ready. Your call!` };
  }
  const recent = history.slice(-4);
  if (recent.length === 4 && Math.max(...recent.map((h) => h.best)) - Math.min(...recent.map((h) => h.best)) < 0.02) {
    return {
      text: `Generation ${g}: a little plateau. It's not stuck, it's rummaging around for the next idea.`,
      tip: { word: 'fitness', meaning: 'the score each brain earns in its test fights. Higher = better fighter.' },
    };
  }
  if (g === 2) return { text: `Generation 2: still flailing, which is completely normal for generation 2.` };
  return { text: `Generation ${g}: ${SHRUGS[g % SHRUGS.length]}` };
}

/** Is the champion good enough to send into a real fight? */
export function isReady(history: GenReport[]): boolean {
  const last = history[history.length - 1];
  if (!last) return false;
  // Enough of the population can push (not just one lucky brain), or we've waited long enough.
  return (history.length >= 5 && last.pushers >= last.popSize * 0.25) || history.length >= 14;
}

export const LOADING_LINES = [
  'Spawning baby brains…',
  'Untangling neurons…',
  'Filling the dish with lukewarm water…',
  'Explaining the rules to the creatures (they did not listen)…',
];
