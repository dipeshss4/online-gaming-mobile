import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { Game } from './api';
import type { Mood } from './fx/Ambience';

/**
 * Each game's title as a casino marquee: metallic lettering (a bright upper half over a deeper lower half, on a
 * stamped edge) set in a framed plaque, with a small kicker line above and gold rules and diamonds either side.
 * Known games have their own metal and plaque; any other game gets one from its kind, so none is plain text.
 */
export type Metal = { light: string; deep: string; edge: string; glow: string };
type Logo = { kicker?: string; title: string; metal: Metal; plaque: [string, string]; frame: [string, string]; serif?: boolean };
export type GameTheme = { background: [string, string, string]; frame: string; accent: string; reels: string; mood: Mood };

const serif = Platform.OS === 'android' ? 'serif' : 'Georgia';
export const GOLD: Metal = { light: '#fff6cc', deep: '#e3a51c', edge: '#5a3300', glow: '#ffb01f' };
const RUBY: Metal = { light: '#ffe2c4', deep: '#ff3b2a', edge: '#4a0005', glow: '#ff3a00' };
const ICE: Metal = { light: '#e8fbff', deep: '#26c8ff', edge: '#03264a', glow: '#22e1ff' };
const JADE: Metal = { light: '#eafff0', deep: '#2fd47a', edge: '#043a1c', glow: '#2ee57a' };
const ROSE: Metal = { light: '#ffe6f4', deep: '#ff4fb0', edge: '#4a0530', glow: '#ff3cac' };
const FRAME_GOLD: [string, string] = ['#fff1b0', '#a8700f'];
const FRAME_ICE: [string, string] = ['#c8f4ff', '#1a6ab0'];
const FRAME_FIRE: [string, string] = ['#ffd08a', '#a8300f'];

const LOGOS: Record<string, Logo> = {
  VEGAS_JACKPOT_DEVIL_HEART: { kicker: 'VEGAS JACKPOT', title: 'DEVIL ♥ HEART', metal: RUBY, plaque: ['#3a0306', '#120001'], frame: FRAME_GOLD, serif: true },
  HOT_7S: { kicker: 'CLASSIC', title: 'HOT 7s', metal: RUBY, plaque: ['#3a0806', '#140201'], frame: FRAME_GOLD, serif: true },
  FRUIT_RUSH: { kicker: 'ORIGINAL', title: 'FRUIT RUSH', metal: JADE, plaque: ['#063a24', '#021a10'], frame: FRAME_GOLD },
  LUCKY_FIRE_BLITZ: { kicker: 'LUCKY', title: 'FIRE BLITZ', metal: GOLD, plaque: ['#4a0d04', '#1a0401'], frame: FRAME_FIRE },
  SEVEN_STARS_DELUXE: { kicker: 'DELUXE', title: 'SEVEN STARS', metal: GOLD, plaque: ['#3a0b4a', '#14031c'], frame: FRAME_GOLD, serif: true },
  GALAXY_KENO: { kicker: 'KENO', title: 'GALAXY', metal: ICE, plaque: ['#062a4a', '#020c1c'], frame: FRAME_ICE },
  ROULETTE: { kicker: 'EUROPEAN', title: 'ROULETTE', metal: GOLD, plaque: ['#0b3a22', '#031a0e'], frame: FRAME_GOLD, serif: true },
  ASCENT_CRASH: { kicker: 'ARCADE', title: 'ASCENT CRASH', metal: ICE, plaque: ['#0a1a4a', '#030818'], frame: FRAME_ICE },
  DRAGON_TIDE: { kicker: 'FISH TABLE', title: 'DRAGON TIDE', metal: GOLD, plaque: ['#04304a', '#010f1c'], frame: FRAME_ICE },
  QUICK_HIT: { kicker: 'LIGHTNING', title: 'QUICK HIT', metal: ICE, plaque: ['#0a1a4a', '#030818'], frame: FRAME_GOLD },
  TEN_X_TRIPLE: { kicker: 'TRIPLE PAY', title: '10× TRIPLE', metal: GOLD, plaque: ['#4a0606', '#1a0101'], frame: FRAME_GOLD, serif: true },
  WILD_BUFFALO: { kicker: 'FRONTIER', title: 'WILD BUFFALO', metal: GOLD, plaque: ['#3a1e06', '#140a01'], frame: FRAME_GOLD },
  SIMPLE_DOLLAR: { kicker: 'SIMPLE', title: '$ DOLLAR', metal: JADE, plaque: ['#063a24', '#021a10'], frame: FRAME_GOLD, serif: true },
  TRIPLE_MATCH_SCRATCH: { kicker: 'INSTANT SCRATCH', title: 'TRIPLE MATCH', metal: GOLD, plaque: ['#0b2a7a', '#030c2a'], frame: FRAME_GOLD },
  LOTERIA_SCRATCH: { kicker: 'SCRATCH · TABLA', title: '¡LOTERÍA!', metal: ROSE, plaque: ['#0b4a2a', '#03180e'], frame: FRAME_GOLD, serif: true },
  BREAK_THE_BANK: { kicker: 'FIRE LINK', title: 'BREAK THE BANK', metal: GOLD, plaque: ['#4a0d04', '#1a0401'], frame: FRAME_FIRE },
  BLAZING_HIT: { kicker: 'HOT HITS', title: 'BLAZING HIT', metal: RUBY, plaque: ['#4a0d04', '#1a0401'], frame: FRAME_FIRE },
};

