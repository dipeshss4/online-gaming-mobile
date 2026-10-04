import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Tap } from '../Tap';
import { useReducedMotion } from '../theme';

/**
 * The big round SPIN button: a glowing ring breathes while it waits for a tap, it presses in when tapped, and the
 * ring turns while the round plays, so the button always says what the game is doing.
 */
export function SpinButton({ label, size, ring, busy, disabled, accessibilityLabel, onPress }: {
  label: string; size: number; ring: string; busy?: boolean; disabled?: boolean; accessibilityLabel?: string; onPress: () => void;
}) {
  const reduced = useReducedMotion();
  const breathe = useRef(new Animated.Value(0)).current, turn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) return;
    const anim = busy
      ? Animated.loop(Animated.timing(turn, { toValue: 1, duration: 700, easing: Easing.linear, useNativeDriver: true }))
      : Animated.loop(Animated.sequence([Animated.timing(breathe, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }), Animated.timing(breathe, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true })]));
    if (!busy) turn.setValue(0);
    anim.start(); return () => anim.stop();
  }, [busy, reduced]); // eslint-disable-line react-hooks/exhaustive-deps
  // Halo and ring sit inside the button's own box (12px larger than the button), so nothing spills out of it.
  const box = size + 8;
  return <View style={{ width: box, height: box, alignItems: 'center', justifyContent: 'center' }}>
    {/* The halo breathing behind the button. */}
    {!disabled && <Animated.View pointerEvents="none" style={[s.halo, { width: box, height: box, borderRadius: box, backgroundColor: ring,
      opacity: breathe.interpolate({ inputRange: [0, 1], outputRange: [.12, .4] }), transform: [{ scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [.86, 1] }) }] }]} />}
    {/* A dashed ring that turns while the round plays. */}
    <Animated.View pointerEvents="none" style={[s.ring, { width: size + 8, height: size + 8, borderRadius: size, borderColor: ring, opacity: busy ? 1 : .55,
      transform: [{ rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]} />
    <Tap haptic="heavy" accessibilityLabel={accessibilityLabel ?? label} disabled={disabled} onPress={onPress}
      style={[s.button, { width: size, height: size, borderRadius: size }, disabled && !busy && { opacity: .55 }]}>
      <LinearGradient colors={['#fff3a0', '#ffb01f', '#d1480f']} start={{ x: .3, y: 0 }} end={{ x: .7, y: 1 }} style={StyleSheet.absoluteFill} />
      {/* A glossy cap on the top half, as on a real arcade button. */}
      <LinearGradient colors={['#ffffffaa', '#ffffff00']} style={[s.gloss, { width: size * .74, height: size * .4, borderRadius: size }]} />
      <Text style={[s.text, { fontSize: label.length > 5 ? size * .17 : size * .26 }]} numberOfLines={1} adjustsFontSizeToFit>{label}</Text>
    </Tap>
  </View>;
}

const s = StyleSheet.create({
  halo: { position: 'absolute' },
  ring: { position: 'absolute', borderWidth: 3, borderStyle: 'dashed' },
  button: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: '#fff1b0', shadowColor: '#ff9f1a', shadowOpacity: .8, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 10 },
  gloss: { position: 'absolute', top: 5 },
  text: { color: '#3b1600', fontWeight: '900', letterSpacing: 1.5, textShadowColor: '#fff6c8', textShadowRadius: 2, textShadowOffset: { width: 0, height: 1 } },
});
