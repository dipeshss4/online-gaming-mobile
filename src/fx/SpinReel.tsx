import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * One slot reel that moves like a real one:
 *  - wind-up: a short kick up before it drops into the spin;
 *  - spin: a blurred strip racing down (stretched, dimmed), on a drum that is shaded dark at its top and bottom;
 *  - landing: a last run onto the result that overshoots and settles back, the thud a player feels;
 *  - win: the lit cells swell and glow in their line's colour while the others dim.
 * The parent decides when each reel stops (spinning true → false) and what it lands on (cells).
 */
export type ReelProps = {
  index: number;
  cells: string[];
  /** Symbols the reel races through while it spins. */
  strip: string[];
  spinning: boolean;
  /** Height of one cell; the reel is {@code cells.length} cells high and {@code width} wide. */
  size: number; width: number;
  reduced?: boolean;
  /** The colour a cell is lit in when it is part of a win, or null. */
  lit?: (row: number) => string | null;
  dim?: boolean;
  /** Anticipation: the reel keeps spinning, slower, with a glowing frame, because the win hangs on it. */
  tease?: boolean;
  render: (symbol: string, size: number) => React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  children?: React.ReactNode;
};

const FILLER = 14;

export function SpinReel({ index, cells, strip, spinning, size, width, reduced, lit, dim, tease, render, style, children }: ReelProps) {
  const rows = cells.length;
  const pos = useRef(new Animated.Value(FILLER)).current;   // in cells: FILLER shows the result, 0 the top of the strip
  const blur = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0)).current;
  // The strip the reel runs through: FILLER symbols, then the result. Rebuilt for each spin so it never repeats.
  const [filler, setFiller] = useState(() => Array.from({ length: FILLER }, (_, i) => strip[(i * 5 + index * 3) % strip.length]));
  const wasSpinning = useRef(spinning);

  useEffect(() => {
    if (reduced) { pos.setValue(FILLER); blur.setValue(0); return; }
    if (spinning && !wasSpinning.current) {
      setFiller(Array.from({ length: FILLER }, () => strip[Math.floor(Math.random() * strip.length)]));
      // Wind-up, then the endless run through the filler.
      pos.setValue(FILLER);
      const run = Animated.sequence([
        Animated.timing(pos, { toValue: FILLER + .18, duration: 110, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(blur, { toValue: 1, duration: 60, useNativeDriver: true }),
        Animated.loop(Animated.sequence([
          Animated.timing(pos, { toValue: FILLER - rows, duration: 0, useNativeDriver: true }),
          Animated.timing(pos, { toValue: 0, duration: (FILLER - rows) * (tease ? 95 : 48), easing: Easing.linear, useNativeDriver: true }),
        ])),
      ]);
      run.start();
      wasSpinning.current = true;
      return () => run.stop();
    }
    if (!spinning && wasSpinning.current) {
      wasSpinning.current = false;
      // The landing: one last run down onto the result, past it, and back.
      pos.stopAnimation();
      pos.setValue(FILLER - rows - 2);
      Animated.parallel([
        Animated.timing(blur, { toValue: 0, duration: 260, useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(pos, { toValue: FILLER + .16, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.spring(pos, { toValue: FILLER, friction: 4, tension: 160, useNativeDriver: true }),
        ]),
      ]).start();
    }
  }, [spinning, reduced]); // eslint-disable-line react-hooks/exhaustive-deps

  // The tease frame pulses while this reel decides the round.
  useEffect(() => {
    if (!tease || reduced) { glow.setValue(0); return; }
    const pulse = Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.timing(glow, { toValue: .3, duration: 260, useNativeDriver: true }),
    ]));
    pulse.start(); return () => pulse.stop();
  }, [tease, reduced]); // eslint-disable-line react-hooks/exhaustive-deps

  const anyLit = !spinning && !!lit && cells.some((_, row) => !!lit(row));
  useEffect(() => {
    if (!anyLit || reduced) { pop.setValue(0); return; }
    const beat = Animated.sequence([Animated.delay(index * 90), Animated.loop(Animated.sequence([
      Animated.timing(pop, { toValue: 1, duration: 300, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(pop, { toValue: 0, duration: 340, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]), { iterations: 3 })]);
    beat.start(); return () => beat.stop();
  }, [anyLit, reduced, cells.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = [...filler, ...cells];
  const translateY = pos.interpolate({ inputRange: [0, FILLER + 1], outputRange: [0, -(FILLER + 1) * size] });
  return <View accessibilityLabel={spinning ? `Reel ${index + 1} spinning` : `Reel ${index + 1}: ${cells.join(', ')}`}
    style={[r.reel, { width, height: rows * size }, style]}>
    <Animated.View style={{ transform: [{ translateY }, { scaleY: blur.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) }], opacity: blur.interpolate({ inputRange: [0, 1], outputRange: [1, .78] }) }}>
      {items.map((symbol, i) => {
        const row = i - FILLER, color = row >= 0 && !spinning && lit ? lit(row) : null;
        return <Animated.View key={i} style={[r.cell, { height: size },
          color ? { transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }] } : null,
          !color && row >= 0 && dim && !spinning ? { opacity: .35 } : null]}>
          {color && <Animated.View style={[r.litGlow, { borderColor: color, backgroundColor: color + '30', opacity: pop.interpolate({ inputRange: [0, 1], outputRange: [.6, 1] }) }]} />}
          {render(symbol, size)}
        </Animated.View>;
      })}
    </Animated.View>
    {/* The drum: dark at its top and bottom edges, a soft highlight across its middle. */}
    <LinearGradient pointerEvents="none" colors={['#000000cc', '#00000000', '#ffffff10', '#00000000', '#000000cc']} locations={[0, .22, .5, .78, 1]} style={StyleSheet.absoluteFill} />
    {tease && <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, r.tease, { opacity: glow }]} />}
    {children}
  </View>;
}

const r = StyleSheet.create({
  reel: { overflow: 'hidden', borderRadius: 8, backgroundColor: '#0e0618', borderWidth: 1, borderColor: '#ffffff22' },
  cell: { alignItems: 'center', justifyContent: 'center' },
  litGlow: { ...StyleSheet.absoluteFill, margin: 3, borderRadius: 10, borderWidth: 3 },
  tease: { borderWidth: 4, borderColor: '#ffe45c', borderRadius: 8, backgroundColor: '#ffe45c1f' },
});
