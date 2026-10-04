import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Image, Platform, StyleSheet, Text, View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { ApiError, Balance, Game, PlayResult, request } from './api';
import { clearPending, PendingBet, readPending, savePending } from './pendingBet';
import { s } from './styles';
import { BetBar } from './BetBar';
import { c, feel } from './theme';
import { Win, WinCelebration } from './WinCelebration';
import { BigWin } from './fx/BigWin';
import { sound } from './sound';
import { GameShell, PayRow, Rules } from './GameShell';
import { SpinReel } from './fx/SpinReel';
import { Paylines } from './fx/Paylines';

import { MarqueeFrame } from './fx/MarqueeFrame';

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

/** Devil Heart's symbols: 3D renders made for the game (scripts/render-symbols.py). */
const DEVIL_ART: Record<string, number> = {
  SEVEN: require('../assets/devil/SEVEN.png'), BAR1: require('../assets/devil/BAR1.png'), BAR2: require('../assets/devil/BAR2.png'),
  BAR3: require('../assets/devil/BAR3.png'), WILD: require('../assets/devil/WILD.png'), X2: require('../assets/devil/X2.png'), JACKPOT: require('../assets/devil/JACKPOT.png'),
};
const DEVIL_LABEL: Record<string, string> = { SEVEN: 'flaming seven', BAR1: 'single bar', BAR2: 'double bar', BAR3: 'triple bar', WILD: 'wild', X2: 'two times wild', JACKPOT: 'jackpot' };
export function DevilSymbol({ symbol, size }: { symbol: string; size: number }) {
  const art = DEVIL_ART[symbol];
  if (!art) return <View accessibilityLabel="blank" style={{ width: size, height: size }} />;
  return <Image source={art} accessibilityLabel={DEVIL_LABEL[symbol]} style={{ width: size * 1.3, height: size * .94 }} resizeMode="contain" />;
}

