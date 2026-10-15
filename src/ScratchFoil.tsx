import React from 'react';
import { StyleSheet } from 'react-native';
import { Canvas, Group, LinearGradient as SkGradient, Path, Rect, Skia, vec, type SkPath } from '@shopify/react-native-skia';

/**
 * A scratch ticket's silver foil, drawn with Skia on phones: brushed silver with a diagonal sheen, with the finger's
 * strokes cut out of it ({@code rubbed}). The web preview has its own version (ScratchFoil.web.tsx).
 */
export type Point = { x: number; y: number };
export function rubbedPath(strokes: Point[][]): SkPath {
  const path = Skia.Path.Make();
  for (const stroke of strokes) {
    if (!stroke.length) continue;
    path.moveTo(stroke[0].x, stroke[0].y);
    if (stroke.length === 1) path.lineTo(stroke[0].x + .1, stroke[0].y);
    for (const point of stroke.slice(1)) path.lineTo(point.x, point.y);
  }
  return path;
}

export function ScratchFoil({ width, height, rubbed, brush }: { width: number; height: number; rubbed: SkPath; brush: number }) {
  return <Canvas style={StyleSheet.absoluteFill}>
        <Group layer>
          {/* Brushed silver with a diagonal sheen and a fine $ pattern, as a printed ticket's latex. */}
          <Rect x={0} y={0} width={width} height={height}>
            <SkGradient start={vec(0, 0)} end={vec(width, height)} colors={['#eef1f6', '#a8afbf', '#f6f8fb', '#9198aa', '#d9dde6']} positions={[0, .38, .5, .64, 1]} />
          </Rect>
          {Array.from({ length: 4 }, (_, i) => <Rect key={i} x={-width + i * width * .7} y={0} width={width * .06} height={height * 2} color="#ffffff33" transform={[{ rotate: -.6 }]} />)}
          <Path path={rubbed} style="stroke" strokeWidth={brush * 2} strokeCap="round" strokeJoin="round" color="black" blendMode="clear" />
        </Group>
  </Canvas>;
}
