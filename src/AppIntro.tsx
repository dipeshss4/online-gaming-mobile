import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GOLD, MetalText } from './GameLogo';
import { sound } from './sound';

/**
 * The intro the app opens with, played like a short film over the app while it loads (about 3.5 s, tap to skip):
 * light rays spin up on a dark stage, the Loot777x coin drops in with a ring of light, LOOT and 777X slide in from
 * either side in gold, a sheen sweeps across them, coins burst out and the tagline and a loading bar settle in;
 * then the whole thing fades into the lobby. Reduced motion gets a still card and a short fade instead.
 */
const MARK = require('../assets/brand/loot777x-mark.png');
const DURATION = 3500, RAYS = 16, COINS = 14, SPARKS = 18;

export function AppIntro({ onStart, onDone }: { onStart?: () => void; onDone: () => void }) {
  const { width, height } = useWindowDimensions(), short = Math.min(width, height);
  const t = useRef(new Animated.Value(0)).current;        // the timeline, 0 → 1 over DURATION
  const spin = useRef(new Animated.Value(0)).current;     // the rays, turning all the while
  const fade = useRef(new Animated.Value(1)).current;
  const [still, setStill] = useState(false);
  const done = useRef(onDone); done.current = onDone;
  const finished = useRef(false);
  // Coins burst in fixed directions so every opening looks the same; sparks sit at fixed places on the stage.
  const coins = useRef(Array.from({ length: COINS }, (_, i) => ({ angle: (i / COINS) * Math.PI * 2 + (i % 2 ? .2 : -.1), reach: .55 + (i * 37 % 40) / 100, size: .05 + (i * 13 % 5) / 100 }))).current;
  const sparks = useRef(Array.from({ length: SPARKS }, (_, i) => ({ x: (i * 53 % 100) / 100, y: (i * 29 % 100) / 100, delay: (i * 7 % 10) / 10 }))).current;

  function finish() {
    if (finished.current) return;
    finished.current = true;
    Animated.timing(fade, { toValue: 0, duration: still ? 200 : 450, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(() => done.current());
  }

  useEffect(() => {
    let alive = true, timer: ReturnType<typeof setTimeout> | undefined;
    void AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      if (!alive) return;
      if (reduced) { setStill(true); t.setValue(1); timer = setTimeout(finish, 900); return; }
      // Browsers refuse sound before the first tap (the web build is a preview); phones play it.
      if (Platform.OS !== 'web') sound.play('intro');
      Animated.loop(Animated.timing(spin, { toValue: 1, duration: 9000, easing: Easing.linear, useNativeDriver: true })).start();
      Animated.timing(t, { toValue: 1, duration: DURATION, easing: Easing.linear, useNativeDriver: true }).start(({ finished: ended }) => { if (ended) finish(); });
    });
    return () => { alive = false; if (timer) clearTimeout(timer); spin.stopAnimation(); t.stopAnimation(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Each beat of the film as a slice of the timeline.
  const at = (from: number, to: number, out: number[] = [0, 1]) => t.interpolate({ inputRange: [0, from / DURATION, to / DURATION, 1], outputRange: [out[0], out[0], out[1], out[1]], extrapolate: 'clamp' });
  const mark = short * .26, word = Math.min(short * .17, width * .11);
  const rays = Array.from({ length: RAYS }, (_, i) => i);

  return <Animated.View onLayout={() => onStart?.()} style={[StyleSheet.absoluteFill, z.root, { opacity: fade }]} accessibilityLabel="Loot777x" accessibilityRole="image">
    <Pressable style={StyleSheet.absoluteFill} onPress={finish} accessibilityRole="button" accessibilityLabel="Skip intro">
      <LinearGradient colors={['#3a0f6e', '#14052e', '#06010f']} start={{ x: .5, y: .3 }} end={{ x: .5, y: 1 }} style={StyleSheet.absoluteFill} />

      {/* Light rays behind the mark, turning slowly and opening out as the mark lands. */}
      <Animated.View style={[z.center, { opacity: at(150, 900, [0, .55]), transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }, { scale: at(150, 1100, [.4, 1]) }] }]} pointerEvents="none">
        {rays.map(i => <View key={i} style={[z.ray, { height: Math.max(width, height) * 1.3, transform: [{ rotate: `${(i * 180) / RAYS}deg` }] }]}>
          <LinearGradient colors={['#ffd23f00', i % 2 ? '#ffd23f33' : '#ff3cac2a', '#ffd23f00']} style={StyleSheet.absoluteFill} />
        </View>)}
      </Animated.View>

      {/* Twinkling sparks scattered over the stage. */}
      {sparks.map((p, i) => <Animated.Text key={i} pointerEvents="none" style={[z.spark, { left: `${p.x * 100}%`, top: `${p.y * 100}%`, fontSize: 10 + (i % 4) * 4,
        opacity: t.interpolate({ inputRange: [0, .1 + p.delay * .5, .2 + p.delay * .5, .35 + p.delay * .5, 1], outputRange: [0, 0, 1, .2, .6], extrapolate: 'clamp' }) }]}>✦</Animated.Text>)}

      <View style={z.center} pointerEvents="none">
        {/* The coin mark: drops in, overshoots, settles. */}
        <Animated.View style={{ opacity: at(250, 500), transform: [{ translateY: at(250, 800, [-height * .4, 0]) }, { scale: t.interpolate({ inputRange: [0, 650 / DURATION, 800 / DURATION, 950 / DURATION, 1], outputRange: [.5, .9, 1.15, 1, 1], extrapolate: 'clamp' }) }] }}>
          {/* A ring of light that pulses out around the mark as it lands. */}
          <Animated.View style={[z.ring, { left: -mark * .3, top: -mark * .3, width: mark * 1.6, height: mark * 1.6, borderRadius: mark, opacity: at(700, 1500, [.9, 0]), transform: [{ scale: at(700, 1500, [.6, 2.2]) }] }]} />
          <View style={[z.glow, { left: -mark * .05, top: -mark * .05, width: mark * 1.1, height: mark * 1.1, borderRadius: mark }]} />
          <Image source={MARK} style={{ width: mark, height: mark }} />
        </Animated.View>

        {/* The wordmark: LOOT from the left, 777X from the right, in gold, then a sheen across it. */}
        <View style={z.word}>
          <Animated.View style={{ opacity: at(900, 1250), transform: [{ translateX: at(900, 1400, [-width * .5, 0]) }] }}>
            <MetalText text="LOOT" size={word} metal={{ light: '#ffffff', deep: '#e6dcff', edge: '#3a1a6e', glow: '#b56cff' }} />
          </Animated.View>
          <Animated.View style={{ opacity: at(1000, 1350), transform: [{ translateX: at(1000, 1500, [width * .5, 0]) }] }}>
            <MetalText text="777X" size={word} metal={GOLD} />
          </Animated.View>
          <Animated.View pointerEvents="none" style={[z.sheen, { height: word * 1.5, transform: [{ translateX: at(1600, 2300, [-word * 5, word * 5]) }, { rotate: '18deg' }] }]}>
            <LinearGradient colors={['#ffffff00', '#ffffff22', '#ffffff66', '#ffffff22', '#ffffff00']} start={{ x: 0, y: .5 }} end={{ x: 1, y: .5 }} style={StyleSheet.absoluteFill} />
          </Animated.View>
        </View>

        {/* Tagline and a loading bar settle in last. */}
        <Animated.Text style={[z.tagline, { fontSize: Math.max(12, short * .03), opacity: at(1900, 2400), transform: [{ translateY: at(1900, 2400, [12, 0]) }] }]}>THE ORIGINAL COLLECTION</Animated.Text>
        <Animated.View style={[z.bar, { width: short * .5, opacity: at(2000, 2300) }]}>
          <Animated.View style={[z.barFill, { transform: [{ scaleX: at(2000, DURATION - 200) }] }]}>
            <LinearGradient colors={['#ff9f1a', '#ffe45c']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
          </Animated.View>
        </Animated.View>
      </View>

      {/* Gold coins burst out from behind the mark and fall away. */}
      {!still && <View style={z.center} pointerEvents="none">{coins.map((c, i) => {
        const size = short * c.size, dx = Math.cos(c.angle) * short * c.reach, dy = Math.sin(c.angle) * short * c.reach * .7;
        return <Animated.View key={i} style={[z.coin, { width: size, height: size, borderRadius: size,
          opacity: t.interpolate({ inputRange: [0, 1300 / DURATION, 1400 / DURATION, 2800 / DURATION, 1], outputRange: [0, 0, 1, 1, 0], extrapolate: 'clamp' }),
          transform: [{ translateX: at(1300, 2100, [0, dx]) }, { translateY: t.interpolate({ inputRange: [0, 1300 / DURATION, 2100 / DURATION, 1], outputRange: [0, 0, dy, dy + height * .35], extrapolate: 'clamp' }) },
            { rotate: t.interpolate({ inputRange: [0, 1300 / DURATION, 3300 / DURATION, 1], outputRange: ['0deg', '0deg', `${(i % 2 ? 1 : -1) * 540}deg`, `${(i % 2 ? 1 : -1) * 540}deg`], extrapolate: 'clamp' }) }] }]}>
          <LinearGradient colors={['#fff1b0', '#ffb01f', '#a8700f']} style={[StyleSheet.absoluteFill, { borderRadius: size }]} />
          <Text style={[z.coinText, { fontSize: size * .55 }]}>$</Text>
        </Animated.View>;
      })}</View>}

      <Text style={z.skip}>TAP TO SKIP</Text>
    </Pressable>
  </Animated.View>;
}

const z = StyleSheet.create({
  root: { zIndex: 1000, elevation: 1000, backgroundColor: '#06010f' },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  ray: { position: 'absolute', width: 70 },
  spark: { position: 'absolute', color: '#ffe68a' },
  ring: { position: 'absolute', borderWidth: 3, borderColor: '#ffd23f' },
  glow: { position: 'absolute', backgroundColor: '#ffb01f', opacity: .35, shadowColor: '#ffb01f', shadowOpacity: 1, shadowRadius: 30, shadowOffset: { width: 0, height: 0 } },
  word: { flexDirection: 'row', alignItems: 'center', marginTop: 8, overflow: 'hidden', paddingHorizontal: 6, paddingVertical: 4 },
  sheen: { position: 'absolute', width: 90, alignSelf: 'center' },
  tagline: { color: '#e6dcff', fontWeight: '800', letterSpacing: 5, marginTop: 6 },
  bar: { height: 6, borderRadius: 3, marginTop: 18, backgroundColor: '#ffffff1a', overflow: 'hidden' },
  barFill: { ...StyleSheet.absoluteFill, transformOrigin: 'left' } as object,
  coin: { position: 'absolute', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#fff1b0', overflow: 'hidden' },
  coinText: { color: '#6a4300', fontWeight: '900' },
  skip: { position: 'absolute', bottom: 18, right: 22, color: '#ffffff66', fontSize: 11, fontWeight: '800', letterSpacing: 2 },
});
