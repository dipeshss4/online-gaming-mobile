import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { vipApi, VipStatus } from './api';
import { Tap } from './Tap';
import { c, feel, useReducedMotion } from './theme';
import { sound } from './sound';
import { isPromoShowing, setOtherPopup } from './Popups';

/**
 * The player's VIP level in the app: a chip with the level's crest and a progress bar, the ladder behind it, and a
 * celebration the one time the server reports a new level (it waits for the welcome offer to close first).
 */
const COLOURS: Record<string, [string, string]> = {
  BRONZE: ['#f0b27a', '#8a4b1c'], SILVER: ['#f4f6fa', '#8a94a6'], GOLD: ['#fff1a0', '#c8861a'], PLATINUM: ['#e8f4ff', '#6aa8d8'], DIAMOND: ['#b8f6ff', '#7a3cff'],
};

export function VipCrest({ code, size = 30 }: { code: string; size?: number }) {
  const [light, dark] = COLOURS[code] ?? COLOURS.BRONZE;
  return <LinearGradient colors={[light, dark]} start={{ x: .2, y: .1 }} end={{ x: .9, y: 1 }} style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#ffffff55' }}>
    <Text style={{ color: '#ffffffee', fontWeight: '900', fontSize: size * .48, textShadowColor: '#0007', textShadowRadius: 2, textShadowOffset: { width: 0, height: 1 } }}>{code === 'DIAMOND' ? '◆' : '★'}</Text>
  </LinearGradient>;
}

export function VipChip({ token }: { token: string }) {
  const [vip, setVip] = useState<VipStatus | null>(null), [open, setOpen] = useState(false), [celebrate, setCelebrate] = useState(false);
  const load = useCallback(() => vipApi.read(token).then(next => { setVip(next); if (next.levelUp) setCelebrate(true); }).catch(() => undefined), [token]);
  useEffect(() => {
    void load();
    const timer = setInterval(() => { if (AppState.currentState === 'active') void load(); }, 60_000);
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void load(); });
    return () => { clearInterval(timer); listener.remove(); };
  }, [load]);
  if (!vip || !Array.isArray(vip.levels)) return null;
  return <>
    <Tap haptic="select" accessibilityLabel={`VIP ${vip.name}, ${vip.next ? `${vip.progress}% to ${vip.next.name}` : 'top level'}`} onPress={() => setOpen(true)} style={u.chip}>
      <VipCrest code={vip.code} size={26} />
      <View style={{ gap: 3 }}>
        <Text style={u.chipName}>{vip.name.toUpperCase()}</Text>
        <View style={u.chipBar}><View style={[u.chipFill, { width: `${vip.progress}%` }]} /></View>
      </View>
    </Tap>
    {open && <VipLadder vip={vip} onClose={() => setOpen(false)} />}
    {celebrate && <LevelUp vip={vip} onClose={() => setCelebrate(false)} />}
  </>;
}

function VipLadder({ vip, onClose }: { vip: VipStatus; onClose: () => void }) {
  return <Modal transparent visible animationType="fade" onRequestClose={onClose} supportedOrientations={['portrait', 'landscape-left', 'landscape-right']}>
    <Pressable accessible={false} style={u.backdrop} onPress={onClose}>
      <Pressable onPress={() => undefined} style={u.card} accessibilityViewIsModal>
        <LinearGradient colors={['#3a1268', '#12052a']} style={StyleSheet.absoluteFill} />
        <Tap haptic="select" accessibilityLabel="Close" onPress={onClose} style={u.close}><Text style={u.closeText}>×</Text></Tap>
        <ScrollView contentContainerStyle={u.body}>
          <VipCrest code={vip.code} size={64} />
          <Text style={u.title}>{vip.name} VIP</Text>
          <Text style={u.points}>{vip.points.toLocaleString()} points</Text>
          {vip.next ? <>
            <View style={u.bar} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: vip.progress }}><LinearGradient colors={['#ff3cac', '#ffd23f']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[u.fill, { width: `${Math.max(3, vip.progress)}%` }]} /></View>
            <Text style={u.toNext}><Text style={{ color: c.gold, fontWeight: '900' }}>{(vip.next.points - vip.points).toLocaleString()}</Text> points to {vip.next.name}</Text>
          </> : <Text style={u.toNext}>You are at the top of the ladder.</Text>}
          <View style={{ alignSelf: 'stretch', marginTop: 12, gap: 4 }}>
            {vip.levels.map((level, i) => <View key={level.code} style={[u.row, i === vip.rank && u.here, i > vip.rank && { opacity: .6 }]}>
              <VipCrest code={level.code} size={30} />
              <View style={{ flex: 1 }}><Text style={u.rowName}>{level.name}</Text><Text style={u.rowPoints}>{level.points.toLocaleString()} points</Text></View>
              <Text style={u.rowPerk}>{vip.wheelBoosted && level.wheelBoost > 1 ? `Wheel ×${level.wheelBoost}` : i === vip.rank ? 'You are here' : ''}</Text>
            </View>)}
          </View>
          <Text style={u.rule}>Earn one point for every 1.00 you stake from your balance. Free spins don't earn points.</Text>
        </ScrollView>
      </Pressable>
    </Pressable>
  </Modal>;
}

