# Growing Petri beyond sumo: ideas

Today Petri is one game (sumo) built on a general engine: **a body made of joints,
bones and muscles + a small brain + deterministic physics + evolution + share codes**.
Almost everything below reuses that engine; most of the work is a new *environment*
(rules + fitness) and a screen. Ranked by impact for effort.

## The one structural change that unlocks most of this
**Make "the task" a plug-in.** Today `match.ts` hard-codes sumo, and `fitness.ts` hard-codes
how sumo is scored. Split them into an `Environment` interface:
`setup(world, creatures, seed)`, `sense(i) → inputs`, `step()`, `outcome()`, `score(i)`.
Sumo becomes one environment; every idea below is another. Senses become per-environment
(food direction, flag position, current…). Share codes stay valid because a creature is
still body + brain. Roughly a 1–2 day refactor, and it keeps determinism.

## Ideas

1. **Open-ended ecosystem ("the Culture")**: *highest ceiling.*
   One large dish, 30–100 organisms, drifting food particles, energy that drains with
   movement, and reproduction when energy is high (offspring = mutated copy). No fitness
   function at all: whoever survives and reproduces, wins. Species emerge, compete, go extinct.
   Players seed it with their own creatures or ones from links, then watch, Petri-dish style.
   Teaches the real thing (natural selection without a referee) and is endlessly re-watchable.
   *Engine needs:* broadphase for many bodies (spatial grid), an energy model, a mutation
   operator for bodies (not just brains). Runs in a worker; renders the same organisms.

2. **More arenas from the same creatures**: *cheapest variety.*
   Race to a light, king-of-the-hill, tag (predator/prey roles), herding pellets into a goal,
   current-swimming. Each is one `Environment`. A creature's "résumé" across arenas is a
   nice collectible stat and makes specialists vs generalists visible.

3. **Breeding between players**: *social glue.*
   Paste two share links and cross them: same body plan → crossover of brains; different
   bodies → the child takes one parent's body and a brain re-fitted by a short evolution run.
   "Bred from Ana's Lash × Ravi's Oar" on the specimen label; lineage visible across people.

4. **Asynchronous leagues with no backend.**
   A weekly league is a list of share codes in a JSON file in the repo (people submit by PR
   or a form that writes an issue). A GitHub Action runs the round robin headlessly (our sim
   already runs in Node) and publishes the table to the site. Deterministic, so anyone can
   verify any result locally. Later, a tiny backend if it takes off.

5. **Daily challenge.**
   One seeded challenge per day (a fixed opponent + arena + body constraints, e.g. "no edge
   sense, max 6 joints"). Everyone gets the same seed, so results are comparable and
   shareable as a one-line result card. Cheap, habit-forming.

6. **Evolving bodies too (Karl Sims style)**: *deeper science.*
   Mutate joint positions, bone lengths and muscle strengths alongside the brain, within the
   Lab's limits. Pair with NEAT-style structure growth (Stage 6). Shows co-adaptation of
   body and brain, the most striking result in this field.

7. **Phylogeny and fossil record.**
   Keep a compact history of champions and draw the family tree: branches, extinctions,
   the moment a trick appeared. Click a node to replay that ancestor. Great for the
   learning pillar and for sharing ("my lineage, 400 generations").

8. **Classroom kit.**
   Teacher mode with fixed seeds, exportable CSV of fitness per generation, three ready
   lesson plans (selection pressure, mutation rate, reward hacking) and a "predict then run"
   worksheet. Schools are a real distribution channel for a free, offline, no-login web app.

9. **Evolution vs gradient learning, side by side.**
   Train the same body with a simple policy-gradient learner (still dependency-free) and race
   it against evolution in a split screen. Connects Petri to mainstream ML for curious students.

10. **Open the engine.**
    Publish `petri-sim` (physics + brain + environments) as an MIT npm package with a CLI
    (`npx petri-sim evolve --body crab.json --env sumo`). Others build arenas, run research
    experiments headlessly, and their environments can flow back into the game.

## Suggested order
1. Environment plug-in refactor → 2. two more arenas (race, king-of-the-hill) → 3. the
Culture (ecosystem) as the flagship "grow" mode → then breeding/leagues for the social loop.
