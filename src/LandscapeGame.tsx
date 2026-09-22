import React from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { s } from './styles';

/**
 * Independent stage/control scrolling keeps the game visible while editing a ticket.
 *
 * The two columns are given explicit widths rather than flex ratios. `flex: 1.8` against `flex: 1` did not
 * divide the screen the same way on Android as it did in the web preview — the game ended up the *smaller*
 * half on a phone — and a game whose stage is guesswork is not worth the brevity.
 *
 * {@code stage}: the share of the width the game itself gets. Slots and crash want most of it; roulette's
 * betting table is the game, so it asks for less.
 */
export function LandscapeGame({ children, stageItems = 4, stage = 0.68, below }: {
  children: React.ReactNode; stageItems?: number; stage?: number;
  /** Shown under the game itself (the player's past rounds): below the stage in landscape, at the end in portrait. */
  below?: React.ReactNode;
}) {
  const { width, height } = useWindowDimensions();
  const items = React.Children.toArray(children);
  if (width <= height) return <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">{children}{below}</ScrollView>;
  // Wide enough for a stake field and a row of chips, and never more than half the screen: whatever a game
  // asks for, the thing being played stays the larger side.
  const controls = Math.round(Math.max(210, Math.min(width * 0.5, width * (1 - stage))));
  return <View style={{ flex: 1, flexDirection: 'row', backgroundColor: '#111117' }}>
    <ScrollView style={{ width: width - controls }} contentContainerStyle={[s.content, { padding: 12, gap: 8 }]} keyboardShouldPersistTaps="handled">{items.slice(0, stageItems)}{below}</ScrollView>
    <ScrollView style={{ width: controls, borderLeftWidth: 1, borderLeftColor: '#bba16a44', backgroundColor: '#17131c' }} contentContainerStyle={[s.content, { padding: 12, gap: 8 }]} keyboardShouldPersistTaps="handled">{items.slice(stageItems)}</ScrollView>
  </View>;
}
