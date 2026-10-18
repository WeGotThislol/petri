# Research pass: evolution engine review

One focused pass (Stage 3 start) over similar projects and the key papers, looking for
ways to avoid cheating, stalling and cycling, train faster, and make evolved behaviour
more interesting to watch. All sources were reachable; nothing was blocked.
**No code was copied** from any project below (see `CREDITS.md`).

## Findings

1. **Train against random *old* opponents, not the latest one.** In OpenAI's
   "Emergent Complexity via Multi-Agent Competition" (Bansal et al., 2017), sumo agents
   trained against the latest opponent became unbalanced (one side runs away and the other
   never recovers). Sampling opponents uniformly from history (or from the newer half,
   δ = 0.5) gave the most robust policies. *Petri had "latest + one random old";
   changed to one from the recent half + one from the whole history.*
2. **Exploration curriculum: dense shaping first, then anneal it to zero.** The same paper
   gives a dense "exploration reward" (move, stay near centre) for only the first ~10–15%
   of training, then linearly fades it so the sparse win/lose signal dominates. Agents that
   kept the dense reward learned worse, safer behaviour ("stand and move to the centre").
   *Petri now anneals its closeness / pushed-outward bonuses over the first 20 generations,
   but to a floor of 0.3, not zero: fading to zero made champions stop pushing the Buoy late in
   training (push rate fell to 5–20%). With the floor, the 30-generation proof run reaches 65–90%
   push-outs vs the Buoy by generations 24–29 (35% before these changes), though noisier mid-run.*
3. **Randomise the world gradually.** Randomising start positions or arena size is crucial
   for generalisation but blocks early learning if applied at full strength from the start;
   a randomisation curriculum (small → large) worked for every task. *Petri's training
   start-jitter now grows from 30% to 100% over 20 generations.*
4. **Evolution exploits physics bugs; expect it.** Karl Sims (1994) saw swimmers twitch tiny
   parts to harvest "free energy" from Euler integration error, and jumpers trigger a
   collision bug to pop into the air (Lehman et al., "The Surprising Creativity of Digital
   Evolution", 2020). *Petri already uses a stable position-based integrator, a speed cap and
   an `exploit` flag; it now also charges a small cost for frantic muscle twitching.*
5. **Penalise wasted effort for more natural motion.** EvoLab offers an "efficiency" fitness
   (distance minus energy spent) to stop flailing. A small effort cost produces smoother,
   more watchable gaits. *Adopted (small weight, so it never outweighs winning).*
6. **Sims' competition: relative fitness from one-on-one contests.** In "Evolving 3D
   Morphology and Behavior by Competition" (Sims, 1994) fitness is relative (wins against
   others), and interesting strategy/counter-strategy arms races emerged. A hall of fame
   (Rosin & Belew, 1995/1997) keeps past winners as opponents so arms races don't forget old
   defences. *Petri's design matches this; the hall of fame is now sampled as in finding 1.*
7. **NEAT protects innovation with speciation and grows networks from minimal.** Stanley &
   Miikkulainen (2002) align genes by historical markings for crossover, and use explicit
   fitness sharing within species so a new structure isn't wiped out before its weights are
   tuned; networks start without hidden nodes. *Planned for Stage 6 (optional); our fixed
   10-neuron MLP is fine for now, and a lightweight version of speciation (fitness sharing by
   weight distance) is the cheapest next step if populations collapse to one strategy.*
8. **Diversity makes better shows.** Novelty search with local competition (Lehman & Stanley,
   2011) found more varied creatures in one run than pure fitness. Several pool policies
   trained together (an "ensemble") also beat single self-play policies in Bansal et al.
   *Idea for later: a small "sparring pool" of 2–3 parallel lineages.*
9. **Speed tricks seen in hobby projects:** end a test as soon as the outcome is decided
   (EvoLab freezes dead/finished/stalled creatures and ends the generation early); run many
   tests in parallel; small fixed networks. *Petri already ends matches on ring-out and runs a
   worker pool; adding an early "stall" stop is a candidate if training gets slow.*
10. **What makes these projects fun to watch** (keiwando/evolution, carykh's Jelly Evolution
    Simulator, kibotu's NeuralNetworkEvolution, rendragonnn/evolve-creature): a live fitness
    graph, a "show best / show all" toggle, a network visualiser, speed controls up to 8–10×,
    and letting the player build the body. *Petri's Stage 3 Evolve screen includes speed up
    to 50×, a live graph, and picking any individual to watch and adopt.*

## Sources
- Bansal, Pachocki, Sidor, Sutskever, Mordatch. *Emergent Complexity via Multi-Agent Competition.* arXiv:1710.03748 (2017).
- Sims. *Evolving Virtual Creatures.* SIGGRAPH '94. And *Evolving 3D Morphology and Behavior by Competition.* ALife IV (1994).
- Stanley & Miikkulainen. *Evolving Neural Networks through Augmenting Topologies.* Evolutionary Computation (2002).
- Lehman, Clune, Misevic et al. *The Surprising Creativity of Digital Evolution.* Artificial Life 26(2) (2020).
- Rosin & Belew. *New Methods for Competitive Coevolution.* Evolutionary Computation 5(1) (1997).
- Lehman & Stanley. *Evolving a Diversity of Virtual Creatures through Novelty Search and Local Competition.* GECCO '11.
- Projects: github.com/keiwando/evolution, github.com/Jason2Brownlee/EvoLab, github.com/rendragonnn/evolve-creature,
  github.com/kibotu/NeuralNetworkEvolution, neat-javascript.org, github.com/neat-evolution/neat-js, github.com/carykh/jes.
