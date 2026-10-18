// Stage 2 proof: does evolution really make better fighters?
// Evolves a creature, then measures every generation's champion:
//   - win rate vs the generation-0 champion (head-to-head, both sides, fresh seeds)
//   - push-out rate vs Globby the dummy (fresh seeds)
// Writes docs/data/stage2-proof.json and docs/img/stage2-proof.svg.
// Usage: npx tsx scripts/proof.ts [body] [generations]
import { mkdirSync, writeFileSync } from 'node:fs';
import { ALL_BODIES, DUMMY } from '../src/sim/creature';
import { Evolution } from '../src/evo/ga';
import { allPairs, evaluate, headToHead } from '../src/evo/fitness';
import { trainingJob } from '../src/evo/schedule';
import { COLOR, FONT } from '../src/ui/tokens';

const body = ALL_BODIES.find((b) => b.nick?.toLowerCase() === (process.argv[2] ?? 'wriggle'))!;
const GENS = Number(process.argv[3] ?? 30);
const evo = new Evolution(body, undefined, 42);
const t0 = performance.now();
for (let g = 0; g < GENS; g++) {
  const job = trainingJob(evo);
  const s = evo.advance(evo.pop.map((x) => evaluate(job, x)));
  if (g % 5 === 0) console.log(`gen ${s.generation} best ${s.best.toFixed(2)} mean ${s.mean.toFixed(2)} (${((performance.now() - t0) / 1000).toFixed(0)}s)`);
}

const testSeeds = Array.from({ length: 20 }, (_, i) => 50000 + i); // never used in training
const g0 = evo.champions[0];
const rows = evo.champions.map((c, g) => ({
  generation: g,
  vsGen0: headToHead(body, evo.shape, c, g0, testSeeds),
  pushVsDummy: evaluate(allPairs(body, evo.shape, [{ kind: 'dummy', spec: DUMMY }], testSeeds), c).pushes / testSeeds.length,
}));
console.table(rows.filter((r) => r.generation % 3 === 0 || r.generation === GENS - 1));

mkdirSync('docs/data', { recursive: true });
writeFileSync('docs/data/stage2-proof.json', JSON.stringify({ body: body.nick, generations: GENS, testSeeds: testSeeds.length, rows }, null, 1));
writeFileSync('docs/img/stage2-proof.svg', chart(rows));
console.log('wrote docs/data/stage2-proof.json and docs/img/stage2-proof.svg');

function chart(rows: { generation: number; vsGen0: number; pushVsDummy: number }[]): string {
  const W = 760, H = 380, L = 64, R = 170, T = 64, B = 52;
  const x = (g: number) => L + (g / (rows.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - v) * (H - T - B);
  const path = (k: 'vsGen0' | 'pushVsDummy') => rows.map((r, i) => `${i ? 'L' : 'M'}${x(r.generation).toFixed(1)},${y(r[k]).toFixed(1)}`).join(' ');
  const last = rows[rows.length - 1];
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const gTicks = rows.filter((r) => r.generation % 5 === 0 || r.generation === rows.length - 1).map((r) => r.generation);
  const font = FONT.ui.replace(/"/g, "'");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t d">
<title id="t">Evolution works: ${body.nick}'s champions get better every generation</title>
<desc id="d">Line chart. Win rate of each generation's champion against the generation-0 champion rises from 50% to ${Math.round(last.vsGen0 * 100)}%. Push-out rate against the dummy rises to ${Math.round(last.pushVsDummy * 100)}%. Measured on ${testSeeds.length} fresh seeds never used in training.</desc>
<rect width="${W}" height="${H}" rx="22" fill="${COLOR.dusk}"/>
<text x="${L}" y="30" fill="${COLOR.cream}" font-family="${font}" font-size="18" font-weight="700">Does evolution work? ${body.nick}, ${rows.length} generations</text>
<text x="${L}" y="50" fill="${COLOR.inkFaint}" font-family="${font}" font-size="13">measured on ${testSeeds.length} fresh seeds never used in training · each seed played from both sides</text>
${ticks.map((t) => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="${COLOR.line}" stroke-opacity="${t === 0.5 ? 0.9 : 0.35}" stroke-width="1" ${t === 0.5 ? 'stroke-dasharray="5 5"' : ''}/>
<text x="${L - 10}" y="${y(t) + 4}" text-anchor="end" fill="${COLOR.inkFaint}" font-family="${font}" font-size="12">${t * 100}%</text>`).join('\n')}
<text x="${W - R - 4}" y="${y(0.5) - 6}" text-anchor="end" fill="${COLOR.inkFaint}" font-family="${font}" font-size="11">50% = no better than generation 0</text>
${gTicks.map((g) => `<text x="${x(g)}" y="${H - B + 20}" text-anchor="middle" fill="${COLOR.inkFaint}" font-family="${font}" font-size="12">${g}</text>`).join('\n')}
<text x="${(L + W - R) / 2}" y="${H - 12}" text-anchor="middle" fill="${COLOR.inkSoft}" font-family="${font}" font-size="13">generation</text>
<path d="${path('pushVsDummy')}" fill="none" stroke="${COLOR.lavender}" stroke-width="2" stroke-linejoin="round"/>
<path d="${path('vsGen0')}" fill="none" stroke="${COLOR.mint}" stroke-width="2.5" stroke-linejoin="round"/>
${rows.map((r) => `<circle cx="${x(r.generation)}" cy="${y(r.vsGen0)}" r="4" fill="${COLOR.mint}" stroke="${COLOR.dusk}" stroke-width="2"><title>gen ${r.generation}: beats gen 0 ${Math.round(r.vsGen0 * 100)}% · pushes Globby out ${Math.round(r.pushVsDummy * 100)}%</title></circle>`).join('\n')}
<text x="${x(last.generation) + 10}" y="${y(last.vsGen0) + 4}" fill="${COLOR.cream}" font-family="${font}" font-size="13" font-weight="700">beats gen-0 champ</text>
<text x="${x(last.generation) + 10}" y="${y(last.vsGen0) + 20}" fill="${COLOR.inkSoft}" font-family="${font}" font-size="12">${Math.round(last.vsGen0 * 100)}% of fights</text>
<text x="${x(last.generation) + 10}" y="${y(last.pushVsDummy) + 4}" fill="${COLOR.cream}" font-family="${font}" font-size="13" font-weight="700">pushes Globby out</text>
<text x="${x(last.generation) + 10}" y="${y(last.pushVsDummy) + 20}" fill="${COLOR.inkSoft}" font-family="${font}" font-size="12">${Math.round(last.pushVsDummy * 100)}% of fights</text>
</svg>`;
}
