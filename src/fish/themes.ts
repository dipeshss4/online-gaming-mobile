/**
 * Each fish table's look. They all play FishTableEngine's creatures (the same codes and prizes); a table brings its
 * own seabed colours, a tint for the creatures, and its boss: the Tide Dragon drawn in code, or a rendered sprite
 * (scripts/render-tiles.py FT_<NAME>) that swims across in the dragon's place.
 */
export type FishTheme = {
  sea: [string, string, string, string]; glow: string; rocks: string; sand: [string, string]; rock: [string, string]; coral: string[];
  /** Degrees the creatures' colours are turned round the wheel (0 keeps them as drawn). */
  tint: number;
  boss: { name: string; warning: string; sprite?: 'KRAKEN' | 'MEGALODON'; aura: string };
  light: string;
};

export const FISH_THEMES: Record<string, FishTheme> = {
  DRAGON_TIDE: {
    sea: ['#0e6c8f', '#0a4467', '#06264a', '#041630'], glow: '#7fe9ff55', rocks: '#0a2b45', sand: ['#2c5a6e', '#173347'], rock: ['#46708a', '#16324a'],
    coral: ['#e2507a', '#f39a3b', '#b35be0', '#e2507a', '#f39a3b'], tint: 0, light: 'rgba(140,240,255,.10)',
    boss: { name: 'Tide Dragon', warning: 'THE TIDE DRAGON APPROACHES', aura: 'rgba(255,120,40,.35)' },
  },
  KRAKENS_DEEP: {
    sea: ['#3a1260', '#240a44', '#14052a', '#08020f'], glow: '#c88aff44', rocks: '#1c0a30', sand: ['#3a2450', '#1a0c2a'], rock: ['#5a3a7a', '#1e0e30'],
    coral: ['#a040ff', '#ff4fb0', '#40e0d0', '#a040ff', '#ff4fb0'], tint: 260, light: 'rgba(200,140,255,.09)',
    boss: { name: 'The Kraken', warning: 'THE KRAKEN RISES', sprite: 'KRAKEN', aura: 'rgba(180,60,255,.4)' },
  },
  SHARK_FRENZY: {
    sea: ['#20b0d8', '#0c84b0', '#05507a', '#033050'], glow: '#c8fbff66', rocks: '#0a4a62', sand: ['#d8c08a', '#a08858'], rock: ['#7aa8b8', '#2a5a6a'],
    coral: ['#ff6a4a', '#ffb02a', '#ff4f8a', '#ff6a4a', '#ffd84a'], tint: 30, light: 'rgba(220,255,255,.13)',
    boss: { name: 'Megalodon', warning: 'THE MEGALODON IS HUNTING', sprite: 'MEGALODON', aura: 'rgba(255,60,60,.32)' },
  },
};
export const themeOfFish = (code: string): FishTheme => FISH_THEMES[code] ?? FISH_THEMES.DRAGON_TIDE;

/** A colour matrix that turns hues by {@code degrees} (the browser's hue-rotate), for Skia's colour filter. */
export function hueMatrix(degrees: number): number[] {
  const a = degrees * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return [
    .213 + c * .787 - s * .213, .715 - c * .715 - s * .715, .072 - c * .072 + s * .928, 0, 0,
    .213 - c * .213 + s * .143, .715 + c * .285 + s * .14, .072 - c * .072 - s * .283, 0, 0,
    .213 - c * .213 - s * .787, .715 - c * .715 + s * .715, .072 + c * .928 + s * .072, 0, 0,
    0, 0, 0, 1, 0,
  ];
}
