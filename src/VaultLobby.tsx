import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, Platform, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as SecureStore from 'expo-secure-store';
import { API_URL, Balance, Game } from './api';
import type { FloorState } from './FloorNow';
import { InboxButton, SoundToggle } from './Popups';
import { Tap } from './Tap';
import { c, useReducedMotion } from './theme';
import { artOf, CASINO } from './casinoArt';
import { DailyWheelButton } from './DailyWheel';
import { Site, SymbolArt } from './WebLook';

/**
 * The lobby a phone held sideways opens on, laid out the way the big sweepstakes game rooms are: the player's ID
 * and credits top left, the brand in the middle, two rows of large game cabinets that scroll sideways, and the
 * categories docked along the bottom. Wallet, history and account sit behind the icons top right, so the games get
 * the whole screen. The room is dressed in 3D casino art (src/casinoArt.ts): a casino floor behind everything, a
 * rendered centrepiece floating in each cabinet, the featured game's banner first in line, and rendered category icons.
 */
export type Section = 'SLOTS' | 'FISHING' | 'ALL' | 'OTHER' | 'FAVORITE';
const SECTIONS: { key: Section; icon: number; label: string }[] = [
  { key: 'SLOTS', icon: CASINO.slot, label: 'SLOTS' }, { key: 'FISHING', icon: CASINO.fish, label: 'FISHING' }, { key: 'ALL', icon: CASINO.chips, label: 'ALL GAMES' },
  { key: 'OTHER', icon: CASINO.dice, label: 'OTHER' }, { key: 'FAVORITE', icon: CASINO.heart, label: 'FAVORITE' },
];
const MARK = require('../assets/brand/loot777x-mark.png');
const FAVORITES = 'lobby-favorites';

export const sectionOf = (game: Game): Section =>
  game.engine?.layout === 'FISH' ? 'FISHING'
    : ['REEL_3', 'GRID_3X3', 'VIDEO_5X3', 'CLASSIC_5L', 'FIRE_LINK', 'LINES_5X3'].includes(game.engine?.layout ?? '') ? 'SLOTS' : 'OTHER';

/** Favourites outlive the visit: the phone's secure store, or the browser's storage in the web preview. */
async function readFavorites(): Promise<string[]> {
  try {
    const value = Platform.OS === 'web' ? localStorage.getItem(FAVORITES) : await SecureStore.getItemAsync(FAVORITES);
    return value ? JSON.parse(value) : [];
  } catch { return []; }
}
function saveFavorites(codes: string[]) {
  const value = JSON.stringify(codes);
  try { if (Platform.OS === 'web') localStorage.setItem(FAVORITES, value); else void SecureStore.setItemAsync(FAVORITES, value); } catch { /* kept for this visit */ }
}

/** Each kind of game has its own cabinet colours, so the room reads at a glance. */
function colorsOf(game: Game, index: number): [string, string, string] {
  if (game.engine?.layout === 'FISH') return ['#1fb6e8', '#0b4f8a', '#041630'];
  if (game.engineType === 'CRASH') return ['#3c7bff', '#1b2f8a', '#0a1030'];
  if (game.engine?.layout === 'ROULETTE') return ['#1fae6a', '#0b5a3a', '#06180f'];
  if (game.engine?.layout === 'GRID_3X3') return ['#ff8a1a', '#a4220a', '#1a0602'];
  if (game.theme === 'FRUIT' || game.theme === 'CITRUS') return ['#12c98c', '#0b7a66', '#062a3a'];
  return index % 2 ? ['#b04dff', '#5a1aa8', '#1c0b4d'] : ['#ff3c7a', '#a8105a', '#3a0730'];
}

/** A soft pool of light under a centrepiece: rings of fading white, since a native view has no radial gradient. */
function Spotlight({ size }: { size: number }) {
  return <View pointerEvents="none" style={[v.spot, { width: size, height: size }]}>
    {[1, .78, .56, .34].map((k, i) => <View key={i} style={{ position: 'absolute', width: size * k, height: size * k, borderRadius: size, backgroundColor: `rgba(255,236,170,${.05 + i * .035})` }} />)}
  </View>;
}