export function NativeDevilHeart({ game, token, userId, initialBalance, onClose, onSettled }: { game: Game; token: string; userId: string; initialBalance: Balance | null; onClose: () => void; onSettled: () => void }) {
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
      sound.play('reel-land'); await wait(220);
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
  const tagTop = (row: number, line: number, side: 'left' | 'right', size: number) => {
    // Lines that start (or end) on the same row are fanned out around it, so every number stays readable.
    const group = LINES.map((rows, l) => l).filter(l => LINES[l][side === 'left' ? 0 : 2] === row), order = group.indexOf(line);
    return row * size + size / 2 - 11 + (order - (group.length - 1) / 2) * 24;
  };
  return <GameShell game={game} balance={wallet} onBack={onClose} backDisabled={busy} status={status}
    notice={error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text>
      : pending && !busy ? `Pending: ${pending.gameCode} · ${cash(pending.stake)}. ${pending.gameCode !== game.code ? 'Open that game to recover the round.' : 'SPIN resends this exact bet, not a new one.'}` : undefined}
    bet={<BetBar inline label={`TOTAL BET · ${cash(stake / 5)} × 5 LINES`} value={pending ? pending.stake : stake} onChange={setStake} min={game.minStake} max={game.maxStake} disabled={busy || !!pending} />}
    win={cash(meter)}
    spin={{ busy, label: busy ? 'SPIN' : pending ? 'RECOVER' : 'SPIN', accessibilityLabel: pending ? 'Recover bet' : 'Spin', onPress: spin, disabled: busy || !ready || (!!pending && pending.gameCode !== game.code) }}
    overlay={<>
      {jackpot !== null && <View style={d.jackpotWin} accessibilityRole="alert"><Text style={d.jackpotSmall}>JACKPOT!</Text><Text style={d.jackpotBig}>{jackpot}× BET</Text></View>}
      <WinCelebration win={win} />
      <BigWin win={win} />
    </>}
    info={<>
      <PayRow label={<View style={d.payArt}>{['JACKPOT', 'JACKPOT', 'JACKPOT'].map((x, i) => <DevilSymbol key={i} symbol={x} size={34} />)}</View>} pays="10×–30× BET" />
      <PayRow label={<View style={d.payArt}>{['JACKPOT', 'WILD', 'X2'].map((x, i) => <DevilSymbol key={i} symbol={x} size={34} />)}<Text style={s.small}> any 3</Text></View>} pays="40" />
      <PayRow label={<View style={d.payArt}>{['SEVEN', 'SEVEN', 'SEVEN'].map((x, i) => <DevilSymbol key={i} symbol={x} size={34} />)}</View>} pays="12" />
      <PayRow label={<View style={d.payArt}>{['BAR3', 'BAR3', 'BAR3'].map((x, i) => <DevilSymbol key={i} symbol={x} size={28} />)}</View>} pays="7" />
      <PayRow label={<View style={d.payArt}>{['BAR2', 'BAR2', 'BAR2'].map((x, i) => <DevilSymbol key={i} symbol={x} size={28} />)}</View>} pays="5" />
      <PayRow label={<View style={d.payArt}>{['BAR1', 'BAR1', 'BAR1'].map((x, i) => <DevilSymbol key={i} symbol={x} size={28} />)}</View>} pays="3" />
      <PayRow label="Any three BARs" pays="1" />
      <Text style={s.small}>Line pays are multiples of the line bet (a fifth of the total bet).</Text>
      <Rules rules={game.engine?.rules} />
    </>}>
    {stage => {
      // The reels fill the stage: three rows high, or as wide as three reels and the line numbers allow.
      const narrow = stage.width < stage.height, reelWidth = narrow ? 1.25 : 1.45;
      const size = Math.max(44, Math.floor(Math.min((stage.height - 34) / 3, (stage.width - 104) / (3 * reelWidth + .25))));
      return <View style={d.stage}>
        <View style={[d.tags, { height: size * 3 + 38 }]}>{LINES.map((rows, line) => <Text key={line} style={[d.tag, { top: tagTop(rows[0], line, 'left', size) + 19, backgroundColor: LINE_COLORS[line], opacity: lines.includes(line) ? 1 : .55 }]}>{line + 1}</Text>)}</View>
        <MarqueeFrame colors={['#ffd08a', '#c0300f', '#4a0505']} bulb="#ffd8a0" excited={lines.length > 0 && !busy} reduced={reduced}>
          <View style={d.reels}>{[0, 1, 2].map(reel => <SpinReel key={reel} index={reel} size={size} width={size * reelWidth} reduced={reduced} strip={BLUR}
            cells={[0, 1, 2].map(row => screen[row * 3 + reel])} spinning={spinning[reel]} style={locked[reel] ? d.locked : d.reel}
            lit={row => lit.has(row * 3 + reel) ? LINE_COLORS[lines.find(line => cellsOf(line).includes(row * 3 + reel)) ?? 0] : null} dim={lines.length > 0}
            render={(symbol, cell) => <DevilSymbol symbol={symbol} size={cell * .78} />}>
            {locked[reel] && <Text style={d.lockTag}>LOCKED</Text>}
          </SpinReel>)}
            <Paylines geometry={{ left: 5, top: 5, width: size * reelWidth, height: size, gap: 5 }}
              lines={(showing === null ? lines : [showing]).map(line => ({ color: LINE_COLORS[line], cells: LINES[line].map((row, reel) => [reel, row] as [number, number]) }))} />
          </View>
        </MarqueeFrame>
        <View style={[d.tags, { height: size * 3 + 38 }]}>{LINES.map((rows, line) => <Text key={line} style={[d.tag, { top: tagTop(rows[2], line, 'right', size) + 19, backgroundColor: LINE_COLORS[line], opacity: lines.includes(line) ? 1 : .55 }]}>{line + 1}</Text>)}</View>
      </View>;
    }}
  </GameShell>;
}

const serif = Platform.OS === 'android' ? 'serif' : 'Georgia';
const d = StyleSheet.create({
  stage: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  payArt: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  tags: { width: 22 },
  tag: { position: 'absolute', left: 0, width: 22, height: 20, borderRadius: 5, textAlign: 'center', fontSize: 11, fontWeight: '900', color: '#1a0204', lineHeight: 20, overflow: 'hidden' },
  reels: { flexDirection: 'row', gap: 5, padding: 5, borderRadius: 12, borderWidth: 3, borderColor: '#ffb01f', backgroundColor: '#120102', flexShrink: 1 },
  reel: { overflow: 'hidden', borderRadius: 8, backgroundColor: '#2e0609', borderWidth: 1, borderColor: '#ff6a3a55' },
  locked: { borderColor: c.gold, borderWidth: 2, backgroundColor: '#4a0c08' },
  lockTag: { position: 'absolute', bottom: 4, alignSelf: 'center', paddingHorizontal: 8, borderRadius: 999, backgroundColor: c.gold, color: '#3a0005', fontSize: 11, fontWeight: '900', letterSpacing: 1.5, overflow: 'hidden' },
  cell: { alignItems: 'center', justifyContent: 'center' },
  lit: { backgroundColor: '#ffd23f33' },
  jackpotWin: { position: 'absolute', alignSelf: 'center', top: '35%', paddingHorizontal: 26, paddingVertical: 12, borderRadius: 18, borderWidth: 4, borderColor: c.gold, backgroundColor: '#8a0010', alignItems: 'center' },
  jackpotSmall: { color: '#fff', fontWeight: '900', letterSpacing: 3 },
  jackpotBig: { color: '#ffe45c', fontWeight: '900', fontSize: 34, fontFamily: serif },
});
