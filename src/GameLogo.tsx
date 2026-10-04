import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { Game } from './api';

/**
 * Each game's own title, drawn as a game-room logo rather than plain text: outlined, glowing words in the game's
 * colours, with its ornament. Known games have a design of their own; any other game gets one built from its name
 * and kind, so a new game is never a plain line of text.
 */
type Word = { text: string; fill: string; outline: string; glow?: string; scale?: number; italic?: boolean; serif?: boolean };
type Logo = { top?: string; topColor?: string; words: Word[]; ornament?: string; plaque?: [string, string]; stacked?: boolean };
export type GameTheme = { background: [string, string, string]; frame: string; accent: string; reels: string };

const serif = Platform.OS === 'android' ? 'serif' : 'Georgia';
const LOGOS: Record<string, Logo> = {
  VEGAS_JACKPOT_DEVIL_HEART: { top: 'VEGAS JACKPOT', topColor: '#ffd23f', ornament: '😈', words: [
    { text: 'DEVIL', fill: '#ff2a3a', outline: '#3a0005', glow: '#ff6a00', italic: true },
    { text: '♥', fill: '#ff3c7a', outline: '#ffd23f', glow: '#ff0040', scale: 1.15 },
    { text: 'HEART', fill: '#ffe45c', outline: '#7a0010', glow: '#ff3a00', italic: true }] },
  HOT_7S: { ornament: '🔥', words: [
    { text: 'HOT', fill: '#ff7a1a', outline: '#3a0a00', glow: '#ff3a00', italic: true },
    { text: '7s', fill: '#ffd23f', outline: '#8a1000', glow: '#ff9a00', scale: 1.35, serif: true, italic: true }] },
  FRUIT_RUSH: { ornament: '🍒', words: [
    { text: 'FRUIT', fill: '#7dff5a', outline: '#0b4a1a', glow: '#2ee57a' },
    { text: 'RUSH', fill: '#ffb01f', outline: '#5a2000', glow: '#ff7a1a', italic: true }] },
  LUCKY_FIRE_BLITZ: { top: 'LUCKY', topColor: '#ffe45c', ornament: '🏮', words: [
    { text: 'FIRE', fill: '#ff4a1a', outline: '#3a0500', glow: '#ff9a00', italic: true },
    { text: 'BLITZ', fill: '#ffd23f', outline: '#7a1a00', glow: '#ff5a00', italic: true }] },
  SEVEN_STARS_DELUXE: { ornament: '★', plaque: ['#ff3cac', '#7a0b5a'], words: [
    { text: 'SEVEN STARS', fill: '#ffe45c', outline: '#4a1a00', glow: '#ffb01f', serif: true, italic: true },
    { text: 'DELUXE', fill: '#ffffff', outline: '#7a0b5a' }] },
  GALAXY_KENO: { ornament: '🎱', words: [
    { text: 'GALAXY', fill: '#22e1ff', outline: '#04223a', glow: '#22e1ff' },
    { text: 'KENO', fill: '#ffd23f', outline: '#3a1a00', glow: '#ff9a00', scale: 1.15 }] },
  ROULETTE: { ornament: '🎡', plaque: ['#13a95a', '#06301c'], words: [{ text: 'ROULETTE', fill: '#ffe45c', outline: '#2a1a00', glow: '#ffd23f', serif: true }] },
  ASCENT_CRASH: { ornament: '✈', words: [
    { text: 'ASCENT', fill: '#ffffff', outline: '#0a1a4a', glow: '#3c7bff', italic: true },
    { text: 'CRASH', fill: '#22e1ff', outline: '#04223a', glow: '#22e1ff', italic: true }] },
  DRAGON_TIDE: { ornament: '🐉', words: [
    { text: 'DRAGON', fill: '#ffd23f', outline: '#04223a', glow: '#22e1ff' },
    { text: 'TIDE', fill: '#22e1ff', outline: '#04223a', glow: '#3c7bff', italic: true }] },
  QUICK_HIT: { ornament: '⚡', words: [
    { text: 'QUICK', fill: '#22e1ff', outline: '#04123a', glow: '#3c7bff', italic: true },
    { text: 'HIT', fill: '#ffe45c', outline: '#3a1a00', glow: '#ffb01f', italic: true }] },
  TEN_X_TRIPLE: { ornament: '💎', words: [
    { text: '10×', fill: '#ffd23f', outline: '#5a0000', glow: '#ff3a00', scale: 1.4, serif: true },
    { text: 'TRIPLE', fill: '#ff3c3c', outline: '#2a0000', glow: '#ff6a00' }] },
  WILD_BUFFALO: { ornament: '🦬', words: [
    { text: 'WILD', fill: '#ffb01f', outline: '#3a1a00', glow: '#ff7a1a', italic: true },
    { text: 'BUFFALO', fill: '#fff1d5', outline: '#5a2a00', glow: '#ffb01f' }] },
  SIMPLE_DOLLAR: { ornament: '💵', plaque: ['#1b8a4a', '#062a16'], words: [
    { text: 'SIMPLE', fill: '#d9ffd9', outline: '#062a16', scale: .7 },
    { text: '$ DOLLAR', fill: '#7dff5a', outline: '#062a16', glow: '#2ee57a', serif: true }] },
  BLAZING_HIT: { ornament: '🔥', words: [
    { text: 'BLAZING', fill: '#ff5a1a', outline: '#3a0500', glow: '#ff9a00', italic: true },
    { text: 'HIT', fill: '#ffe45c', outline: '#7a1a00', glow: '#ff5a00', scale: 1.2, italic: true }] },
};
const PALETTES: Array<[string, string, string]> = [['#ff3cac', '#3a0730', '#ff9ad6'], ['#22e1ff', '#04223a', '#3c7bff'], ['#ffd23f', '#3a1a00', '#ff9a00'], ['#7dff5a', '#0b4a1a', '#2ee57a']];

