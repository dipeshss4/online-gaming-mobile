import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { randomUUID } from 'expo-crypto';
import { ApiError, Balance, Game, PlayResult, request } from './api';
import { clearPending, PendingBet, readPending, savePending } from './pendingBet';
import { s } from './styles';
import { BetBar } from './BetBar';
import { c, feel } from './theme';
import { Win, WinCelebration } from './WinCelebration';
import { BigWin } from './fx/BigWin';
import { SpinReel } from './fx/SpinReel';
import { MarqueeFrame } from './fx/MarqueeFrame';
import { Paylines } from './fx/Paylines';
import { sound } from './sound';
import { GameShell, PayRow, Rules } from './GameShell';

/**
 * Luxury Life in the app: five reels, three rows, fifteen lines, and the DOUBLE diamond wild that doubles every win it
 * is part of. The round comes whole from the server (LuxuryLifeEngine); this spins the reels onto its fifteen cells,
 * then draws each winning line in turn while the meter counts up.
 */
export const supportsLuxuryLife = (game: Game) => game.engine?.layout === 'LINES_5X3';
const REELS = 5, ROWS = 3, CELLS = 15, WILD = 'DOUBLE', FIVE_WILDS = 1000;
const PAYS: Record<string, number[]> = {
  YACHT: [25, 100, 500], JET: [20, 75, 300], LIMO: [15, 50, 200], RING: [10, 30, 120],
  WATCH: [8, 25, 100], GOLD: [5, 15, 60], COIN: [4, 12, 40], SILVER: [3, 8, 30],
};
const ART: Record<string, number> = {
  YACHT: require('../assets/luxury/YACHT.png'), JET: require('../assets/luxury/JET.png'), LIMO: require('../assets/luxury/LIMO.png'),
  RING: require('../assets/luxury/RING.png'), WATCH: require('../assets/luxury/WATCH.png'), GOLD: require('../assets/luxury/GOLD.png'),
  COIN: require('../assets/luxury/COIN.png'), SILVER: require('../assets/luxury/SILVER.png'), DOUBLE: require('../assets/luxury/DOUBLE.png'),
};
const STRIP = ['YACHT', 'COIN', 'RING', 'DOUBLE', 'SILVER', 'JET', 'GOLD', 'WATCH', 'LIMO'];
const FALLBACK = [[1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2], [0, 0, 1, 2, 2], [2, 2, 1, 0, 0],
  [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [0, 1, 1, 1, 0], [2, 1, 1, 1, 2], [1, 0, 1, 2, 1], [1, 2, 1, 0, 1], [0, 1, 0, 1, 0], [2, 1, 2, 1, 2]]
  .map(rows => rows.map((row, reel) => row * REELS + reel));
const LINE_COLOURS = ['#ffd84a', '#ff5ab4', '#5ad8ff', '#7aff8a', '#ff9a3a', '#c48aff', '#ff6a6a', '#5affd8', '#fff07a', '#ff8ad8', '#8ab4ff', '#d8ff5a', '#ffb45a', '#5a9aff', '#ff5a8a'];
const cash = (n: number) => n.toFixed(2);
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** A line's pay in line bets and how many cells it covers, read as the server reads it. */
function linePay(line: string[]) {
  const target = line.find(cell => cell !== WILD);
  if (!target) return { pays: FIVE_WILDS, count: REELS };
  let count = 0, wilds = 0;
  while (count < REELS && (line[count] === target || line[count] === WILD)) { if (line[count] === WILD) wilds++; count++; }
  return count >= 3 ? { pays: PAYS[target][count - 3] * 2 ** wilds, count } : { pays: 0, count: 0 };
}
type LineWin = { index: number; cells: number[]; pays: number; count: number };
const winningLines = (screen: string[], lines: number[][]): LineWin[] =>
  lines.map((cells, index) => ({ index, cells, ...linePay(cells.map(cell => screen[cell])) })).filter(found => found.pays > 0);

export function NativeLuxuryLife({ game, token, userId, initialBalance, onClose, onSettled }: { game: Game; token: string; userId: string; initialBalance: Balance | null; onClose: () => void; onSettled: () => void }) {
  const lines = game.engine?.lines?.length ? game.engine.lines : FALLBACK;
  const [stake, setStake] = useState(game.minStake), [wallet, setWallet] = useState(initialBalance);
  const [pending, setPending] = useState<PendingBet | null>(null), [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [reduced, setReduced] = useState(false);
  const [screen, setScreen] = useState<string[]>(() => Array.from({ length: CELLS }, (_, i) => STRIP[(i * 4) % STRIP.length]));
  const [stopped, setStopped] = useState(REELS), [wins, setWins] = useState<LineWin[]>([]), [shown, setShown] = useState<number | null>(null);
  const [banner, setBanner] = useState<string | null>(null), [meter, setMeter] = useState(0), [win, setWin] = useState<Win | null>(null);
  const [status, setStatus] = useState('DOUBLE WILDS DOUBLE EVERY WIN');
  const alive = useRef(true), lock = useRef(false), fast = useRef(false);
  const slam = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    alive.current = true;
    readPending(userId).then(value => { if (alive.current) { setPending(value); setReady(true); } }).catch(() => setError('Cannot read saved bet. Play is locked to prevent duplicate bets.'));
    AccessibilityInfo.isReduceMotionEnabled().then(value => { fast.current = value; setReduced(value); });
    return () => { alive.current = false; };
  }, [userId]);
  const wait = (ms: number) => pause(fast.current ? Math.min(ms, 100) : ms);
  async function show(text: string, ms: number) {
    setBanner(text); slam.setValue(0);
    Animated.spring(slam, { toValue: 1, friction: 4, tension: 110, useNativeDriver: true }).start();
    await wait(ms); setBanner(null);
  }

  async function spin() {
    if (lock.current || !ready || (pending && pending.gameCode !== game.code)) return;
    if (!pending && wallet && stake > wallet.balance) { setError('Insufficient available balance.'); return; }
    lock.current = true; setBusy(true); setError(''); setWin(null); setMeter(0); setWins([]); setShown(null); setStopped(0); setStatus('GOOD LUCK!');
    let submitted = false;
    try {
      const bet = pending || { gameCode: game.code, requestId: randomUUID(), stake };
      await savePending(userId, bet); setPending(bet); submitted = true;
      sound.play('spin');
      const data = await request<PlayResult>(`/api/games/${encodeURIComponent(game.code)}/play`, token, { requestId: bet.requestId, stake: bet.stake });
      if (data.requestId !== bet.requestId || data.gameCode !== game.code || data.symbols.length < CELLS) throw new Error('Unexpected result. Keep this request for reconciliation.');
      await clearPending(userId); setPending(null);
      if (!alive.current) return;
      const cells = data.symbols.slice(0, CELLS);
      setScreen(cells);
      await wait(700);
      for (let reel = 1; reel <= REELS; reel++) { if (!alive.current) return; setStopped(reel); sound.play('reel-land'); await wait(200); }
      const found = winningLines(cells, lines), perLine = data.stake / lines.length;
      if (found.length) {
        // The last reel is still landing (its run and bounce take about half a second); draw lines once it rests.
        await wait(450);
        setWins(found);
        let running = 0;
        for (const line of found.slice(0, 6)) {
          if (!alive.current) return;
          setShown(line.index); running += line.pays * perLine; setMeter(running);
          setStatus(`LINE ${line.index + 1} · ${cash(line.pays * perLine)}`); feel('select'); sound.play('reel-land');
          await wait(found.length > 3 ? 520 : 800);
        }
        setShown(null);
        const doubled = found.some(line => line.cells.slice(0, line.count).some(cell => cells[cell] === WILD));
        if (data.multiplier >= 25) { sound.play('bigwin'); await show('MEGA WIN', 2000); }
        else if (data.multiplier >= 3) { sound.play('bigwin'); await show('BIG WIN', 1500); }
        else if (doubled) await show('DOUBLED!', 1000);
      }
      if (!alive.current) return;
      setMeter(data.payout); setWallet(current => current ? { ...current, balance: data.balance, currency: data.currency } : current);
      setStatus(data.payout > 0 ? `WIN ${cash(data.payout)}` : 'DOUBLE WILDS DOUBLE EVERY WIN');
      feel(data.payout > 0 ? 'win' : 'tap'); sound.result(data.payout > 0 ? data.multiplier : 0);
      if (data.payout > 0) setWin({ payout: data.payout, stake: data.stake, multiplier: data.multiplier, currency: data.currency, id: data.betId });
      onSettled();
    } catch (e) {
      if (!alive.current) return;
      if (!pending && e instanceof ApiError && [400, 401, 403, 404, 422, 429].includes(e.status)) await clearPending(userId).then(() => setPending(null)).catch(() => {});
      feel('warn'); setStatus('DOUBLE WILDS DOUBLE EVERY WIN');
      setError(`${e instanceof Error ? e.message : 'Unable to play'}${submitted ? ' If a bet is pending, use Recover with the same request ID.' : ''}`);
    } finally { lock.current = false; if (alive.current) { setBusy(false); setStopped(REELS); } }
  }

  const drawn = shown === null ? wins : wins.filter(line => line.index === shown);
  const litBy = new Map<number, string>();
  for (const line of drawn) for (const cell of line.cells.slice(0, line.count)) if (!litBy.has(cell)) litBy.set(cell, LINE_COLOURS[line.index % LINE_COLOURS.length]);
  const perLine = (pending ? pending.stake : stake) / lines.length;
  return <GameShell game={game} balance={wallet} onBack={onClose} backDisabled={busy} status={status}
    notice={error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text>
      : pending && !busy ? `Pending: ${pending.gameCode} · ${cash(pending.stake)}. ${pending.gameCode !== game.code ? 'Open that game to recover the round.' : 'SPIN resends this exact bet, not a new one.'}` : undefined}
    bet={<BetBar inline label={`TOTAL BET · ${lines.length} LINES`} value={pending ? pending.stake : stake} onChange={setStake} min={game.minStake} max={game.maxStake} disabled={busy || !!pending} />}
    win={cash(meter)}
    spin={{ busy, label: pending ? 'RECOVER' : 'SPIN', accessibilityLabel: pending ? 'Recover bet' : 'Spin', onPress: spin, disabled: busy || !ready || (!!pending && pending.gameCode !== game.code) }}
    overlay={<>
      {banner && <Animated.View pointerEvents="none" style={[l.banner, banner === 'MEGA WIN' && l.mega, { transform: [{ scale: slam.interpolate({ inputRange: [0, 1], outputRange: [2.4, 1] }) }], opacity: slam }]}><Text style={[l.bannerText, banner === 'MEGA WIN' && { fontSize: 58 }]}>{banner}</Text></Animated.View>}
      <WinCelebration win={win} /><BigWin win={win} />
    </>}
    info={<>
      <PayRow label={<View style={l.special}><Image source={ART.DOUBLE} style={{ width: 40, height: 40 }} resizeMode="contain" /><Text style={[s.small, { flexShrink: 1 }]}>Wild. Each DOUBLE in a win doubles it; five on a line pay {FIVE_WILDS} line bets.</Text></View>} pays="×2" />
      {Object.entries(PAYS).map(([name, p]) => <PayRow key={name} label={<View style={l.special}><Image source={ART[name]} style={{ width: 40, height: 40 }} resizeMode="contain" /><Text style={s.small}>×3 / ×4 / ×5</Text></View>}
        pays={`${cash(p[0] * perLine)} / ${cash(p[1] * perLine)} / ${cash(p[2] * perLine)}`} />)}
      <Rules rules={game.engine?.rules} />
    </>}>
    {stage => {
      // Line numbers down both sides like the cabinet, the reels as big as the stage allows.
      const cell = Math.max(40, Math.floor(Math.min((stage.height - 30) / ROWS, (stage.width - 110) / (REELS * 1.12))));
      const won = new Set(wins.map(line => line.index));
      const numbers = (odd: boolean) => <View style={[l.numbers, { height: cell * ROWS }]}>{lines.map((_, i) => i).filter(i => (i % 2 === 1) === odd).map(i =>
        <Text key={i} style={[l.number, won.has(i) && { backgroundColor: LINE_COLOURS[i % LINE_COLOURS.length], color: '#100418', borderColor: LINE_COLOURS[i % LINE_COLOURS.length] }]}>{i + 1}</Text>)}</View>;
      return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {numbers(false)}
        <MarqueeFrame colors={['#fff0b0', '#c0187a', '#3a0530']} bulb="#ffe8a0" excited={wins.length > 0} reduced={reduced}>
          <LinearGradient colors={['#3a1048', '#14061c']} style={l.cabinet}>
            <View style={l.reels}>{Array.from({ length: REELS }, (_, reel) => <SpinReel key={reel} index={reel} size={cell} width={cell * 1.08} reduced={reduced}
              strip={STRIP} spinning={busy && stopped <= reel} cells={[0, 1, 2].map(row => screen[row * REELS + reel])} dim={wins.length > 0}
              lit={row => litBy.get(row * REELS + reel) ?? null}
              render={(symbol, size) => <Image source={ART[symbol] ?? ART.COIN} style={{ width: size * .9, height: size * .9 }} resizeMode="contain" accessibilityLabel={symbol.toLowerCase()} />} />)}
              <Paylines geometry={{ left: 0, top: 0, width: cell * 1.08, height: cell, gap: 4 }}
                lines={drawn.map(line => ({ color: LINE_COLOURS[line.index % LINE_COLOURS.length], cells: line.cells.map(index => [index % REELS, Math.floor(index / REELS)] as [number, number]) }))} />
            </View>
          </LinearGradient>
        </MarqueeFrame>
        {numbers(true)}
      </View>;
    }}
  </GameShell>;
}

const l = StyleSheet.create({
  cabinet: { overflow: 'hidden', padding: 6, borderRadius: 10 },
  reels: { flexDirection: 'row', gap: 4, justifyContent: 'center', alignSelf: 'center' },
  numbers: { justifyContent: 'space-around' },
  number: { width: 24, textAlign: 'center', fontSize: 11, fontWeight: '900', color: '#ffffff77', borderRadius: 6, borderWidth: 1, borderColor: '#ffffff22', backgroundColor: '#ffffff0c', overflow: 'hidden', paddingVertical: 1 },
  special: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  banner: { position: 'absolute', alignSelf: 'center', top: '34%', paddingHorizontal: 30, paddingVertical: 10, borderRadius: 20, borderWidth: 4, borderColor: c.gold, backgroundColor: '#3a0630ee' },
  mega: { backgroundColor: '#5a0a4aee', shadowColor: '#ff5ab4', shadowOpacity: 1, shadowRadius: 30, shadowOffset: { width: 0, height: 0 } },
  bannerText: { color: '#ffe58a', fontWeight: '900', fontStyle: 'italic', fontSize: 44, textShadowColor: '#ff5ab4', textShadowRadius: 18, textShadowOffset: { width: 0, height: 0 } },
});
