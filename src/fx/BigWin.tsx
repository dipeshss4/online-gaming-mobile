import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MetalText, GOLD } from '../GameLogo';
import { sound } from '../sound';
import { feel, useReducedMotion } from '../theme';
import type { Win } from '../WinCelebration';

/**
 * The big-win show, as the game rooms stage it, for wins of 10x the bet and more: the game dims, light rays spin up,
 * BIG WIN (25x MEGA WIN, 50x EPIC WIN) slams in in gold, the amount rolls up while a fountain of coins sprays from
 * the bottom of the screen, and it waits for a tap to collect (or closes itself after a few seconds). The amount is
 * always the server's payout.
 */
export const isBigWin = (win: Win | null) => !!win && win.multiplier >= 10;
const COINS = 34;
const tierOf = (m: number) => m >= 50 ? { title: 'EPIC WIN', rays: ['#ff3cac', '#8a3cff'], roll: 4200 } : m >= 25 ? { title: 'MEGA WIN', rays: ['#22e1ff', '#3c7bff'], roll: 3400 } : { title: 'BIG WIN', rays: ['#ffd23f', '#ff7a1a'], roll: 2600 };

export function BigWin({ win, onClose }: { win: Win | null; onClose?: () => void }) {
  const reduced = useReducedMotion();
  const { width, height } = useWindowDimensions(), short = Math.min(width, height);
  const [shown, setShown] = useState<Win | null>(null), [amount, setAmount] = useState(0);
  const enter = useRef(new Animated.Value(0)).current, spin = useRef(new Animated.Value(0)).current;
  const slam = useRef(new Animated.Value(0)).current, roll = useRef(new Animated.Value(0)).current, fountain = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const coins = useRef(Array.from({ length: COINS }, (_, i) => ({ x: ((i * 37) % 100) / 100 - .5, lift: .55 + ((i * 53) % 40) / 100, delay: (i % 12) / 12, size: .06 + ((i * 7) % 4) / 100, turn: i % 2 ? 1 : -1 }))).current;
  const closing = useRef(false);

  function close() {
    if (closing.current) return;
    closing.current = true;
    roll.stopAnimation(); setAmount(shown?.payout ?? 0);
    Animated.timing(enter, { toValue: 0, duration: 260, useNativeDriver: true }).start(() => { setShown(null); onClose?.(); });
  }

  useEffect(() => {
    if (!isBigWin(win)) return;
    const next = win!, tier = tierOf(next.multiplier);
    closing.current = false; setShown(next); setAmount(0);
    feel('win'); sound.play('bigwin'); sound.play('coins');
    if (reduced) { enter.setValue(1); slam.setValue(1); setAmount(next.payout); const t = setTimeout(close, 2500); return () => clearTimeout(t); }
    [enter, slam, roll, fountain].forEach(v => v.setValue(0));
    // The count ticks as it climbs: one tick per twentieth of the way, so it speeds up and slows down with the roll.
    let lastStep = 0;
    const id = roll.addListener(({ value }) => { setAmount(value * next.payout); const step = Math.floor(value * 20); if (step > lastStep) { lastStep = step; sound.play('tick'); } });
    const rays = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 6000, easing: Easing.linear, useNativeDriver: true }));
    const beat = Animated.loop(Animated.sequence([Animated.timing(pulse, { toValue: 1, duration: 420, useNativeDriver: true }), Animated.timing(pulse, { toValue: 0, duration: 420, useNativeDriver: true })]));
    const show = Animated.sequence([
      Animated.timing(enter, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(slam, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }),
    ]);
    const counting = Animated.timing(roll, { toValue: 1, duration: tier.roll, easing: Easing.out(Easing.quad), useNativeDriver: false });
    const spray = Animated.loop(Animated.timing(fountain, { toValue: 1, duration: 1600, easing: Easing.linear, useNativeDriver: true }));
    rays.start(); beat.start(); show.start(); counting.start(); spray.start();
    const t = setTimeout(close, tier.roll + 2600);
    return () => { clearTimeout(t); roll.removeListener(id); rays.stop(); beat.stop(); counting.stop(); spray.stop(); };
  }, [win?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!shown) return null;
  const tier = tierOf(shown.multiplier), title = Math.min(short * .16, width * .12);
  return <Animated.View style={[StyleSheet.absoluteFill, b.root, { opacity: enter }]}>
    <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityRole="button" accessibilityLabel={`${tier.title}: ${shown.payout.toFixed(2)}. Tap to collect`}>
      <View style={[StyleSheet.absoluteFill, b.dim]} />
      {/* Rays behind the title, turning. */}
      <Animated.View pointerEvents="none" style={[b.center, { transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]}>
        {Array.from({ length: 12 }, (_, i) => <View key={i} style={[b.ray, { height: Math.max(width, height) * 1.4, transform: [{ rotate: `${i * 15}deg` }] }]}>
          <LinearGradient colors={['#ffffff00', tier.rays[i % 2] + '66', '#ffffff00']} style={StyleSheet.absoluteFill} />
        </View>)}
      </Animated.View>
      {/* The coin fountain: each coin rises from the bottom, arcs and falls, on its own beat. */}
      {!reduced && coins.map((c, i) => {
        const size = short * c.size, t = Animated.modulo(Animated.add(fountain, c.delay), 1);
        return <Animated.View key={i} pointerEvents="none" style={[b.coin, { width: size, height: size, borderRadius: size, left: width / 2 - size / 2, top: height - size,
          transform: [
            { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, c.x * width * 1.1] }) },
            { translateY: t.interpolate({ inputRange: [0, .45, 1], outputRange: [0, -height * c.lift, height * .1] }) },
            { rotateY: t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${c.turn * 720}deg`] }) },
          ] }]}>
          <LinearGradient colors={['#fff4c0', '#ffc83a', '#b07a10']} style={[StyleSheet.absoluteFill, { borderRadius: size }]} />
          <Text style={[b.coinText, { fontSize: Math.max(11, size * .55) }]}>$</Text>
        </Animated.View>;
      })}
      <View style={b.center} pointerEvents="none">
        <Animated.View style={{ alignItems: 'center', transform: [{ scale: Animated.multiply(slam.interpolate({ inputRange: [0, 1], outputRange: [2.6, 1] }), pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] })) }], opacity: slam }}>
          <MetalText text={tier.title} size={title} metal={GOLD} />
          <View style={b.plate}>
            <Text style={[b.amount, { fontSize: title * .62 }]}>{amount.toFixed(2)}</Text>
          </View>
          <Text style={b.under}>{shown.multiplier}× YOUR BET OF {shown.stake.toFixed(2)}</Text>
        </Animated.View>
      </View>
      <Text style={b.tap}>TAP TO COLLECT</Text>
    </Pressable>
  </Animated.View>;
}

const b = StyleSheet.create({
  root: { zIndex: 500, elevation: 500, overflow: 'hidden' },
  dim: { backgroundColor: '#05010ccc' },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  ray: { position: 'absolute', width: 90 },
  coin: { position: 'absolute', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 1.5, borderColor: '#fff4c0' },
  coinText: { color: '#6a4300', fontWeight: '900' },
  plate: { marginTop: 4, paddingHorizontal: 26, paddingVertical: 4, borderRadius: 999, backgroundColor: '#00000099', borderWidth: 2, borderColor: '#ffd23f' },
  amount: { color: '#ffffff', fontWeight: '900', letterSpacing: 1, fontVariant: ['tabular-nums'] },
  under: { marginTop: 8, color: '#ffe68a', fontWeight: '800', letterSpacing: 2, fontSize: 13 },
  tap: { position: 'absolute', bottom: 22, alignSelf: 'center', color: '#ffffffaa', fontWeight: '800', letterSpacing: 3, fontSize: 12 },
});
