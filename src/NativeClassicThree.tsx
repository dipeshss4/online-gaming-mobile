import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
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
import { usePace } from './playControls';

/**
 * The classic three-reel games in the app (layout CLASSIC_3X3, ClassicThreeEngine): three reels of three rows, one or
 * five lines and, for some, a fourth reel of multipliers. What pays comes from the server's engine info: the lines,
 * the paytable (patterns of symbols, "A|B" meaning either; WILD<n> stands in and multiplies) and the multiplier reel.
 */
export const supportsClassicThree = (game: Game) => game.engine?.layout === 'CLASSIC_3X3';
const REELS = 3, ROWS = 3, CELLS = 9;
const ART: Record<string, Record<string, number>> = {
  STARS_STRIPES_7S: { RED7: require('../assets/stars-stripes/RED7.png'), WHITE7: require('../assets/stars-stripes/WHITE7.png'), BLUE7: require('../assets/stars-stripes/BLUE7.png'),
    BAR1: require('../assets/stars-stripes/BAR1.png'), BAR2: require('../assets/stars-stripes/BAR2.png'), BAR3: require('../assets/stars-stripes/BAR3.png') },
  DIAMOND_WILDS: { SEVEN: require('../assets/diamond-wilds/SEVEN.png'), CHERRY: require('../assets/diamond-wilds/CHERRY.png'), BAR1: require('../assets/diamond-wilds/BAR1.png'),
    BAR2: require('../assets/diamond-wilds/BAR2.png'), BAR3: require('../assets/diamond-wilds/BAR3.png'), WILD2: require('../assets/diamond-wilds/WILD2.png'),
    WILD3: require('../assets/diamond-wilds/WILD3.png'), WILD5: require('../assets/diamond-wilds/WILD5.png') },
  INFERNO_JACKPOT: { JACKPOT: require('../assets/inferno/JACKPOT.png'), FIRE7: require('../assets/inferno/FIRE7.png'), SEVEN: require('../assets/inferno/SEVEN.png'),
    BAR1: require('../assets/inferno/BAR1.png'), BAR2: require('../assets/inferno/BAR2.png'), BAR3: require('../assets/inferno/BAR3.png') },
};
const LOOKS: Record<string, { frame: [string, string, string]; board: [string, string]; idle: string }> = {
  STARS_STRIPES_7S: { frame: ['#ffffff', '#c0182a', '#0a1440'], board: ['#14245a', '#060c2a'], idle: 'RED, WHITE AND BLUE PAYS 250X' },
  DIAMOND_WILDS: { frame: ['#e0f6ff', '#2a6ad0', '#061838'], board: ['#122a5a', '#040a20'], idle: 'DIAMONDS MULTIPLY EVERY WIN' },
  INFERNO_JACKPOT: { frame: ['#ffd08a', '#c0300f', '#3a0802'], board: ['#2a0a06', '#120201'], idle: 'THE FOURTH REEL MULTIPLIES UP TO 10X' },
};
const cash = (n: number) => n.toFixed(2);
const wildOf = (cell: string) => { const m = /^WILD(\d+)$/.exec(cell); return m ? Number(m[1]) : 0; };
const fits = (token: string, cell: string) => token.split('|').includes(cell) || (wildOf(cell) > 0 && !token.includes('JACKPOT') && !token.includes('BLANK'));
type Entry = { label: string; pattern: string[]; multiplier: number };
type LineWin = { index: number; cells: number[]; pays: number; label: string; jackpot: boolean };
/** A line's best paytable entry and its pay in line bets (wilds multiplied in), read as the server reads it. */
function linePay(line: string[], paytable: Entry[]) {
  const entry = paytable.find(row => row.pattern.length === line.length && row.pattern.every((token, i) => fits(token, line[i])));
  if (!entry) return null;
  return { entry, pays: entry.multiplier * line.reduce((product, cell) => product * (wildOf(cell) || 1), 1), jackpot: entry.pattern.every(token => token === 'JACKPOT') };
}

