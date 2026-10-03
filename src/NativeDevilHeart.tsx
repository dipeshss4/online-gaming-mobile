import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { randomUUID } from 'expo-crypto';
import { ApiError, Balance, Game, PlayResult, request } from './api';
import { clearPending, PendingBet, readPending, savePending } from './pendingBet';
import { s } from './styles';
import { Tap } from './Tap';
import { BetBar } from './BetBar';
import { c, feel } from './theme';
import { Win, WinCelebration } from './WinCelebration';
import { sound } from './sound';
import { SoundToggle } from './Popups';

/**
 * Vegas Jackpot: Devil Heart in the app: three reels and five lines. A WILD or 2X fills its reel and locks it for a
 * free respin in the same bet; three JACKPOTs on a line pay 10x to 30x the bet. The screens come from the server's
 * round (see DevilHeartEngine); this shows them in order and lights the lines it paid.
 */
export const supportsDevilHeart = (game: Game) => game.engine?.layout === 'CLASSIC_5L';
const LINES = [[1, 1, 1], [0, 0, 0], [2, 2, 2], [0, 1, 2], [2, 1, 0]];
const LINE_COLORS = ['#ffd23f', '#ff3cac', '#22e1ff', '#2ee57a', '#ff7a1a'];
const PAYS: Record<string, number> = { SEVEN: 12, BAR3: 7, BAR2: 5, BAR1: 3 };
const WILDS = ['WILD', 'X2'];
const IDLE = ['BAR2', 'SEVEN', 'BAR3', 'BAR1', 'SEVEN', 'BAR2', 'SEVEN', 'BAR3', 'BAR1'];
const BLUR = ['SEVEN', 'BAR3', 'WILD', 'BAR1', 'JACKPOT', 'BAR2', 'X2', 'SEVEN'];
const cash = (n: number) => n.toFixed(2);
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function linePay(symbols: string[]) {
  if (symbols.every(x => x === 'JACKPOT')) return 0;
  if (symbols.every(x => WILDS.includes(x) || x === 'JACKPOT')) return 40;
  if (symbols.some(x => !WILDS.includes(x) && !(x in PAYS))) return 0;
  const rest = symbols.filter(x => !WILDS.includes(x)), doubles = symbols.filter(x => x === 'X2').length;
  return (new Set(rest).size === 1 ? PAYS[rest[0]] : rest.every(x => x.startsWith('BAR')) ? 1 : 0) * 2 ** doubles;
}
const cellsOf = (line: number) => LINES[line].map((row, reel) => row * 3 + reel);
/** The lines that paid on a screen (three JACKPOTs count: they won the jackpot). */
function winningLines(screen: string[]) {
  return LINES.map((_, line) => line).filter(line => {
    const symbols = cellsOf(line).map(cell => screen[cell]);
    return symbols.every(x => x === 'JACKPOT') || linePay(symbols) > 0;
  });
}
const lockedReels = (screen: string[]) => [0, 1, 2].map(reel => WILDS.includes(screen[reel]) && screen[3 + reel] === screen[reel] && screen[6 + reel] === screen[reel]);

/** Devil Heart's symbols in plain views: a flaming 7, BAR plates with horns, a heart WILD, a 2X flame and the jackpot. */
export function DevilSymbol({ symbol, size }: { symbol: string; size: number }) {
  if (symbol === 'SEVEN') return <View accessibilityLabel="flaming seven" style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <Text style={{ position: 'absolute', top: -size * .06, fontSize: size * .38 }}>🔥</Text>
    <Text style={[d.seven, { fontSize: size * .82, lineHeight: size * .92 }]}>7</Text>
  </View>;
  if (symbol.startsWith('BAR')) {
    const count = Number(symbol.slice(3)), tone = count === 3 ? ['#ff5ab4', '#a1135f'] : count === 2 ? ['#ffd23f', '#a46a00'] : ['#ff6a3a', '#9e1f05'];
    return <View accessibilityLabel={`${['single', 'double', 'triple'][count - 1]} bar`} style={{ width: size * 1.3, height: size, alignItems: 'center', justifyContent: 'center', gap: size * .04 }}>
      <Text style={[d.horns, { fontSize: size * .2 }]}>▲   ▲</Text>
      {Array.from({ length: count }, (_, i) => <LinearGradient key={i} colors={tone as [string, string]} style={[d.plate, { width: size * 1.2, height: Math.max(17, size * .22) }]}>
        <Text style={[d.barText, { fontSize: Math.max(11, size * .16), lineHeight: Math.max(13, size * .19) }]}>BAR</Text></LinearGradient>)}
    </View>;
  }
  if (symbol === 'WILD') return <View accessibilityLabel="wild" style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <Text style={{ fontSize: size * .8, lineHeight: size * .95 }}>❤️</Text>
    <Text style={[d.wildText, { fontSize: Math.max(11, size * .2) }]}>WILD</Text>
  </View>;
  if (symbol === 'X2') return <View accessibilityLabel="two times wild" style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <LinearGradient colors={['#ff9a00', '#d10f1f', '#5c0010']} style={[d.circle, { width: size * .82, height: size * .82, borderRadius: size }]}>
      <Text style={[d.x2, { fontSize: size * .34 }]}>2X</Text></LinearGradient>
  </View>;
  if (symbol === 'JACKPOT') return <View accessibilityLabel="jackpot" style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <LinearGradient colors={['#ff4a5a', '#8a0010']} style={[d.diamond, { width: size * .66, height: size * .66 }]} />
    <Text style={[d.jp, { fontSize: Math.max(11, size * .16) }]}>JACK{'\n'}POT</Text>
  </View>;
  return <View accessibilityLabel="blank" style={{ width: size, height: size }} />;
}

