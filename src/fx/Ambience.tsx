import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useReducedMotion } from '../theme';

/**
 * Slow motion behind a game, so the stage is never a flat colour: embers rising for the fire games, glowing bokeh
 * drifting for the video slots, stars twinkling for keno and crash, spotlights sweeping the roulette floor, and a
 * glow that breathes under all of them. One looping clock drives every particle (each on its own offset), all on
 * the native driver. Reduced motion shows the scene still.
 */
export type Mood = 'embers' | 'bokeh' | 'stars' | 'spotlights' | 'sparkle';

const COUNT: Record<Mood, number> = { embers: 26, bokeh: 14, stars: 40, spotlights: 0, sparkle: 18 };

export function Ambience({ mood, tint }: { mood: Mood; tint: string }) {
  const { width, height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const clock = useRef(new Animated.Value(0)).current, breathe = useRef(new Animated.Value(0)).current;
  const particles = useRef(Array.from({ length: 40 }, (_, i) => ({
    x: ((i * 61) % 100) / 100, y: ((i * 37) % 100) / 100, offset: ((i * 29) % 100) / 100,
    size: 2 + (i * 7) % 5, drift: (((i * 13) % 20) - 10) / 100, speed: 1 + (i % 3),
  }))).current;

  useEffect(() => {
    if (reduced) { clock.setValue(.5); breathe.setValue(.5); return; }
    const run = Animated.parallel([
      Animated.loop(Animated.timing(clock, { toValue: 1, duration: 9000, easing: Easing.linear, useNativeDriver: true })),
      Animated.loop(Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 3200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 3200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])),
    ]);
    run.start(); return () => run.stop();
  }, [reduced]); // eslint-disable-line react-hooks/exhaustive-deps

  const big = Math.max(width, height);
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, a.root]}>
    {/* The breathing glow, low behind the cabinet. */}
    <Animated.View style={[a.glow, { width: big * .9, height: big * .9, borderRadius: big, left: width / 2 - big * .45, top: height * .55 - big * .45,
      opacity: breathe.interpolate({ inputRange: [0, 1], outputRange: [.18, .4] }), transform: [{ scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [.9, 1.05] }) }] }]}>
      <LinearGradient colors={[tint + 'aa', tint + '00']} start={{ x: .5, y: .5 }} end={{ x: .5, y: 0 }} style={[StyleSheet.absoluteFill, { borderRadius: big }]} />
    </Animated.View>

    {mood === 'spotlights' && [0, 1].map(i => <Animated.View key={i} style={[a.beam, { height: big * 1.4, left: width * (i ? .72 : .28) - 70, top: -big * .2,
      transform: [{ rotate: clock.interpolate({ inputRange: [0, .5, 1], outputRange: i ? ['18deg', '-14deg', '18deg'] : ['-18deg', '14deg', '-18deg'] }) }] }]}>
      <LinearGradient colors={['#ffffff38', '#ffffff00']} style={StyleSheet.absoluteFill} />
    </Animated.View>)}

    {particles.slice(0, COUNT[mood]).map((p, i) => {
      const t = Animated.modulo(Animated.add(Animated.multiply(clock, p.speed), p.offset), 1);
      if (mood === 'embers') return <Animated.View key={i} style={[a.dot, { width: p.size + 1, height: p.size + 1, left: p.x * width, top: height, backgroundColor: i % 3 ? '#ff8a2a' : '#ffd23f', shadowColor: '#ff6a00',
        opacity: t.interpolate({ inputRange: [0, .15, .8, 1], outputRange: [0, .9, .5, 0] }),
        transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, -height * 1.05] }) }, { translateX: t.interpolate({ inputRange: [0, .5, 1], outputRange: [0, p.drift * width, 0] }) }] }]} />;
      if (mood === 'bokeh') { const s = 18 + p.size * 9; return <Animated.View key={i} style={[a.bokeh, { width: s, height: s, borderRadius: s, left: p.x * width - s / 2, top: p.y * height - s / 2, backgroundColor: i % 2 ? tint : '#ffd23f',
        opacity: t.interpolate({ inputRange: [0, .5, 1], outputRange: [.04, .2, .04] }),
        transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [12, -12] }) }, { translateX: t.interpolate({ inputRange: [0, .5, 1], outputRange: [0, p.drift * 120, 0] }) }] }]} />; }
      // Stars and sparkle: fixed points that twinkle on their own beat.
      return <Animated.View key={i} style={[a.dot, { width: p.size, height: p.size, left: p.x * width, top: p.y * height, backgroundColor: mood === 'stars' ? '#e8fbff' : '#ffe9a0', shadowColor: tint,
        opacity: t.interpolate({ inputRange: [0, .5, 1], outputRange: [.1, 1, .1] }), transform: [{ scale: t.interpolate({ inputRange: [0, .5, 1], outputRange: [.6, 1.3, .6] }) }] }]} />;
    })}
  </View>;
}

const a = StyleSheet.create({
  root: { overflow: 'hidden' },
  glow: { position: 'absolute', overflow: 'hidden' },
  beam: { position: 'absolute', width: 140, borderRadius: 70, overflow: 'hidden' },
  dot: { position: 'absolute', borderRadius: 4, shadowOpacity: 1, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } },
  bokeh: { position: 'absolute' },
});
