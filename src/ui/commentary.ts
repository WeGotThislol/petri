/**
 * Plain-language commentary for the evolution screen. Short, warm, first
 * person, and based on what actually happened in this generation.
 */
import type { GenReport } from '../evo/runner';

export interface Line { text: string; tip?: { word: string; meaning: string } }

const SHRUGS = [
  'small gains. This is what most of evolution looks like up close.',
  'mostly worse offspring, a few slightly better ones. That turns out to be enough.',
  'nothing dramatic. The population is drifting, slowly, toward pushier.',
  'still searching. No one designed any of this, for the record.',
];

/** Picks a line for generation report `r`, given everything before it. */
export function commentFor(r: GenReport, history: GenReport[], nick: string): Line {
  const g = r.generation + 1; // people count from 1
  const prev = history[history.length - 2];
  const firstPushGen = history.findIndex((h) => h.pushers > 0);
  if (g === 1) {
    return {
      text: `Generation 1. ${r.popSize} random nervous systems. Most are discovering that they have muscles.`,
      tip: { word: 'Generation', meaning: 'one round of testing every variant, keeping the best, and breeding the next set from them.' },
    };
  }
  if (r.pushers > 0 && firstPushGen === history.length - 1) {
    return {
      text: `Generation ${g}. One of them pushed an opponent out of the ring. Its offspring will be over-represented.`,
      tip: { word: 'Selection', meaning: 'better fighters are more likely to become parents. That is the entire mechanism.' },
    };
  }
  const lazy = r.flags.idle + r.flags.camping;
  if (lazy > r.popSize * 1.5 && !history.slice(0, -1).some((h) => h.flags.idle + h.flags.camping > h.popSize * 1.5)) {
    return {
      text: `Generation ${g}. A popular strategy: do nothing and let the shrinking rim deal with the opponent. Points deducted.`,
      tip: { word: 'Reward hacking', meaning: 'when a learner exploits a loophole in the score instead of doing what was intended. Common, and instructive.' },
    };
  }
  if (prev && r.best > prev.best + 0.08) {
    return {
      text: `Generation ${g}. A sharp improvement: one mutation that happened to matter.`,
      tip: { word: 'Mutation', meaning: 'a small random change to an offspring\'s wiring. Usually neutral or harmful; occasionally the whole story.' },
    };
  }
  if (r.pushers >= r.popSize * 0.5) {
    return { text: `Generation ${g}. ${r.pushers} of ${r.popSize} variants can now clear an opponent from the ring. ${nick} is ready when you are.` };
  }
  const recent = history.slice(-4);
  if (recent.length === 4 && Math.max(...recent.map((h) => h.best)) - Math.min(...recent.map((h) => h.best)) < 0.02) {
    return {
      text: `Generation ${g}. A plateau. Not stuck; searching.`,
      tip: { word: 'Fitness', meaning: 'the score each variant earns in its test fights. Selection only ever sees this number.' },
    };
  }
  if (g === 2) return { text: `Generation 2. Still flailing, which is exactly what generation 2 is for.` };
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
  'Wiring forty-eight nervous systems at random…',
  'Filling the dish…',
  'Explaining the rules. They will not be listening.',
];
