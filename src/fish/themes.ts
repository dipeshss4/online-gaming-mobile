/**
 * Each fish table's look. They all play FishTableEngine's creatures (the same codes and prizes); each table has its
 * own cast of rendered creatures (src/fish/sprites.ts, from scripts/render-fish.py), its own sea floor
 * (scripts/render-seabeds.py) and boss. The colours here are for what is drawn in code: the light, the boss's aura,
 * and the drawn seabed shown until the rendered one has loaded.
 */
export type FishTheme = {
  sea: [string, string, string, string]; glow: string; rocks: string; sand: [string, string]; rock: [string, string]; coral: string[];
  /** Light shafts from the surface, or none in the deep. */
  light: string | null;
  /** How strongly the caustics shine over the floor. */
  caustics: number;
  boss: { name: string; warning: string; aura: string };
};

export const FISH_THEMES: Record<string, FishTheme> = {
  DRAGON_TIDE: {
    sea: ['#0e6c8f', '#0a4467', '#06264a', '#041630'], glow: '#7fe9ff55', rocks: '#0a2b45', sand: ['#2c5a6e', '#173347'], rock: ['#46708a', '#16324a'],
    coral: ['#e2507a', '#f39a3b', '#b35be0', '#e2507a', '#f39a3b'], light: 'rgba(170,250,255,.08)', caustics: .09,
    boss: { name: 'Tide Dragon', warning: 'THE TIDE DRAGON APPROACHES', aura: 'rgba(255,120,40,.32)' },
  },
  KRAKENS_DEEP: {
    sea: ['#3a1260', '#240a44', '#14052a', '#08020f'], glow: '#c88aff44', rocks: '#1c0a30', sand: ['#3a2450', '#1a0c2a'], rock: ['#5a3a7a', '#1e0e30'],
    coral: ['#a040ff', '#ff4fb0', '#40e0d0', '#a040ff', '#ff4fb0'], light: null, caustics: .05,
    boss: { name: 'The Kraken', warning: 'THE KRAKEN RISES', aura: 'rgba(180,60,255,.38)' },
  },
  SHARK_FRENZY: {
    sea: ['#20b0d8', '#0c84b0', '#05507a', '#033050'], glow: '#c8fbff66', rocks: '#0a4a62', sand: ['#d8c08a', '#a08858'], rock: ['#7aa8b8', '#2a5a6a'],
    coral: ['#ff6a4a', '#ffb02a', '#ff4f8a', '#ff6a4a', '#ffd84a'], light: 'rgba(230,255,255,.08)', caustics: .08,
    boss: { name: 'Megalodon', warning: 'THE MEGALODON IS HUNTING', aura: 'rgba(255,60,60,.3)' },
  },
};
export const themeOfFish = (code: string): FishTheme => FISH_THEMES[code] ?? FISH_THEMES.DRAGON_TIDE;

/** The creature codes every table's cast covers, in a fixed order. */
export const FISH_CODES = ['SHRIMP', 'CLOWNFISH', 'PUFFER', 'ANGELFISH', 'TURTLE', 'LANTERN', 'OCTOPUS', 'STINGRAY', 'SWORDFISH', 'SHARK', 'WHALE', 'DRAGON'] as const;

/**
 * How big a creature's sheet is drawn: its render units times its radius. A body of about two render units then spans
 * two and a half radii, so the hit circle covers it.
 */
export function creatureSize(sheet: { w: number; h: number }, code: string, r: number) {
  // Every boss spans the same 520 of the table's 1280, whatever its shape.
  const k = code === 'DRAGON' ? 520 / sheet.w : r * 1.25 * (GROW[code] ?? 1);
  return { w: sheet.w * k, h: sheet.h * k };
}
/** How far from its middle a creature can be hit: its radius, grown with it, so a shot that touches it counts. */
export const reachOf = (code: string, r: number) => r * (GROW[code] ?? 1);
/** The small creatures are drawn larger than their radius alone would make them, so they read at a glance. */
const GROW: Record<string, number> = { SHRIMP: 1.75, CLOWNFISH: 1.6, PUFFER: 1.45, ANGELFISH: 1.4, LANTERN: 1.3, TURTLE: 1.15, OCTOPUS: 1.1, STINGRAY: 1.05 };

/** Which of the eight swimming frames to show: small creatures beat faster, and faster swimmers faster still. */
export function frameOf(code: string, t: number, speed: number) {
  const rate = (code === 'DRAGON' ? 7 : code === 'WHALE' || code === 'TURTLE' ? 6 : 9) * (.7 + speed / 200);
  return Math.floor(t * rate) % 8;
}

/** A colour matrix that keeps only shape: black at a third of the alpha, for creatures' shadows on the floor. */
export const SHADOW = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, .32, 0];
