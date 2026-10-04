import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * A cabinet frame with marquee bulbs running round it: a metal bezel in the game's colours, bulbs that chase
 * slowly while the game waits and race (and flash together) on a win. Wraps the reels, board or table.
 */
export function MarqueeFrame({ colors, bulb = '#ffe9a0', excited = false, reduced, style, children }: {
  colors: [string, string, string]; bulb?: string; excited?: boolean; reduced?: boolean; style?: ViewStyle | ViewStyle[]; children: React.ReactNode;
}) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const chase = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) return;
    chase.setValue(0);
    const run = Animated.loop(Animated.timing(chase, { toValue: 1, duration: excited ? 420 : 1600, easing: Easing.linear, useNativeDriver: true }));
    run.start(); return () => run.stop();
  }, [excited, reduced]); // eslint-disable-line react-hooks/exhaustive-deps

  const measure = (e: LayoutChangeEvent) => { const { width, height } = e.nativeEvent.layout; if (Math.abs(width - box.w) > 1 || Math.abs(height - box.h) > 1) setBox({ w: width, h: height }); };
  // Bulbs every ~22px along the bezel, in three phases so they appear to chase round.
  const gap = 22, inset = 5, bulbs: { x: number; y: number; phase: number }[] = [];
  if (box.w > 0) {
    const across = Math.max(2, Math.round((box.w - inset * 2) / gap)), down = Math.max(2, Math.round((box.h - inset * 2) / gap));
    let n = 0;
    for (let i = 0; i <= across; i++) bulbs.push({ x: inset + i * (box.w - inset * 2) / across, y: inset, phase: n++ % 3 });
    for (let i = 1; i <= down; i++) bulbs.push({ x: box.w - inset, y: inset + i * (box.h - inset * 2) / down, phase: n++ % 3 });
    for (let i = across - 1; i >= 0; i--) bulbs.push({ x: inset + i * (box.w - inset * 2) / across, y: box.h - inset, phase: n++ % 3 });
    for (let i = down - 1; i >= 1; i--) bulbs.push({ x: inset, y: inset + i * (box.h - inset * 2) / down, phase: n++ % 3 });
  }
  const phaseOpacity = (phase: number) => reduced ? .9 : chase.interpolate({
    inputRange: [0, .33, .34, .66, .67, 1],
    outputRange: phase === 0 ? [1, 1, .25, .25, .25, .25] : phase === 1 ? [.25, .25, 1, 1, .25, .25] : [.25, .25, .25, .25, 1, 1],
  });
  return <View style={[f.root, style]} onLayout={measure}>
    <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, f.bezel]} />
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {bulbs.map((b, i) => <Animated.View key={i} style={[f.bulb, { left: b.x - 3.5, top: b.y - 3.5, backgroundColor: bulb, shadowColor: bulb, opacity: phaseOpacity(b.phase) }]} />)}
    </View>
    <View style={f.inner}>{children}</View>
  </View>;
}

const f = StyleSheet.create({
  root: { padding: 10, borderRadius: 20 },
  bezel: { borderRadius: 22, borderWidth: 2, borderColor: '#ffffff40' },
  bulb: { position: 'absolute', width: 7, height: 7, borderRadius: 4, shadowOpacity: 1, shadowRadius: 5, shadowOffset: { width: 0, height: 0 }, elevation: 2 },
  inner: { borderRadius: 12, overflow: 'hidden', backgroundColor: '#05010c', padding: 2, borderWidth: 2, borderColor: '#00000088' },
});