/** One reel: a running strip while it spins, then its three symbols, with the cells the shown line paid lit. */
function Reel({ cells, spinning, locked, lit, dim, reel, size, reduced }: { cells: string[]; spinning: boolean; locked: boolean; lit: Set<number>; dim: boolean; reel: number; size: number; reduced: boolean }) {
  const offset = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!spinning || reduced) { offset.setValue(0); return; }
    const run = Animated.loop(Animated.timing(offset, { toValue: -BLUR.length * size, duration: 380 + reel * 60, easing: Easing.linear, useNativeDriver: true }));
    run.start(); return () => { run.stop(); offset.setValue(0); };
  }, [spinning, reduced, size, reel]);
  return <View style={[d.reel, { height: size * 3 }, locked && d.locked]} accessibilityLabel={spinning ? `Reel ${reel + 1} spinning` : `Reel ${reel + 1}: ${cells.join(', ')}`}>
    {spinning && !reduced
      ? <Animated.View style={{ transform: [{ translateY: offset }] }}>{[...BLUR, ...BLUR].map((symbol, i) => <View key={i} style={[d.cell, { height: size }]}><DevilSymbol symbol={symbol} size={size * .78} /></View>)}</Animated.View>
      : cells.map((symbol, row) => { const cell = row * 3 + reel; return <View key={row} style={[d.cell, { height: size }, lit.has(cell) && d.lit, dim && !lit.has(cell) && { opacity: .35 }]}><DevilSymbol symbol={symbol} size={size * .78} /></View>; })}
    {locked && <Text style={d.lockTag}>LOCKED</Text>}
  </View>;
}

