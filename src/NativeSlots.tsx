import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ImageBackground, Platform, Animated, Easing, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { ApiError, Balance, Game, PlayResult, request } from './api';
import { clearPending, PendingBet, readPending, savePending } from './pendingBet';
import { s } from './styles';
import { LandscapeGame } from './LandscapeGame';
import { SymbolArt } from './WebLook';
import { Tap } from './Tap';
import { feel } from './theme';
import { Win, WinCelebration } from './WinCelebration';
import { sound } from './sound';
import { SoundToggle } from './Popups';
import { GameHistory } from './GameHistory';

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
  const {width,height}=useWindowDimensions();
  const landscape=width>height;
  // What is left for the reels once the single header row, the cabinet's own title, padding and status line
  // are taken out. The cap only bites on a tall screen, where a symbol any larger stops reading as a reel.
  const cellHeight=landscape?Math.max(44,Math.min(92,Math.floor((height-150)/3))):80;
  const [stake, setStake] = useState(String(game.minStake));
  const [wallet, setWallet] = useState(initialBalance);
  const [pending, setPending] = useState<PendingBet | null>(null);
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [result, setResult] = useState<PlayResult | null>(null), [stopped, setStopped] = useState(3), [reduced, setReduced] = useState(false);
  const [win, setWin] = useState<Win | null>(null);
  // Bumped whenever a round settles, so the history under the reels picks it up.
  const [played, setPlayed] = useState(0);
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
      setPlayed(n => n + 1); onSettled();
    } catch (e) {
      if (!alive.current) return;
      // A first-attempt validation/auth rejection did not settle. Uncertain retries stay locked.
      if (!pending && e instanceof ApiError && [400, 401, 403, 404, 422, 429].includes(e.status)) {
        await clearPending(userId).then(() => setPending(null)).catch(() => {});
      }
      feel('warn');
      setError(`${e instanceof Error ? e.message : 'Unable to play'}${submitted ? ' If a bet is pending, use Recover bet with the same request ID.' : ''}`);
      setStopped(3); setPlayed(n => n + 1); onSettled();
    } finally { locked.current = false; if (alive.current) setBusy(false); }
  }
  const display = result?.symbols || idle;
  const settled = result && !busy;
  return <LandscapeGame stageItems={2} below={<GameHistory token={token} game={game} refresh={played} />}>
    {/* One row of chrome, not three: every line above the cabinet is height taken from the reels. */}
    <View style={g.topBar}>
      <Tap haptic="select" disabled={busy} onPress={onClose} style={s.inlineButton}><Text style={s.link}>{busy ? 'Round in progress…' : '← Back to lobby'}</Text></Tap>
      <SoundToggle />
      <Text numberOfLines={1} style={[s.kicker, { flex: 1 }]}>{game.presentation?.eyebrow || 'THE ORIGINAL COLLECTION'}</Text>
      <Text style={s.accent}>{wallet ? `${cash(wallet.balance)} ${wallet.currency}` : 'Refresh wallet in lobby'}</Text>
    </View>
    <ImageBackground source={grid ? require('../assets/web/lucky-fire-blitz-bg-v1.png') : undefined} style={[g.cabinet, landscape&&{padding:10,gap:8}, {backgroundColor:game.presentation?.skin==='fruit'?'#063a33':'#3a0f5e'}]} imageStyle={{borderRadius:18,opacity:.6}}><Text style={[g.cabinetTitle,landscape&&{fontSize:22}]}>✦  {game.name.toUpperCase()}  ✦</Text><View style={g.reels}>{[0, 1, 2].map(col => <Reel cellHeight={cellHeight} key={col} index={col} reduced={reduced} spinning={busy && stopped <= col} highlight={!!settled && result.payout > 0} values={grid ? [display[col], display[col + 3], display[col + 6]] : [game.engine?.symbols?.[(col + 1) % (game.engine.symbols.length || 1)] || 'STAR', display[col], game.engine?.symbols?.[(col + 3) % (game.engine.symbols.length || 1)] || 'BAR']} />)}</View><Text style={g.line}>{grid ? 'CENTER ROW PAYS' : 'ONE PAYLINE'} · {busy ? 'SPINNING' : 'READY'}</Text><WinCelebration win={win} /></ImageBackground>
    <View accessibilityLiveRegion="polite" style={[s.card,landscape&&{padding:10,gap:4}]}><Text style={s.kicker}>{busy ? 'SETTLING YOUR ROUND' : settled ? result.outcome.replaceAll('_', ' ') : 'YOUR NEXT ROUND'}</Text><Text style={[s.title,landscape&&{fontSize:18}]}>{settled ? `Return ${cash(result.payout)} ${result.currency}` : busy ? 'Reels in motion…' : 'Choose your stake'}</Text>{settled && <Text style={s.muted}>Stake {cash(result.stake)} · Net {cash(result.payout - result.stake)} · {result.multiplier}×</Text>}</View>
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {!!pending && !busy && <Text style={s.muted}>Pending: {pending.gameCode} · {cash(pending.stake)}. {pending.gameCode !== game.code ? 'Open that game to recover the round.' : 'Recover resends this exact bet, not a new bet.'}</Text>}
    <Text style={s.kicker}>STAKE PER SPIN</Text><TextInput accessibilityLabel="Stake" style={[s.input,landscape&&{minHeight:44,padding:10}]} keyboardType="decimal-pad" value={pending ? String(pending.stake) : stake} onChangeText={setStake} editable={!busy && !pending} />
    <View style={g.reels}>{[game.minStake, Math.min(game.maxStake, game.minStake * 5), Math.min(game.maxStake, game.minStake * 10)].map((value, i) => <Tap key={i} haptic="select" disabled={busy || !!pending} style={[g.chip,landscape&&{padding:10,minHeight:40}]} onPress={() => setStake(cash(value))}><Text style={s.accent}>{cash(value)}</Text></Tap>)}</View>
    <Tap haptic="heavy" disabled={busy || !ready || (!!pending && pending.gameCode !== game.code)} onPress={spin} style={[s.button, {borderRadius:landscape?12:50,width:landscape?'100%':100,height:landscape?56:100,alignSelf:'center',justifyContent:'center',borderWidth:3,borderColor:'#ffd23f'}]}><Text style={s.buttonText}>{busy ? 'Spinning…' : pending ? 'Recover bet' : 'SPIN'}</Text></Tap>
    <Text style={s.small}>Each spin debits the displayed stake. Returns include the stake. No autoplay. Outcomes and payouts are determined by your backend.</Text>
    <Text style={s.title}>Paytable & rules</Text>{game.engine?.paytable?.map((line, i) => <View key={i} style={g.balance}><Text style={[s.muted, { flex: 1 }]}>{line.label}</Text><Text style={s.accent}>{line.multiplier}×</Text></View>)}{game.engine?.rules?.map((rule, i) => <Text key={i} style={s.small}>• {rule}</Text>)}
  </LandscapeGame>;
}
const g = StyleSheet.create({
  balance: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  cabinet: { overflow: 'hidden', padding: 16, borderRadius: 18, borderWidth: 2, borderColor: '#ffd23f', backgroundColor: '#22104a', gap: 20 },
  cabinetTitle: { textAlign: 'center', color: '#ffd23f', fontWeight: '800', letterSpacing: -1, fontSize: 30, fontFamily: Platform.OS === 'android' ? 'serif' : 'Georgia', fontStyle: 'italic' },
  reels: { flexDirection: 'row', gap: 10 }, reel: { flex: 1, overflow: 'hidden', borderRadius: 3, backgroundColor: '#180d23', borderWidth: 1, borderColor: '#b56cff66' },
  cell: { height: 80, alignItems: 'center', justifyContent: 'center', padding: 4 }, glyph: { color: '#f0d693', fontWeight: '900', fontSize: 23, textAlign: 'center' },
  winner: { borderColor: '#ffd23f', backgroundColor: '#3a2520' }, payGlow: { position: 'absolute' as const, left: 0, right: 0, top: 0, bottom: 0, backgroundColor: '#ffd23f' }, line: { color: '#d9c290', fontSize: 11, textAlign: 'center', letterSpacing: 1.6 }, chip: { flex: 1, alignItems: 'center', padding: 14, borderRadius: 12, backgroundColor: '#2e1660', borderWidth: 1, borderColor: '#b56cff77' },
});
