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
import { usePace } from './playControls';

/**
 * The keno games: Galaxy and Starball Keno mark 1 to 10 of 80 numbers and the server draws 20; Hexa Keno (its engine
 * art says so) is a honeycomb of 40 hexes, up to 8 marked, 10 drawn, and a winning ticket spins the Hex Spinner. The draw is shown one ball at a time;
 * the amount paid is the server's, from the paytable for the count of numbers marked. A ticket is one bet: it is
 * saved with its request ID before it is sent, so an uncertain answer can only be recovered, never played twice.
 */
export const supportsKeno = (game: Game) => game.engine?.layout === 'KENO';
const ROOT3 = Math.sqrt(3);

/** A pointy-top hexagon {w} wide (flat to flat): three bars of the edge's length, turned 0, 60 and 120 degrees. */
function Hex({ w, color, children }: { w: number; color: string; children?: React.ReactNode }) {
  const side = w / ROOT3;
  return <View style={{ width: w, height: side * 2, alignItems: 'center', justifyContent: 'center' }}>
    {[0, 60, -60].map(turn => <View key={turn} style={{ position: 'absolute', width: w, height: side, top: side / 2, backgroundColor: color, transform: [{ rotate: `${turn}deg` }] }} />)}
    {children}
  </View>;
}
const HEX_LOOK = { plain: ['#4a6fc0', '#1d2a55', '#bfd4ff'], out: ['#bcd6ff', '#3c7bff', '#ffffff'], marked: ['#fff1a8', '#ff9f1a', c.goldInk], hit: ['#c8ffd9', '#12a85a', '#ffffff'] } as const;
const cash = (n: number) => n.toFixed(2);
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** What each count of hits pays for this many picks, from the paytable the server publishes. */
function paysFor(game: Game, picks: number) {
  return (game.engine?.paytable ?? []).filter(line => line.pattern?.[0] === `PICK${picks}`)
    .map(line => ({ hits: Number(line.pattern![1].slice(3)), pays: line.multiplier })).sort((a, b) => b.hits - a.hits);
}