function logoOf(game: Game): Logo {
  if (LOGOS[game.code]) return LOGOS[game.code];
  const layout = game.engine?.layout;
  const metal = layout === 'KENO' || game.engineType === 'CRASH' ? ICE : game.theme === 'FRUIT' || game.theme === 'CITRUS' ? JADE : layout === 'VIDEO_5X3' ? ROSE : GOLD;
  const kicker = layout === 'VIDEO_5X3' ? 'VIDEO SLOT' : layout === 'FISH' ? 'FISH TABLE' : layout === 'KENO' ? 'KENO' : layout === 'ROULETTE' ? 'TABLE GAME' : 'ORIGINAL';
  return { kicker, title: game.name.toUpperCase().replace(/^[^:]*:\s*/, ''), metal, plaque: ['#2a0a4a', '#0c0218'], frame: FRAME_GOLD };
}

/**
 * Metallic lettering: a stamped edge (the word in its dark edge colour, stepped down), the word in the deep metal,
 * and over its upper half the same word in the light metal, so it reads as polished metal catching the light.
 */
export function MetalText({ text, size, metal, serif: useSerif }: { text: string; size: number; metal: Metal; serif?: boolean }) {
  const style = { fontSize: size, lineHeight: size * 1.18, fontWeight: '900' as const, letterSpacing: size * .06, fontFamily: useSerif ? serif : undefined, fontStyle: useSerif ? 'italic' as const : 'normal' as const };
  const depth = Math.max(2, Math.round(size * .07));
  return <View style={{ paddingBottom: depth, paddingHorizontal: 2 }}>
    {Array.from({ length: depth }, (_, i) => <Text key={i} numberOfLines={1} importantForAccessibility="no"
      style={[style, { position: 'absolute', left: 2, top: i + 1, color: metal.edge }]}>{text}</Text>)}
    <Text numberOfLines={1} style={[style, { color: metal.deep, textShadowColor: metal.glow, textShadowRadius: size * .45, textShadowOffset: { width: 0, height: 0 } }]}>{text}</Text>
    <View pointerEvents="none" style={{ position: 'absolute', left: 2, right: 0, top: 0, height: size * .62, overflow: 'hidden' }}>
      <Text numberOfLines={1} importantForAccessibility="no" style={[style, { color: metal.light }]}>{text}</Text>
    </View>
  </View>;
}

/** A small diamond in the frame's metal: the marquee's punctuation. */
function Diamond({ size, colors }: { size: number; colors: [string, string] }) {
  // Turned 45°, a square needs √2 its side to stay inside its own box.
  return <View style={{ width: size * 1.42, height: size * 1.42, alignItems: 'center', justifyContent: 'center' }}>
    <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: size, height: size, transform: [{ rotate: '45deg' }], borderRadius: 1 }} />
  </View>;
}

