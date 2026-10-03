import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Tap } from './Tap';
import { c } from './theme';

/**
 * The bet control every game shares, as on the website and in the sweepstakes game rooms: MIN and MAX jump to the
 * game's limits, − and + step through the usual bet sizes, and tapping the amount opens every allowed bet. Nobody
 * has to type a number. {@code allowOff}: the bet can be switched off (crash's second panel) by stepping below MIN.
 */
const LADDER = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 80, 100,
  150, 200, 250, 300, 400, 500, 750, 1000];
const cents = (value: number) => Math.round(value * 100);

export function betSteps(min: number, max: number) {
  const set = new Set([min, max, ...LADDER].map(cents).filter(value => value >= cents(min) && value <= cents(max)));
  return [...set].sort((a, b) => a - b).map(value => value / 100);
}

export function BetBar({ value, onChange, min, max, disabled = false, label = 'BET', allowOff = false }: {
  value: number; onChange: (value: number) => void; min: number; max: number; disabled?: boolean; label?: string; allowOff?: boolean;
}) {
  const top = Math.min(max, 1000), steps = betSteps(min, top), off = allowOff && cents(value) === 0;
  const [open, setOpen] = useState(false), [narrow, setNarrow] = useState(false);
  const below = steps.filter(step => cents(step) <= cents(value)), index = below.length - 1;
  const exact = index >= 0 && cents(steps[index]) === cents(value);
  const down = () => off ? undefined : index <= 0 && exact ? (allowOff ? onChange(0) : undefined) : onChange(steps[Math.max(0, exact ? index - 1 : index)]);
  const up = () => onChange(off ? min : steps[Math.min(steps.length - 1, index + 1)]);
  const atMin = off || (!allowOff && cents(value) <= cents(min)), atMax = !off && cents(value) >= cents(top);
  return <View style={b.root}>
    <Text style={b.label}>{label}</Text>
    {/* Five across when there is room; in a narrow column (the app held sideways) MIN and MAX go on their own row. */}
    <View style={b.row} onLayout={event => setNarrow(event.nativeEvent.layout.width < 300)}>
      {!narrow && <>
      <Tap haptic="select" accessibilityLabel="Minimum bet" disabled={disabled || (!off && cents(value) === cents(min))} onPress={() => onChange(min)} style={[b.limit, (disabled || (!off && cents(value) === cents(min))) && b.dim]}>
        <LinearGradient colors={['#1b6fd1', '#0b2f6e']} style={StyleSheet.absoluteFill} /><Text style={b.limitText}>MIN</Text>
      </Tap>
      </>}
      <Tap haptic="select" accessibilityLabel="Decrease bet" disabled={disabled || atMin} onPress={down} style={[b.step, (disabled || atMin) && b.dim]}><Text style={b.stepText}>−</Text></Tap>
      <Tap haptic="select" accessibilityLabel={`Bet ${off ? 'off' : value.toFixed(2)}, choose a bet`} disabled={disabled} onPress={() => setOpen(true)} style={[b.amount, disabled && b.dim]}>
        <Text style={b.amountText} numberOfLines={1} adjustsFontSizeToFit>{off ? 'OFF' : value.toFixed(2)}</Text><Text style={b.caret}>▾</Text>
      </Tap>
      <Tap haptic="select" accessibilityLabel="Increase bet" disabled={disabled || atMax} onPress={up} style={[b.step, (disabled || atMax) && b.dim]}><Text style={b.stepText}>+</Text></Tap>
      {!narrow && <>
      <Tap haptic="select" accessibilityLabel="Maximum bet" disabled={disabled || atMax} onPress={() => onChange(top)} style={[b.limit, (disabled || atMax) && b.dim]}>
        <LinearGradient colors={['#ff3c7a', '#a8105a']} style={StyleSheet.absoluteFill} /><Text style={b.limitText}>MAX</Text>
      </Tap>
      </>}
    </View>
    {narrow && <View style={b.row}>
      <Tap haptic="select" accessibilityLabel="Minimum bet" disabled={disabled || (!off && cents(value) === cents(min))} onPress={() => onChange(min)} style={[b.limit, b.wide, (disabled || (!off && cents(value) === cents(min))) && b.dim]}>
        <LinearGradient colors={['#1b6fd1', '#0b2f6e']} style={StyleSheet.absoluteFill} /><Text style={b.limitText}>MIN</Text>
      </Tap>
      <Tap haptic="select" accessibilityLabel="Maximum bet" disabled={disabled || atMax} onPress={() => onChange(top)} style={[b.limit, b.wide, (disabled || atMax) && b.dim]}>
        <LinearGradient colors={['#ff3c7a', '#a8105a']} style={StyleSheet.absoluteFill} /><Text style={b.limitText}>MAX</Text>
      </Tap>
    </View>}
    <Modal visible={open} transparent animationType="fade" supportedOrientations={['landscape-left', 'landscape-right', 'portrait']} onRequestClose={() => setOpen(false)}>
      <Pressable style={b.shade} onPress={() => setOpen(false)} accessibilityLabel="Close bet picker">
        <Pressable style={b.sheet} onPress={() => undefined} accessibilityLabel="Choose your bet">
          <View style={b.sheetHead}><Text style={b.sheetTitle}>CHOOSE YOUR BET</Text><Text style={b.sheetRange}>{min.toFixed(2)} – {top.toFixed(2)}</Text></View>
          <ScrollView contentContainerStyle={b.grid}>
            {allowOff && <Tap haptic="select" accessibilityLabel="Bet off" onPress={() => { onChange(0); setOpen(false); }} style={[b.option, off && b.optionOn]}><Text style={[b.optionText, off && b.optionTextOn]}>OFF</Text></Tap>}
            {steps.map(step => {
              const on = !off && cents(step) === cents(value);
              return <Tap key={step} haptic="select" accessibilityLabel={`Bet ${step.toFixed(2)}`} accessibilityState={{ selected: on }} onPress={() => { onChange(step); setOpen(false); }} style={[b.option, on && b.optionOn]}>
                <Text style={[b.optionText, on && b.optionTextOn]}>{step.toFixed(2)}</Text>
              </Tap>;
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  </View>;
}

const b = StyleSheet.create({
  root: { alignItems: 'center', gap: 4 },
  label: { color: '#ffe68a', fontSize: 11, fontWeight: '900', letterSpacing: 1.8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'stretch', justifyContent: 'center' },
  limit: { minWidth: 48, minHeight: 44, paddingHorizontal: 8, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#22e1ff' },
  wide: { flex: 1 },
  limitText: { color: '#ffffff', fontWeight: '900', fontSize: 13, letterSpacing: 1 },
  step: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#c79bff', backgroundColor: '#6a2ad1' },
  stepText: { color: '#ffffff', fontSize: 24, fontWeight: '900', lineHeight: 28 },
  amount: { flexGrow: 1, flexShrink: 1, minWidth: 76, maxWidth: 140, minHeight: 44, flexDirection: 'row', gap: 4, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 2, borderColor: c.gold, backgroundColor: '#1a0b3d', paddingHorizontal: 6 },
  amountText: { color: '#ffe45c', fontSize: 18, fontWeight: '900', flexShrink: 1 },
  caret: { color: c.gold, fontSize: 12 },
  dim: { opacity: 0.4 },
  shade: { flex: 1, backgroundColor: '#000000aa', alignItems: 'center', justifyContent: 'center', padding: 16 },
  sheet: { width: '100%', maxWidth: 420, maxHeight: '90%', borderRadius: 18, borderWidth: 2, borderColor: c.gold, backgroundColor: '#170a36', padding: 12, gap: 10 },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  sheetTitle: { color: '#ffe68a', fontWeight: '900', letterSpacing: 2, fontSize: 12 },
  sheetRange: { color: c.muted, fontSize: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  option: { width: '23.5%', minHeight: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#b56cff77', backgroundColor: '#2e1660' },
  optionOn: { backgroundColor: c.gold, borderColor: c.gold },
  optionText: { color: c.gold, fontWeight: '800', fontSize: 14 },
  optionTextOn: { color: c.goldInk },
});
