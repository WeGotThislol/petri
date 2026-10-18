// Headless evolution run: `npx tsx scripts/evolve.ts [body] [generations]`
import { ALL_BODIES, DUMMY } from '../src/sim/creature';
import { Evolution } from '../src/evo/ga';
import { allPairs, evaluate } from '../src/evo/fitness';
import { trainingJob } from '../src/evo/schedule';

const body = ALL_BODIES.find((b) => b.nick?.toLowerCase() === (process.argv[2] ?? 'bloop'))!;
const gens = Number(process.argv[3] ?? 15);
const evo = new Evolution(body);
const t0 = performance.now();
for (let g = 0; g < gens; g++) {
  const job = trainingJob(evo);
  const res = evo.pop.map((gen) => evaluate(job, gen));
  const s = evo.advance(res);
  const fl = res.reduce((a, r) => a + r.flags.idle + r.flags.camping + r.flags.exploit, 0);
  console.log(`flags ${fl} gen ${s.generation} best ${s.best.toFixed(3)} mean ${s.mean.toFixed(3)} wins ${s.bestWins}/${s.bestGames} pushes ${s.bestPushes}  ${((performance.now() - t0) / 1000).toFixed(1)}s`);
}
// Test the final champion on 20 fresh seeds.
const champ = evo.champions[evo.champions.length - 1];
const test = evaluate(allPairs(body, evo.shape, [{ kind: 'dummy', spec: DUMMY }], Array.from({ length: 20 }, (_, i) => 1000 + i)), champ);
console.log(`champion vs dummy on 20 new seeds: ${test.wins}/20 wins, ${test.pushes}/20 real push-outs`);