function Cabinet({ game, index, width, height, favorite, float, onPlay, onFavorite }: {
  game: Game; index: number; width: number; height: number; favorite: boolean; float: Animated.Value; onPlay: () => void; onFavorite: () => void;
}) {
  const art = Math.min(height * .27, width * .34), image = game.presentation?.tileImageId, rendered = artOf(game);
  const badge = game.presentation?.badge?.split('·')[0].trim();
  // Neighbouring cabinets float out of step, so the room breathes rather than bounces.
  const bob = float.interpolate({ inputRange: [0, 1], outputRange: index % 2 ? [-4, 4] : [4, -4] });
  return <View style={[v.frame, { width, height }]}>
    <LinearGradient colors={colorsOf(game, index)} start={{ x: .5, y: 0 }} end={{ x: .5, y: 1 }} style={v.screen}>
      <Tap haptic="heavy" accessibilityLabel={`Play ${game.name}`} onPress={onPlay} style={v.press}>
        {image ? <Image source={{ uri: `${API_URL}/api/media/${image}` }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          : <View style={[v.art, { height: height * .5 }]}>
            <Spotlight size={art * 1.7} />
            <Animated.View style={{ transform: [{ translateY: bob }] }}>
              {/* Every tile shows 3D art: its own render, else its featured slot symbol. */}
              {rendered ? <Image source={rendered} style={{ width: art * 1.5, height: art * 1.3 }} resizeMode="contain" />
                : <SymbolArt symbol={game.featuredSymbol || '7'} size={art * 1.2} />}
            </Animated.View>
            <View style={[v.shadow, { width: art * .9, height: art * .12, borderRadius: art }]} />
          </View>}
        <LinearGradient pointerEvents="none" colors={['#ffffff30', '#ffffff00']} style={v.gloss} />
        <LinearGradient colors={['#00000000', '#000000cc']} style={v.nameBand}>
          <Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={.6} style={[v.name, { fontSize: Math.max(15, Math.min(26, height * .13)) }]}>{game.name.toUpperCase()}</Text>
        </LinearGradient>
      </Tap>
    </LinearGradient>
    {!!badge && <LinearGradient colors={['#5aff9d', '#12a85a']} style={v.badge}><Text style={v.badgeText} numberOfLines={1}>{badge}</Text></LinearGradient>}
    <Tap haptic="select" accessibilityLabel={`Favorite ${game.name}`} accessibilityState={{ selected: favorite }} onPress={onFavorite} style={v.heart}>
      <Text style={{ color: favorite ? '#ff5aa8' : '#ffffffcc', fontSize: 20 }}>{favorite ? '♥' : '♡'}</Text>
    </Tap>
    {/* The rivets that make it a cabinet rather than a card. */}
    <View style={[v.rivet, { left: -5, top: -5 }]} /><View style={[v.rivet, { right: -5, bottom: -5 }]} />
  </View>;
}

/** The featured game (Admin → Site content → Lobby), first in the room: its art over a crown and chips, and PLAY NOW. */
function Featured({ game, width, height, float, onPlay }: { game: Game; width: number; height: number; float: Animated.Value; onPlay: () => void }) {
  const art = artOf(game), size = Math.min(width * .5, height * .3);
  const bob = float.interpolate({ inputRange: [0, 1], outputRange: [-6, 6] });
  const sweep = float.interpolate({ inputRange: [0, 1], outputRange: [-width, width * 1.2] });
  return <View style={[v.featured, { width, height }]}>
    <LinearGradient colors={['#ffe58a', '#c8861a', '#5a2a04']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={v.featuredRim}>
      <LinearGradient colors={['#4a0a5a', '#1e0738', '#0a0320']} style={v.featuredScreen}>
        <Tap haptic="heavy" accessibilityLabel={`Featured: play ${game.name}`} onPress={onPlay} style={v.featuredPress}>
          <Text style={v.featuredKicker}>★ FEATURED ★</Text>
          <View style={{ alignItems: 'center', justifyContent: 'center', height: size * 1.25 }}>
            <Spotlight size={size * 1.5} />
            <Image source={CASINO.crown} style={{ position: 'absolute', top: -size * .12, width: size * .42, height: size * .27 }} resizeMode="contain" />
            <Animated.View style={{ transform: [{ translateY: bob }] }}>
              {art ? <Image source={art} style={{ width: size, height: size }} resizeMode="contain" /> : <SymbolArt symbol={game.featuredSymbol || '7'} size={size * .85} />}
            </Animated.View>
            <Image source={CASINO.chips} style={{ position: 'absolute', bottom: -size * .1, right: -size * .08, width: size * .5, height: size * .42 }} resizeMode="contain" />
            <Image source={CASINO.coins} style={{ position: 'absolute', bottom: -size * .12, left: -size * .08, width: size * .5, height: size * .4 }} resizeMode="contain" />
          </View>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={.5} style={v.featuredName}>{game.name.toUpperCase()}</Text>
          <LinearGradient colors={['#ffe58a', '#ffb01f', '#e0700a']} style={v.playNow}><Text style={v.playNowText} numberOfLines={1}>PLAY NOW</Text></LinearGradient>
        </Tap>
        <Animated.View pointerEvents="none" style={[v.sheen, { transform: [{ translateX: sweep }, { rotate: '20deg' }] }]}>
          <LinearGradient colors={['#ffffff00', '#ffffff2a', '#ffffff00']} start={{ x: 0, y: .5 }} end={{ x: 1, y: .5 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
      </LinearGradient>
    </LinearGradient>
  </View>;
}

/** Who just won what, one line at a time, as the room's ticker. Only the floor's real wins are shown. */
function Ticker({ floor }: { floor?: FloorState }) {
  const wins = floor?.snapshot?.scoreboard ?? [];
  const [at, setAt] = useState(0);
  useEffect(() => { const timer = setInterval(() => setAt(n => n + 1), 4000); return () => clearInterval(timer); }, []);
  if (!wins.length) return null;
  const win = wins[at % wins.length];
  return <View style={v.ticker}><Text numberOfLines={1} style={v.tickerText}>
    🎉 Congratulations to <Text style={{ color: c.cyan }}>{win.player || 'a player'}</Text> — won <Text style={{ color: c.gold, fontWeight: '900' }}>{win.payout.toFixed(2)}</Text> on {win.gameName} ({win.multiplier}×)
  </Text></View>;
}

export function VaultLobby({ site, games, balance, playerId, token, floor, loading, error, onRetry, onPlay, onWallet, onHistory, onAccount }: {
  site: Site; loading?: boolean; error?: string; onRetry?: () => void; games: Game[]; balance: Balance | null; playerId: string; token: string; floor?: FloorState;
  onPlay: (game: Game) => void; onWallet: () => void; onHistory: () => void; onAccount: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const [section, setSection] = useState<Section>('ALL'), [favorites, setFavorites] = useState<string[]>([]);
  useEffect(() => { void readFavorites().then(setFavorites); }, []);
  const toggle = (code: string) => setFavorites(previous => {
    const next = previous.includes(code) ? previous.filter(c => c !== code) : [...previous, code];
    saveFavorites(next); return next;
  });
  const shown = useMemo(() => games.filter(game => section === 'ALL' || (section === 'FAVORITE' ? favorites.includes(game.code) : sectionOf(game) === section)), [games, section, favorites]);
  // Two rows fill what the top bar and the dock leave; each cabinet keeps a poster's proportions.
  const rows = height < 300 ? 1 : 2, gap = 12;
  const cabinetHeight = Math.floor((height - 60 - 26 - 70 - 24 - gap * (rows - 1)) / rows);
  const cabinetWidth = Math.round(Math.min(cabinetHeight * 1.45, (width - 48) / 2.2));
  const columns: Game[][] = [];
  for (let i = 0; i < shown.length; i += rows) columns.push(shown.slice(i, i + rows));
  const id = playerId.replace(/-/g, '').slice(0, 8).toUpperCase();
  const logo = site.content.brand.logoImageId;
  // The admin's featured game (or the first one, if it is not on this floor); the lobby's hero switch hides it.
  const copy = site.content.lobby;
  const featured = section === 'ALL' && copy.heroEnabled !== false ? games.find(game => game.code === copy.featuredGameCode) ?? games[0] : undefined;
  // One slow swing drives every centrepiece's float and the banner's sheen; still when motion is reduced.
  const reduced = useReducedMotion(), float = useRef(new Animated.Value(.5)).current;
  useEffect(() => {
    if (reduced) { float.setValue(.5); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(float, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(float, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.start(); return () => loop.stop();
  }, [reduced, float]);

  return <View style={v.root}>
    <Image source={CASINO.floor} resizeMode="cover" style={v.backdrop} accessibilityIgnoresInvertColors />
    <LinearGradient pointerEvents="none" colors={['#0b0626e6', '#12062b8c', '#12062b70', '#0b0626ee']} locations={[0, .25, .7, 1]} style={StyleSheet.absoluteFill} />
    <View style={v.top}>
      <View style={v.player}>
        <Tap haptic="select" accessibilityLabel="Open account" onPress={onAccount}>
          <LinearGradient colors={[c.pink, c.violet]} style={v.avatar}><Text style={v.avatarText}>{(site.platformName[0] || 'L').toUpperCase()}</Text></LinearGradient>
        </Tap>
        <View><Text style={v.id}>ID {id}</Text>
          <Tap haptic="select" accessibilityLabel="Open wallet" onPress={onWallet} style={v.credits}>
            <Text style={v.coin}>$</Text><Text style={v.balance}>{balance ? balance.balance.toFixed(2) : '—'}</Text><Text style={v.plus}>＋</Text>
          </Tap>
        </View>
      </View>
      <View style={v.brand}>
        {logo ? <Image source={{ uri: `${API_URL}/api/media/${logo}` }} style={{ width: 36, height: 36, borderRadius: 18 }} /> : <Image source={MARK} style={{ width: 36, height: 36 }} />}
        <Text style={v.brandText} numberOfLines={1}>{logo ? site.platformName.toUpperCase() : <>LOOT<Text style={{ color: c.gold }}>777X</Text></>}</Text>
      </View>
      <View style={v.icons}>
        <SoundToggle /><InboxButton token={token} />
        <Tap haptic="select" accessibilityLabel="Game history" onPress={onHistory} style={v.icon}><Text style={v.iconText}>◷</Text></Tap>
        <Tap haptic="select" accessibilityLabel="Account" onPress={onAccount} style={v.icon}><Text style={v.iconText}>⚙</Text></Tap>
      </View>
    </View>
    <Ticker floor={floor} />
    {!!error && <Tap haptic="select" accessibilityRole="button" onPress={onRetry} style={v.error}><Text style={v.errorText} numberOfLines={2}>{error}  ·  Tap to retry</Text></Tap>}
    <ScrollView key={section} horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={v.rows} decelerationRate="fast"
      snapToOffsets={columns.map((_, i) => (featured ? Math.round(cabinetWidth * 1.0) + gap : 0) + i * (cabinetWidth + gap))}>
      {featured && <Featured game={featured} width={Math.round(cabinetWidth * 1.0)} height={cabinetHeight * rows + gap * (rows - 1)} float={float} onPlay={() => onPlay(featured)} />}
      {columns.map((column, x) => <View key={x} style={{ gap }}>
        {column.map((game, y) => <Cabinet key={game.code} game={game} index={x * rows + y} width={cabinetWidth} height={cabinetHeight} float={float}
          favorite={favorites.includes(game.code)} onPlay={() => onPlay(game)} onFavorite={() => toggle(game.code)} />)}
      </View>)}
      {!shown.length && <View style={[v.empty, { width: width - 32 }]}><Text style={v.emptyText}>{loading ? 'Loading games…' : section === 'FAVORITE' ? 'Tap ♡ on a game to keep it here.' : 'No games here yet.'}</Text></View>}
    </ScrollView>
    {/* The daily wheel waits above the dock, bottom right, while today's spin is there. */}
    <View style={v.wheel} pointerEvents="box-none"><DailyWheelButton token={token} games={games} onPlay={onPlay} /></View>
    <View style={v.dock}>
      {SECTIONS.map(({ key, icon, label }) => {
        const on = key === section;
        return <Tap key={key} haptic="select" accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={label} onPress={() => setSection(key)} style={v.dockTab}>
          {on && <LinearGradient colors={['#ff3cac00', '#ff3cac88']} style={StyleSheet.absoluteFill} />}
          <Image source={icon} style={[v.dockIcon, on && { transform: [{ scale: 1.18 }, { translateY: -2 }] }]} resizeMode="contain" />
          <Text style={[v.dockLabel, on && { color: '#ffffff' }]}>{label}</Text>
          <View style={[v.dockBar, on && { backgroundColor: c.pink }]} />
        </Tap>;
      })}
    </View>
  </View>;
}

const v = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden', backgroundColor: '#0b0626' },
  backdrop: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  top: { height: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, gap: 8 },
  player: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  avatar: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: c.cyan },
  avatarText: { color: '#fff', fontSize: 22, fontWeight: '900' },
  id: { color: '#bfe9ff', fontSize: 11, fontWeight: '700', letterSpacing: 1.2, fontStyle: 'italic' },
  credits: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 1, paddingLeft: 6, paddingRight: 10, minHeight: 40, borderRadius: 20, borderWidth: 1, borderColor: '#22e1ff88', backgroundColor: '#04122dcc' },
  coin: { width: 20, height: 20, borderRadius: 10, backgroundColor: c.gold, color: c.goldInk, textAlign: 'center', fontWeight: '900', fontSize: 13, lineHeight: 20, overflow: 'hidden' },
  balance: { color: '#ffffff', fontWeight: '900', fontSize: 15, fontStyle: 'italic', minWidth: 54 },
  plus: { color: c.gold, fontWeight: '900', fontSize: 14 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 4, borderRadius: 12, borderWidth: 1.5, borderColor: '#22e1ffaa', backgroundColor: '#04122dcc' },
  brandText: { color: '#ffffff', fontSize: 22, fontWeight: '900', letterSpacing: 1.5, textShadowColor: '#22e1ff', textShadowRadius: 10, textShadowOffset: { width: 0, height: 0 } },
  icons: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 2, flex: 1 },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#22e1ff88', backgroundColor: '#04122dcc' },
  iconText: { color: '#bfe9ff', fontSize: 20 },
  ticker: { height: 26, marginHorizontal: 60, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 13, backgroundColor: '#04122dcc', borderWidth: 1, borderColor: '#22e1ff44' },
  tickerText: { color: '#fff6c2', fontSize: 12, textAlign: 'center' },
  rows: { gap: 12, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center' },
  frame: { borderRadius: 14, padding: 4, borderWidth: 2, borderColor: '#22e1ff', backgroundColor: '#0e2a52', shadowColor: '#22e1ff', shadowOpacity: .6, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 6 },
  screen: { flex: 1, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#ffffff30' },
  press: { flex: 1, justifyContent: 'flex-end' },
  art: { position: 'absolute', top: 6, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  spot: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  shadow: { position: 'absolute', bottom: 2, backgroundColor: '#00000066' },
  gloss: { position: 'absolute', top: 0, left: 0, right: 0, height: '38%' },
  featuredPress: { flex: 1, justifyContent: 'space-evenly', alignItems: 'stretch' },
  featured: { borderRadius: 18, shadowColor: '#ffb01f', shadowOpacity: .8, shadowRadius: 14, shadowOffset: { width: 0, height: 0 }, elevation: 10 },
  featuredRim: { flex: 1, borderRadius: 18, padding: 3 },
  featuredScreen: { flex: 1, borderRadius: 15, overflow: 'hidden', alignItems: 'stretch' },
  featuredKicker: { marginTop: 4, textAlign: 'center', color: '#ffe58a', fontWeight: '900', fontSize: 12, letterSpacing: 3 },
  featuredName: { marginHorizontal: 10, textAlign: 'center', color: '#ffffff', fontWeight: '900', fontStyle: 'italic', fontSize: 24, letterSpacing: .5, textShadowColor: '#ff3cac', textShadowRadius: 12, textShadowOffset: { width: 0, height: 0 } },
  playNow: { alignSelf: 'center', marginBottom: 6, minHeight: 44, paddingHorizontal: 18, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff3c0' },
  playNowText: { color: '#3b1600', fontWeight: '900', fontSize: 14, letterSpacing: 1.2 },
  sheen: { position: 'absolute', top: -40, bottom: -40, width: 70 },
  nameBand: { paddingHorizontal: 8, paddingTop: 18, paddingBottom: 8 },
  name: { color: '#ffe45c', fontWeight: '900', fontStyle: 'italic', textAlign: 'center', letterSpacing: .5, textShadowColor: '#b0105a', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 2 },
  badge: { position: 'absolute', top: -6, left: 14, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, maxWidth: '70%', transform: [{ rotate: '-4deg' }] },
  badgeText: { color: '#04220f', fontWeight: '900', fontSize: 11, letterSpacing: .8 },
  heart: { position: 'absolute', top: 2, right: 2, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  rivet: { position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: '#7fd8ff', borderWidth: 2, borderColor: '#0e2a52' },
  empty: { alignItems: 'center', justifyContent: 'center', flex: 1 },
  error: { marginHorizontal: 60, marginTop: 6, padding: 8, borderRadius: 10, backgroundColor: '#5a0d1ecc', borderWidth: 1, borderColor: c.bad },
  errorText: { color: c.bad, fontSize: 12, textAlign: 'center' },
  emptyText: { color: c.muted, fontSize: 15 },
  wheel: { position: 'absolute', right: 14, bottom: 80, zIndex: 5 },
  dock: { height: 70, flexDirection: 'row', justifyContent: 'center', gap: 6, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: '#22e1ff55', backgroundColor: '#071538e8' },
  dockTab: { width: 112, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderTopLeftRadius: 14, borderTopRightRadius: 14 },
  dockIcon: { width: 34, height: 30 },
  dockLabel: { color: '#9fc8e8', fontSize: 11, fontWeight: '900', letterSpacing: 1.5, marginTop: 2 },
  dockBar: { position: 'absolute', bottom: 0, left: 18, right: 18, height: 3, borderRadius: 2, backgroundColor: 'transparent' },
});
