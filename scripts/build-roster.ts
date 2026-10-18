// Builds src/data/roster.json from docs/data/roster/*.json (made by train-roster.ts).
// Measures each champion (vs the Buoy, and a round robin vs each other) and writes a
// short personality line derived from those measurements: nothing is invented.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { ALL_BODIES, DUMMY } from '../src/sim/creature';
import { Match, TICK } from '../src/sim/match';
import { Brain } from '../src/sim/brain';
import { DummyController } from '../src/sim/controllers';
import { shapeFor } from '../src/evo/ga';
import { isPush } from '../src/evo/fitness';

interface Raw { nick: string; generations: number; hidden: number; genome: number[] }
const raws: Raw[] = readdirSync('docs/data/roster').filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(`docs/data/roster/${f}`, 'utf8')));
const entries = raws.map((r) => {
  const spec = ALL_BODIES.find((b) => b.nick === r.nick)!;
  return { ...r, spec, shape: shapeFor(spec, r.hidden) };
});
type E = (typeof entries)[number];
const seeds = Array.from({ length: 10 }, (_, i) => 123000 + i);

function vsBuoy(e: E) {
  let wins = 0, pushes = 0, t = 0;
  for (const s of seeds) {
    const m = new Match(e.spec, DUMMY, [new Brain(e.shape, e.genome), new DummyController()], s);
    const r = m.run();
    if (r.winner === 0) { wins++; t += r.time; if (isPush(m)) pushes++; }
  }
  return { wins, pushes, avgWinTime: wins ? t / wins : 0 };
}
function duel(a: E, b: E): number {
  let score = 0;
  for (const s of seeds.slice(0, 6)) {
    const r1 = new Match(a.spec, b.spec, [new Brain(a.shape, a.genome), new Brain(b.shape, b.genome)], s).run();
    const r2 = new Match(b.spec, a.spec, [new Brain(b.shape, b.genome), new Brain(a.shape, a.genome)], s).run();
    score += (r1.winner === 0 ? 1 : r1.winner === -1 ? 0.5 : 0) + (r2.winner === 1 ? 1 : r2.winner === -1 ? 0.5 : 0);
  }
  return score / 12;
}

const stats = entries.map((e) => ({ e, buoy: vsBuoy(e), rr: entries.filter((o) => o !== e).reduce((s, o) => s + duel(e, o), 0) / Math.max(1, entries.length - 1) }));
stats.sort((a, b) => b.rr - a.rr);
const out = stats.map((s, rank) => {
  const lines: string[] = [];
  const t = s.buoy.avgWinTime;
  if (rank === 0) lines.push(`The strongest in the roster: wins ${Math.round(s.rr * 100)}% of its bouts against the others.`);
  else if (rank === stats.length - 1) lines.push(`Wins only ${Math.round(s.rr * 100)}% against the rest of the roster. Underestimated, or correctly estimated.`);
  else lines.push(`Wins ${Math.round(s.rr * 100)}% of its bouts against the rest of the roster.`);
  if (s.buoy.pushes >= 7 && t < 9) lines.push(`Clears the Buoy in ${t.toFixed(1)} s on average. Does not wait to be introduced.`);
  else if (s.buoy.pushes >= 5) lines.push(`Pushes the Buoy out ${s.buoy.pushes} times in 10, in ${t.toFixed(1)} s on average.`);
  else if (s.buoy.wins >= 7) lines.push('Rarely bothers pushing. It holds the middle and lets the rim do the work.');
  else lines.push(`Struggles with the Buoy (${s.buoy.wins} wins in 10). Its talents lie elsewhere.`);
  return {
    nick: s.e.nick, rank: rank + 1, generations: s.e.generations, hidden: s.e.hidden, genome: s.e.genome,
    vsBuoy: s.buoy, vsRoster: +s.rr.toFixed(3), blurb: lines.join(' '),
  };
});
writeFileSync('src/data/roster.json', JSON.stringify(out));
for (const o of out) console.log(`#${o.rank} ${o.nick.padEnd(8)} roster ${(o.vsRoster * 100).toFixed(0)}%  buoy ${o.vsBuoy.wins}/10 (${o.vsBuoy.pushes} pushes, ${o.vsBuoy.avgWinTime.toFixed(1)}s)  ${o.blurb}`);
void TICK;
