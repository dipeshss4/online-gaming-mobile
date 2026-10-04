import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { randomUUID } from 'expo-crypto';
import { ApiError, Balance, Game, PlayResult, request } from './api';
import { clearPending, PendingBet, readPending, savePending } from './pendingBet';
import { s } from './styles';
import { Tap } from './Tap';
import { BetBar } from './BetBar';
import { c, feel } from './theme';
import { Win, WinCelebration } from './WinCelebration';
import { BigWin } from './fx/BigWin';
import { sound } from './sound';
import { GameShell, PayRow, Rules } from './GameShell';

/**
 * Galaxy Keno: mark 1 to 10 of the 80 numbers, play, and the server draws 20. The draw is shown one ball at a time;
 * the amount paid is the server's, from the paytable for the count of numbers marked. A ticket is one bet: it is
 * saved with its request ID before it is sent, so an uncertain answer can only be recovered, never played twice.
 */
export const supportsKeno = (game: Game) => game.engine?.layout === 'KENO';
const NUMBERS = 80, COLUMNS = 10, MAX_PICKS = 10;
const cash = (n: number) => n.toFixed(2);
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** What each count of hits pays for this many picks, from the paytable the server publishes. */
function paysFor(game: Game, picks: number) {
  return (game.engine?.paytable ?? []).filter(line => line.pattern?.[0] === `PICK${picks}`)
    .map(line => ({ hits: Number(line.pattern![1].slice(3)), pays: line.multiplier })).sort((a, b) => b.hits - a.hits);
}

