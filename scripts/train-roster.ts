// Offline training for the built-in champion roster.
// Usage: npx tsx scripts/train-roster.ts <nick> [generations] [popSize]
// Writes docs/data/roster/<nick>.json. Run several in parallel (one per core).
import { mkdirSync, writeFileSync } from 'node:fs';
import { ALL_BODIES, DUMMY } from '../src/sim/creature';
import { DEFAULT_CONFIG, Evolution } from '../src/evo/ga';
import { allPairs, evaluate, headToHead } from '../src/evo/fitness';
import { trainingJob } from '../src/evo/schedule';

const nick = process.argv[2];
const GENS = Number(process.argv[3] ?? 70);
const POP = Number(process.argv[4] ?? 64);
const body = ALL_BODIES.find((b) => b.nick === nick);
if (!body) throw new Error(`no body named ${nick}`);
const SEED = Number(process.env.SEED ?? 777);
const evo = new Evolution(body, { ...DEFAULT_CONFIG, popSize: POP }, SEED);
const t0 = Date.now();
for (let g = 0; g < GENS; g++) {
  const job = trainingJob(evo);
  const s = evo.advance(evo.pop.map((x) => evaluate(job, x)));
  if (g % 10 === 0) console.log(`${nick} gen ${g} best ${s.best.toFixed(2)} mean ${s.mean.toFixed(2)} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
// The last champion is the luckiest of its generation, not necessarily the best.
// Pick, among the last 20 champions, the one that does best on fresh seeds: real
// push-outs against the Buoy count double (the roster doubles as "how it's done"),
// plus how it fares against the other candidates.
const seeds = Array.from({ length: 10 }, (_, i) => 90000 + i);
const cands = evo.champions.slice(-20);
const scored = cands.map((c) => {
  const vsBuoy = evaluate(allPairs(body, evo.shape, [{ kind: 'dummy', spec: DUMMY }], seeds), c);
  const vsPeers = cands.reduce((s, o) => s + (o === c ? 0.5 : headToHead(body, evo.shape, c, o, seeds.slice(0, 4))), 0) / cands.length;
  return { c, score: 2 * vsBuoy.pushes / seeds.length + vsPeers, pushes: vsBuoy.pushes, wins: vsBuoy.wins, vsPeers };
}).sort((a, b) => b.score - a.score);
const best = scored[0];
mkdirSync('docs/data/roster', { recursive: true });
writeFileSync(`docs/data/roster/${nick}.json`, JSON.stringify({
  nick, generations: GENS, popSize: POP, hidden: evo.shape.hidden,
  vsBuoy: { pushes: best.pushes, wins: best.wins, of: seeds.length }, vsPeers: +best.vsPeers.toFixed(3),
  genome: best.c.map((w) => +w.toFixed(5)),
}));
console.log(`${nick} done in ${((Date.now() - t0) / 1000).toFixed(0)}s: pushes Buoy ${best.pushes}/10, wins ${best.wins}/10, vs peers ${best.vsPeers.toFixed(2)}`);
