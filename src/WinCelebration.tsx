import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';
import { c, useReducedMotion } from './theme';

/**
 * What a win looks like. The web lights the payline and pulses the winning symbols; this does the same in the
 * app's own terms — a banner that springs in over the cabinet, the amount counting up to what the server
 * actually paid, and sparks for the wins worth making noise about.
 *
 * The size of the celebration follows the size of the win. Treating a 1.5× return like a jackpot is how a game
 * teaches players to ignore it.
 */
export type Win = { payout: number; stake: number; multiplier: number; currency: string; id: string };
type Tier = 'small' | 'good' | 'big';
const tierOf = (multiplier: number): Tier => multiplier >= 10 ? 'big' : multiplier >= 2 ? 'good' : 'small';
const SPARKS = 10;

export function WinCelebration({ win }: { win: Win | null }) {
  const reduced = useReducedMotion();
  const enter = useRef(new Animated.Value(0)).current;
  const sparks = useRef(Array.from({ length: SPARKS }, () => new Animated.Value(0))).current;
  const counter = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState<Win | null>(null);
  const [amount, setAmount] = useState(0);

  useEffect(() => {
    if (!win) { setShown(null); return; }
    setShown(win);
    const tier = tierOf(win.multiplier);
    // Reduce motion: the win is still announced, it simply does not move.
    if (reduced) { enter.setValue(1); setAmount(win.payout); return; }

    enter.setValue(0); counter.setValue(0); setAmount(0);
    const listener = counter.addListener(({ value }) => setAmount(value * win.payout));
    const hold = tier === 'big' ? 2600 : tier === 'good' ? 1900 : 1400;

    const show = Animated.sequence([
      Animated.spring(enter, { toValue: 1, useNativeDriver: true, friction: 5, tension: 90 }),
      Animated.delay(hold),
      Animated.timing(enter, { toValue: 0, duration: 320, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]);
    const count = Animated.timing(counter, {
      toValue: 1, duration: tier === 'small' ? 420 : 750, easing: Easing.out(Easing.cubic),
      // A number has to be read on the JS side to be rendered as text.
      useNativeDriver: false,
    });
    const burst = Animated.stagger(40, sparks.map(spark => Animated.sequence([
      Animated.timing(spark, { toValue: 1, duration: 850, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(spark, { toValue: 0, duration: 0, useNativeDriver: true }),
    ])));

    const all = tier === 'small' ? Animated.parallel([show, count]) : Animated.parallel([show, count, burst]);
    all.start(({ finished }) => { if (finished) setShown(null); });
    return () => { all.stop(); counter.removeListener(listener); };
  }, [win?.id, reduced]);

  if (!shown) return null;
  const tier = tierOf(shown.multiplier);
  const scale = enter.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] });

  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    {/* Sparks from the middle of the cabinet, the banner above the paying row: a celebration that hides the
        winning symbols is celebrating something the player never got to see. */}
    <View style={v.centre}>
      {tier !== 'small' && !reduced && sparks.map((spark, i) => {
        const angle = (i / SPARKS) * Math.PI * 2;
        const reach = tier === 'big' ? 130 : 88;
        return <Animated.View key={i} style={[v.spark, {
          opacity: spark.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 1, 0] }),
          transform: [
            { translateX: spark.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(angle) * reach] }) },
            { translateY: spark.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(angle) * reach] }) },
            { scale: spark.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.4, 1, 0.3] }) },
          ],
        }]} />;
      })}
    </View>
    <View style={v.top}>
      <Animated.View accessibilityLiveRegion="polite" accessibilityLabel={`You won ${shown.payout.toFixed(2)} ${shown.currency}`}
        style={[v.banner, tier === 'big' && v.bannerBig, { opacity: enter, transform: [{ scale }] }]}>
        <Text style={v.kicker}>{tier === 'big' ? 'BIG WIN' : tier === 'good' ? 'NICE WIN' : 'WIN'}</Text>
        <Text style={[v.amount, tier === 'big' && { fontSize: 38 }]}>{amount.toFixed(2)}</Text>
        <Text style={v.under}>{shown.currency} · {shown.multiplier}× your {shown.stake.toFixed(2)}</Text>
      </Animated.View>
    </View>
  </View>;
}

const v = StyleSheet.create({
  centre: { position: 'absolute' as const, left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  top: { position: 'absolute' as const, left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'flex-start', paddingTop: '3%' },
  spark: { position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: c.gold },
  banner: {
    alignItems: 'center', paddingVertical: 10, paddingHorizontal: 24, borderRadius: 16,
    borderWidth: 2, borderColor: c.gold, backgroundColor: '#140f16f2',
    ...Platform.select({ ios: { shadowColor: c.gold, shadowOpacity: 0.55, shadowRadius: 22, shadowOffset: { width: 0, height: 0 } }, android: { elevation: 12 } }),
  },
  bannerBig: { paddingVertical: 14, paddingHorizontal: 30, borderColor: '#ffe6ae' },
  kicker: { color: c.gold, fontSize: 12, fontWeight: '800', letterSpacing: 3 },
  amount: { color: '#fff4dd', fontSize: 30, fontWeight: '900', marginTop: 2 },
  under: { color: c.muted, fontSize: 12, marginTop: 4 },
});
