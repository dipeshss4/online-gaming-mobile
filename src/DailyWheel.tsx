import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ApiError, bonuses, Game, WheelResult, WheelStatus } from './api';
import { Tap } from './Tap';
import { c, feel, useReducedMotion } from './theme';
import { sound } from './sound';
import { isPromoShowing, setOtherPopup } from './Popups';

/**
 * The Daily Bonus Wheel in the app: a glowing button in the lobby while today's spin waits, and the wheel itself. The
 * server picks the segment and grants the free spins (DailyWheelService); the wheel only turns to show which it was.
 * Drawn with plain views (one triangle per segment, clipped to a circle) so it is the same on phones and the web preview.
 */
const COLOURS = ['#ff3cac', '#7a3cff', '#ffb01f', '#22c1ff', '#ff5a3c', '#2ee57a', '#d93cff', '#ffd23f', '#3c7bff', '#ff8a1a', '#1fd6b4', '#ff3c6e'];
const SPIN_MS = 5200;

const until = (iso: string | null, now: number) => {
  if (!iso) return '';
  const left = Math.max(0, new Date(iso).getTime() - now), h = Math.floor(left / 3_600_000), m = Math.floor(left / 60_000) % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
};

/** The lobby's wheel button and its dialog; nothing at all while the wheel is switched off. */
export function DailyWheelButton({ token, games, onPlay, compact }: { token: string; games: Game[]; onPlay: (game: Game) => void; compact?: boolean }) {
  const [status, setStatus] = useState<WheelStatus | null>(null), [open, setOpen] = useState(false);
  const reduced = useReducedMotion(), glow = useRef(new Animated.Value(0)).current;
  const load = useCallback(() => bonuses.wheel(token).then(setStatus).catch(() => setStatus(null)), [token]);
  useEffect(() => {
    void load();
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void load(); });
    return () => listener.remove();
  }, [load]);
  useEffect(() => {
    if (!status?.available || reduced) { glow.setValue(0); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(glow, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true })]));
    loop.start(); return () => loop.stop();
  }, [status?.available, reduced, glow]);
  if (!status?.enabled) return null;
  return <>
    <Tap haptic="heavy" accessibilityLabel={status.available ? 'Spin the daily wheel' : 'Daily wheel'} onPress={() => { if (!isPromoShowing()) { setOtherPopup(true); setOpen(true); } }}
      style={[w.launch, compact && w.launchCompact]}>
      <Animated.View style={[w.launchGlow, { opacity: glow }]} />
      <View style={w.mini}>{[0, 1, 2, 3, 4, 5, 6, 7].map(i => <View key={i} style={[w.miniSlice, { backgroundColor: COLOURS[i], transform: [{ rotate: `${i * 45}deg` }] }]} />)}</View>
      {!compact && <View><Text style={w.launchTitle}>DAILY WHEEL</Text><Text style={w.launchSub}>{status.available ? 'Free spin ready!' : 'Back tomorrow'}</Text></View>}
    </Tap>
    {open && <WheelDialog token={token} status={status} games={games} onPlay={onPlay}
      onClose={() => { setOpen(false); setOtherPopup(false); void load(); }} onWon={result => setStatus(current => current && { ...current, available: false, today: result })} />}
  </>;
}

