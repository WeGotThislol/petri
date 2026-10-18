/**
 * DESIGN TOKENS: the single source of truth for every colour, font, size,
 * radius, shadow and easing curve in Petri.
 *
 * Both the CSS (through custom properties like `var(--c-cream)`) and the
 * canvas renderer read from here, so changing a value restyles the whole app.
 * See docs/DESIGN.md for the reasoning behind each choice.
 */

export const COLOR = {
  // Grounds: dusky plum-indigo, never pure black.
  night: '#1e1a33',    // deepest background, the dish floor at its edges
  dusk: '#29233f',     // main background
  surface: '#342c4f',  // panels, cards, drawers
  raised: '#3f3660',   // hovered / raised surfaces
  line: '#5c5180',     // soft outlines, dividers

  // Inks: warm cream, never pure white.
  cream: '#fbefdc',    // main text
  inkSoft: '#d9cce0',  // secondary text
  inkFaint: '#b0a4c8', // hints, captions (≥4.5:1 on every ground)

  // The friendly palette. Each colour has ONE job in the UI; creatures may use all of them.
  mint: '#8fe3c0',     // PRIMARY ACTION (buttons you should press), "you"
  coral: '#ff8a7a',    // danger: the shrinking rim, knock-outs, undo
  butter: '#ffd98a',   // champion glow, celebrations, highlights
  peach: '#ffb894',    // warm annotations, the maker's notes
  lavender: '#bfaeff', // learning moments (Lab Notebook, jargon tips)
  sky: '#93ccff',      // information, opponents' stickers
} as const;

export type ColorName = keyof typeof COLOR;

/** Colours creatures may be painted in (always from the palette, so always harmonious). */
export const CREATURE_COLORS = ['peach', 'coral', 'butter', 'mint', 'lavender', 'sky'] as const;
export type CreatureColor = (typeof CREATURE_COLORS)[number];

/**
 * Hand-picked pattern colours that look good on each body colour.
 * Patterns are painted in a lighter or deeper tint of these, never a random colour.
 */
export const PATTERN_PAIRS: Record<CreatureColor, CreatureColor[]> = {
  peach: ['coral', 'butter', 'lavender'],
  coral: ['butter', 'peach', 'lavender'],
  butter: ['peach', 'coral', 'mint'],
  mint: ['sky', 'butter', 'lavender'],
  lavender: ['sky', 'coral', 'peach'],
  sky: ['lavender', 'mint', 'butter'],
};

export const FONT = {
  display: '"Fraunces", "Iowan Old Style", Georgia, serif', // soft serif: headings, names
  ui: '"Nunito", "Segoe UI", system-ui, sans-serif',        // friendly sans: everything you read
  hand: '"Caveat", "Comic Sans MS", cursive',               // handwriting: annotations only, sparingly
  mono: '"IBM Plex Mono", ui-monospace, monospace',         // tiny numbers only
};

/** Google Fonts URL for the families above (loaded once in each HTML page). */
export const FONT_URL =
  'https://fonts.googleapis.com/css2?family=Caveat:wght@500;700&family=Fraunces:opsz,wght,SOFT@9..144,400..700,100&family=IBM+Plex+Mono:wght@400;500&family=Nunito:wght@400;600;700;800&display=swap';

/** Type scale (px). A gentle 1.25 ratio. */
export const TYPE = { xs: 12, sm: 14, md: 16, lg: 20, xl: 25, xxl: 32, hero: 56 };

/** Spacing scale (px). Generous on purpose. */
export const SPACE = { xs: 4, sm: 8, md: 16, lg: 24, xl: 40, xxl: 64 };

export const RADIUS = { sm: 10, md: 16, lg: 26, pill: 999 };

export const SHADOW = {
  soft: '0 6px 18px rgba(14, 10, 30, 0.35)',
  lift: '0 12px 30px rgba(14, 10, 30, 0.45)',
  glowButter: '0 0 28px rgba(255, 217, 138, 0.45)',
};

export const EASE = {
  out: 'cubic-bezier(0.22, 1, 0.36, 1)',         // settles softly
  overshoot: 'cubic-bezier(0.34, 1.56, 0.64, 1)', // springs a little past, then back
  inOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
};

export const DURATION = { quick: 140, base: 260, slow: 480 };

/**
 * Write every token into CSS custom properties on <html>, so stylesheets can
 * use `var(--c-mint)`, `var(--f-ui)`, `var(--s-md)` and so on.
 */
export function applyTokens(root: HTMLElement = document.documentElement): void {
  const set = (k: string, v: string) => root.style.setProperty(k, v);
  for (const [k, v] of Object.entries(COLOR)) set(`--c-${k}`, v);
  for (const [k, v] of Object.entries(FONT)) set(`--f-${k}`, v);
  for (const [k, v] of Object.entries(TYPE)) set(`--t-${k}`, `${v}px`);
  for (const [k, v] of Object.entries(SPACE)) set(`--s-${k}`, `${v}px`);
  for (const [k, v] of Object.entries(RADIUS)) set(`--r-${k}`, `${v}px`);
  for (const [k, v] of Object.entries(SHADOW)) set(`--sh-${k}`, v);
  for (const [k, v] of Object.entries(EASE)) set(`--e-${k}`, v);
  for (const [k, v] of Object.entries(DURATION)) set(`--d-${k}`, `${v}ms`);
}

/** Load the web fonts (adds the <link> once). */
export function loadFonts(): void {
  if (document.querySelector('link[data-petri-fonts]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = FONT_URL; l.dataset.petriFonts = '';
  document.head.appendChild(l);
}

/** '#rrggbb' + alpha → 'rgba(r,g,b,a)'. */
export function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a.toFixed(3)})`;
}

/** Mix two '#rrggbb' colours: t=0 → a, t=1 → b. */
export function mix(a: string, b: string, t: number): string {
  const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((x >> s) & 255) * (1 - t) + ((y >> s) & 255) * t);
  return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
}