export function GameLogo({ game, height = 40, maxWidth }: { game: Game; height?: number; maxWidth?: number }) {
  const logo = logoOf(game);
  // Sized so the title fits: about 0.8em a heavy capital, plus the plaque's padding and, with room, the flourishes.
  const flourish = !maxWidth || maxWidth > 360;
  const room = (maxWidth ?? 9999) - (flourish ? height * 2.4 : 0) - 34;
  const size = Math.max(14, Math.min(height * .58, room / (logo.title.length * .8)));
  const kicker = Math.max(11, Math.round(size * .36));
  return <View accessible accessibilityRole="header" accessibilityLabel={game.name} style={l.root}>
    {flourish && <View style={l.flourish}><LinearGradient colors={['transparent', logo.frame[0]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[l.rule, { width: height * .8 }]} /><Diamond size={height * .2} colors={logo.frame} /></View>}
    <LinearGradient colors={logo.frame} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={l.frame}>
      <LinearGradient colors={logo.plaque} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={[l.plaque, { paddingHorizontal: size * .55 }]}>
        {/* A sheen along the top of the plaque, as on lacquered signage. */}
        <LinearGradient colors={['#ffffff22', '#ffffff00']} style={l.sheen} pointerEvents="none" />
        {!!logo.kicker && <Text style={[l.kicker, { fontSize: kicker, letterSpacing: kicker * .4, color: logo.frame[0] }]} numberOfLines={1}>{logo.kicker}</Text>}
        <MetalText text={logo.title} size={size} metal={logo.metal} serif={logo.serif} />
      </LinearGradient>
    </LinearGradient>
    {flourish && <View style={l.flourish}><Diamond size={height * .2} colors={logo.frame} /><LinearGradient colors={[logo.frame[0], 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[l.rule, { width: height * .8 }]} /></View>}
  </View>;
}

/** The colours a game's screen is dressed in, from its kind and theme. */
export function themeOf(game: Game): GameTheme {
  const layout = game.engine?.layout;
  if (game.code === 'VEGAS_JACKPOT_DEVIL_HEART' || layout === 'CLASSIC_5L') return { background: ['#4a0a06', '#250404', '#120102'], frame: '#ff7a1a', accent: '#ffd23f', reels: '#1a0204', mood: 'embers' };
  if (layout === 'FIRE_LINK') return { background: ['#5a1206', '#250402', '#0e0101'], frame: '#ff8a2a', accent: '#ffd23f', reels: '#120201', mood: 'embers' };
  if (layout === 'GRID_3X3') return { background: ['#5a1a06', '#2a0803', '#140402'], frame: '#ffb01f', accent: '#ffd23f', reels: '#1a0703', mood: 'embers' };
  if (layout === 'VIDEO_5X3') return { background: ['#3a1478', '#1d0838', '#0b0422'], frame: '#ff3cac', accent: '#ffd23f', reels: '#140a24', mood: 'bokeh' };
  if (layout === 'SCRATCH_MATCH3') return { background: ['#1b3fa8', '#0a1a5a', '#050a24'], frame: '#ffd23f', accent: '#ffd23f', reels: '#0b2a7a', mood: 'sparkle' };
  if (layout === 'SCRATCH_LOTERIA') return { background: ['#0b6b3a', '#063a22', '#021a0e'], frame: '#ff4fb0', accent: '#ffe45c', reels: '#0b4a2a', mood: 'sparkle' };
  if (layout === 'KENO') return { background: ['#0b2a5a', '#0b0626', '#05031a'], frame: '#22e1ff', accent: '#22e1ff', reels: '#0e1a3a', mood: 'stars' };
  if (layout === 'ROULETTE') return { background: ['#0b4a2a', '#06301c', '#03180e'], frame: '#e7c888', accent: '#ffe45c', reels: '#103629', mood: 'spotlights' };
  if (game.engineType === 'CRASH' || game.code === 'ASCENT_CRASH') return { background: ['#1b2f8a', '#0a1030', '#05081a'], frame: '#22e1ff', accent: '#22e1ff', reels: '#0a1030', mood: 'stars' };
  if (game.theme === 'FRUIT' || game.theme === 'CITRUS') return { background: ['#0b7a5a', '#063a33', '#03201c'], frame: '#7dff5a', accent: '#ffd23f', reels: '#062a26', mood: 'bokeh' };
  return { background: ['#5a1478', '#2a0a4a', '#12062b'], frame: '#ffd23f', accent: '#ffd23f', reels: '#180d23', mood: game.code === 'HOT_7S' || game.code === 'BLAZING_HIT' ? 'embers' : 'sparkle' };
}

const l = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  flourish: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rule: { height: 2, borderRadius: 1 },
  frame: { padding: 2, borderRadius: 10, shadowColor: '#000', shadowOpacity: .6, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 6 },
  plaque: { borderRadius: 8, paddingVertical: 1, alignItems: 'center', overflow: 'hidden' },
  sheen: { position: 'absolute', left: 0, right: 0, top: 0, height: '45%' },
  kicker: { fontWeight: '800', marginBottom: -3, marginTop: 1 },
});
