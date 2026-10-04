import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ImageBackground, Platform, Animated, Easing, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { ApiError, Balance, Game, PlayResult, request } from './api';
import { clearPending, PendingBet, readPending, savePending } from './pendingBet';
import { s } from './styles';
import { GameShell, PayRow, Rules } from './GameShell';
import { themeOf } from './GameLogo';
import { SymbolArt } from './WebLook';
import { Tap } from './Tap';
import { BetBar } from './BetBar';
import { feel } from './theme';
import { Win, WinCelebration } from './WinCelebration';
import { sound } from './sound';

export const supportsNativeSlots = (game: Game) => ['REEL_3', 'GRID_3X3'].includes(game.engine?.layout || '');
const glyphs: Record<string, string> = { '7': '7', CHERRY: '🍒', LEMON: '🍋', ORANGE: '🍊', BELL: '🔔', STAR: '★', BAR: 'BAR', DIAMOND: '◆', KOI: '🐟', RED_LANTERN: '🏮', JADE_LION: '🦁', JADE_COMPASS: '◈', CRANE: '🪽', FLAME_LOTUS: '🪷' };
const cash = (n: number) => n.toFixed(2);
function Reel({ values, spinning, index, reduced, highlight, cellHeight }: { cellHeight: number; values: string[]; spinning: boolean; index: number; reduced: boolean; highlight: boolean }) {
  const offset = useRef(new Animated.Value(0)).current;
  const cheer = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!spinning || reduced) { offset.setValue(0); return; }
    const animation = Animated.loop(Animated.timing(offset, { toValue: -values.length * cellHeight, duration: 550 + index * 100, easing: Easing.linear, useNativeDriver: true }));
    animation.start(); return () => { animation.stop(); offset.setValue(0); };
  }, [spinning, reduced, values.join(','), index, cellHeight]);
  // The paying row swells twice, a beat apart per reel, so the eye is led along the payline.
  useEffect(() => {
    if (!highlight || reduced) { cheer.setValue(0); return; }
    const pulse = Animated.sequence([
      Animated.delay(index * 110),
      Animated.loop(Animated.sequence([
        Animated.timing(cheer, { toValue: 1, duration: 380, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(cheer, { toValue: 0, duration: 380, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]), { iterations: 2 }),
    ]);
    pulse.start(); return () => { pulse.stop(); cheer.setValue(0); };
  }, [highlight, reduced, index]);
  const symbols = spinning && !reduced ? [...values, ...values] : values;
  // Index 1 is the paying row in both layouts: the centre of a three-reel window and of the 3×3 grid's column.
  const paying = (i: number) => !spinning && highlight && i % values.length === 1;
  return <View accessibilityLabel={spinning ? `Reel ${index + 1} spinning` : `Reel ${index + 1}: ${values.join(', ')}`} style={[g.reel, { height: values.length * cellHeight }, highlight && g.winner]}><Animated.View style={{ transform: [{ translateY: offset }] }}>{symbols.map((value, i) => <Animated.View key={i} style={[g.cell,{height:cellHeight}, paying(i) && { transform: [{ scale: cheer.interpolate({ inputRange: [0, 1], outputRange: [1, 1.11] }) }] }]}>
    {paying(i) && <Animated.View pointerEvents="none" style={[g.payGlow, { opacity: cheer.interpolate({ inputRange: [0, 1], outputRange: [0, 0.32] }) }]} />}
    <SymbolArt symbol={value} size={cellHeight-8}/></Animated.View>)}</Animated.View></View>;
}
export function NativeSlots({ game, token, userId, initialBalance, onClose, onSettled }: { game: Game; token: string; userId: string; initialBalance: Balance | null; onClose: () => void; onSettled: () => void }) {
  const [stake, setStake] = useState(String(game.minStake));
  const [wallet, setWallet] = useState(initialBalance);
  const [pending, setPending] = useState<PendingBet | null>(null);
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [result, setResult] = useState<PlayResult | null>(null), [stopped, setStopped] = useState(3), [reduced, setReduced] = useState(false);
  const [win, setWin] = useState<Win | null>(null);
  const locked = useRef(false), alive = useRef(true);
  const grid = game.engine?.layout === 'GRID_3X3';
  const count = grid ? 9 : 3;
  const idle = Array.from({ length: count }, (_, i) => game.engine?.symbols?.[i % (game.engine.symbols.length || 1)] || '7');
  useEffect(() => {
    alive.current = true;
    readPending(userId).then(value => { if (alive.current) { setPending(value); setReady(true); } }).catch(() => setError('Cannot read saved bet. Play is locked to prevent duplicate bets.'));
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => { alive.current = false; listener.remove(); };
  }, [userId]);
  async function spin() {
    if (locked.current || !ready || (pending && pending.gameCode !== game.code)) return;
    const amount = Number(stake);
    if (!pending && (!/^\d+(\.\d{1,2})?$/.test(stake) || amount < game.minStake || amount > Math.min(game.maxStake, 1000))) { setError(`Enter a stake between ${game.minStake} and ${Math.min(game.maxStake, 1000)}, with at most 2 decimals.`); return; }
    if (!pending && wallet && amount > wallet.balance) { setError('Insufficient available balance.'); return; }
    locked.current = true; setBusy(true); setError(''); setResult(null); setStopped(0); setWin(null);
    let submitted = false;
    try {
      const bet = pending || { gameCode: game.code, requestId: randomUUID(), stake: amount };
      // Persist before sending; never create a new request ID after an uncertain response.
      await savePending(userId, bet); setPending(bet); submitted = true;
      sound.play('spin');
      const data = await request<PlayResult>(`/api/games/${encodeURIComponent(game.code)}/play`, token, { requestId: bet.requestId, stake: bet.stake });
      if (data.requestId !== bet.requestId || data.gameCode !== game.code || data.symbols.length !== count) throw new Error('Unexpected result. Keep this request for reconciliation.');
      if (!alive.current) return;
      setResult(data);
      for (let reel = 1; reel <= 3; reel++) {
        if (!reduced) await new Promise(resolve => setTimeout(resolve, reel === 1 ? 900 : 350));
        if (!alive.current) return;
        setStopped(reel); sound.play('reel-stop');
      }
      await clearPending(userId); setPending(null);
      setWallet({ ...wallet, balance: data.balance, currency: data.currency });
      feel(data.payout > 0 ? 'win' : 'tap'); sound.result(data.payout > 0 ? data.multiplier : 0);
      if (data.payout > 0) setWin({ payout: data.payout, stake: data.stake, multiplier: data.multiplier, currency: data.currency, id: data.betId });
      onSettled();
    } catch (e) {
      if (!alive.current) return;
      // A first-attempt validation/auth rejection did not settle. Uncertain retries stay locked.
      if (!pending && e instanceof ApiError && [400, 401, 403, 404, 422, 429].includes(e.status)) {
        await clearPending(userId).then(() => setPending(null)).catch(() => {});
      }
      feel('warn');
      setError(`${e instanceof Error ? e.message : 'Unable to play'}${submitted ? ' If a bet is pending, use Recover bet with the same request ID.' : ''}`);
      setStopped(3); onSettled();
    } finally { locked.current = false; if (alive.current) setBusy(false); }
  }
  const display = result?.symbols || idle;
  const settled = result && !busy;
  const status = busy ? 'GOOD LUCK!' : settled ? (result.payout > 0 ? `WIN ${cash(result.payout)} · ${result.multiplier}×` : 'SO CLOSE · SPIN AGAIN') : grid ? 'CENTER ROW PAYS' : 'ONE PAYLINE · CENTER ROW';
  return <GameShell game={game} balance={wallet} onBack={onClose} backDisabled={busy} status={status}
    notice={error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text>
      : pending && !busy ? `Pending: ${pending.gameCode} · ${cash(pending.stake)}. ${pending.gameCode !== game.code ? 'Open that game to recover the round.' : 'SPIN resends this exact bet, not a new one.'}` : undefined}
    bet={<BetBar inline label="BET PER SPIN" value={pending ? pending.stake : Number(stake)} onChange={value => setStake(value.toFixed(2))} min={game.minStake} max={game.maxStake} disabled={busy || !!pending} />}
    win={cash(settled ? result.payout : 0)}
    spin={{ label: busy ? '…' : pending ? 'RECOVER' : 'SPIN', accessibilityLabel: pending ? 'Recover bet' : 'Spin', onPress: spin, disabled: busy || !ready || (!!pending && pending.gameCode !== game.code) }}
    overlay={<WinCelebration win={win} />}
    info={<>
      {game.engine?.paytable?.map((line, i) => <PayRow key={i} label={line.label} pays={`${line.multiplier}×`} />)}
      <Text style={s.small}>Each spin debits the bet shown. Returns include the bet. Outcomes and payouts are decided by the game server.</Text>
      <Rules rules={game.engine?.rules} />
    </>}>
    {stage => {
      // Three reels, as large as the stage allows: three rows high, three reels (and the cabinet's border) wide.
      const cellHeight = Math.max(44, Math.floor(Math.min((stage.height - 34) / 3, (stage.width - 60) / 3.9)));
      return <ImageBackground source={grid ? require('../assets/web/lucky-fire-blitz-bg-v1.png') : undefined}
        style={[g.cabinet, { backgroundColor: game.presentation?.skin === 'fruit' ? '#063a33' : '#3a0f5e', borderColor: themeOf(game).frame }]} imageStyle={{ borderRadius: 18, opacity: .6 }}>
        <View style={g.reels}>{[0, 1, 2].map(col => <View key={col} style={{ width: cellHeight * 1.2 }}><Reel cellHeight={cellHeight} index={col} reduced={reduced} spinning={busy && stopped <= col} highlight={!!settled && result.payout > 0}
          values={grid ? [display[col], display[col + 3], display[col + 6]] : [game.engine?.symbols?.[(col + 1) % (game.engine.symbols.length || 1)] || 'STAR', display[col], game.engine?.symbols?.[(col + 3) % (game.engine.symbols.length || 1)] || 'BAR']} /></View>)}</View>
        {!grid && <View pointerEvents="none" style={[g.payline, { top: 10 + cellHeight * 1.5 }]} />}
      </ImageBackground>;
    }}
  </GameShell>;
}
const g = StyleSheet.create({
  cabinet: { overflow: 'hidden', padding: 10, borderRadius: 18, borderWidth: 3, borderColor: '#ffd23f', backgroundColor: '#22104a' },
  payline: { position: 'absolute', left: 4, right: 4, height: 2, backgroundColor: '#ffd23f', opacity: .7 },
  reels: { flexDirection: 'row', gap: 10, justifyContent: 'center' }, reel: { flex: 1, overflow: 'hidden', borderRadius: 3, backgroundColor: '#180d23', borderWidth: 1, borderColor: '#b56cff66' },
  cell: { height: 80, alignItems: 'center', justifyContent: 'center', padding: 4 }, glyph: { color: '#f0d693', fontWeight: '900', fontSize: 23, textAlign: 'center' },
  winner: { borderColor: '#ffd23f', backgroundColor: '#3a2520' }, payGlow: { position: 'absolute' as const, left: 0, right: 0, top: 0, bottom: 0, backgroundColor: '#ffd23f' }, line: { color: '#d9c290', fontSize: 11, textAlign: 'center', letterSpacing: 1.6 }
});
