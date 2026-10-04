import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Image, Platform, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { randomUUID } from 'expo-crypto';
import { API_URL, ApiError, Balance, Game, PlayResult, request } from './api';
import { clearPending, PendingBet, readPending, savePending } from './pendingBet';
import { s } from './styles';
import { GameShell, PayRow, Rules } from './GameShell';
import { SpinReel } from './fx/SpinReel';
import { Paylines } from './fx/Paylines';

import { MarqueeFrame } from './fx/MarqueeFrame';
import { SymbolArt } from './WebLook';
import { Tap } from './Tap';
import { BetBar } from './BetBar';
import { feel } from './theme';
import { Win, WinCelebration } from './WinCelebration';
import { BigWin } from './fx/BigWin';
import { sound } from './sound';

/**
 * The five-reel video slot (Seven Stars Deluxe and the Game builder's games), as on the website: twenty lines,
 * wilds, and three scatters for eight free spins at double pay. The server decides and pays the whole round in one
 * bet; its symbols are the base screen followed by one screen per free spin. This only reads the screens the way
 * the server's VideoSlotRules does, to light the lines that won. The amount paid always comes from the server.
 */
const REELS = 5, ROWS = 3, CELLS = 15, WILD = 'WILD', SCATTER = 'SCATTER';
const FREE_SPINS = 8, FREE_SPIN_FACTOR = 2, SCATTERS_FOR_FEATURE = 3;
const IMAGE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** One colour per line, the web's, so overlapping wins stay tellable apart. */
const LINE_COLORS = ['#ffd23f', '#ff3cac', '#22e1ff', '#2ee57a', '#ff7a1a', '#a43cff', '#ff5a5a', '#3c7bff', '#f8ff5a', '#ff9ad6',
  '#5affd6', '#ffb01f', '#c77dff', '#7dff5a', '#ff6ad5', '#5ac8ff', '#ffe45c', '#ff8a5a', '#9d8cff', '#5aff9d'];

export const supportsVideoSlot = (game: Game) => game.engine?.layout === 'VIDEO_5X3';

type LineWin = { line: number; symbol: string; count: number; pays: number; cells: number[] };
type Engine = NonNullable<Game['engine']>;

function evaluate(screen: string[], engine: Engine) {
  const pays = new Map<string, number[]>();
  for (const entry of engine.paytable ?? []) {
    if (!entry.pattern?.length) continue;
    const table = pays.get(entry.pattern[0]) ?? [0, 0, 0];
    table[entry.pattern.length - 3] = entry.multiplier;
    pays.set(entry.pattern[0], table);
  }
  const value = (symbol: string, count: number) => count >= 3 ? pays.get(symbol)?.[count - 3] ?? 0 : 0;
  const wins: LineWin[] = [];
  (engine.lines ?? []).forEach((path, line) => {
    const symbols = path.map(cell => screen[cell]);
    let wilds = 0;
    while (wilds < REELS && symbols[wilds] === WILD) wilds++;
    const target = wilds < REELS ? symbols[wilds] : WILD;
    let best: LineWin | null = null;
    if (target !== SCATTER && target !== WILD) {
      let count = 0;
      while (count < REELS && (symbols[count] === target || symbols[count] === WILD)) count++;
      if (value(target, count) > 0) best = { line, symbol: target, count, pays: value(target, count), cells: path.slice(0, count) };
    }
    if (value(WILD, wilds) > (best?.pays ?? 0)) best = { line, symbol: WILD, count: wilds, pays: value(WILD, wilds), cells: path.slice(0, wilds) };
    if (best) wins.push(best);
  });
  return { wins, scatters: screen.filter(symbol => symbol === SCATTER).length, pays: wins.reduce((sum, win) => sum + win.pays, 0) };
}

/** A symbol as the website draws it: the Game builder's uploaded art, the wild and scatter badges, else the sheets. */
function VideoSymbol({ symbol, art, size }: { symbol: string; art?: Record<string, string>; size: number }) {
  const chosen = art?.[symbol] ?? '';
  if (IMAGE_ID.test(chosen)) return <Image accessibilityLabel={symbol} source={{ uri: `${API_URL}/api/media/${chosen}` }} style={{ width: size, height: size }} resizeMode="contain" />;
  if (symbol === WILD) return <LinearGradient accessibilityLabel="wild" colors={['#ff3cac', '#7a0bc0']} style={[v.badge, { width: size, height: size * .7 }]}><Text style={[v.wild, { fontSize: size * .26 }]}>WILD</Text></LinearGradient>;
  if (symbol === SCATTER) return <LinearGradient accessibilityLabel="scatter" colors={['#22e1ff', '#0b4fc0']} style={[v.badge, { width: size, height: size * .82 }]}><Text style={[v.star, { fontSize: size * .34 }]}>★</Text><Text style={[v.free, { fontSize: Math.max(11, size * .2) }]}>FREE</Text></LinearGradient>;
  return <SymbolArt symbol={chosen || symbol} size={size} />;
}

