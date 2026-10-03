import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { Game } from './api';
import { SymbolArt } from './WebLook';

/**
 * The screen a game opens behind, as on the website: the Loot777x logo, the game's poster, a progress bar and a tip.
 * The game mounts underneath at once (the fish table fetches its drawing engine meanwhile) and shows when this fades.
 */
const MARK = require('../assets/brand/loot777x-mark.png');
const DURATION = 1500;
const GENERIC = ['Set a loss limit from your account to stay in control.', 'Every result is decided by our game server and kept in your history.', 'Turn the sound on for the full experience.'];
const BY_KIND: Record<string, string[]> = {
  FISH: ['Hold to keep firing. Lock sends every bullet to one creature.', 'Watch for the Tide Dragon: up to 500x.'],
  CRASH: ['Cash out before the flight ends.'],
  ROULETTE: ['Tap chips onto the table, then spin.'],
  CLASSIC_5L: ['A WILD or 2X fills its reel and locks it for a free respin.', 'Three JACKPOTs on a line pay 10x to 30x your bet.'],
  KENO: ['Mark up to 10 numbers. Quick pick chooses for you.', 'More numbers marked: rarer, bigger wins, up to 10,000x.'],
};
const THEMES: Record<string, [string, string]> = { FISH: ['#1fa6d6', '#041630'], CRASH: ['#2f7dff', '#0a1030'], ROULETTE: ['#1fae6a', '#06180f'], GRID_3X3: ['#ff6a1a', '#1a0602'], KENO: ['#22e1ff', '#0b0626'], CLASSIC_5L: ['#ff3a00', '#1a0204'] };
const kindOf = (game: Game) => game.engineType === 'CRASH' || game.code === 'ASCENT_CRASH' ? 'CRASH' : game.engine?.layout ?? 'REEL_3';