export function NativeKeno({ game, token, userId, initialBalance, onClose, onSettled }: { game: Game; token: string; userId: string; initialBalance: Balance | null; onClose: () => void; onSettled: () => void }) {
  const [picks, setPicks] = useState<number[]>([]), [stake, setStake] = useState(String(game.minStake));
  const [wallet, setWallet] = useState(initialBalance), [pending, setPending] = useState<PendingBet | null>(null);
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [drawn, setDrawn] = useState<number[]>([]), [result, setResult] = useState<PlayResult | null>(null), [win, setWin] = useState<Win | null>(null);
  const locked = useRef(false), alive = useRef(true), fast = useRef(false);

  useEffect(() => {
    alive.current = true;
    readPending(userId).then(value => {
      if (!alive.current) return;
      setPending(value); setReady(true);
      if (value?.gameCode === game.code && value.selection) setPicks(value.selection.split('-').map(Number));
    }).catch(() => setError('Cannot read saved bet. Play is locked to prevent duplicate bets.'));
    AccessibilityInfo.isReduceMotionEnabled().then(value => { fast.current = value; });
    return () => { alive.current = false; };
  }, [userId]);

  const shownPicks = pending?.gameCode === game.code && pending.selection ? pending.selection.split('-').map(Number) : picks;
  const hits = shownPicks.filter(n => drawn.includes(n)).length;
  const table = paysFor(game, shownPicks.length);
  const editable = !busy && !pending;

  function toggle(n: number) {
    if (!editable) return;
    setError(''); setResult(null); setDrawn([]); setWin(null);
    if (picks.includes(n)) { setPicks(picks.filter(p => p !== n)); sound.play('tap'); return; }
    if (picks.length >= MAX_PICKS) { setError(`Mark up to ${MAX_PICKS} numbers.`); feel('warn'); return; }
    setPicks([...picks, n]); sound.play('tap');
  }
  function quickPick() {
    if (!editable) return;
    const count = picks.length || 5, pool = Array.from({ length: NUMBERS }, (_, i) => i + 1), chosen: number[] = [];
    while (chosen.length < count) chosen.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    setPicks(chosen); setResult(null); setDrawn([]); setWin(null); setError(''); feel('select');
  }

  async function play() {
    if (locked.current || !ready || (pending && pending.gameCode !== game.code)) return;
    const amount = Number(stake), max = Math.min(game.maxStake, 1000);
    if (!pending && !picks.length) { setError('Mark at least one number.'); return; }
    if (!pending && (!/^\d+(\.\d{1,2})?$/.test(stake) || amount < game.minStake || amount > max)) { setError(`Enter a bet between ${game.minStake} and ${max}, with at most 2 decimals.`); return; }
    if (!pending && wallet && amount > wallet.balance) { setError('Insufficient available balance.'); return; }
    locked.current = true; setBusy(true); setError(''); setResult(null); setDrawn([]); setWin(null);
    let submitted = false;
    try {
      const bet: PendingBet = pending || { gameCode: game.code, requestId: randomUUID(), stake: amount, selection: [...picks].sort((a, b) => a - b).join('-') };
      if (!bet.selection) throw new Error('Saved request is not a keno ticket. Reconcile it before playing.');
      // Persist before sending; never create a new request ID after an uncertain response.
      await savePending(userId, bet); setPending(bet); submitted = true;
      sound.play('spin');
      const data = await request<PlayResult>(`/api/games/${encodeURIComponent(game.code)}/play`, token, { requestId: bet.requestId, stake: bet.stake, selection: bet.selection });
      if (data.requestId !== bet.requestId || data.gameCode !== game.code || data.symbols.length !== 21 || data.symbols[0] !== bet.selection) throw new Error('Unexpected result. Keep this request for reconciliation.');
      await clearPending(userId); setPending(null);
      if (!alive.current) return;
      const balls = data.symbols.slice(1).map(Number), mine = bet.selection.split('-').map(Number);
      // The balls come out one at a time; a ball on the ticket gets its own sound.
      for (let i = 1; i <= balls.length && alive.current; i++) {
        setDrawn(balls.slice(0, i));
        if (mine.includes(balls[i - 1])) { sound.play('reel-stop'); feel('select'); }
        if (!fast.current) await pause(140);
      }
      if (!alive.current) return;
      setDrawn(balls); setResult(data);
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
      setError(`${e instanceof Error ? e.message : 'Unable to play'}${submitted ? ' If a bet is pending, use Recover ticket with the same request ID.' : ''}`);
      onSettled();
    } finally { locked.current = false; if (alive.current) setBusy(false); }
  }

  const board = (cell: number, columns: number) => <View style={[k.board, { width: cell * columns + 12 }]} accessibilityLabel="Keno board">
    {Array.from({ length: NUMBERS }, (_, i) => i + 1).map(n => {
      const marked = shownPicks.includes(n), out = drawn.includes(n), hit = marked && out;
      return <Tap key={n} haptic="none" disabled={!editable} accessibilityLabel={`Number ${n}${marked ? ', marked' : ''}${out ? ', drawn' : ''}`} accessibilityState={{ selected: marked }}
        onPress={() => toggle(n)} style={{ width: cell, height: cell, padding: 2 }}>
        {hit ? <LinearGradient colors={['#5aff9d', '#12a85a']} style={k.ball}><Text style={[k.number, { color: '#04220f', fontSize: Math.max(11, cell * .4) }]}>{n}</Text></LinearGradient>
          : marked ? <LinearGradient colors={['#ffe45c', '#ff9f1a']} style={k.ball}><Text style={[k.number, { color: c.goldInk, fontSize: Math.max(11, cell * .4) }]}>{n}</Text></LinearGradient>
          : <View style={[k.ball, k.plain, out && k.out]}><Text style={[k.number, { fontSize: Math.max(11, cell * .36) }, out && { color: '#ffffff' }]}>{n}</Text></View>}
      </Tap>;
    })}
  </View>;

  // Beside the board: the count, the result, quick pick and what the numbers marked pay.
  const side = <LinearGradient colors={['#2b1456', '#130a35']} style={k.panel}>
    <View style={k.stats}>
      <View style={k.stat}><Text style={k.statLabel}>MARKED</Text><Text style={k.statValue}>{shownPicks.length}/{MAX_PICKS}</Text></View>
      <View style={k.stat}><Text style={k.statLabel}>DRAWN</Text><Text style={k.statValue}>{drawn.length}/20</Text></View>
      <View style={k.stat}><Text style={k.statLabel}>HITS</Text><Text style={[k.statValue, { color: c.win }]}>{hits}</Text></View>
    </View>
    <View style={k.row}>
      <Tap haptic="select" disabled={!editable} onPress={quickPick} style={[k.small, { flex: 1 }]}><Text style={s.accent} numberOfLines={1}>⚡ Quick</Text></Tap>
      <Tap haptic="select" disabled={!editable || !picks.length} onPress={() => { setPicks([]); setDrawn([]); setResult(null); setWin(null); }} style={[k.small, { flex: 1 }]}><Text style={s.accent}>Clear</Text></Tap>
    </View>
    <Text style={k.paysTitle}>{shownPicks.length ? `PAYS FOR ${shownPicks.length} ${shownPicks.length === 1 ? 'PICK' : 'PICKS'}` : 'MARK 1 TO 10 NUMBERS'}</Text>
    <ScrollView style={{ flexShrink: 1 }}>{table.map(line => <View key={line.hits} style={[k.payRow, result && !busy && line.hits === hits && k.payRowOn]}>
      <Text style={s.muted}>{line.hits} {line.hits === 1 ? 'hit' : 'hits'}</Text><Text style={s.accent}>{line.pays}×</Text>
    </View>)}</ScrollView>
  </LinearGradient>;

  const status = busy ? 'DRAWING…' : result ? `${hits} ${hits === 1 ? 'HIT' : 'HITS'} · ${result.payout > 0 ? `WIN ${cash(result.payout)}` : 'NO WIN THIS DRAW'}` : 'MARK YOUR NUMBERS';
  return <GameShell game={game} balance={wallet} onBack={onClose} backDisabled={busy} status={status}
    notice={error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text>
      : pending && !busy ? `Pending: ${pending.gameCode} · ${cash(pending.stake)}. ${pending.gameCode !== game.code ? 'Open that game to recover the ticket.' : 'PLAY resends this exact ticket, not a new bet.'}` : undefined}
    bet={<BetBar inline value={pending ? pending.stake : Number(stake)} onChange={value => setStake(value.toFixed(2))} min={game.minStake} max={game.maxStake} disabled={!editable} />}
    win={cash(result && !busy ? result.payout : 0)}
    spin={{ busy, label: busy ? 'PLAY' : pending ? 'RECOVER' : 'PLAY', accessibilityLabel: pending ? 'Recover ticket' : 'PLAY', onPress: play, disabled: busy || !ready || (!!pending && pending.gameCode !== game.code) }}
    overlay={<><WinCelebration win={win} /><BigWin win={win} /></>}
    info={<>
      {table.map(line => <PayRow key={line.hits} label={`${shownPicks.length} picks, ${line.hits} ${line.hits === 1 ? 'hit' : 'hits'}`} pays={`${line.pays}×`} />)}
      <Rules rules={game.engine?.rules} />
    </>}>
    {stage => {
      // The board's shape follows the space: 8 by 10 on an upright phone, 10 by 8 on a tall stage, 16 by 5 or 20 by 4 on a short sideways one,
      // whichever gives the biggest balls. Sideways, a narrow panel beside it holds the count and the pays.
      const wide = stage.width > stage.height * 1.3, sideWidth = wide ? Math.min(220, Math.max(150, stage.width * .2)) : 0;
      const boardW = wide ? stage.width - sideWidth - 22 : stage.width - 16, boardH = wide ? stage.height - 16 : stage.height * .76;
      const [columns, cell] = (wide ? [10, 16, 20] : [8, 10]).map(cols => [cols, Math.floor(Math.min((boardW - 12) / cols, (boardH - 12) / (NUMBERS / cols)))] as const)
        .reduce((best, next) => next[1] > best[1] ? next : best);
      return <View style={[k.split, !wide && { flexDirection: 'column' }, { width: stage.width, height: stage.height }]}>
        {board(cell, columns)}
        <View style={wide ? { width: sideWidth, height: Math.min(stage.height - 8, cell * (NUMBERS / columns) + 12) } : { width: '100%', flex: 1, minHeight: 0 }}>{side}</View>
      </View>;
    }}
  </GameShell>;
}

