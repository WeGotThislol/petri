/**
 * DESIGN TOKENS: the single source of truth for every colour, font, size,
 * radius, shadow and easing curve in Petri.
 *
 * Both the CSS (through custom properties like `var(--c-amber)`) and the
 * canvas renderer read from here, so changing a value restyles the whole app.
 * See docs/DESIGN.md (section "v2 correction") for the reasoning.
 */

export const COLOR = {
  // Grounds: deep inks with warm plum / cool teal undertones. Never pure black.
  abyss: '#0b0a12',    // deepest: page edges, vignette
  ink: '#121019',      // main background
  dish: '#141c21',     // the dish floor (a hint of deep-sea teal)
  surface: '#1a1622',  // panels
  raised: '#231d2d',   // hovered / raised panels
  line: '#3a3246',     // hairlines (used at low opacity)

  // Text: warm bone, never pure white.
  bone: '#e9e0cf',     // main text (≈15:1 on ink)
  inkSoft: '#b9ad9d',  // secondary text
  inkFaint: '#8d8292', // captions, hints (≥4.5:1 on ink and surface)

  // Accents: used sparingly so they mean something.
  amber: '#e2a14a',    // THE primary action, "yours", winner light
  ember: '#d4614a',    // danger: the shrinking rim, knock-outs

  // Organism pigments: muted, rich, a little mineral. Creatures only.
  verdigris: '#5fa79c',
  rose: '#b8737c',
  ochre: '#c59a52',
  iris: '#8279bd',
  bone2: '#d6c6a8',
  kelp: '#6f9a63',
} as const;

export type ColorName = keyof typeof COLOR;

/** Pigments creatures may be painted in. */
export const CREATURE_COLORS = ['verdigris', 'rose', 'ochre', 'iris', 'bone2', 'kelp'] as const;
export type CreatureColor = (typeof CREATURE_COLORS)[number];

/** Marking colours that sit well on each body pigment (genes pick from these only). */
export const PATTERN_PAIRS: Record<CreatureColor, CreatureColor[]> = {
  verdigris: ['bone2', 'iris', 'ochre'],
  rose: ['bone2', 'ochre', 'iris'],
  ochre: ['rose', 'bone2', 'kelp'],
  iris: ['verdigris', 'bone2', 'rose'],
  bone2: ['rose', 'verdigris', 'ochre'],
  kelp: ['ochre', 'bone2', 'verdigris'],
};

export const FONT = {
  display: '"Cormorant Garamond", "Iowan Old Style", Georgia, serif', // refined serif: titles, specimen names
  ui: '"Source Sans 3", "Segoe UI", system-ui, sans-serif',          // humanist sans: everything you read
  hand: '"Caveat", "Bradley Hand", cursive',                         // marginalia only, small and faint
  mono: '"IBM Plex Mono", ui-monospace, monospace',                  // tiny numbers only
};

/** Google Fonts URL for the families above (loaded once per page). */
export const FONT_URL =
  'https://fonts.googleapis.com/css2?family=Caveat:wght@400;500&family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=IBM+Plex+Mono:wght@400&family=Source+Sans+3:wght@400;500;600&display=swap';

/** Type scale (px). */
export const TYPE = { xs: 12, sm: 14, md: 16, lg: 19, xl: 24, xxl: 34, hero: 64 };

/** Spacing scale (px). */
export const SPACE = { xs: 4, sm: 8, md: 16, lg: 24, xl: 40, xxl: 64 };

/** Modest radii: crafted, not bubbly. */
export const RADIUS = { sm: 6, md: 9, lg: 12, pill: 999 };

export const SHADOW = {
  soft: '0 10px 30px rgba(0, 0, 0, 0.45)',
  lift: '0 18px 48px rgba(0, 0, 0, 0.55)',
  glowAmber: '0 0 24px rgba(226, 161, 74, 0.35)',
};

/** Weighty, purposeful easing. No overshoot anywhere in the UI. */
export const EASE = {
  out: 'cubic-bezier(0.16, 1, 0.3, 1)',    // arrives with momentum, settles
  inOut: 'cubic-bezier(0.65, 0, 0.35, 1)', // deliberate transitions
};

export const DURATION = { quick: 160, base: 320, slow: 640 };

/** Hairline: bone at low opacity. */
export const HAIRLINE = 'rgba(233, 224, 207, 0.12)';

/**
 * Write every token into CSS custom properties on <html>, so stylesheets can
 * use `var(--c-amber)`, `var(--f-ui)`, `var(--s-md)` and so on.
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
  set('--hairline', HAIRLINE);
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