export function NativeKeno({ game, token, userId, initialBalance, onClose, onSettled }: { game: Game; token: string; userId: string; initialBalance: Balance | null; onClose: () => void; onSettled: () => void }) {
  const art = game.engine?.art ?? {}, hexBoard = art.board === 'hex';
  const NUMBERS = Number(art.numbers ?? 80), DRAWN = Number(art.drawn ?? 20), MAX_PICKS = Number(art.maxPicks ?? 10);
  // Hexa Keno: a win spins the Hex Spinner, whose faces multiply it.
  const faces = art.hexFaces ? art.hexFaces.split(',').map(Number) : [], [spinAt, setSpinAt] = useState<number | null>(null);
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
  // Starball Keno: the twentieth ball drawn is the Starball; on one of the player's numbers it multiplies the win.
  const starX = Number(art.starball ?? 0), starball = starX && drawn.length === DRAWN ? drawn[DRAWN - 1] : null;
  const starHit = starball !== null && shownPicks.includes(starball) && !!result && result.payout > 0;
  const table = paysFor(game, shownPicks.length);
  const editable = !busy && !pending;

  function toggle(n: number) {
    if (!editable) return;
    setError(''); setResult(null); setDrawn([]); setWin(null); setSpinAt(null);
    if (picks.includes(n)) { setPicks(picks.filter(p => p !== n)); sound.play('tap'); return; }
    if (picks.length >= MAX_PICKS) { setError(`Mark up to ${MAX_PICKS} numbers.`); feel('warn'); return; }
    setPicks([...picks, n]); sound.play('tap');
  }
  function quickPick() {
    if (!editable) return;
    const count = picks.length || 5, pool = Array.from({ length: NUMBERS }, (_, i) => i + 1), chosen: number[] = [];
    while (chosen.length < count) chosen.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    setPicks(chosen); setResult(null); setDrawn([]); setWin(null); setError(''); setSpinAt(null); feel('select');
  }

  // The draw's pace follows the player's TURBO and STOP; AUTO replays the same ticket (src/playControls.ts).
  const pace = usePace(game);
  async function play() {
    if (locked.current || !ready || (pending && pending.gameCode !== game.code)) return;
    const amount = Number(stake), max = Math.min(game.maxStake, 1000);
    if (!pending && !picks.length) { setError('Mark at least one number.'); return; }
    if (!pending && (!/^\d+(\.\d{1,2})?$/.test(stake) || amount < game.minStake || amount > max)) { setError(`Enter a bet between ${game.minStake} and ${max}, with at most 2 decimals.`); return; }
    if (!pending && wallet && amount > wallet.balance) { setError('Insufficient available balance.'); return; }
    locked.current = true; pace.pace.begin(); setBusy(true); setError(''); setResult(null); setDrawn([]); setWin(null); setSpinAt(null);
    let submitted = false;
    try {
      const bet: PendingBet = pending || { gameCode: game.code, requestId: randomUUID(), stake: amount, selection: [...picks].sort((a, b) => a - b).join('-') };
      if (!bet.selection) throw new Error('Saved request is not a keno ticket. Reconcile it before playing.');
      // Persist before sending; never create a new request ID after an uncertain response.
      await savePending(userId, bet); setPending(bet); submitted = true;
      sound.play('spin');
      const data = await request<PlayResult>(`/api/games/${encodeURIComponent(game.code)}/play`, token, { requestId: bet.requestId, stake: bet.stake, selection: bet.selection });
      if (data.requestId !== bet.requestId || data.gameCode !== game.code || data.symbols.length !== 1 + DRAWN + (faces.length ? 1 : 0) || data.symbols[0] !== bet.selection) throw new Error('Unexpected result. Keep this request for reconciliation.');
      await clearPending(userId); setPending(null);
      if (!alive.current) return;
      const balls = data.symbols.slice(1, 1 + DRAWN).map(Number), face = Number(data.symbols[1 + DRAWN]?.slice(3) ?? 0), mine = bet.selection.split('-').map(Number);
      // The balls come out one at a time; a ball on the ticket gets its own sound.
      for (let i = 1; i <= balls.length && alive.current; i++) {
        // The Starball comes last, after a pause.
        if (starX && i === balls.length) { sound.play('tease'); await pace.pace.wait(900); }
        setDrawn(balls.slice(0, i));
        if (mine.includes(balls[i - 1])) { sound.play('reel-stop'); feel('select'); }
        if (starX && i === balls.length && mine.includes(balls[i - 1])) { sound.play('bigwin'); feel('heavy'); }
        await pace.pace.wait(140);
      }
      if (!alive.current) return;
      setDrawn(balls);
      if (faces.length && data.payout > 0) {
        // The spinner steps round its six faces, slowing, and stops on one showing the face the server drew.
        const options = faces.map((value, i) => value === face ? i : -1).filter(i => i >= 0);
        const stop = options[Math.floor(Math.random() * options.length)] ?? 0, steps = faces.length * 3 + stop;
        for (let i = 0; i <= steps && alive.current; i++) { setSpinAt(i % faces.length); sound.play('tap'); await pace.pace.wait(60 + (i / steps) ** 3 * 360); }
        if (!alive.current) return;
        if (face > 1) { sound.play('bigwin'); feel('heavy'); }
      }
      setResult(data);
      setWallet(current => current ? { ...current, balance: data.balance, currency: data.currency } : current);
      feel(data.payout > 0 ? 'win' : 'tap'); sound.result(data.payout > 0 ? data.multiplier : 0);
      if (data.payout > 0) setWin({ payout: data.payout, stake: data.stake, multiplier: data.multiplier, currency: data.currency, id: data.betId });
      pace.pace.report({ payout: data.payout, stake: data.stake, multiplier: data.multiplier });
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

  const hexCell = (n: number, w: number) => {
    const marked = shownPicks.includes(n), out = drawn.includes(n), [edge, fill, ink] = HEX_LOOK[marked && out ? 'hit' : marked ? 'marked' : out ? 'out' : 'plain'];
    return <Tap key={n} haptic="none" offscreen disabled={!editable} accessibilityLabel={`Number ${n}${marked ? ', marked' : ''}${out ? ', drawn' : ''}`} accessibilityState={{ selected: marked }}
      onPress={() => toggle(n)} style={{ width: w, height: w * 2 / ROOT3, alignItems: 'center', justifyContent: 'center' }}>
      <Hex w={w} color={edge}><View style={{ position: 'absolute' }}><Hex w={w * .86} color={fill} /></View>
        <Text style={[k.number, { color: ink, fontSize: Math.max(11, w * .36) }]}>{n}</Text></Hex>
    </Tap>;
  };
  // The honeycomb: rows of 8, every other row shifted half a hex, rows overlapping by a quarter of a hex's height.
  const honeycomb = (w: number) => <View style={[k.board, { flexDirection: 'column', flexWrap: 'nowrap', padding: 8, width: w * 8.5 + 14 + 20 }]} accessibilityLabel="Keno board">
    {Array.from({ length: Math.ceil(NUMBERS / 8) }, (_, row) => <View key={row} style={{ flexDirection: 'row', gap: 2, marginLeft: row % 2 ? w / 2 : 0, marginTop: row ? -w / ROOT3 / 2 + 2 : 0 }}>
      {Array.from({ length: 8 }, (_, i) => row * 8 + i + 1).filter(n => n <= NUMBERS).map(n => hexCell(n, w))}
    </View>)}
  </View>;
  const board = (cell: number, columns: number) => <View style={[k.board, { width: cell * columns + 12 }]} accessibilityLabel="Keno board">
    {Array.from({ length: NUMBERS }, (_, i) => i + 1).map(n => {
      const marked = shownPicks.includes(n), out = drawn.includes(n), hit = marked && out, star = n === starball;
      return <Tap key={n} haptic="none" offscreen disabled={!editable} accessibilityLabel={`Number ${n}${marked ? ', marked' : ''}${out ? ', drawn' : ''}`} accessibilityState={{ selected: marked }}
        onPress={() => toggle(n)} style={{ width: cell, height: cell, padding: 2 }}>
        {star ? <LinearGradient colors={['#fff6c0', '#ffb01f', '#a8600a']} style={[k.ball, k.star]}><Text style={[k.number, { color: '#3a1c00', fontSize: Math.max(11, cell * .4) }]}>{n}</Text></LinearGradient>
          : hit ? <LinearGradient colors={['#5aff9d', '#12a85a']} style={k.ball}><Text style={[k.number, { color: '#04220f', fontSize: Math.max(11, cell * .4) }]}>{n}</Text></LinearGradient>
          : marked ? <LinearGradient colors={['#ffe45c', '#ff9f1a']} style={k.ball}><Text style={[k.number, { color: c.goldInk, fontSize: Math.max(11, cell * .4) }]}>{n}</Text></LinearGradient>
          : <View style={[k.ball, k.plain, out && k.out]}><Text style={[k.number, { fontSize: Math.max(11, cell * .36) }, out && { color: '#ffffff' }]}>{n}</Text></View>}
      </Tap>;
    })}
  </View>;

  // Beside the board: the count, the result, quick pick and what the numbers marked pay.
  const side = <LinearGradient colors={['#2b1456', '#130a35']} style={k.panel}>
    <View style={k.stats}>
      {/* Hexa Keno's panel also holds the spinner, so its three counts share a row. */}
      <View style={hexBoard ? { flexDirection: 'row', gap: 4 } : { gap: 4 }}>
        {([[hexBoard ? 'PICKS' : 'MARKED', `${shownPicks.length}/${MAX_PICKS}`, '#ffffff'], [hexBoard ? 'BALLS' : 'DRAWN', `${drawn.length}/${DRAWN}`, '#ffffff'], ['HITS', String(hits), c.win]] as const).map(([label, value, color]) =>
          <View key={label} style={[k.stat, hexBoard && { flex: 1, flexDirection: 'column', justifyContent: 'center', paddingVertical: 2, paddingHorizontal: 2 }]}>
            <Text numberOfLines={1} style={[k.statLabel, hexBoard && { fontSize: 10, letterSpacing: .5 }]}>{label}</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit style={[k.statValue, { color }, hexBoard && { fontSize: 16 }]}>{value}</Text></View>)}
      </View>
      {starX > 0 && <View style={[k.stat, starHit && { borderWidth: 1.5, borderColor: c.gold }]}><Text style={k.statLabel}>STARBALL</Text>
        <Text style={[k.statValue, { color: c.gold }]}>{starHit ? `×${starX}!` : starball ?? '★'}</Text></View>}
      {faces.length > 0 && <View style={[k.stat, { flexDirection: 'column', alignItems: 'stretch', paddingVertical: 4 }, spinAt !== null && !busy && result && { borderWidth: 1.5, borderColor: c.gold }]} accessibilityLabel="Hex Spinner">
        <Text style={[k.statLabel, { color: '#22e1ff' }]}>HEX SPINNER{spinAt !== null && result ? ` · ×${faces[spinAt]}` : ''}</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 }}>{faces.map((value, i) => <Hex key={i} w={24} color={spinAt === i ? '#ffd23f' : value === 5 ? '#7a2a78' : value === 2 ? '#3a2a88' : '#2a3a78'}>
          <Text style={{ color: spinAt === i ? c.goldInk : '#e8dcff', fontSize: 10, fontWeight: '900' }}>×{value}</Text></Hex>)}</View>
      </View>}
    </View>
    <View style={k.row}>
      <Tap haptic="select" disabled={!editable} onPress={quickPick} style={[k.small, { flex: 1 }]}><Text style={s.accent} numberOfLines={1}>⚡ Quick</Text></Tap>
      <Tap haptic="select" disabled={!editable || !picks.length} onPress={() => { setPicks([]); setDrawn([]); setResult(null); setWin(null); setSpinAt(null); }} style={[k.small, { flex: 1 }]}><Text style={s.accent}>Clear</Text></Tap>
    </View>
    <Text style={k.paysTitle}>{shownPicks.length ? `PAYS FOR ${shownPicks.length} ${shownPicks.length === 1 ? 'PICK' : 'PICKS'}` : `MARK 1 TO ${MAX_PICKS} NUMBERS`}</Text>
    <ScrollView style={{ flexShrink: 1 }}>{table.map(line => <View key={line.hits} style={[k.payRow, result && !busy && line.hits === hits && k.payRowOn]}>
      <Text style={s.muted}>{line.hits} {line.hits === 1 ? 'hit' : 'hits'}</Text><Text style={s.accent}>{line.pays}×</Text>
    </View>)}</ScrollView>
  </LinearGradient>;

  const status = busy ? 'DRAWING…' : result ? `${hits} ${hits === 1 ? 'HIT' : 'HITS'} · ${result.payout > 0 ? `WIN ${cash(result.payout)}` : 'NO WIN THIS DRAW'}${starHit ? ` · STARBALL ×${starX}` : ''}${faces.length && spinAt !== null && result.payout > 0 ? ` · HEX ×${faces[spinAt]}` : ''}` : 'MARK YOUR NUMBERS';
  return <GameShell game={game} play={{ ...pace, stake: pending ? pending.stake : Number(stake) || game.minStake }} balance={wallet} onBack={onClose} backDisabled={busy} status={status}
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
      if (hexBoard) {
        // A hex w wide is 2w/√3 tall; rows step down three quarters of that.
        const rows = Math.ceil(NUMBERS / 8), w = Math.floor(Math.min((boardW - 38) / 8.5, (boardH - 20) / ((rows - 1) * 1.5 / ROOT3 + 2 / ROOT3)));
        return <View style={[k.split, !wide && { flexDirection: 'column' }, { width: stage.width, height: stage.height }]}>
          {honeycomb(w)}
          <View style={wide ? { width: sideWidth, height: stage.height - 8 } : { width: '100%', flex: 1, minHeight: 0 }}>{side}</View>
        </View>;
      }
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
  star: { borderWidth: 2, borderColor: '#fff3b0', shadowColor: '#ffd23f', shadowOpacity: 1, shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, elevation: 8 },
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