const cash = (n: number) => n.toFixed(2);
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function NativeVideoSlot({ game, token, userId, initialBalance, onClose, onSettled }: { game: Game; token: string; userId: string; initialBalance: Balance | null; onClose: () => void; onSettled: () => void }) {
  const engine = game.engine as Engine;
  const reelSymbols = (engine.symbols ?? []).filter(symbol => symbol !== SCATTER);
  const idle = Array.from({ length: CELLS }, (_, i) => reelSymbols[(i * 7 + Math.floor(i / REELS)) % (reelSymbols.length || 1)] || '7');
  const [stake, setStake] = useState(String(game.minStake));
  const [wallet, setWallet] = useState(initialBalance);
  const [pending, setPending] = useState<PendingBet | null>(null);
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [screen, setScreen] = useState(idle), [stopped, setStopped] = useState(REELS), [reduced, setReduced] = useState(false);
  const [wins, setWins] = useState<LineWin[]>([]), [scatterLit, setScatterLit] = useState(false);
  const [feature, setFeature] = useState<{ spin: number; total: number; banner: boolean } | null>(null);
  const [result, setResult] = useState<PlayResult | null>(null), [meter, setMeter] = useState(0);
  const [win, setWin] = useState<Win | null>(null);
  const locked = useRef(false), alive = useRef(true), fast = useRef(false);

  useEffect(() => {
    alive.current = true;
    readPending(userId).then(value => { if (alive.current) { setPending(value); setReady(true); } }).catch(() => setError('Cannot read saved bet. Play is locked to prevent duplicate bets.'));
    AccessibilityInfo.isReduceMotionEnabled().then(value => { fast.current = value; setReduced(value); });
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', value => { fast.current = value; setReduced(value); });
    return () => { alive.current = false; listener.remove(); };
  }, [userId]);

  /** Spins every reel, then stops them left to right on the given screen. */
  async function land(next: string[], spinMs: number) {
    setWins([]); setScatterLit(false); setStopped(0);
    if (!fast.current) await pause(spinMs);
    setScreen(next);
    for (let reel = 1; reel <= REELS; reel++) {
      if (!fast.current) await pause(140);
      if (!alive.current) return;
      setStopped(reel); sound.play('reel-land');
    }
  }

  async function spin() {
    if (locked.current || !ready || (pending && pending.gameCode !== game.code)) return;
    const amount = Number(stake), max = Math.min(game.maxStake, 1000);
    if (!pending && (!/^\d+(\.\d{1,2})?$/.test(stake) || amount < game.minStake || amount > max)) { setError(`Enter a stake between ${game.minStake} and ${max}, with at most 2 decimals.`); return; }
    if (!pending && wallet && amount > wallet.balance) { setError('Insufficient available balance.'); return; }
    locked.current = true; setBusy(true); setError(''); setResult(null); setWin(null); setMeter(0); setFeature(null); setWins([]); setStopped(0);
    let submitted = false;
    try {
      const bet = pending || { gameCode: game.code, requestId: randomUUID(), stake: amount };
      // Persist before sending; never create a new request ID after an uncertain response.
      await savePending(userId, bet); setPending(bet); submitted = true;
      sound.play('spin');
      const data = await request<PlayResult>(`/api/games/${encodeURIComponent(game.code)}/play`, token, { requestId: bet.requestId, stake: bet.stake });
      if (data.requestId !== bet.requestId || data.gameCode !== game.code || data.symbols.length < CELLS || data.symbols.length % CELLS) throw new Error('Unexpected result. Keep this request for reconciliation.');
      // Settled on the server: the bet is no longer pending, whatever happens to the animation.
      await clearPending(userId); setPending(null);
      if (!alive.current) return;
      const screens: string[][] = [];
      for (let start = 0; start < data.symbols.length; start += CELLS) screens.push(data.symbols.slice(start, start + CELLS));
      const [base, ...spins] = screens;
      await land(base, 700);
      const found = evaluate(base, engine);
      let total = found.pays * data.stake;
      if (found.wins.length) { setWins(found.wins); setMeter(total); sound.play('reel-stop'); if (!fast.current) await pause(1100); }
      // Three scatters: the free spins play out one screen at a time, every win doubled.
      if (spins.length && found.scatters >= SCATTERS_FOR_FEATURE && alive.current) {
        setScatterLit(true); feel('win'); sound.result(20);
        setFeature({ spin: 0, total, banner: true });
        if (!fast.current) await pause(2000);
        for (let index = 0; index < spins.length && alive.current; index++) {
          setFeature({ spin: index + 1, total, banner: false });
          sound.play('spin');
          await land(spins[index], 350);
          const free = evaluate(spins[index], engine);
          if (free.wins.length) {
            total += free.pays * FREE_SPIN_FACTOR * data.stake;
            setWins(free.wins); setMeter(total); setFeature({ spin: index + 1, total, banner: false });
            if (!fast.current) await pause(900);
          } else if (!fast.current) await pause(300);
        }
      }
      if (!alive.current) return;
      // The server's payout is what was paid; the screens only showed how it was made up.
      setMeter(data.payout); setResult(data);
      setWallet(current => current ? { ...current, balance: data.balance, currency: data.currency } : current);
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
      setStopped(REELS); onSettled();
    } finally {
      locked.current = false;
      if (alive.current) { setBusy(false); setStopped(REELS); setFeature(current => current && { ...current, banner: false }); }
    }
  }

  // Which line lights each cell: the first winning line through it, in that line's colour.
  const litBy = new Map<number, string>();
  for (const found of wins) for (const index of found.cells) if (!litBy.has(index)) litBy.set(index, LINE_COLORS[found.line % LINE_COLORS.length]);
  const status = busy && feature?.banner ? `${SCATTERS_FOR_FEATURE} SCATTERS · ${FREE_SPINS} FREE SPINS!`
    : busy && feature ? `FREE SPIN ${feature.spin} / ${FREE_SPINS} · WINS ×${FREE_SPIN_FACTOR}`
    : busy ? 'SPINNING' : `${engine.lines?.length ?? 20} LINES · READY`;
  return <GameShell game={game} balance={wallet} onBack={onClose} backDisabled={busy}
    status={result && !busy ? (result.payout > 0 ? `WIN ${cash(result.payout)} · ${result.multiplier}×` : 'SO CLOSE · SPIN AGAIN')
      : busy && wins.length && !feature?.banner ? wins.map(found => `LINE ${found.line + 1} · ${found.count}× ${found.symbol.replaceAll('_', ' ')}`).slice(0, 2).join('  ·  ') : status}
    notice={error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text>
      : pending && !busy ? `Pending: ${pending.gameCode} · ${cash(pending.stake)}. ${pending.gameCode !== game.code ? 'Open that game to recover the round.' : 'SPIN resends this exact bet, not a new one.'}` : undefined}
    bet={<BetBar inline label={`TOTAL BET · ${engine.lines?.length ?? 20} LINES`} value={pending ? pending.stake : Number(stake)} onChange={value => setStake(value.toFixed(2))} min={game.minStake} max={game.maxStake} disabled={busy || !!pending} />}
    win={cash(meter)}
    spin={{ busy, label: busy ? 'SPIN' : pending ? 'RECOVER' : 'SPIN', accessibilityLabel: pending ? 'Recover bet' : 'Spin', onPress: spin, disabled: busy || !ready || (!!pending && pending.gameCode !== game.code) }}
    overlay={<>
      {feature?.banner && <View style={v.banner} accessibilityRole="alert"><Text style={v.bannerSmall}>{SCATTERS_FOR_FEATURE} SCATTERS</Text><Text style={v.bannerBig}>{FREE_SPINS} FREE SPINS</Text><Text style={v.bannerSmall}>EVERY WIN PAYS ×{FREE_SPIN_FACTOR}</Text></View>}
      <WinCelebration win={win} />
      <BigWin win={win} />
    </>}
    info={<>
      <PayRow label={<View style={v.special}><VideoSymbol symbol={WILD} art={engine.art} size={40} /><Text style={[s.small, { flexShrink: 1 }]}>Stands in for every symbol except the scatter.</Text></View>} pays="WILD" />
      <PayRow label={<View style={v.special}><VideoSymbol symbol={SCATTER} art={engine.art} size={40} /><Text style={[s.small, { flexShrink: 1 }]}>{SCATTERS_FOR_FEATURE}+ anywhere: {FREE_SPINS} free spins.</Text></View>} pays={`×${FREE_SPIN_FACTOR}`} />
      {engine.paytable?.map((line, i) => <PayRow key={i} label={line.label} pays={`${line.multiplier}×`} />)}
      <Text style={s.small}>Each spin debits the total bet across all lines, free spins included. Returns include the bet.</Text>
      <Rules rules={engine.rules} />
    </>}>
    {stage => {
      // Five reels, three rows: as big as the stage allows either way.
      const cell = Math.max(40, Math.floor(Math.min((stage.height - 40) / ROWS, (stage.width - 70) / (REELS * 1.12))));
      return <MarqueeFrame colors={feature ? ['#c8f4ff', '#1a6ab0', '#062a4a'] : ['#ffd0ec', '#c0187a', '#3a0530']} bulb={feature ? '#c8f4ff' : '#ffe0f0'} excited={!!feature || wins.length > 0} reduced={reduced}>
        <LinearGradient colors={feature ? ['#0b3a6e', '#081a3a'] : ['#4a1478', '#1d0838']} style={v.cabinet}>
          <View style={v.reels}>{Array.from({ length: REELS }, (_, col) => <SpinReel key={col} index={col} size={cell} width={cell * 1.08} reduced={reduced}
            strip={reelSymbols.length ? reelSymbols : ['7']} spinning={busy && stopped <= col}
            cells={[0, 1, 2].map(row => screen[row * REELS + col])} dim={wins.length > 0}
            lit={row => { const index = row * REELS + col; return litBy.get(index) ?? (scatterLit && screen[index] === SCATTER ? '#22e1ff' : null); }}
            render={(symbol, size) => <VideoSymbol symbol={symbol} art={engine.art} size={size - 10} />} />)}
            <Paylines geometry={{ left: 0, top: 0, width: cell * 1.08, height: cell, gap: 4 }}
              lines={busy && !wins.length ? [] : wins.map(found => ({ color: LINE_COLORS[found.line % LINE_COLORS.length], cells: found.cells.map(index => [index % REELS, Math.floor(index / REELS)] as [number, number]) }))} />
          </View>
        </LinearGradient>
      </MarqueeFrame>;
    }}
  </GameShell>;
}