function WheelDialog({ token, status, games, onClose, onPlay, onWon }: {
  token: string; status: WheelStatus; games: Game[]; onClose: () => void; onPlay: (game: Game) => void; onWon: (result: WheelResult) => void;
}) {
  const { width, height } = useWindowDimensions(), reduced = useReducedMotion();
  // A phone held sideways: the wheel on the left, the prize and the odds beside it, so nothing needs scrolling.
  const side = width > height && height < 560;
  const size = side ? Math.min(height - 80, width * .42, 300) : Math.min(width * .8, height * .62, 320), r = size / 2;
  const segments = status.segments, angle = 360 / segments.length;
  const turn = useRef(new Animated.Value(status.today ? 360 - (status.today.segment + .5) * angle : 0)).current;
  const [spinning, setSpinning] = useState(false), [result, setResult] = useState<WheelResult | null>(status.today), [error, setError] = useState(''), [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(timer); }, []);

  async function spin() {
    if (spinning || result) return;
    setSpinning(true); setError(''); feel('heavy');
    try {
      const won = await bonuses.spinWheel(token);
      sound.play('spin'); sound.play('tease');
      // Six turns, then the winning segment's middle under the pointer at the top.
      const target = 360 * 6 + 360 - (won.segment + .5) * angle;
      await new Promise<void>(resolve => Animated.timing(turn, { toValue: target, duration: reduced ? 1 : SPIN_MS, easing: Easing.bezier(.12, .68, .12, 1), useNativeDriver: true }).start(() => resolve()));
      feel('win'); sound.play('bigwin'); sound.play('coins');
      setResult(won); onWon(won);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'The wheel could not be spun. Check your connection.');
    } finally { setSpinning(false); }
  }

  const prizeGame = games.find(game => game.code === (result?.gameCode ?? status.gameCode));
  const half = r * Math.tan(Math.min(angle, 170) / 2 * Math.PI / 180);
  return <Modal transparent visible animationType="fade" onRequestClose={() => { if (!spinning) onClose(); }} supportedOrientations={['portrait', 'landscape-left', 'landscape-right']}>
    <Pressable accessible={false} style={w.backdrop} onPress={() => { if (!spinning) onClose(); }}>
      <Pressable onPress={() => undefined} style={[w.card, { maxHeight: height - 24 }, side && { maxWidth: 760 }]} accessibilityViewIsModal>
        <LinearGradient colors={['#3a1268', '#12052a']} style={StyleSheet.absoluteFill} />
        <Tap haptic="select" accessibilityLabel="Close" disabled={spinning} onPress={onClose} style={w.close}><Text style={w.closeText}>×</Text></Tap>
        <ScrollView contentContainerStyle={[w.body, side && w.bodySide]} showsVerticalScrollIndicator={false}>
          <View style={{ alignItems: 'center' }}>
          {!side && <><Text style={w.kicker}>DAILY</Text><Text style={w.title}>BONUS WHEEL</Text>
          <Text style={w.sub}>One free spin a day · free spins on {status.gameName}</Text></>}
          <View style={{ width: size + 16, height: size + 16, alignItems: 'center', justifyContent: 'center', marginVertical: 8 }}>
            <View style={[w.rim, { width: size + 16, height: size + 16, borderRadius: size }]} />
            <Animated.View accessibilityLabel={`Wheel of ${segments.length} prizes`} style={{ width: size, height: size, borderRadius: r, overflow: 'hidden',
              transform: [{ rotate: turn.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'] }) }] }}>
              {segments.map((segment, i) => <View key={i} pointerEvents="none" style={[StyleSheet.absoluteFill, { transform: [{ rotate: `${(i + .5) * angle}deg` }] }]}>
                <View style={{ position: 'absolute', left: r - half, top: 0, width: 0, height: 0, borderLeftWidth: half, borderRightWidth: half, borderTopWidth: r,
                  borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: COLOURS[i % COLOURS.length], opacity: result && !spinning && result.segment !== i ? .55 : 1 }} />
                <View style={{ position: 'absolute', left: r - 40, top: r * .14, width: 80, alignItems: 'center' }}>
                  <Text style={[w.segSpins, { fontSize: Math.max(16, r * .17) }]}>{segment.spins}</Text>
                  <Text style={w.segLabel}>SPINS</Text>
                </View>
              </View>)}
            </Animated.View>
            <View pointerEvents="none" style={w.pointer} />
            <Tap haptic="heavy" accessibilityLabel="Spin the wheel" disabled={spinning || !!result} onPress={() => void spin()} style={w.hubWrap}>
              <LinearGradient colors={['#fff3a0', '#ffb01f', '#d1480f']} style={w.hub}><Text style={w.hubText}>{spinning ? '…' : result ? '✓' : 'SPIN'}</Text></LinearGradient>
            </Tap>
          </View>
          </View>
          <View style={side ? w.sidePanel : { alignSelf: 'stretch', alignItems: 'center' }}>
          {side && <><Text style={w.kicker}>DAILY</Text><Text style={w.title}>BONUS WHEEL</Text>
          <Text style={w.sub}>One free spin a day · free spins on {status.gameName}</Text></>}
          <View accessibilityLiveRegion="polite" style={{ alignItems: 'center', minHeight: 60, marginTop: side ? 8 : 0 }}>
            {!!error && <Text style={w.error}>{error}</Text>}
            {result && !spinning ? <>
              <Text style={w.won}>YOU WON <Text style={{ color: c.gold }}>{result.spins} FREE SPINS</Text></Text>
              <Text style={w.detail}>on {result.gameName} at {result.stake.toFixed(2)} a spin{result.expiresAt ? ` · until ${new Date(result.expiresAt).toLocaleDateString()}` : ''}</Text>
              {prizeGame && <Tap haptic="heavy" accessibilityLabel={`Play ${prizeGame.name} now`} onPress={() => { onClose(); onPlay(prizeGame); }} style={{ marginTop: 10 }}>
                <LinearGradient colors={['#ffe58a', '#ff9f1a']} style={w.play}><Text style={w.playText}>PLAY {prizeGame.name.toUpperCase()}</Text></LinearGradient>
              </Tap>}
              <Text style={w.next}>Next spin in {until(result.nextAt, now)}</Text>
            </> : !spinning && <Text style={w.detail}>Tap SPIN — every segment wins.</Text>}
          </View>
          <View style={w.odds}>
            <Text style={w.oddsTitle}>PRIZES AND CHANCES</Text>
            {segments.map((segment, i) => <View key={i} style={w.oddsRow}><Text style={w.oddsText}>{segment.spins} free spins</Text><Text style={w.oddsText}>{segment.chance}%</Text></View>)}
            <Text style={w.rule}>One spin per player per day (UTC). Free spins are played on {status.gameName} and expire after {status.expiresInDays} days; winnings go to your balance. No purchase needed.</Text>
          </View>
          </View>
        </ScrollView>
      </Pressable>
    </Pressable>
  </Modal>;
}

const w = StyleSheet.create({
  launch: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingLeft: 6, paddingRight: 14, borderRadius: 24, borderWidth: 2, borderColor: c.gold, backgroundColor: '#2a0a50', overflow: 'hidden' },
  launchCompact: { paddingRight: 6 },
  launchGlow: { ...StyleSheet.absoluteFill, backgroundColor: '#ffd23f44' },
  mini: { width: 34, height: 34, borderRadius: 17, overflow: 'hidden', borderWidth: 2, borderColor: c.gold, backgroundColor: COLOURS[0] },
  miniSlice: { position: 'absolute', left: 15, top: -17, width: 0, height: 0, borderLeftWidth: 7, borderRightWidth: 7, borderTopWidth: 34, borderLeftColor: 'transparent', borderRightColor: 'transparent' },
  launchTitle: { color: '#ffe58a', fontWeight: '900', fontSize: 12, letterSpacing: 1.5 },
  launchSub: { color: '#e8dcff', fontSize: 11 },
  backdrop: { flex: 1, backgroundColor: '#05010cdd', alignItems: 'center', justifyContent: 'center', padding: 12 },
  card: { width: '100%', maxWidth: 420, borderRadius: 24, borderWidth: 3, borderColor: c.gold, overflow: 'hidden' },
  body: { alignItems: 'center', padding: 18 },
  bodySide: { flexDirection: 'row', alignItems: 'center', gap: 18, paddingVertical: 12 },
  sidePanel: { flex: 1, alignItems: 'center', minWidth: 260 },
  close: { position: 'absolute', top: 4, right: 4, width: 44, height: 44, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  closeText: { color: '#fff', fontSize: 26 },
  kicker: { color: '#ff9ad6', fontWeight: '900', fontSize: 12, letterSpacing: 8 },
  title: { color: '#ffe58a', fontWeight: '900', fontStyle: 'italic', fontSize: 30, textShadowColor: '#ff3cac', textShadowRadius: 14, textShadowOffset: { width: 0, height: 0 } },
  sub: { color: '#e8dcff', fontSize: 13, marginTop: 4, textAlign: 'center' },
  rim: { position: 'absolute', backgroundColor: '#5a2a04', borderWidth: 4, borderColor: c.gold },
  pointer: { position: 'absolute', top: -6, width: 0, height: 0, borderLeftWidth: 15, borderRightWidth: 15, borderTopWidth: 32, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: c.gold },
  hubWrap: { position: 'absolute' },
  hub: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: '#fff3c0' },
  hubText: { color: '#3b1600', fontWeight: '900', fontSize: 17 },
  segSpins: { color: '#fff', fontWeight: '900', textShadowColor: '#0008', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } },
  segLabel: { color: '#fff', fontWeight: '900', fontSize: 11, letterSpacing: 1.5 },
  won: { color: '#fff', fontWeight: '900', fontSize: 18, letterSpacing: .5, textAlign: 'center' },
  detail: { color: '#e8dcff', fontSize: 13, textAlign: 'center', marginTop: 2 },
  play: { minHeight: 46, paddingHorizontal: 22, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  playText: { color: '#3b1600', fontWeight: '900', fontSize: 14, letterSpacing: 1 },
  next: { color: '#b9a6e0', fontSize: 12, marginTop: 8 },
  error: { color: '#ffb5ad', fontSize: 13, textAlign: 'center' },
  odds: { alignSelf: 'stretch', marginTop: 14, gap: 4 },
  oddsTitle: { color: '#ffe58a', fontWeight: '900', fontSize: 11, letterSpacing: 2 },
  oddsRow: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#ffffff14', paddingVertical: 3 },
  oddsText: { color: '#d8c8f0', fontSize: 12 },
  rule: { color: '#a998c8', fontSize: 11, marginTop: 6 },
});
