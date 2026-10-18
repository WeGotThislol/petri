// Quick headless probe: run matches and print outcomes. `npx tsx scripts/probe.ts`
import { CRAB, DUMMY } from '../src/sim/creature';
import { Match } from '../src/sim/match';
import { PusherController, DummyController } from '../src/sim/controllers';

let wins = 0; const N = Number(process.argv[2] ?? 20);
const t0 = performance.now(); let ticks = 0;
for (let seed = 1; seed <= N; seed++) {
  const m = new Match(CRAB, DUMMY, [new PusherController(), new DummyController()], seed);
  const traj: string[] = [];
  while (!m.result) { m.step(); if (m.tick % 40 === 0 && seed === 1) { const a = m.com(0), b = m.com(1); traj.push(`${m.time.toFixed(0)}s A(${a.x.toFixed(0)},${a.y.toFixed(0)}) B(${b.x.toFixed(0)},${b.y.toFixed(0)})`); } }
  ticks += m.tick;
  if (seed === 1) console.log(traj.join('\n'));
  if (m.result.winner === 0) wins++;
  console.log(seed, JSON.stringify(m.result), m.world.speedCapHits);
}
const dt = (performance.now() - t0) / 1000;
console.log(`pusher wins ${wins}/${N}; ${(ticks / dt).toFixed(0)} ticks/s`);
