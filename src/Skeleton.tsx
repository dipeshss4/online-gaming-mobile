import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View, ViewStyle } from 'react-native';
import { c, radius, sp, useReducedMotion } from './theme';

/**
 * The shape of what is coming, while it comes. A spinner says "wait"; this says "a lobby is loading, and here
 * is roughly where the games will be" — and it keeps the screen from jumping as content arrives.
 */
export function Skeleton({ width, height, round = radius.s, style }: { width?: number | `${number}%`; height: number; round?: number; style?: ViewStyle }) {
  const reduced = useReducedMotion();
  const pulse = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    if (reduced) { pulse.setValue(0.55); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 850, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.45, duration: 850, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [reduced]);
  return <Animated.View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={[{ width: width ?? '100%', height, borderRadius: round, backgroundColor: c.surfaceLift, opacity: pulse }, style]} />;
}

/** The lobby's bones: a heading, the category row, and the shelf of games. */
export function LobbySkeleton({ landscape }: { landscape: boolean }) {
  return <View style={{ gap: sp.m }} accessibilityLabel="Loading games">
    <Skeleton width="55%" height={22} />
    <View style={{ flexDirection: 'row', gap: sp.s }}>{[84, 70, 62, 96].map((w, i) => <Skeleton key={i} width={w} height={36} round={radius.pill} />)}</View>
    <View style={{ flexDirection: 'row', gap: sp.m }}>
      {[0, 1, 2].map(i => <View key={i} style={{ flex: 1 }}><Skeleton height={landscape ? 170 : 210} round={radius.l} /></View>)}
    </View>
  </View>;
}

/** The floor strip, before the first snapshot arrives. */
export function FloorSkeleton() {
  return <View style={{ gap: sp.m }} accessibilityLabel="Loading live activity">
    <Skeleton height={64} round={radius.m} />
    <Skeleton height={96} round={radius.l} />
  </View>;
}