export function NativeClassicThree({ game, token, userId, initialBalance, onClose, onSettled }: { game: Game; token: string; userId: string; initialBalance: Balance | null; onClose: () => void; onSettled: () => void }) {
  const art = ART[game.code] ?? ART.STARS_STRIPES_7S, look = LOOKS[game.code] ?? LOOKS.STARS_STRIPES_7S;
  const engine = game.engine, lines = engine?.lines?.length ? engine.lines : [[3, 4, 5]];
  const paytable: Entry[] = (engine?.paytable ?? []).map(row => ({ label: row.label, pattern: row.pattern ?? [], multiplier: Number(row.multiplier) }));
  const multipliers = engine?.art?.multipliers?.split(',').map(Number) ?? [];
  const strip = (engine?.symbols ?? Object.keys(art));
  const [stake, setStake] = useState(game.minStake), [wallet, setWallet] = useState(initialBalance);
  const [pending, setPending] = useState<PendingBet | null>(null), [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [reduced, setReduced] = useState(false);
  const [screen, setScreen] = useState<string[]>(() => Array.from({ length: CELLS }, (_, i) => strip[(i * 2) % strip.length]));
  const [stopped, setStopped] = useState(REELS), [wins, setWins] = useState<LineWin[]>([]), [shown, setShown] = useState<number | null>(null);
  const [multiplier, setMultiplier] = useState(multipliers[0] ?? 1), [rolling, setRolling] = useState(false), [teasing, setTeasing] = useState(false);
  const [banner, setBanner] = useState<string | null>(null), [meter, setMeter] = useState(0), [win, setWin] = useState<Win | null>(null);
  const [status, setStatus] = useState(look.idle);
  const alive = useRef(true), lock = useRef(false);
  const slam = useRef(new Animated.Value(0)).current, roll = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    alive.current = true;
    readPending(userId).then(value => { if (alive.current) { setPending(value); setReady(true); } }).catch(() => setError('Cannot read saved bet. Play is locked to prevent duplicate bets.'));
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    return () => { alive.current = false; };
  }, [userId]);
  // The multiplier reel's spin: its values race past while it rolls.
  useEffect(() => {
    if (!rolling || reduced) return;
    roll.setValue(0);
    const run = Animated.loop(Animated.timing(roll, { toValue: 1, duration: teasing ? 360 : 180, easing: Easing.linear, useNativeDriver: true }));
    run.start(); return () => run.stop();
  }, [rolling, teasing, reduced, roll]);
  const play = usePace(game), wait = play.pace.wait;
  async function show(text: string, ms: number) {
    setBanner(text); slam.setValue(0);
    Animated.spring(slam, { toValue: 1, friction: 4, tension: 110, useNativeDriver: true }).start();
    await wait(ms); setBanner(null);
  }

  async function spin() {
    if (lock.current || !ready || (pending && pending.gameCode !== game.code)) return;
    if (!pending && wallet && stake > wallet.balance) { setError('Insufficient available balance.'); return; }
    lock.current = true; play.pace.begin(); setBusy(true); setError(''); setWin(null); setMeter(0); setWins([]); setShown(null); setStopped(0); setStatus('GOOD LUCK!');
    if (multipliers.length) setRolling(true);
    let submitted = false;
    try {
      const bet = pending || { gameCode: game.code, requestId: randomUUID(), stake };
      await savePending(userId, bet); setPending(bet); submitted = true;
      sound.play('spin');
      const data = await request<PlayResult>(`/api/games/${encodeURIComponent(game.code)}/play`, token, { requestId: bet.requestId, stake: bet.stake });
      if (data.requestId !== bet.requestId || data.gameCode !== game.code || data.symbols.length < CELLS) throw new Error('Unexpected result. Keep this request for reconciliation.');
      await clearPending(userId); setPending(null);
      if (!alive.current) return;
      const cells = data.symbols.slice(0, CELLS), x = data.symbols[CELLS]?.startsWith('X:') ? Number(data.symbols[CELLS].slice(2)) : 1;
      setScreen(cells);
      await wait(650);
      for (let reel = 1; reel <= REELS; reel++) { if (!alive.current) return; setStopped(reel); sound.play('reel-land'); await wait(220); }
      const found: LineWin[] = lines.map((line, index) => ({ index, cells: line, hit: linePay(line.map(cell => cells[cell]), paytable) }))
        .filter(f => f.hit).map(f => ({ index: f.index, cells: f.cells, pays: f.hit!.pays, label: f.hit!.entry.label, jackpot: f.hit!.jackpot }));
      if (multipliers.length) {
        // A win waiting on it: the multiplier reel rolls on slower before it lands.
        if (found.some(line => !line.jackpot)) { setTeasing(true); sound.play('tease'); await wait(900); }
        setTeasing(false); setRolling(false); setMultiplier(x); sound.play('reel-land'); await wait(300);
      }
      let running = 0;
      const perLine = data.stake / lines.length;
      if (found.length) {
        await wait(300); setWins(found);
        for (const line of found) {
          if (!alive.current) return;
          setShown(line.index); running += line.pays * perLine * (line.jackpot ? 1 : x); setMeter(running);
          setStatus(`${line.label.toUpperCase()} · ${cash(line.pays * perLine)}`); feel('select'); sound.play('reel-land'); await wait(850);
        }
        setShown(null);
        if (x > 1 && found.some(line => !line.jackpot)) { sound.play('coins'); await show(`×${x} MULTIPLIER!`, 1200); }
      }
      if (found.some(line => line.jackpot)) { sound.play('bigwin'); await show('JACKPOT!', 2200); }
      else if (data.multiplier >= 25) { sound.play('bigwin'); await show('MEGA WIN', 2000); }
      else if (data.multiplier >= 3) { sound.play('bigwin'); await show('BIG WIN', 1500); }
      if (!alive.current) return;
      setMeter(data.payout); setWallet(current => current ? { ...current, balance: data.balance, currency: data.currency } : current);
      setStatus(data.payout > 0 ? `WIN ${cash(data.payout)}` : look.idle);
      feel(data.payout > 0 ? 'win' : 'tap'); sound.result(data.payout > 0 ? data.multiplier : 0);
      if (data.payout > 0) setWin({ payout: data.payout, stake: data.stake, multiplier: data.multiplier, currency: data.currency, id: data.betId });
      play.pace.report({ payout: data.payout, stake: data.stake, multiplier: data.multiplier });
      onSettled();
    } catch (e) {
      if (!alive.current) return;
      if (!pending && e instanceof ApiError && [400, 401, 403, 404, 422, 429].includes(e.status)) await clearPending(userId).then(() => setPending(null)).catch(() => {});
      feel('warn'); setStatus(look.idle);
      setError(`${e instanceof Error ? e.message : 'Unable to play'}${submitted ? ' If a bet is pending, use Recover with the same request ID.' : ''}`);
    } finally { lock.current = false; if (alive.current) { setBusy(false); setStopped(REELS); setRolling(false); setTeasing(false); } }
  }

  const drawn = shown === null ? wins : wins.filter(line => line.index === shown);
  const lit = new Set(drawn.flatMap(line => line.cells));
  const perLine = (pending ? pending.stake : stake) / lines.length;
  const symbolArt = (symbol: string, size: number) => symbol === 'BLANK'
    ? <View style={{ width: size * .5, height: 3, borderRadius: 2, backgroundColor: '#ffffff1a' }} />
    : <Image source={art[symbol]} style={{ width: size * .86, height: size * .86 }} resizeMode="contain" accessibilityLabel={symbol.toLowerCase()} />;
  return <GameShell game={game} play={{ ...play, stake: pending ? pending.stake : stake }} balance={wallet} onBack={onClose} backDisabled={busy} status={status}
    notice={error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text>
      : pending && !busy ? `Pending: ${pending.gameCode} · ${cash(pending.stake)}. ${pending.gameCode !== game.code ? 'Open that game to recover the round.' : 'SPIN resends this exact bet, not a new one.'}` : undefined}
    bet={<BetBar inline label={lines.length === 1 ? 'BET PER SPIN' : `TOTAL BET · ${lines.length} LINES`} value={pending ? pending.stake : stake} onChange={setStake} min={game.minStake} max={game.maxStake} disabled={busy || !!pending} />}
    win={cash(meter)}
    spin={{ busy, label: pending ? 'RECOVER' : 'SPIN', accessibilityLabel: pending ? 'Recover bet' : 'Spin', onPress: spin, disabled: busy || !ready || (!!pending && pending.gameCode !== game.code) }}
    overlay={<>
      {banner && <Animated.View pointerEvents="none" style={[k.banner, (banner === 'MEGA WIN' || banner === 'JACKPOT!') && k.mega, { borderColor: look.frame[0], transform: [{ scale: slam.interpolate({ inputRange: [0, 1], outputRange: [2.4, 1] }) }], opacity: slam }]}>
        <Text style={[k.bannerText, (banner === 'MEGA WIN' || banner === 'JACKPOT!') && { fontSize: 58 }]}>{banner}</Text></Animated.View>}
      <WinCelebration win={win} /><BigWin win={win} />
    </>}
    info={<>
      {paytable.map(row => <PayRow key={row.label} label={<View style={k.special}>
        <View style={{ flexDirection: 'row' }}>{row.pattern.map((token, i) => <View key={i} style={{ width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}>{symbolArt(token.split('|')[0], 34)}</View>)}</View>
        <Text style={[s.small, { flexShrink: 1 }]}>{row.label}</Text></View>} pays={cash(row.multiplier * perLine)} />)}
      <Rules rules={engine?.rules} />
    </>}>
    {stage => {
      const side = multipliers.length ? 1.25 : 0;
      const cell = Math.max(44, Math.floor(Math.min((stage.height - 30) / ROWS, (stage.width - 60) / ((REELS + side) * 1.2))));
      const width = cell * 1.25;
      return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <MarqueeFrame colors={look.frame} bulb="#fff3c0" excited={wins.length > 0} reduced={reduced}>
          <LinearGradient colors={look.board} style={k.cabinet}>
            <View style={k.reels}>{Array.from({ length: REELS }, (_, reel) => <SpinReel key={reel} index={reel} size={cell} width={width} reduced={reduced}
              strip={strip} spinning={busy && stopped <= reel} cells={[0, 1, 2].map(row => screen[row * REELS + reel])} dim={wins.length > 0}
              lit={row => lit.has(row * REELS + reel) ? c.gold : lines.length === 1 && row === 1 && !wins.length ? '#ffffff22' : null}
              render={(symbol, size) => symbolArt(symbol, size)} />)}
              <Paylines geometry={{ left: 0, top: 0, width, height: cell, gap: 4 }}
                lines={drawn.map(line => ({ color: c.gold, cells: line.cells.map(index => [index % REELS, Math.floor(index / REELS)] as [number, number]) }))} />
            </View>
          </LinearGradient>
        </MarqueeFrame>
        {multipliers.length > 0 && <LinearGradient colors={[look.frame[1], look.frame[2]]} style={[k.multiplier, { width: cell * 1.3, height: cell * ROWS + 24, borderColor: !busy && multiplier > 1 ? c.gold : look.frame[0] }]}
          accessible accessibilityLabel={`Multiplier ${multiplier} times`}>
          <Text style={k.multiplierLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={.6}>MULTIPLIER</Text>
          {rolling && !reduced
            ? <View style={{ height: cell * 1.2, overflow: 'hidden' }}><Animated.View style={{ transform: [{ translateY: roll.interpolate({ inputRange: [0, 1], outputRange: [0, -cell * 1.2 * multipliers.length] }) }] }}>
                {[...multipliers, ...multipliers].map((value, i) => <Text key={i} style={[k.multiplierValue, { height: cell * 1.2, lineHeight: cell * 1.2, fontSize: cell * .55 }]}>×{value}</Text>)}
              </Animated.View></View>
            : <Text style={[k.multiplierValue, { fontSize: cell * .55 }]}>×{multiplier}</Text>}
        </LinearGradient>}
      </View>;
    }}
  </GameShell>;
}

const k = StyleSheet.create({
  cabinet: { overflow: 'hidden', padding: 6, borderRadius: 10 },
  reels: { flexDirection: 'row', gap: 4, justifyContent: 'center', alignSelf: 'center' },
  special: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  multiplier: { borderRadius: 16, borderWidth: 3, alignItems: 'center', justifyContent: 'center', gap: 6, overflow: 'hidden' },
  multiplierLabel: { color: '#ffe58a', fontWeight: '900', fontSize: 11, letterSpacing: 1, paddingHorizontal: 4 },
  multiplierValue: { color: '#ffe58a', fontWeight: '900', fontStyle: 'italic', textAlign: 'center', textShadowColor: '#ff5a00', textShadowRadius: 14, textShadowOffset: { width: 0, height: 0 } },
  banner: { position: 'absolute', alignSelf: 'center', top: '34%', paddingHorizontal: 30, paddingVertical: 10, borderRadius: 20, borderWidth: 4, backgroundColor: '#0a0418ee' },
  mega: { shadowColor: '#ffd23f', shadowOpacity: 1, shadowRadius: 30, shadowOffset: { width: 0, height: 0 } },
  bannerText: { color: '#ffe58a', fontWeight: '900', fontStyle: 'italic', fontSize: 44, textShadowColor: '#ff5ab4', textShadowRadius: 18, textShadowOffset: { width: 0, height: 0 } },
});