function logoOf(game: Game): Logo {
  if (LOGOS[game.code]) return LOGOS[game.code];
  // Anything else: its name in two coloured halves, in a palette picked from its code so it stays the same.
  const hash = [...game.code].reduce((sum, ch) => sum + ch.charCodeAt(0), 0), [fill, outline, glow] = PALETTES[hash % PALETTES.length];
  const words = game.name.toUpperCase().replace(/[^A-Z0-9 ×:']/g, '').split(/[ :]+/).filter(Boolean);
  const half = Math.ceil(words.length / 2);
  return { ornament: game.presentation?.glyph || '✦', words: [
    { text: words.slice(0, half).join(' '), fill, outline, glow, italic: true },
    ...(words.length > 1 ? [{ text: words.slice(half).join(' '), fill: '#ffe45c', outline: '#3a1a00', glow: '#ffb01f', italic: true }] : [])] };
}

/** A word with a hard outline: the text drawn eight times around, in the outline colour, then the fill on top. */
function Outlined({ word, size }: { word: Word; size: number }) {
  const font = size * (word.scale ?? 1), o = Math.max(1.5, font * .07);
  const style = { fontSize: font, lineHeight: font * 1.12, fontWeight: '900' as const, fontStyle: word.italic ? 'italic' as const : 'normal' as const, fontFamily: word.serif ? serif : undefined, letterSpacing: font * .02 };
  const offsets = [[-o, 0], [o, 0], [0, -o], [0, o], [-o, -o], [o, o], [-o, o], [o, -o]];
  // The outline copies sit inside a margin of the outline's width, so nothing is drawn outside the word's own box.
  return <View style={{ padding: Math.ceil(o) }}>
    {offsets.map(([x, y], i) => <Text key={i} numberOfLines={1} style={[style, { position: 'absolute', left: Math.ceil(o) + x, top: Math.ceil(o) + y, color: word.outline }]} importantForAccessibility="no">{word.text}</Text>)}
    <Text numberOfLines={1} style={[style, { color: word.fill, textShadowColor: word.glow ?? 'transparent', textShadowRadius: word.glow ? font * .35 : 0, textShadowOffset: { width: 0, height: 0 } }]}>{word.text}</Text>
  </View>;
}

export function GameLogo({ game, height = 40, maxWidth }: { game: Game; height?: number; maxWidth?: number }) {
  const logo = logoOf(game);
  // A narrow bar drops the ornaments and shrinks the words until the logo fits (about 0.78em a heavy letter, as drawn).
  const letters = logo.words.reduce((sum, word) => sum + word.text.length * (word.scale ?? 1), 0) + logo.words.length;
  const fit = maxWidth ? Math.min(1, maxWidth / (letters * height * .78 * (logo.top ? .62 : .78) + (logo.plaque ? 32 : 0))) : 1;
  const ornaments = !maxWidth || fit >= 1 && maxWidth > letters * height * .5 + height * 1.6;
  const size = height * (logo.top ? .62 : .78) * Math.max(.55, fit);
  const words = <View style={[l.row, logo.stacked && { flexDirection: 'column', gap: 0 }]}>{logo.words.map((word, i) => <Outlined key={i} word={word} size={logo.stacked ? size * .8 : size} />)}</View>;
  return <View accessible accessibilityRole="header" accessibilityLabel={game.name} style={l.root}>
    {!!logo.top && <Text style={[l.top, { color: logo.topColor, fontSize: Math.max(11, height * .24) }]}>{logo.top}</Text>}
    <View style={l.row}>
      {ornaments && !!logo.ornament && <Text style={{ fontSize: size * .8 }}>{logo.ornament}</Text>}
      {logo.plaque ? <LinearGradient colors={logo.plaque} style={l.plaque}>{words}</LinearGradient> : words}
      {ornaments && !!logo.ornament && <Text style={{ fontSize: size * .8, transform: [{ scaleX: -1 }] }}>{logo.ornament}</Text>}
    </View>
  </View>;
}

/** The colours a game's screen is dressed in, from its kind and theme. */
export function themeOf(game: Game): GameTheme {
  const layout = game.engine?.layout;
  if (game.code === 'VEGAS_JACKPOT_DEVIL_HEART' || layout === 'CLASSIC_5L') return { background: ['#4a0a06', '#250404', '#120102'], frame: '#ff7a1a', accent: '#ffd23f', reels: '#1a0204' };
  if (layout === 'GRID_3X3') return { background: ['#5a1a06', '#2a0803', '#140402'], frame: '#ffb01f', accent: '#ffd23f', reels: '#1a0703' };
  if (layout === 'VIDEO_5X3') return { background: ['#3a1478', '#1d0838', '#0b0422'], frame: '#ff3cac', accent: '#ffd23f', reels: '#140a24' };
  if (layout === 'KENO') return { background: ['#0b2a5a', '#0b0626', '#05031a'], frame: '#22e1ff', accent: '#22e1ff', reels: '#0e1a3a' };
  if (layout === 'ROULETTE') return { background: ['#0b4a2a', '#06301c', '#03180e'], frame: '#e7c888', accent: '#ffe45c', reels: '#103629' };
  if (game.engineType === 'CRASH' || game.code === 'ASCENT_CRASH') return { background: ['#1b2f8a', '#0a1030', '#05081a'], frame: '#22e1ff', accent: '#22e1ff', reels: '#0a1030' };
  if (game.theme === 'FRUIT' || game.theme === 'CITRUS') return { background: ['#0b7a5a', '#063a33', '#03201c'], frame: '#7dff5a', accent: '#ffd23f', reels: '#062a26' };
  return { background: ['#5a1478', '#2a0a4a', '#12062b'], frame: '#ffd23f', accent: '#ffd23f', reels: '#180d23' };
}

const l = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center' },
  top: { fontWeight: '900', letterSpacing: 3, marginBottom: -2 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 },
  plaque: { paddingHorizontal: 12, paddingVertical: 2, borderRadius: 10, borderWidth: 2, borderColor: '#ffd23f' },
});