export function GameLoading({ game, legal, onDone }: { game: Game; legal?: string; onDone: () => void }) {
  const { width, height } = useWindowDimensions(), landscape = width > height;
  const kind = kindOf(game), [glow, deep] = THEMES[kind] ?? ['#b84dff', '#12052b'];
  const tips = [...(BY_KIND[kind] ?? []), ...(game.engine?.rules ?? []).slice(0, 2), ...GENERIC];
  const [tip, setTip] = useState(() => Math.floor(Math.random() * tips.length));
  const [percent, setPercent] = useState(0);
  const progress = useRef(new Animated.Value(0)).current, fade = useRef(new Animated.Value(1)).current;
  const float = useRef(new Animated.Value(0)).current, pop = useRef(new Animated.Value(0)).current;
  const done = useRef(onDone); done.current = onDone;

  useEffect(() => {
    let reduced = false;
    const id = progress.addListener(({ value }) => setPercent(Math.round(value * 100)));
    const rotate = setInterval(() => setTip(current => (current + 1) % tips.length), 2200);
    const bob = Animated.loop(Animated.sequence([
      Animated.timing(float, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(float, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true })]));
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { reduced = value; if (!value) bob.start(); });
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }).start();
    // Fast to begin with, then easing into the finish, like a download.
    Animated.timing(progress, { toValue: 1, duration: DURATION, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(() => {
      Animated.timing(fade, { toValue: 0, duration: reduced ? 0 : 320, useNativeDriver: true }).start(() => done.current());
    });
    return () => { progress.removeListener(id); clearInterval(rotate); bob.stop(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const poster = landscape ? Math.min(120, height * .3) : Math.min(170, width * .42);
  const barWidth = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return <Animated.View style={[st.root, { opacity: fade, transform: [{ scale: fade.interpolate({ inputRange: [0, 1], outputRange: [1.04, 1] }) }] }]}>
    <View style={st.fill100} accessible role="progressbar" aria-label={`Loading ${game.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} testID="game-loading">
    <LinearGradient colors={[glow + 'aa', deep, deep]} locations={[0, .55, 1]} start={{ x: .5, y: .35 }} end={{ x: .5, y: 1 }} style={StyleSheet.absoluteFill} />
    <View style={[st.center, landscape && st.centerWide]}>
      <Animated.View style={[st.logo, { transform: [{ translateY: float.interpolate({ inputRange: [0, 1], outputRange: [0, -7] }) }] }]}>
        <Image source={MARK} style={{ width: landscape ? 52 : 64, height: landscape ? 52 : 64 }} accessibilityIgnoresInvertColors />
        <Text style={[st.word, landscape && { fontSize: 30 }]}>LOOT<Text style={st.wordGold}>777X</Text></Text>
      </Animated.View>
      <View style={[st.body, landscape && st.bodyWide]}>
        <Animated.View style={[st.poster, { width: poster, height: poster, transform: [{ scale: pop }] }]}>
          <LinearGradient colors={['#ff3c7a', '#b0105a', '#3a0730']} style={StyleSheet.absoluteFill} />
          <Text style={st.glyphFallback}>{kind === 'FISH' ? '🐉' : kind === 'CRASH' ? '🚀' : kind === 'KENO' ? '🎱' : ''}</Text>
          {!['FISH', 'CRASH', 'KENO'].includes(kind) && <SymbolArt symbol={game.featuredSymbol || '7'} size={poster * .72} />}
        </Animated.View>
        <View style={[st.info, landscape && { alignItems: 'flex-start' }]}>
          <Text style={[st.name, landscape && { fontSize: 24 }]} numberOfLines={1}>{game.name}</Text>
          <View style={st.bar}>
            <Animated.View style={[st.fill, { width: barWidth }]}><LinearGradient colors={['#ff8a00', '#ffd54a', '#fff6c2']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} /></Animated.View>
            <Text style={st.percent}>{percent}%</Text>
          </View>
          <Text style={st.status}>{percent < 100 ? 'LOADING GAME…' : 'READY!'}</Text>
          <Text style={[st.tip, landscape && { textAlign: 'left' }]} numberOfLines={2}><Text style={st.tipBadge}> TIP </Text>  {tips[tip % tips.length]}</Text>
        </View>
      </View>
    </View>
    {!!legal && <Text style={st.legal} numberOfLines={1}>{legal}</Text>}
    </View>
  </Animated.View>;
}

const st = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, zIndex: 50, alignItems: 'center', justifyContent: 'center', backgroundColor: '#12052b', padding: 16 },
  fill100: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: 16 },
  center: { alignItems: 'center', gap: 18, width: '100%', maxWidth: 520 },
  centerWide: { maxWidth: 760, gap: 10 },
  logo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  word: { color: '#ffffff', fontSize: 38, fontWeight: '900', letterSpacing: 1, textShadowColor: '#ffb800', textShadowRadius: 14, textShadowOffset: { width: 0, height: 0 } },
  wordGold: { color: '#ffcf2e' },
  body: { alignItems: 'center', gap: 16, width: '100%' },
  bodyWide: { flexDirection: 'row', justifyContent: 'center', gap: 24 },
  poster: { borderRadius: 22, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#ffd54a' },
  glyphFallback: { position: 'absolute', fontSize: 64 },
  info: { alignItems: 'center', gap: 10, flexShrink: 1 },
  name: { color: '#ffffff', fontSize: 30, fontWeight: '900', letterSpacing: .5, textShadowColor: '#6b21a8', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0 },
  bar: { width: 300, maxWidth: '100%', height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#ffd54a', backgroundColor: 'rgba(0,0,0,.45)', padding: 3, justifyContent: 'center' },
  fill: { height: '100%', borderRadius: 9, overflow: 'hidden' },
  percent: { position: 'absolute', alignSelf: 'center', color: '#ffffff', fontSize: 13, lineHeight: 16, fontWeight: '900', textShadowColor: '#3a1400', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } },
  status: { color: '#ffe68a', fontSize: 12, letterSpacing: 2.5, fontWeight: '700' },
  tip: { color: '#e6d8ff', fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 420 },
  tipBadge: { backgroundColor: '#ffd54a', color: '#3a1400', fontWeight: '900', fontSize: 11 },
  legal: { position: 'absolute', bottom: 14, left: 16, right: 16, textAlign: 'center', color: 'rgba(255,255,255,.55)', fontSize: 11 },
});
