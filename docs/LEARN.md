# Learning from Petri

A beginner-friendly tour of how this game is built. Written for someone who
knows C++ but not TypeScript, the web, or git. Updated at every stage.

---

## 1. The big picture (Stage 0)

Petri is a **static website**: just HTML, CSS and JavaScript files. There is
no server doing work for you — every fight, every generation of evolution,
runs inside the player's browser. That's why it can be hosted for free on
GitHub Pages.

The code is split into layers, like a C++ project split into libraries:

| Folder | Role | C++ analogy |
|---|---|---|
| `src/sim/` | The physics + rules of a match. Pure maths, no graphics. | A header-only library with no I/O |
| `src/evo/` | The genetic algorithm that evolves brains | An optimiser that calls the library |
| `src/render/` | Draws the current state on a `<canvas>` | The "view" in MVC |
| `src/ui/` | Buttons, screens, panels | The GUI layer |
| `src/workers/` | Runs many simulations in parallel threads | `std::thread` pool |

**The one rule:** `sim/` must never depend on `render/` or `ui/`. That way the
same simulation runs on a web page, in a background thread, or in a Node.js
test with no screen at all ("headless").

### Why determinism matters
If you give the simulation the same two creatures and the same *seed* (a
starting number for the random generator), it must produce exactly the same
fight, bit for bit, on every computer. Then a replay is tiny: two creatures +
one number. Two tricks make this possible:

1. **Our own random number generator** (`src/sim/rng.ts`). `Math.random()`
   can't be seeded, so we use *Mulberry32*, which only uses 32-bit integer
   operations — the same on every machine. Think of it like `std::mt19937`
   with a fixed seed.
2. **Only "safe" floating-point maths in the simulation.** IEEE-754 (the
   standard behind `double` in both C++ and JS) guarantees `+ − × ÷ √` give
   identical results everywhere. Functions like `sin`, `cos`, `exp` are *not*
   guaranteed to match in the last bit across browsers, so the sim avoids them.
   That's also why we wrote our own small physics engine (see PLAN.md).

### TypeScript in 30 seconds, for a C++ programmer
- `let x = 3;` is like `auto x = 3;`. `const` means the variable can't be re-pointed.
- `function f(a: number): number { ... }` — types come *after* the name.
- `number` is always a 64-bit `double`. There is no `int`; `x >>> 0` is a trick
  to force a value into an unsigned 32-bit integer.
- `class` works much like C++, but every object lives on the heap and is
  garbage collected — no `delete`.
- TypeScript is compiled ("transpiled") to plain JavaScript; the types vanish
  at runtime, they only exist to catch bugs early, like a strict compiler.

---

## 2. Glossary

### Git terms
- **Repository (repo)** — a project folder whose full history is tracked by git.
- **Commit** — a saved snapshot of the files, with a message saying what changed.
- **Branch** — a parallel line of commits. We work on `claude/epic-carson-walyhr`
  so the main line (`main`) stays clean until you merge.
- **Push** — upload your local commits to GitHub.
- **Merge / Pull Request (PR)** — bringing one branch's commits into another;
  a PR is GitHub's page for reviewing that before it happens.
- **`.gitignore`** — a list of files git should not track (e.g. `node_modules/`,
  the downloaded libraries, which can be re-installed any time).

### Web / tooling terms
- **Node.js** — runs JavaScript outside the browser (like running a compiled
  binary from the terminal). We use it for tests and scripts.
- **npm** — Node's package manager (like `vcpkg`/`apt` for JS libraries).
  `package.json` lists the libraries; `package-lock.json` pins exact versions.
- **Vite** — the build tool: a fast dev server while coding, and a bundler that
  produces the final optimised files in `dist/`.
- **Vitest** — the unit-test framework (like GoogleTest).
- **Playwright** — drives a real (headless) Chrome so we can take screenshots
  and check the game actually renders.
- **Canvas** — an HTML element you draw pixels/shapes on from code.
- **Web Worker** — a background thread in the browser. It can't touch the page,
  only send/receive messages — perfect for running simulations.
- **WASM (WebAssembly)** — a compact binary format browsers can run at near
  native speed; C++ can compile to it. (We chose *not* to use a WASM physics
  engine — see PLAN.md.)
- **GitHub Pages** — free static-site hosting from a GitHub repo.
- **GitHub Actions / workflow** — scripts GitHub runs on its servers when you
  push (ours: install → test → build → publish to Pages). Lives in
  `.github/workflows/deploy.yml`.
- **Headless** — running without a visible window or screen.
