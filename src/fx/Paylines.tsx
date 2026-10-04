import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useReducedMotion } from '../theme';

/**
 * Winning paylines drawn over the reels: each line is a glowing stroke in its colour through the centres of the cells
 * it paid on, with a spark of light running along it from the first reel to the last. Lines are given in cell
 * positions (reel, row) and laid out from the reels' geometry, so they always meet the symbols they paid for.
 */
export type Payline = { cells: [number, number][]; color: string };
export type ReelGeometry = { left: number; top: number; width: number; height: number; gap: number };

const centre = (g: ReelGeometry, [reel, row]: [number, number]) => ({ x: g.left + reel * (g.width + g.gap) + g.width / 2, y: g.top + row * g.height + g.height / 2 });

export function Paylines({ lines, geometry }: { lines: Payline[]; geometry: ReelGeometry }) {
  const reduced = useReducedMotion();
  const spark = useRef(new Animated.Value(0)).current, glow = useRef(new Animated.Value(0)).current;
  const key = lines.map(line => line.color + line.cells.join(':')).join('|');
  useEffect(() => {
    if (!lines.length || reduced) { spark.setValue(1); glow.setValue(1); return; }
    spark.setValue(0); glow.setValue(0);
    const run = Animated.parallel([
      Animated.timing(glow, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.loop(Animated.timing(spark, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }), { iterations: 2 }),
    ]);
    run.start(); return () => run.stop();
  }, [key, reduced]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!lines.length) return null;

  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    {lines.map((line, n) => {
      const points = line.cells.map(cell => centre(geometry, cell));
      // The spark travels the polyline: one stop per point, spaced by how far along the line each point is.
      const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y)), total = lengths.reduce((a, b) => a + b, 0) || 1;
      const stops = [0]; lengths.forEach(l => stops.push(stops[stops.length - 1] + l / total));
      return <React.Fragment key={n}>
        {points.slice(1).map((b, i) => {
          const a = points[i], length = Math.hypot(b.x - a.x, b.y - a.y), angle = Math.atan2(b.y - a.y, b.x - a.x);
          return <Animated.View key={i} style={[p.stroke, { width: length + 6, left: (a.x + b.x) / 2 - (length + 6) / 2, top: (a.y + b.y) / 2 - 3,
            backgroundColor: line.color, shadowColor: line.color, opacity: glow, transform: [{ rotate: `${angle}rad` }] }]} />;
        })}
        {points.map((pt, i) => <Animated.View key={`dot${i}`} style={[p.dot, { left: pt.x - 6, top: pt.y - 6, borderColor: line.color, opacity: glow }]} />)}
        {!reduced && points.length > 1 && <Animated.View style={[p.spark, { shadowColor: line.color,
          transform: [
            { translateX: spark.interpolate({ inputRange: stops, outputRange: points.map(pt => pt.x - 9) }) },
            { translateY: spark.interpolate({ inputRange: stops, outputRange: points.map(pt => pt.y - 9) }) },
          ] }]} />}
      </React.Fragment>;
    })}
  </View>;
}

const p = StyleSheet.create({
  stroke: { position: 'absolute', height: 6, borderRadius: 3, shadowOpacity: 1, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 4, borderWidth: 1, borderColor: '#ffffffaa' },
  dot: { position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: '#ffffff', borderWidth: 3 },
  spark: { position: 'absolute', left: 0, top: 0, width: 18, height: 18, borderRadius: 9, backgroundColor: '#ffffff', shadowOpacity: 1, shadowRadius: 12, shadowOffset: { width: 0, height: 0 }, elevation: 6 },
});
