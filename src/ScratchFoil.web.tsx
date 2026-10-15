import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * The web preview's scratch foil: Skia's browser engine is only fetched for the fish table, so here the foil is a
 * plain silver cover that clears when the spot is revealed (the website itself scratches with a canvas).
 */
export type Point = { x: number; y: number };
export const rubbedPath = (strokes: Point[][]) => strokes.length;

export function ScratchFoil({ height }: { width: number; height: number; rubbed: unknown; brush: number }) {
  return <>
    <LinearGradient colors={['#eef1f6', '#a8afbf', '#f6f8fb', '#9198aa']} locations={[0, .4, .55, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
    <Text style={{ position: 'absolute', alignSelf: 'center', top: height / 2 - 9, color: '#6a7184', fontWeight: '900', fontSize: 14 }}>$</Text>
  </>;
}
