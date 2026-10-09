import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MetalText, GOLD } from '../GameLogo';
import { sound } from '../sound';
import { feel, useReducedMotion } from '../theme';
import type { Win } from '../WinCelebration';

/**
 * The big-win show, as the game rooms stage it, for wins of 10x the bet and more: the game dims, light rays spin up,
 * BIG WIN slams in in gold, and the amount rolls up while a fountain of coins sprays from the bottom of the screen.
 * The title climbs with the count, as the modern cabinets do it: passing 25x it slams again as MEGA WIN, 50x as EPIC
 * WIN and 100x as LEGENDARY WIN, each with its own colours and a heavier hit. The first tap jumps the count to the
 * end, the second collects (or it closes itself a few seconds after the count). The amount is always the server's.
 */
export const isBigWin = (win: Win | null) => !!win && win.multiplier >= 10;
const COINS = 34;
/** The tiers the count climbs through, by multiple of the bet. */
const TIERS = [
  { at: 10, title: 'BIG WIN', rays: ['#ffd23f', '#ff7a1a'] },
  { at: 25, title: 'MEGA WIN', rays: ['#22e1ff', '#3c7bff'] },
  { at: 50, title: 'EPIC WIN', rays: ['#ff3cac', '#8a3cff'] },
  { at: 100, title: 'LEGENDARY WIN', rays: ['#fff3a0', '#ff3cac'] },
];
const tierAt = (m: number) => [...TIERS].reverse().find(tier => m >= tier.at) ?? TIERS[0];
/** Longer counts for bigger wins: each tier the count passes adds to the show. */
const rollFor = (m: number) => 2200 + TIERS.filter(tier => m >= tier.at).length * 1100;

export function BigWin({ win, onClose }: { win: Win | null; onClose?: () => void }) {
  const reduced = useReducedMotion();
  const { width, height } = useWindowDimensions(), short = Math.min(width, height);
  const [shown, setShown] = useState<Win | null>(null), [amount, setAmount] = useState(0), [counted, setCounted] = useState(false);
  const enter = useRef(new Animated.Value(0)).current, spin = useRef(new Animated.Value(0)).current;
  const slam = useRef(new Animated.Value(0)).current, roll = useRef(new Animated.Value(0)).current, fountain = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const coins = useRef(Array.from({ length: COINS }, (_, i) => ({ x: ((i * 37) % 100) / 100 - .5, lift: .55 + ((i * 53) % 40) / 100, delay: (i % 12) / 12, size: .06 + ((i * 7) % 4) / 100, turn: i % 2 ? 1 : -1 }))).current;
  const closing = useRef(false);

  /** First tap: the count jumps to the end. Second tap: collect. */
  function tap() {
    if (!counted && shown) { roll.stopAnimation(); roll.setValue(1); setAmount(shown.payout); setCounted(true); return; }
    close();
  }
  function close() {
    if (closing.current) return;
    closing.current = true;
    roll.stopAnimation(); setAmount(shown?.payout ?? 0);
    Animated.timing(enter, { toValue: 0, duration: 260, useNativeDriver: true }).start(() => { setShown(null); onClose?.(); });
  }

  useEffect(() => {
    if (!isBigWin(win)) return;
    const next = win!, length = rollFor(next.multiplier);
    closing.current = false; setShown(next); setAmount(0); setCounted(false);
    feel('win'); sound.play('bigwin'); sound.play('coins');
    if (reduced) { enter.setValue(1); slam.setValue(1); setAmount(next.payout); setCounted(true); const t = setTimeout(close, 2500); return () => clearTimeout(t); }
    [enter, slam, roll, fountain].forEach(v => v.setValue(0));
    // The count ticks as it climbs: one tick per twentieth of the way, so it speeds up and slows down with the roll.
    // Each tier the climbing amount passes slams the title in again, heavier.
    let lastStep = 0, lastTier = TIERS[0].title;
    const id = roll.addListener(({ value }) => {
      const now = value * next.payout; setAmount(now);
      const step = Math.floor(value * 20); if (step > lastStep) { lastStep = step; sound.play('tick'); }
      const reached = tierAt(now / next.stake);
      if (reached.title !== lastTier && next.multiplier >= reached.at) {
        lastTier = reached.title; feel('heavy'); sound.play('coins');
        slam.setValue(.35); Animated.spring(slam, { toValue: 1, friction: 3, tension: 140, useNativeDriver: true }).start();
      }
      if (value >= 1) setCounted(true);
    });
    const rays = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 6000, easing: Easing.linear, useNativeDriver: true }));
    const beat = Animated.loop(Animated.sequence([Animated.timing(pulse, { toValue: 1, duration: 420, useNativeDriver: true }), Animated.timing(pulse, { toValue: 0, duration: 420, useNativeDriver: true })]));
    const show = Animated.sequence([
      Animated.timing(enter, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(slam, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }),
    ]);
    const counting = Animated.timing(roll, { toValue: 1, duration: length, easing: Easing.out(Easing.quad), useNativeDriver: false });
    const spray = Animated.loop(Animated.timing(fountain, { toValue: 1, duration: 1600, easing: Easing.linear, useNativeDriver: true }));
    rays.start(); beat.start(); show.start(); counting.start(); spray.start();
    const t = setTimeout(close, length + 2600);
    return () => { clearTimeout(t); roll.removeListener(id); rays.stop(); beat.stop(); counting.stop(); spray.stop(); };
  }, [win?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!shown) return null;
  // The title shown is the tier the count has reached so far, not where it will end.
  const tier = tierAt(Math.min(shown.multiplier, amount / shown.stake)), title = Math.min(short * .16, width * .12) * (tier.title.length > 9 ? .8 : 1);
  return <Animated.View style={[StyleSheet.absoluteFill, b.root, { opacity: enter }]}>
    <Pressable style={StyleSheet.absoluteFill} onPress={tap} accessibilityRole="button" accessibilityLabel={`${tierAt(shown.multiplier).title}: ${shown.payout.toFixed(2)}. ${counted ? 'Tap to collect' : 'Tap to skip the count'}`}>
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
      <Text style={b.tap}>{counted ? 'TAP TO COLLECT' : 'TAP TO SKIP'}</Text>
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