export function NativeDevilHeart({ game, token, userId, initialBalance, onClose, onSettled }: { game: Game; token: string; userId: string; initialBalance: Balance | null; onClose: () => void; onSettled: () => void }) {
  const { width, height } = useWindowDimensions(), landscape = width > height;
  const size = landscape ? Math.max(48, Math.min(96, Math.floor((height - 120) / 3))) : Math.max(56, Math.min(110, Math.floor((width - 80) / 3.6)));
  const [stake, setStake] = useState(game.minStake), [wallet, setWallet] = useState(initialBalance);
  const [pending, setPending] = useState<PendingBet | null>(null), [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [reduced, setReduced] = useState(false);
  const [screen, setScreen] = useState(IDLE), [spinning, setSpinning] = useState([false, false, false]), [locked, setLocked] = useState([false, false, false]);
  const [lines, setLines] = useState<number[]>([]), [showing, setShowing] = useState<number | null>(null);
  const [status, setStatus] = useState('PLACE YOUR BET'), [jackpot, setJackpot] = useState<number | null>(null);
  const [meter, setMeter] = useState(0), [win, setWin] = useState<Win | null>(null);
  const alive = useRef(true), lock = useRef(false), fast = useRef(false);
  useEffect(() => {
    alive.current = true;
    readPending(userId).then(value => { if (alive.current) { setPending(value); setReady(true); } }).catch(() => setError('Cannot read saved bet. Play is locked to prevent duplicate bets.'));
    AccessibilityInfo.isReduceMotionEnabled().then(value => { fast.current = value; setReduced(value); });
    return () => { alive.current = false; };
  }, [userId]);
  const wait = (ms: number) => pause(fast.current ? Math.min(ms, 100) : ms);

  async function land(next: string[], reels: number[], spinMs: number) {
    setLines([]); setShowing(null);
    setSpinning(previous => previous.map((value, reel) => reels.includes(reel) ? true : value));
    await wait(spinMs);
    for (const reel of reels) {
      if (!alive.current) return;
      setScreen(previous => previous.map((symbol, cell) => cell % 3 === reel ? next[cell] : symbol));
      setSpinning(previous => previous.map((value, index) => index === reel ? false : value));
      sound.play('reel-stop'); await wait(220);
    }
  }
  async function showLines(found: number[]) {
    if (!found.length) return;
    setLines(found); feel('select');
    for (const line of found) { if (!alive.current) return; setShowing(line); await wait(600); }
    setShowing(null);
  }

  async function spin() {
    if (lock.current || !ready || (pending && pending.gameCode !== game.code)) return;
    if (!pending && wallet && stake > wallet.balance) { setError('Insufficient available balance.'); return; }
    lock.current = true; setBusy(true); setError(''); setWin(null); setMeter(0); setJackpot(null); setLocked([false, false, false]); setStatus('GOOD LUCK!');
    let submitted = false;
    try {
      const bet = pending || { gameCode: game.code, requestId: randomUUID(), stake };
      await savePending(userId, bet); setPending(bet); submitted = true;
      sound.play('spin');
      const data = await request<PlayResult>(`/api/games/${encodeURIComponent(game.code)}/play`, token, { requestId: bet.requestId, stake: bet.stake });
      const cells = data.symbols.filter(x => !x.startsWith('JP')), jackpots = data.symbols.filter(x => x.startsWith('JP')).map(x => Number(x.slice(2)));
      if (data.requestId !== bet.requestId || data.gameCode !== game.code || (cells.length !== 9 && cells.length !== 18)) throw new Error('Unexpected result. Keep this request for reconciliation.');
      await clearPending(userId); setPending(null);
      if (!alive.current) return;
      const base = cells.slice(0, 9), respin = cells.length === 18 ? cells.slice(9) : null;
      await land(base, [0, 1, 2], 650);
      await showLines(winningLines(base));
      const celebrate = async (screenNow: string[]) => {
        if (!LINES.some((_, line) => cellsOf(line).every(cell => screenNow[cell] === 'JACKPOT')) || !jackpots.length) return;
        const prize = jackpots.shift()!; setJackpot(prize); feel('win'); sound.result(prize); await wait(2000); setJackpot(null);
      };
      await celebrate(base);
      if (respin && alive.current) {
        const hold = lockedReels(base);
        setLocked(hold); setStatus('WILD LOCKED · FREE RESPIN!'); feel('heavy'); await wait(1000);
        sound.play('spin');
        await land(respin, [0, 1, 2].filter(reel => !hold[reel]), 400);
        await showLines(winningLines(respin));
        await celebrate(respin);
      }
      if (!alive.current) return;
      setLines(winningLines(respin ?? base)); setMeter(data.payout);
      setWallet(current => current ? { ...current, balance: data.balance, currency: data.currency } : current);
      setStatus(data.payout > 0 ? `WIN ${cash(data.payout)}` : 'SO CLOSE · SPIN AGAIN');
      feel(data.payout > 0 ? 'win' : 'tap'); sound.result(data.payout > 0 ? data.multiplier : 0);
      if (data.payout > 0) setWin({ payout: data.payout, stake: data.stake, multiplier: data.multiplier, currency: data.currency, id: data.betId });
      onSettled();
    } catch (e) {
      if (!alive.current) return;
      if (!pending && e instanceof ApiError && [400, 401, 403, 404, 422, 429].includes(e.status)) await clearPending(userId).then(() => setPending(null)).catch(() => {});
      feel('warn'); setStatus('PLACE YOUR BET');
      setError(`${e instanceof Error ? e.message : 'Unable to play'}${submitted ? ' If a bet is pending, use Recover bet with the same request ID.' : ''}`);
      onSettled();
    } finally {
      lock.current = false;
      if (alive.current) { setBusy(false); setSpinning([false, false, false]); setLocked([false, false, false]); }
    }
  }

  const lit = new Set((showing === null ? lines : [showing]).flatMap(cellsOf));
  const reels = <LinearGradient colors={['#3a0806', '#250404']} style={d.cabinet}>
    <View style={d.marquee}>
      <View style={d.jackpotBox}><Text style={d.boxLabel}>JACKPOT</Text><Text style={d.boxValue}>10×–30× BET</Text></View>
      <View style={{ alignItems: 'center', flex: 1 }}><Text style={d.eyebrow}>VEGAS JACKPOT</Text><Text style={d.title} numberOfLines={1}>Devil Heart</Text></View>
    </View>
    <View style={d.stage}>
      <View style={d.tags}>{LINES.map((rows, line) => <Text key={line} style={[d.tag, { top: rows[0] * size + size / 2 - 10 + (line === 1 ? -11 : line === 3 ? 11 : line === 2 ? -11 : line === 4 ? 11 : 0), backgroundColor: LINE_COLORS[line], opacity: lines.includes(line) ? 1 : .5 }]}>{line + 1}</Text>)}</View>
      <View style={d.reels}>{[0, 1, 2].map(reel => <Reel key={reel} reel={reel} size={size} reduced={reduced} cells={[0, 1, 2].map(row => screen[row * 3 + reel])} spinning={spinning[reel]} locked={locked[reel]} lit={lit} dim={lines.length > 0} />)}</View>
      <View style={d.tags}>{LINES.map((rows, line) => <Text key={line} style={[d.tag, { top: rows[2] * size + size / 2 - 10 + (line === 1 ? -11 : line === 4 ? 11 : line === 2 ? -11 : line === 3 ? 11 : 0), backgroundColor: LINE_COLORS[line], opacity: lines.includes(line) ? 1 : .5 }]}>{line + 1}</Text>)}</View>
    </View>
    <Text style={d.status} accessibilityLiveRegion="polite">{status}</Text>
    {jackpot !== null && <View style={d.jackpotWin} accessibilityRole="alert"><Text style={d.jackpotSmall}>JACKPOT!</Text><Text style={d.jackpotBig}>{jackpot}× BET</Text></View>}
    <WinCelebration win={win} />
  </LinearGradient>;

  const controls = <>
    <View style={d.topBar}>
      <Tap haptic="select" disabled={busy} onPress={onClose} style={s.inlineButton}><Text style={s.link}>{busy ? 'Round in progress…' : '← Lobby'}</Text></Tap>
      <SoundToggle />
      <Text style={[s.accent, { flex: 1, textAlign: 'right' }]} numberOfLines={1}>{wallet ? `${cash(wallet.balance)} ${wallet.currency}` : 'Refresh wallet in lobby'}</Text>
    </View>
    <View style={d.winBox}><Text style={d.boxLabel}>WIN</Text><Text style={d.winValue}>{cash(meter)}</Text></View>
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {!!pending && !busy && <Text style={s.small}>Pending: {pending.gameCode} · {cash(pending.stake)}. {pending.gameCode !== game.code ? 'Open that game to recover the round.' : 'Recover resends this exact bet, not a new bet.'}</Text>}
    <BetBar label={`TOTAL BET · 5 LINES · ${cash(stake / 5)} A LINE`} value={pending ? pending.stake : stake} onChange={setStake} min={game.minStake} max={game.maxStake} disabled={busy || !!pending} />
    <Tap haptic="heavy" accessibilityLabel={pending ? 'Recover bet' : 'Spin'} disabled={busy || !ready || (!!pending && pending.gameCode !== game.code)} onPress={spin} style={d.spin}>
      <LinearGradient colors={['#ff9a3a', '#d10f1f', '#6e0010']} style={StyleSheet.absoluteFill} />
      <Text style={d.spinText}>{busy ? '…' : pending ? 'RECOVER' : 'SPIN'}</Text>
    </Tap>
    <Text style={s.kicker}>PAYTABLE · LINE BET MULTIPLES</Text>
    {[['JACKPOT ×3', '10×–30× BET'], ['ANY 3 JACKPOT / WILD / 2X', '40'], ['7 7 7', '12'], ['TRIPLE BAR ×3', '7'], ['DOUBLE BAR ×3', '5'], ['SINGLE BAR ×3', '3'], ['ANY 3 BARS', '1']].map(([label, pays]) =>
      <View key={label} style={d.payRow}><Text style={s.muted}>{label}</Text><Text style={s.accent}>{pays}</Text></View>)}
    {game.engine?.rules?.map((rule, i) => <Text key={i} style={s.small}>• {rule}</Text>)}
  </>;

  if (!landscape) return <ScrollView contentContainerStyle={[s.content, { backgroundColor: '#1a0204' }]}>{reels}{controls}</ScrollView>;
  return <View style={{ flex: 1, flexDirection: 'row', backgroundColor: '#1a0204' }}>
    <View style={{ flex: 1, minWidth: 0, padding: 8, justifyContent: 'center' }}>{reels}</View>
    <ScrollView style={{ flexGrow: 0, flexShrink: 0, width: Math.max(250, Math.min(340, width * .36)) }} contentContainerStyle={{ padding: 10, gap: 8 }}>{controls}</ScrollView>
  </View>;
}

const serif = Platform.OS === 'android' ? 'serif' : 'Georgia';
const d = StyleSheet.create({
  cabinet: { borderRadius: 18, borderWidth: 3, borderColor: '#ff7a1a', padding: 8, gap: 6, overflow: 'hidden' },
  marquee: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  jackpotBox: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 2, borderColor: c.gold, backgroundColor: '#1a0204cc' },
  boxLabel: { color: '#ff9a6a', fontSize: 11, fontWeight: '900', letterSpacing: 1.5, textAlign: 'center' },
  boxValue: { color: '#ffe45c', fontSize: 14, fontWeight: '900' },
  eyebrow: { color: '#ff9ad6', fontSize: 11, fontWeight: '800', letterSpacing: 3 },
  title: { color: '#ffe45c', fontSize: 24, fontWeight: '900', fontStyle: 'italic', fontFamily: serif, textShadowColor: '#ff3a00', textShadowRadius: 12, textShadowOffset: { width: 0, height: 0 } },
  stage: { flexDirection: 'row', alignItems: 'stretch', justifyContent: 'center', gap: 4 },
  tags: { width: 22 },
  tag: { position: 'absolute', left: 0, width: 22, height: 20, borderRadius: 5, textAlign: 'center', fontSize: 11, fontWeight: '900', color: '#1a0204', lineHeight: 20, overflow: 'hidden' },
  reels: { flexDirection: 'row', gap: 5, padding: 5, borderRadius: 12, borderWidth: 3, borderColor: '#ffb01f', backgroundColor: '#120102', flexShrink: 1 },
  reel: { flex: 1, minWidth: 64, overflow: 'hidden', borderRadius: 8, backgroundColor: '#2e0609', borderWidth: 1, borderColor: '#ff6a3a55' },
  locked: { borderColor: c.gold, borderWidth: 2, backgroundColor: '#4a0c08' },
  lockTag: { position: 'absolute', bottom: 4, alignSelf: 'center', paddingHorizontal: 8, borderRadius: 999, backgroundColor: c.gold, color: '#3a0005', fontSize: 11, fontWeight: '900', letterSpacing: 1.5, overflow: 'hidden' },
  cell: { alignItems: 'center', justifyContent: 'center' },
  lit: { backgroundColor: '#ffd23f33' },
  seven: { color: '#e01020', fontWeight: '900', fontFamily: serif, textShadowColor: '#ffd23f', textShadowRadius: 4, textShadowOffset: { width: 0, height: 0 } },
  horns: { color: '#c40f1f', fontWeight: '900', letterSpacing: 2, marginBottom: -2 },
  plate: { borderRadius: 4, borderWidth: 2, borderColor: c.gold, alignItems: 'center', justifyContent: 'center' },
  barText: { color: '#fff', fontWeight: '900', letterSpacing: 2 },
  wildText: { position: 'absolute', color: '#fff', fontWeight: '900', textShadowColor: '#5c0018', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } },
  circle: { alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: c.gold },
  x2: { color: '#ffe45c', fontWeight: '900' },
  diamond: { position: 'absolute', transform: [{ rotate: '45deg' }], borderWidth: 3, borderColor: c.gold, borderRadius: 4 },
  jp: { color: '#fff', fontWeight: '900', textAlign: 'center' },
  status: { color: '#ffe45c', fontWeight: '900', fontSize: 15, letterSpacing: 2, textAlign: 'center' },
  jackpotWin: { position: 'absolute', alignSelf: 'center', top: '35%', paddingHorizontal: 26, paddingVertical: 12, borderRadius: 18, borderWidth: 4, borderColor: c.gold, backgroundColor: '#8a0010', alignItems: 'center' },
  jackpotSmall: { color: '#fff', fontWeight: '900', letterSpacing: 3 },
  jackpotBig: { color: '#ffe45c', fontWeight: '900', fontSize: 34, fontFamily: serif },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  winBox: { alignItems: 'center', paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: '#ff6a3a88', backgroundColor: '#1a0204' },
  winValue: { color: '#ffe45c', fontSize: 22, fontWeight: '900' },
  spin: { minHeight: 60, borderRadius: 30, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: c.gold },
  spinText: { color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: 2 },
  payRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 6 },
});
