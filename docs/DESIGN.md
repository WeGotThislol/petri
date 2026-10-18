# Petri: design language

**"Made by a person who loves this game."** A cosy naturalist's sketchbook
at dusk: soft, warm, a little hand-drawn, but polished enough to trust.
All values below live in **one file: `src/ui/tokens.ts`**. Change it there
and the whole app (CSS *and* canvas) follows.

## Principles
1. **Warm, never clinical.** Dusky plum-indigo grounds, cream ink. No pure black, no pure white.
2. **One main action per screen.** It is always the mint button. Everything else is quieter.
3. **Soft shapes.** Rounded corners, generous padding, soft shadows. Glow is earned: only the champion and celebrations glow (butter).
4. **A human was here.** Slightly irregular "hand-drawn" frame corners, a handwritten note or arrow where it helps. Never on body text, never more than one or two per screen.
5. **Creatures are characters, not diagrams.** Soft skin over the physics skeleton, faces that react.
6. **Explain when it matters.** Jargon gets one friendly sentence the first time it appears, then gets out of the way.

## Colour tokens
| Token | Hex | Job |
|---|---|---|
| `night` | #1e1a33 | deepest ground, dish edge |
| `dusk` | #29233f | main background |
| `surface` | #342c4f | panels, drawers |
| `raised` | #3f3660 | hover / raised |
| `line` | #5c5180 | soft outlines |
| `cream` | #fbefdc | main text (14.8:1 on night) |
| `inkSoft` | #d9cce0 | secondary text |
| `inkFaint` | #b0a4c8 | hints (≥4.5:1 on every ground) |
| `mint` | #8fe3c0 | **primary action**, "you" |
| `coral` | #ff8a7a | danger: shrinking rim, KO, undo |
| `butter` | #ffd98a | champion glow, celebrations |
| `peach` | #ffb894 | maker's notes, warm annotations |
| `lavender` | #bfaeff | learning moments, jargon tips |
| `sky` | #93ccff | information, opponents |

Creatures are painted only from peach/coral/butter/mint/lavender/sky, and
patterns only from a hand-picked partner list per body colour (`PATTERN_PAIRS`),
so every random creature is harmonious. Outlines are the body colour mixed
toward `night`, never black.

## Type
- **Fraunces** (soft serif, SOFT axis at 100): headings, creature names. Display only.
- **Nunito** (rounded humanist sans): all UI text and buttons.
- **Caveat** (handwriting): annotations, arrows, the maker's note. Sparingly.
- **IBM Plex Mono**: tiny numbers only (generation counters, seeds).
- Scale (px): 12 · 14 · 16 · 20 · 25 · 32 · 56 hero. Body 16, min tap target 48 px.

## Space & shape
Spacing 4 · 8 · 16 · 24 · 40 · 64. Radii 10 · 16 · 26 · pill. Frames use
asymmetric radii (e.g. `26px 22px 28px 20px / 22px 28px 20px 26px`) for a
hand-cut feel, plus a 1° rotation on stickers. Surfaces carry a faint paper grain.

## Motion
- Ease-out for things arriving (`out`), overshoot for things that are *alive*
  (buttons, stickers, creatures: `overshoot`). Never linear, except the rim's
  dash crawl (it is a machine, and it's the danger).
- Buttons squash on press (scale 0.94 × 1.04) and spring back.
- Creatures: squash-and-stretch with speed (≤12%), idle bob, blinking.
- Durations 140 / 260 / 480 ms. Respect `prefers-reduced-motion`.

## Voice
Warm, short, first person, a bit funny. The maker talks to you; the game
never lectures.
- Do: "They're still flailing. That's totally normal for generation 2."
- Don't: "Generation 2 complete. Mean fitness: 0.13."
- Numbers are available, but second: in the Tinker drawer, in small mono.
- Buttons are verbs: "Meet your first creature", "Evolve!", "Fight!", "Again".

---

## v2 correction: warm and handmade, but grown-up

The first pass fixed "cold and mechanical" but overshot into childish. v2 keeps the
warmth, softness, grain and human touch, and adds atmosphere and restraint.
Reference feel: the menus of *Hades* and *Hollow Knight*, *Inside*, *Alto's Odyssey*
at night, a deep-sea documentary. Litmus test: **could this be a screenshot from a
premium indie game on Steam, made by one person with a lot of taste?**

Everything below lives in `src/ui/tokens.ts` (v2), which supersedes the v1 tables above.

### Palette
| Token | Hex | Job |
|---|---|---|
| `abyss` | #0b0a12 | deepest ground, vignette |
| `ink` | #121019 | main background |
| `dish` | #141c21 | dish floor (deep-sea teal undertone) |
| `surface` / `raised` | #1a1622 / #231d2d | layered panels |
| `bone` | #e9e0cf | text (14.4:1 on ink) |
| `inkSoft` / `inkFaint` | #b9ad9d / #8d8292 | secondary / captions (≥4.5:1) |
| `amber` | #e2a14a | **the** primary action; "yours"; winner light |
| `ember` | #d4614a | danger only: contracting rim, knock-outs |
| pigments | verdigris, rose, ochre, iris, bone2, kelp | organisms only, muted and mineral |

### Type
Cormorant Garamond (display, titles, specimen names) · Source Sans 3 (all UI) ·
Caveat only as faint, small marginalia · IBM Plex Mono for tiny numbers.
Small-caps eyebrows (11px, 0.22em tracking) carry structure instead of colour.

### DO
- Deep ink grounds with plum/teal undertones; fine film grain; vignette.
- Hairline borders (bone at 12%), radii 6–12px, layered translucent panels.
- One amber primary button per screen. Ember only for danger.
- Specimen labels: serif name, italic binomial, small-caps catalogue line, hairline rule.
- Creatures as translucent organisms: visible inner structure, rim light, gene-driven
  markings, glowing sensor nodes and a travelling neural pulse driven by the real brain.
- Life through motion and weight: knocked-out bodies dim and drift; winners carry more light.
- Easing `cubic-bezier(.16,1,.3,1)` (weighty ease-out); fades and short rises.
- Copy: dry, understated, curious. "The Buoy holds." "A plateau. Not stuck; searching."

### DON'T
- Faces, eyes, mouths, blinking, expressions, blush, party hats, googly anything.
- Pastel candy colours, big bubbly buttons, chunky drop shadows, stickers, tilted labels.
- Overshoot, bounce, wobble or squash on UI.
- Exclamation marks in UI copy, baby-talk ("little fighter", "friend"), emoji.
- Neon cyberpunk glows or sterile lab-dashboard greys.
- More than two accent colours on screen at once.