const v = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  cabinet: { overflow: 'hidden', padding: 6, borderRadius: 10 },
  title: { textAlign: 'center', color: '#ffd23f', fontWeight: '800', fontSize: 26, fontFamily: Platform.OS === 'android' ? 'serif' : 'Georgia', fontStyle: 'italic' },
  reels: { flexDirection: 'row', gap: 4, justifyContent: 'center', alignSelf: 'center' },
  reel: { alignSelf: 'stretch', overflow: 'hidden', borderRadius: 6, backgroundColor: '#140a24', borderWidth: 1, borderColor: '#b56cff66' },
  cell: { alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent', borderRadius: 6 },
  badge: { alignItems: 'center', justifyContent: 'center', borderRadius: 8, borderWidth: 2, borderColor: '#ffd23f' },
  wild: { color: '#ffffff', fontWeight: '900', letterSpacing: .5 },
  star: { color: '#fff6c2', fontWeight: '900' },
  free: { color: '#ffffff', fontWeight: '900' },
  line: { color: '#d9c290', fontSize: 11, textAlign: 'center', letterSpacing: 1.6 },
  meter: { flexDirection: 'row', alignSelf: 'center', alignItems: 'baseline', gap: 8, paddingHorizontal: 16, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(0,0,0,.4)', borderWidth: 1, borderColor: '#ffd23f88' },
  meterLabel: { color: '#ffe68a', fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  meterValue: { color: '#ffffff', fontSize: 18, fontWeight: '900' },
  banner: { position: 'absolute', left: 20, right: 20, top: '30%', alignItems: 'center', padding: 16, borderRadius: 18, backgroundColor: '#0b4fc0ee', borderWidth: 3, borderColor: '#ffd23f' },
  bannerSmall: { color: '#e6f6ff', fontWeight: '800', letterSpacing: 2, fontSize: 12 },
  bannerBig: { color: '#ffd23f', fontWeight: '900', fontSize: 30 },
  special: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pay: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
});
