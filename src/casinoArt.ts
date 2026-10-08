import type { Game } from './api';

/**
 * The lobby's 3D casino art (scripts/render-casino.py, packed by scripts/pack-symbols.py): each game's tile
 * centrepiece, the category icons and the casino-floor backdrop. Games keep their own symbol art where they have it.
 */
export const CASINO = {
  roulette: require('../assets/casino/ROULETTE.png'), chips: require('../assets/casino/CHIPS.png'), dice: require('../assets/casino/DICE.png'),
  cards: require('../assets/casino/CARDS.png'), slot: require('../assets/casino/SLOT.png'), rocket: require('../assets/casino/ROCKET.png'),
  keno: require('../assets/casino/KENO.png'), scratch: require('../assets/casino/SCRATCH.png'), coins: require('../assets/casino/COINS.png'),
  fish: require('../assets/casino/FISH.png'), heart: require('../assets/casino/HEART.png'), crown: require('../assets/casino/CROWN.png'),
  floor: require('../assets/casino/FLOOR.jpg'),
};

/** A game's own renders, for the games that have a signature piece. */
const BY_CODE: Record<string, number> = {
  LUXURY_LIFE: require('../assets/luxury/DOUBLE.png'), BREAK_THE_BANK: require('../assets/firelink/MAJOR.png'),
  VEGAS_JACKPOT_DEVIL_HEART: require('../assets/devil/JACKPOT.png'), BLAZING_HIT: require('../assets/devil/SEVEN.png'),
  WILD_BUFFALO: require('../assets/video/WILD.png'), SIMPLE_DOLLAR: CASINO.coins, QUICK_HIT: CASINO.slot, TEN_X_TRIPLE: CASINO.chips,
  LOTERIA_SCRATCH: CASINO.cards, TRIPLE_MATCH_SCRATCH: CASINO.scratch,
};

/** The rendered centrepiece for a game's tile, or null when its slot symbol art suits it better. */
export function artOf(game: Game): number | null {
  if (BY_CODE[game.code]) return BY_CODE[game.code];
  const layout = game.engine?.layout;
  if (layout === 'FISH') return CASINO.fish;
  if (game.engineType === 'CRASH') return CASINO.rocket;
  if (layout === 'ROULETTE') return CASINO.roulette;
  if (layout === 'KENO') return CASINO.keno;
  if (layout?.startsWith('SCRATCH')) return CASINO.scratch;
  return null;
}
