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
import { usePace } from './playControls';

/**
 * Money Monsoon in the app: five reels, three rows, fifteen lines. CASH coins land on reels one to four, each showing
 * a prize of 1x to 50x the bet, and the VAULT lands only on reel five: when it shows it collects every coin. The round
 * comes whole from the server (MoneyMonsoonEngine): fifteen cells row by row, a coin reading CASH:n (its prize in total
 * bets). This spins the reels onto it (reel five hangs on when coins are already down), draws each winning line, then
 * has the vault take each coin in turn while the meter counts up. Six or more coins start the MONEY STORM (STORM, then
 * R and cell:CASH:n for each respin's new coins, then GRAND): the coins lock on a dark board, the respins play out, and
 * the vault takes the whole board.
 */
export const supportsMoneyMonsoon = (game: Game) => game.engine?.layout === 'CASH_5X3';
const REELS = 5, ROWS = 3, CELLS = 15, WILD = 'WILD', VAULT = 'VAULT', FIVE_WILDS = 1000;
const PAYS: Record<string, number[]> = {
  CROWN: [30, 120, 500], DIAMOND: [25, 90, 300], GOLD: [20, 60, 200], WATCH: [12, 40, 120],
  CHIPS: [10, 25, 90], DICE: [6, 18, 60], CARDS: [5, 12, 40],
};
const ART: Record<string, number> = {
  CROWN: require('../assets/monsoon/CROWN.png'), DIAMOND: require('../assets/monsoon/DIAMOND.png'), GOLD: require('../assets/monsoon/GOLD.png'),
  WATCH: require('../assets/monsoon/WATCH.png'), CHIPS: require('../assets/monsoon/CHIPS.png'), DICE: require('../assets/monsoon/DICE.png'),
  CARDS: require('../assets/monsoon/CARDS.png'), WILD: require('../assets/monsoon/WILD.png'), CASH: require('../assets/monsoon/CASH.png'),
  VAULT: require('../assets/monsoon/VAULT.png'),
};
const STRIP = ['CROWN', 'CASH:5', 'DICE', 'WILD', 'GOLD', 'CARDS', 'CASH:2', 'WATCH', 'CHIPS', 'DIAMOND'];
const VAULT_STRIP = STRIP.map(cell => cell.startsWith('CASH') ? VAULT : cell);
const FALLBACK = [[1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2], [0, 0, 1, 2, 2], [2, 2, 1, 0, 0],
  [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [0, 1, 1, 1, 0], [2, 1, 1, 1, 2], [1, 0, 1, 2, 1], [1, 2, 1, 0, 1], [0, 1, 0, 1, 0], [2, 1, 2, 1, 2]]
  .map(rows => rows.map((row, reel) => row * REELS + reel));
const LINE_COLOURS = ['#ffd84a', '#5affa0', '#5ad8ff', '#ff9a3a', '#c48aff', '#ff6a6a', '#7aff8a', '#5affd8', '#fff07a', '#ff8ad8', '#8ab4ff', '#d8ff5a', '#ffb45a', '#5a9aff', '#ff5a8a'];
const cash = (n: number) => n.toFixed(2);
const short = (n: number) => Number.isInteger(n) ? String(n) : n.toFixed(2);

/** A coin's prize in total bets, or null when the cell is not a coin. */
const prizeOf = (cell: string) => cell.startsWith('CASH:') ? Number(cell.slice(5)) : null;
/** A line's pay in line bets and how many cells it covers, read as the server reads it. */
function linePay(line: string[]) {
  const target = line.find(cell => cell !== WILD);
  if (!target) return { pays: FIVE_WILDS, count: REELS };
  if (!PAYS[target]) return { pays: 0, count: 0 };
  let count = 0;
  while (count < REELS && (line[count] === target || line[count] === WILD)) count++;
  return count >= 3 ? { pays: PAYS[target][count - 3], count } : { pays: 0, count: 0 };
}
type LineWin = { index: number; cells: number[]; pays: number; count: number };
const winningLines = (screen: string[], lines: number[][]): LineWin[] =>
  lines.map((cells, index) => ({ index, cells, ...linePay(cells.map(cell => screen[cell])) })).filter(found => found.pays > 0);

const IDLE = 'THE VAULT COLLECTS EVERY COIN';
/** A round's storm: each respin's new coins (cell and prize) and whether the board filled; null without one. */
function parseStorm(symbols: string[]) {
  if (!symbols.includes('STORM')) return null;
  const respins: [number, number][][] = [];
  for (const token of symbols.slice(CELLS + 1)) {
    if (token === 'R') respins.push([]);
    else if (token.includes(':CASH:')) { const [cell, , prize] = token.split(':'); respins[respins.length - 1].push([Number(cell), Number(prize)]); }
  }
  return { respins, grand: symbols.includes('GRAND') };
}

export function NativeMoneyMonsoon({ game, token, userId, initialBalance, onClose, onSettled }: { game: Game; token: string; userId: string; initialBalance: Balance | null; onClose: () => void; onSettled: () => void }) {
  const lines = game.engine?.lines?.length ? game.engine.lines : FALLBACK;
  const [stake, setStake] = useState(game.minStake), [wallet, setWallet] = useState(initialBalance);
  const [pending, setPending] = useState<PendingBet | null>(null), [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [reduced, setReduced] = useState(false);
  const [screen, setScreen] = useState<string[]>(() => Array.from({ length: CELLS }, (_, i) => (i % REELS === REELS - 1 ? VAULT_STRIP : STRIP)[(i * 3) % STRIP.length]));
  const [stopped, setStopped] = useState(REELS), [wins, setWins] = useState<LineWin[]>([]), [shown, setShown] = useState<number | null>(null);
  // The collect: the vault glows, the coin it is taking, and the coins already taken.
  const [vaultLit, setVaultLit] = useState(false), [taking, setTaking] = useState<number | null>(null), [taken, setTaken] = useState<number[]>([]);
  // Suspense: with coins already down, reel five spins on, slower and glowing, for the VAULT.
  const [teaseFrom, setTeaseFrom] = useState<number | null>(null);
  // The storm: respins left and the board's total so far, and the coins that just dropped in.
  const [storm, setStorm] = useState<{ left: number; total: number } | null>(null), [fresh, setFresh] = useState<number[]>([]);
  const [banner, setBanner] = useState<string | null>(null), [meter, setMeter] = useState(0), [win, setWin] = useState<Win | null>(null);
  const [status, setStatus] = useState(IDLE);
  const alive = useRef(true), lock = useRef(false), fast = useRef(false);
  const slam = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    alive.current = true;
    readPending(userId).then(value => { if (alive.current) { setPending(value); setReady(true); } }).catch(() => setError('Cannot read saved bet. Play is locked to prevent duplicate bets.'));
    AccessibilityInfo.isReduceMotionEnabled().then(value => { fast.current = value; setReduced(value); });
    return () => { alive.current = false; };
  }, [userId]);
  // The show's pauses follow the player's TURBO and STOP (src/playControls.ts).
  const play = usePace(game), wait = play.pace.wait;
  async function show(text: string, ms: number) {
    setBanner(text); slam.setValue(0);
    Animated.spring(slam, { toValue: 1, friction: 4, tension: 110, useNativeDriver: true }).start();
    await wait(ms); setBanner(null);
  }

  async function spin() {
    if (lock.current || !ready || (pending && pending.gameCode !== game.code)) return;
    if (!pending && wallet && stake > wallet.balance) { setError('Insufficient available balance.'); return; }
    lock.current = true; play.pace.begin(); setBusy(true); setError(''); setWin(null); setMeter(0); setWins([]); setShown(null); setStopped(0); setStatus('GOOD LUCK!'); setVaultLit(false); setTaking(null); setTaken([]); setStorm(null); setFresh([]);
    let submitted = false;
    try {
      const bet = pending || { gameCode: game.code, requestId: randomUUID(), stake };
      await savePending(userId, bet); setPending(bet); submitted = true;
      sound.play('spin');
      const data = await request<PlayResult>(`/api/games/${encodeURIComponent(game.code)}/play`, token, { requestId: bet.requestId, stake: bet.stake });
      if (data.requestId !== bet.requestId || data.gameCode !== game.code || data.symbols.length < CELLS) throw new Error('Unexpected result. Keep this request for reconciliation.');
      await clearPending(userId); setPending(null);
      if (!alive.current) return;
      const cells = data.symbols.slice(0, CELLS), perLine = data.stake / lines.length;
      setScreen(cells);
      await wait(700);
      let teasing: number | null = null; setTeaseFrom(null);
      for (let reel = 1; reel <= REELS; reel++) {
        if (!alive.current) return;
        // Coins already down: the vault reel hangs on, glowing, before it lands.
        if (teasing === null && reel === REELS && cells.some((cell, i) => i % REELS < REELS - 1 && prizeOf(cell) !== null)) { teasing = REELS - 1; setTeaseFrom(teasing); }
        if (teasing !== null) { sound.play('tease'); await wait(900); }
        setStopped(reel); sound.play('reel-land'); await wait(200);
      }
      setTeaseFrom(null);
      let running = 0;
      const found = winningLines(cells, lines);
      if (found.length) {
        await wait(450); setWins(found);
        for (const line of found.slice(0, 6)) {
          if (!alive.current) return;
          setShown(line.index); running += line.pays * perLine; setMeter(running);
          setStatus(`LINE ${line.index + 1} · ${cash(line.pays * perLine)}`); feel('select'); sound.play('reel-land');
          await wait(found.length > 3 ? 520 : 800);
        }
        setShown(null); running = found.reduce((sum, line) => sum + line.pays, 0) * perLine; setMeter(running);
      }
      const coins = cells.map((cell, i) => ({ i, prize: prizeOf(cell) ?? 0 })).filter(coin => coin.prize > 0);
      const stormRound = parseStorm(data.symbols);
      if (stormRound) {
        setWins([]); sound.play('bigwin'); feel('heavy'); await show('MONEY STORM!', 1600);
        let board = [...cells], left = 3;
        const all = coins.map(coin => ({ i: coin.i, prize: coin.prize }));
        const totalOf = () => all.reduce((sum, coin) => sum + coin.prize, 0) * data.stake;
        setStorm({ left, total: totalOf() }); setStatus(`RESPINS LEFT · ${left}`);
        for (const landed of stormRound.respins) {
          if (!alive.current) return;
          setFresh([]); sound.play('spin'); await wait(850);
          if (landed.length) {
            for (const [cell, prize] of landed) { board[cell] = `CASH:${prize}`; all.push({ i: cell, prize }); }
            board = [...board]; setScreen(board); setFresh(landed.map(([cell]) => cell)); sound.play('coins'); feel('select'); left = 3;
          } else left -= 1;
          setStorm({ left, total: totalOf() }); setStatus(`RESPINS LEFT · ${left}`); await wait(landed.length ? 650 : 350);
        }
        setFresh([]);
        if (stormRound.grand) { sound.play('bigwin'); await show('GRAND!', 2200); }
        setVaultLit(true); sound.play('bigwin'); await show('VAULT COLLECT!', 1000);
        for (const coin of all.sort((a, b) => a.i - b.i)) {
          if (!alive.current) return;
          setTaking(coin.i); sound.play('coins'); await wait(240);
          running += coin.prize * data.stake; setMeter(running); setTaken(previous => [...previous, coin.i]); setTaking(null);
        }
        if (stormRound.grand) { running += 200 * data.stake; setMeter(running); }
        setStorm(null); await show(`STORM WIN ${cash(data.payout)}`, 1600);
      } else if (cells.includes(VAULT) && coins.length) {
        setWins([]); setVaultLit(true); sound.play('bigwin'); await show('VAULT COLLECT!', 1100);
        for (const coin of coins) {
          if (!alive.current) return;
          setTaking(coin.i); sound.play('coins'); feel('select'); await wait(420);
          running += coin.prize * data.stake; setMeter(running); setTaken(previous => [...previous, coin.i]); setTaking(null);
          setStatus(`VAULT +${cash(coin.prize * data.stake)}`); await wait(160);
        }
        await show(`COLLECTED ${cash(coins.reduce((sum, coin) => sum + coin.prize, 0) * data.stake)}`, 1500);
      }
      if (data.multiplier >= 25) { sound.play('bigwin'); await show('MEGA WIN', 2000); }
      else if (data.multiplier >= 3) { sound.play('bigwin'); await show('BIG WIN', 1500); }
      if (!alive.current) return;
      setMeter(data.payout); setWallet(current => current ? { ...current, balance: data.balance, currency: data.currency } : current);
      setStatus(data.payout > 0 ? `WIN ${cash(data.payout)}` : IDLE);
      feel(data.payout > 0 ? 'win' : 'tap'); sound.result(data.payout > 0 ? data.multiplier : 0);
      if (data.payout > 0) setWin({ payout: data.payout, stake: data.stake, multiplier: data.multiplier, currency: data.currency, id: data.betId });
      play.pace.report({ payout: data.payout, stake: data.stake, multiplier: data.multiplier });
      onSettled();
    } catch (e) {
      if (!alive.current) return;
      if (!pending && e instanceof ApiError && [400, 401, 403, 404, 422, 429].includes(e.status)) await clearPending(userId).then(() => setPending(null)).catch(() => {});
      feel('warn'); setStatus(IDLE);
      setError(`${e instanceof Error ? e.message : 'Unable to play'}${submitted ? ' If a bet is pending, use Recover with the same request ID.' : ''}`);
    } finally { lock.current = false; if (alive.current) { setBusy(false); setStopped(REELS); setStorm(null); } }
  }

  const drawn = shown === null ? wins : wins.filter(line => line.index === shown);
  const litBy = new Map<number, string>();
  for (const line of drawn) for (const cell of line.cells.slice(0, line.count)) if (!litBy.has(cell)) litBy.set(cell, LINE_COLOURS[line.index % LINE_COLOURS.length]);
  const perLine = (pending ? pending.stake : stake) / lines.length;
  return <GameShell game={game} play={{ ...play, stake: pending ? pending.stake : stake }} balance={wallet} onBack={onClose} backDisabled={busy} status={status}
    notice={error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text>
      : pending && !busy ? `Pending: ${pending.gameCode} · ${cash(pending.stake)}. ${pending.gameCode !== game.code ? 'Open that game to recover the round.' : 'SPIN resends this exact bet, not a new one.'}` : undefined}
    bet={<BetBar inline label={`TOTAL BET · ${lines.length} LINES`} value={pending ? pending.stake : stake} onChange={setStake} min={game.minStake} max={game.maxStake} disabled={busy || !!pending} />}
    win={cash(meter)}
    spin={{ busy, label: pending ? 'RECOVER' : 'SPIN', accessibilityLabel: pending ? 'Recover bet' : 'Spin', onPress: spin, disabled: busy || !ready || (!!pending && pending.gameCode !== game.code) }}
    overlay={<>
      {storm && <View pointerEvents="none" style={l.stormBadge}><Text style={l.stormText}>MONEY STORM</Text><Text style={l.stormTotal} numberOfLines={1} adjustsFontSizeToFit>{cash(storm.total)}</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>{[0, 1, 2].map(i => <View key={i} style={[l.light, i < storm.left && l.lightOn]} />)}</View></View>}
      {banner && <Animated.View pointerEvents="none" style={[l.banner, banner === 'MEGA WIN' && l.mega, { transform: [{ scale: slam.interpolate({ inputRange: [0, 1], outputRange: [2.4, 1] }) }], opacity: slam }]}><Text style={[l.bannerText, banner === 'MEGA WIN' && { fontSize: 58 }]}>{banner}</Text></Animated.View>}
      <WinCelebration win={win} /><BigWin win={win} />
    </>}
    info={<>
      <PayRow label={<View style={l.special}><Image source={ART.VAULT} style={{ width: 40, height: 40 }} resizeMode="contain" /><Text style={[s.small, { flexShrink: 1 }]}>Reel five only. When the VAULT shows it collects every CASH coin on the screen.</Text></View>} pays="COLLECT" />
      <PayRow label={<View style={l.special}><Image source={ART.CASH} style={{ width: 40, height: 40 }} resizeMode="contain" /><Text style={[s.small, { flexShrink: 1 }]}>Six or more coins start the MONEY STORM: they lock, the rest respin three times, every new coin resets the respins, then the vault collects the board. Fill all twelve for the GRAND.</Text></View>}
        pays={cash(200 * (pending ? pending.stake : stake))} />
      <PayRow label={<View style={l.special}><Image source={ART.CASH} style={{ width: 40, height: 40 }} resizeMode="contain" /><Text style={[s.small, { flexShrink: 1 }]}>Reels one to four, each showing a prize.</Text></View>}
        pays={`${cash(pending ? pending.stake : stake)} – ${cash(50 * (pending ? pending.stake : stake))}`} />
      <PayRow label={<View style={l.special}><Image source={ART.WILD} style={{ width: 40, height: 40 }} resizeMode="contain" /><Text style={[s.small, { flexShrink: 1 }]}>Wild for every line symbol; five on a line pay {FIVE_WILDS} line bets.</Text></View>} pays={cash(FIVE_WILDS * perLine)} />
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
        <MarqueeFrame colors={storm ? ['#d8f6ff', '#1a7ab0', '#062a4a'] : ['#fff0b0', '#0f9a6a', '#043a24']} bulb={storm ? '#d8f6ff' : '#fff3b0'} excited={wins.length > 0 || vaultLit || !!storm} reduced={reduced}>
          <LinearGradient colors={storm ? ['#04121a', '#010608'] : ['#0c4434', '#03140f']} style={l.cabinet}>
            {/* The storm's board: the locked coins on a dark board, the vault reel dimmed, new coins ringed in gold. */}
            {storm ? <View style={l.reels}>{Array.from({ length: REELS }, (_, reel) => <View key={reel} style={{ width: cell * 1.08, gap: 0, opacity: reel === REELS - 1 ? .35 : 1 }}>
              {[0, 1, 2].map(row => { const i = row * REELS + reel, prize = prizeOf(screen[i]);
                return <View key={row} style={[l.stormCell, { height: cell }, prize !== null && l.lockedCell, fresh.includes(i) && l.freshCell, taking === i && { borderColor: '#fff3b0' }]}>
                  {prize !== null && <View style={{ width: cell * .86, height: cell * .86, alignItems: 'center', justifyContent: 'center', opacity: taken.includes(i) ? .3 : 1 }}>
                    <Image source={ART.CASH} style={{ width: cell * .86, height: cell * .86 }} resizeMode="contain" accessibilityLabel={`cash ${cash(prize * (pending ? pending.stake : stake))}`} />
                    <Text numberOfLines={1} adjustsFontSizeToFit style={[l.prize, { fontSize: cell * .2 }]}>{short(prize * (pending ? pending.stake : stake))}</Text>
                  </View>}
                  {reel === REELS - 1 && screen[i] === VAULT && <Image source={ART.VAULT} style={{ width: cell * .8, height: cell * .8 }} resizeMode="contain" />}
                </View>; })}</View>)}</View>
            : <View style={l.reels}>{Array.from({ length: REELS }, (_, reel) => <SpinReel key={reel} index={reel} size={cell} width={cell * 1.08} reduced={reduced}
              strip={reel === REELS - 1 ? VAULT_STRIP : STRIP} spinning={busy && stopped <= reel} tease={busy && teaseFrom !== null && reel >= teaseFrom && stopped <= reel} cells={[0, 1, 2].map(row => screen[row * REELS + reel])} dim={wins.length > 0 || vaultLit}
              lit={row => { const i = row * REELS + reel; return litBy.get(i) ?? (taking === i ? '#fff3b0' : vaultLit && (screen[i] === VAULT || (prizeOf(screen[i]) !== null && !taken.includes(i))) ? '#ffd84a' : null); }}
              render={(symbol, size) => { const prize = prizeOf(symbol);
                return <View style={{ width: size * .9, height: size * .9, alignItems: 'center', justifyContent: 'center' }}>
                  <Image source={ART[prize !== null ? 'CASH' : symbol] ?? ART.CARDS} style={{ width: size * .9, height: size * .9 }} resizeMode="contain" accessibilityLabel={prize !== null ? `cash ${cash(prize * (pending ? pending.stake : stake))}` : symbol.toLowerCase()} />
                  {prize !== null && <Text numberOfLines={1} adjustsFontSizeToFit style={[l.prize, { fontSize: size * .2 }, prize >= 25 && { color: '#7a0a0a' }]}>{short(prize * (pending ? pending.stake : stake))}</Text>}
                </View>; }} />)}
              <Paylines geometry={{ left: 0, top: 0, width: cell * 1.08, height: cell, gap: 4 }}
                lines={drawn.map(line => ({ color: LINE_COLOURS[line.index % LINE_COLOURS.length], cells: line.cells.map(index => [index % REELS, Math.floor(index / REELS)] as [number, number]) }))} />
            </View>}
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
  stormCell: { alignItems: 'center', justifyContent: 'center', borderRadius: 8, margin: 2, backgroundColor: '#03090c', borderWidth: 1, borderColor: '#ffffff10' },
  lockedCell: { backgroundColor: '#0a2a3a', borderColor: '#5ad8ff88' },
  freshCell: { borderColor: '#ffd84a', borderWidth: 2 },
  stormBadge: { position: 'absolute', top: 66, left: 12, minWidth: 150, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, borderWidth: 2, borderColor: '#5ad8ff', backgroundColor: '#000000bb', alignItems: 'center', gap: 4 },
  stormText: { color: '#d8f6ff', fontWeight: '900', letterSpacing: 2, fontSize: 11 },
  stormTotal: { color: '#fff3b0', fontWeight: '900', fontSize: 24 },
  light: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#ffffff22' },
  lightOn: { backgroundColor: '#5ad8ff', shadowColor: '#5ad8ff', shadowOpacity: 1, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
  prize: { position: 'absolute', maxWidth: '72%', color: '#3a1c00', fontWeight: '900', textAlign: 'center', textShadowColor: '#fff3b0', textShadowRadius: 1, textShadowOffset: { width: 0, height: 1 } },
  banner: { position: 'absolute', alignSelf: 'center', top: '34%', paddingHorizontal: 30, paddingVertical: 10, borderRadius: 20, borderWidth: 4, borderColor: c.gold, backgroundColor: '#04301fee' },
  mega: { backgroundColor: '#0a4a30ee', shadowColor: '#3affb4', shadowOpacity: 1, shadowRadius: 30, shadowOffset: { width: 0, height: 0 } },
  bannerText: { color: '#ffe58a', fontWeight: '900', fontStyle: 'italic', fontSize: 44, textShadowColor: '#3affb4', textShadowRadius: 18, textShadowOffset: { width: 0, height: 0 } },
});