function LevelUp({ vip, onClose }: { vip: VipStatus; onClose: () => void }) {
  const reduced = useReducedMotion(), pop = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const [shown, setShown] = useState(false);
  // It waits its turn behind the welcome offer, then takes the screen.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const attempt = () => { if (isPromoShowing()) { timer = setTimeout(attempt, 1200); return; } setOtherPopup(true); setShown(true); feel('win'); sound.play('bigwin'); };
    timer = setTimeout(attempt, 600);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => { if (shown && !reduced) Animated.spring(pop, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }).start(); }, [shown, reduced, pop]);
  if (!shown) return null;
  const close = () => { setOtherPopup(false); onClose(); };
  const boost = vip.levels[vip.rank]?.wheelBoost ?? 1;
  return <Modal transparent visible animationType="fade" onRequestClose={close} supportedOrientations={['portrait', 'landscape-left', 'landscape-right']}>
    <Pressable accessible={false} style={u.backdrop} onPress={close}>
      <Animated.View style={[u.card, u.levelUp, { transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [.4, 1] }) }], opacity: pop }]} accessibilityViewIsModal accessibilityLabel={`You reached ${vip.name}`}>
        <LinearGradient colors={['#4a1478', '#12052a']} style={StyleSheet.absoluteFill} />
        <VipCrest code={vip.code} size={96} />
        <Text style={u.kicker}>NEW VIP LEVEL</Text>
        <Text style={u.big}>{vip.name.toUpperCase()}</Text>
        <Text style={u.toNext}>{vip.wheelBoosted && boost > 1 ? `Your daily wheel prizes are now ×${boost}.` : 'Keep playing to climb higher.'}</Text>
        <Tap haptic="heavy" accessibilityLabel="Awesome" onPress={close} style={{ marginTop: 14 }}>
          <LinearGradient colors={['#ffe58a', '#ff9f1a']} style={u.button}><Text style={u.buttonText}>AWESOME!</Text></LinearGradient>
        </Tap>
      </Animated.View>
    </Pressable>
  </Modal>;
}

const u = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingLeft: 4, paddingRight: 12, borderRadius: 22, borderWidth: 1.5, borderColor: '#ffd23f88', backgroundColor: '#04122dcc' },
  chipName: { color: '#ffe58a', fontWeight: '900', fontSize: 11, letterSpacing: 1.2 },
  chipBar: { width: 56, height: 5, borderRadius: 3, backgroundColor: '#ffffff22', overflow: 'hidden' },
  chipFill: { height: '100%', backgroundColor: c.gold },
  backdrop: { flex: 1, backgroundColor: '#05010cdd', alignItems: 'center', justifyContent: 'center', padding: 12 },
  card: { width: '100%', maxWidth: 420, maxHeight: '96%', borderRadius: 24, borderWidth: 3, borderColor: c.gold, overflow: 'hidden' },
  body: { alignItems: 'center', padding: 20 },
  close: { position: 'absolute', top: 4, right: 4, width: 44, height: 44, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  closeText: { color: '#fff', fontSize: 26 },
  title: { color: '#ffe58a', fontWeight: '900', fontStyle: 'italic', fontSize: 26, marginTop: 8 },
  points: { color: '#d8c8f0', fontSize: 13 },
  bar: { alignSelf: 'stretch', height: 12, borderRadius: 6, backgroundColor: '#ffffff1a', overflow: 'hidden', marginTop: 12 },
  fill: { height: '100%', borderRadius: 6 },
  toNext: { color: '#e8dcff', fontSize: 13, marginTop: 6, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 12 },
  here: { backgroundColor: '#ffd23f1a', borderWidth: 1, borderColor: '#ffd23f66' },
  rowName: { color: '#fff', fontWeight: '800', fontSize: 14 },
  rowPoints: { color: '#b9a6e0', fontSize: 11 },
  rowPerk: { color: c.gold, fontSize: 12 },
  rule: { color: '#a998c8', fontSize: 11, marginTop: 10, textAlign: 'center' },
  levelUp: { alignItems: 'center', padding: 24 },
  kicker: { color: '#ff9ad6', fontWeight: '900', fontSize: 12, letterSpacing: 4, marginTop: 14 },
  big: { color: '#ffe58a', fontWeight: '900', fontStyle: 'italic', fontSize: 42, textShadowColor: '#ffd23f', textShadowRadius: 18, textShadowOffset: { width: 0, height: 0 } },
  button: { minHeight: 46, paddingHorizontal: 28, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#3b1600', fontWeight: '900', fontSize: 15, letterSpacing: 1 },
});