const k = StyleSheet.create({
  split: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  paysTitle: { color: '#ff9ad6', fontSize: 11, fontWeight: '900', letterSpacing: 1.4 },
  stage: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 8, borderRightWidth: 1, borderRightColor: '#22e1ff44' },
  board: { flexDirection: 'row', flexWrap: 'wrap', padding: 4, borderRadius: 14, borderWidth: 2, borderColor: '#22e1ff', backgroundColor: '#0e1a3a' },
  ball: { flex: 1, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  plain: { backgroundColor: '#1d2a55', borderWidth: 1, borderColor: '#3c5a9a' },
  out: { backgroundColor: '#3c7bff', borderColor: '#9ec0ff' },
  number: { color: '#bfd4ff', fontWeight: '900' },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  panel: { flex: 1, borderRadius: 14, borderWidth: 1.5, borderColor: '#22e1ff88', padding: 10, gap: 8, overflow: 'hidden' },
  title: { color: c.gold, fontWeight: '900', fontStyle: 'italic', fontSize: 18, textAlign: 'center', letterSpacing: 1 },
  stats: { gap: 4 },
  stat: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 2, paddingHorizontal: 8, borderRadius: 10, backgroundColor: '#00000055' },
  statLabel: { color: '#bfe9ff', fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  statValue: { color: '#ffffff', fontSize: 18, fontWeight: '900' },
  result: { color: '#e6dcff', fontWeight: '800', textAlign: 'center', fontSize: 14 },
  row: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  small: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: '#b56cff77', backgroundColor: '#2e1660' },
  play: { minHeight: 52, justifyContent: 'center', borderWidth: 2, borderColor: c.gold },
  payRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  payRowOn: { backgroundColor: '#12a85a55', borderWidth: 1, borderColor: c.win },
});
