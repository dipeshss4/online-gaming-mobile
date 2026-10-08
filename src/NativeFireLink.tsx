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
import { sound } from './sound';
import { SymbolArt } from './WebLook';
import { GameShell, PayRow, Rules } from './GameShell';
import { usePace } from './playControls';

/**
 * Break the Bank in the app: five reels of four rows, then the Fire Link. The round comes whole from the server
 * (FireLinkEngine); this spins the reels onto its board, lights the rows that paid, then plays the respins: locked
 * fireballs glow on a dark board, new ones drop in, the three respin lights reset, and a full board wins the GRAND.
 */
export const supportsFireLink = (game: Game) => game.engine?.layout === 'FIRE_LINK';
const REELS = 5, ROWS = 4, CELLS = 20;
const PAYS: Record<string, number[]> = { SEVEN: [6, 25, 100], BAR: [4, 12, 50], BELL: [2.5, 8, 25], STAR: [2, 5, 15], ORANGE: [1.2, 4, 10], CHERRY: [.8, 2.5, 6] };
const BALLS: Record<string, number> = { F1: 1, F2: 2, F3: 3, F5: 5, F8: 8, F10: 10, MINI: 25, MINOR: 50, MAJOR: 150 };
const ART: Record<string, number> = { FIRE: require('../assets/firelink/FIRE.png'), MINI: require('../assets/firelink/MINI.png'), MINOR: require('../assets/firelink/MINOR.png'), MAJOR: require('../assets/firelink/MAJOR.png') };
const STRIP = ['SEVEN', 'BAR', 'F5', 'BELL', 'STAR', 'WILD', 'ORANGE', 'CHERRY', 'MINI', 'F2'];
const isBall = (cell: string) => cell in BALLS;
const cash = (n: number) => n.toFixed(2);
/** A prize as short as it can be written: 0.4, 2, 1.5 (a fireball has no room for 0.40). */
const short = (n: number) => String(Math.round(n * 100) / 100);
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function rowPay(line: string[]) {
  const target = line.find(cell => cell !== 'WILD');
  if (!target) return PAYS.SEVEN[2] * 2;
  if (!(target in PAYS)) return 0;
  let count = 0;
  while (count < REELS && (line[count] === target || line[count] === 'WILD')) count++;
  return count >= 3 ? PAYS[target][count - 3] : 0;
}
function parseRound(symbols: string[]) {
  const base = symbols.slice(0, CELLS), respins: [number, string][][] = [];
  for (const token of symbols.slice(CELLS)) {
    if (token === 'R') respins.push([]);
    else if (token.includes(':')) { const [cell, ball] = token.split(':'); respins[respins.length - 1].push([Number(cell), ball]); }
  }
  return { base, link: symbols.includes('LINK'), respins, grand: symbols.includes('GRAND') };
}

/** A cell's art: a fireball with its prize, the wild, or a classic symbol. */
function Cell({ cell, size, stake }: { cell: string; size: number; stake: number }) {
  if (isBall(cell)) {
    const jackpot = ['MINI', 'MINOR', 'MAJOR'].includes(cell);
    return <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={jackpot ? `${cell} jackpot` : `fireball ${cash(BALLS[cell] * stake)}`}>
      <Image source={ART[jackpot ? cell : 'FIRE']} style={{ width: size * 1.1, height: size * 1.1 }} resizeMode="contain" />
      <Text style={[f.ballText, { fontSize: Math.max(11, size * (jackpot ? .17 : .26)) }, jackpot && { color: c.gold }]} numberOfLines={1} adjustsFontSizeToFit>{jackpot ? cell : short(BALLS[cell] * stake)}</Text>
    </View>;
  }
  if (cell === 'WILD') return <Image source={require('../assets/video/WILD.png')} style={{ width: size, height: size }} resizeMode="contain" accessibilityLabel="wild" />;
  return <SymbolArt symbol={cell === 'SEVEN' ? '7' : cell} size={size} />;
}

export function NativeFireLink({ game, token, userId, initialBalance, onClose, onSettled }: { game: Game; token: string; userId: string; initialBalance: Balance | null; onClose: () => void; onSettled: () => void }) {
  const [stake, setStake] = useState(game.minStake), [wallet, setWallet] = useState(initialBalance);
  const [pending, setPending] = useState<PendingBet | null>(null), [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [reduced, setReduced] = useState(false);
  const [board, setBoard] = useState<string[]>(() => Array.from({ length: CELLS }, (_, i) => STRIP[(i * 3) % STRIP.length]));
  const [stopped, setStopped] = useState(REELS), [rows, setRows] = useState<number[]>([]);
  const [link, setLink] = useState(false), [locked, setLocked] = useState<Set<number>>(new Set()), [fresh, setFresh] = useState<Set<number>>(new Set());
  const [left, setLeft] = useState(3), [linkTotal, setLinkTotal] = useState(0), [banner, setBanner] = useState<string | null>(null);
  const [meter, setMeter] = useState(0), [win, setWin] = useState<Win | null>(null), [status, setStatus] = useState('SIX FIREBALLS START THE FIRE LINK');
  const alive = useRef(true), lock = useRef(false), fast = useRef(false);
  const drop = useRef(new Animated.Value(1)).current, slam = useRef(new Animated.Value(0)).current;
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
    lock.current = true; play.pace.begin(); setBusy(true); setError(''); setWin(null); setMeter(0); setRows([]); setLink(false); setLocked(new Set()); setLinkTotal(0); setStopped(0); setStatus('GOOD LUCK!');
    let submitted = false;
    try {
      const bet = pending || { gameCode: game.code, requestId: randomUUID(), stake };
      await savePending(userId, bet); setPending(bet); submitted = true;
      sound.play('spin');
      const data = await request<PlayResult>(`/api/games/${encodeURIComponent(game.code)}/play`, token, { requestId: bet.requestId, stake: bet.stake });
      if (data.requestId !== bet.requestId || data.gameCode !== game.code || data.symbols.length < CELLS) throw new Error('Unexpected result. Keep this request for reconciliation.');
      await clearPending(userId); setPending(null);
      if (!alive.current) return;
      const round = parseRound(data.symbols);
      setBoard(round.base);
      await wait(700);
      for (let reel = 1; reel <= REELS; reel++) { if (!alive.current) return; setStopped(reel); sound.play('reel-land'); await wait(200); }
      const paying = [0, 1, 2, 3].filter(row => rowPay(round.base.slice(row * REELS, row * REELS + REELS)) > 0);
      if (paying.length) {
        setRows(paying); setMeter(paying.reduce((sum, row) => sum + rowPay(round.base.slice(row * REELS, row * REELS + REELS)), 0) * data.stake);
        feel('select'); await wait(1000);
      }
      if (round.link && alive.current) {
        const held = new Set(round.base.map((cell, i) => isBall(cell) ? i : -1).filter(i => i >= 0));
        const cells = [...round.base]; let total = [...held].reduce((sum, i) => sum + BALLS[cells[i]], 0);
        feel('win'); sound.play('bigwin'); await show('FIRE LINK!', 1500);
        setRows([]); setLink(true); setLocked(new Set(held)); setLinkTotal(total * data.stake); setLeft(3);
        let remaining = 3;
        for (const landed of round.respins) {
          if (!alive.current) return;
          sound.play('tease'); await wait(650);
          if (landed.length) {
            for (const [cell, ball] of landed) { cells[cell] = ball; held.add(cell); total += BALLS[ball]; }
            setBoard([...cells]); setLocked(new Set(held)); setFresh(new Set(landed.map(([cell]) => cell))); setLinkTotal(total * data.stake);
            drop.setValue(0); Animated.spring(drop, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }).start();
            sound.play('coins'); feel('heavy'); remaining = 3; setLeft(3); await wait(700); setFresh(new Set());
          } else { remaining -= 1; setLeft(remaining); setStatus(`RESPINS LEFT · ${remaining}`); await wait(350); }
        }
        if (round.grand) await show('GRAND!', 2400);
      }
      if (!alive.current) return;
      setMeter(data.payout); setWallet(current => current ? { ...current, balance: data.balance, currency: data.currency } : current);
      setStatus(data.payout > 0 ? `WIN ${cash(data.payout)}` : 'SIX FIREBALLS START THE FIRE LINK');
      feel(data.payout > 0 ? 'win' : 'tap'); sound.result(data.payout > 0 ? data.multiplier : 0);
      if (data.payout > 0) setWin({ payout: data.payout, stake: data.stake, multiplier: data.multiplier, currency: data.currency, id: data.betId });
      play.pace.report({ payout: data.payout, stake: data.stake, multiplier: data.multiplier });
      onSettled();
    } catch (e) {
      if (!alive.current) return;
      if (!pending && e instanceof ApiError && [400, 401, 403, 404, 422, 429].includes(e.status)) await clearPending(userId).then(() => setPending(null)).catch(() => {});
      feel('warn'); setStatus('SIX FIREBALLS START THE FIRE LINK');
      setError(`${e instanceof Error ? e.message : 'Unable to play'}${submitted ? ' If a bet is pending, use Recover with the same request ID.' : ''}`);
    } finally { lock.current = false; if (alive.current) { setBusy(false); setStopped(REELS); } }
  }

  const jackpots: [string, number][] = [['MINI', 25], ['MINOR', 50], ['MAJOR', 150], ['GRAND', 1000]];
  return <GameShell game={game} play={{ ...play, stake: pending ? pending.stake : stake }} balance={wallet} onBack={onClose} backDisabled={busy} status={link && busy ? `RESPINS LEFT · ${left}` : status}
    notice={error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text>
      : pending && !busy ? `Pending: ${pending.gameCode} · ${cash(pending.stake)}. ${pending.gameCode !== game.code ? 'Open that game to recover the round.' : 'SPIN resends this exact bet, not a new one.'}` : undefined}
    bet={<BetBar inline label="TOTAL BET" value={pending ? pending.stake : stake} onChange={setStake} min={game.minStake} max={game.maxStake} disabled={busy || !!pending} />}
    win={cash(link ? linkTotal + meter : meter)}
    spin={{ busy, label: pending ? 'RECOVER' : 'SPIN', accessibilityLabel: pending ? 'Recover bet' : 'Spin', onPress: spin, disabled: busy || !ready || (!!pending && pending.gameCode !== game.code) }}
    overlay={<>
      {banner && <Animated.View pointerEvents="none" style={[f.banner, banner === 'GRAND!' && f.grand, { transform: [{ scale: slam.interpolate({ inputRange: [0, 1], outputRange: [2.4, 1] }) }], opacity: slam }]}><Text style={[f.bannerText, banner === 'GRAND!' && { fontSize: 64 }]}>{banner}</Text></Animated.View>}
      <WinCelebration win={win} /><BigWin win={win} />
    </>}
    info={<>
      {jackpots.map(([name, x]) => <PayRow key={name} label={`${name} jackpot${name === 'GRAND' ? ': fill all 20' : ''}`} pays={`${x}×`} />)}
      {Object.entries(PAYS).map(([name, p]) => <PayRow key={name} label={`${name} ×3 / ×4 / ×5 on a row`} pays={`${p[0]} / ${p[1]} / ${p[2]}`} />)}
      <Rules rules={game.engine?.rules} />
    </>}>
    {stage => {
      // Jackpots in a column on the left and the Fire Link counter on the right, so the board gets the full height.
      const size = Math.max(36, Math.floor(Math.min((stage.height - 34) / ROWS, (stage.width - 230) / (REELS * 1.2))));
      return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={f.jackpots}>{jackpots.map(([name, x]) => <View key={name} style={[f.jp, name === 'GRAND' && f.jpGrand]}><Text style={[f.jpName, { color: name === 'MINI' ? '#5aff9d' : name === 'MINOR' ? '#5ac8ff' : name === 'MAJOR' ? '#ff8aff' : c.gold }]}>{name}</Text><Text style={f.jpValue}>{cash(x * stake)}</Text></View>)}</View>
        <MarqueeFrame colors={['#ffd08a', '#c0300f', '#3a0802']} bulb="#ffcf80" excited={link || rows.length > 0} reduced={reduced}>
          <View style={[f.board, link && { backgroundColor: '#050000' }]}>
            {Array.from({ length: REELS }, (_, reel) => link
              ? <View key={reel} style={{ width: size * 1.2, gap: 0 }}>{Array.from({ length: ROWS }, (_, row) => { const i = row * REELS + reel;
                return <View key={row} style={[f.linkCell, { height: size }, locked.has(i) && f.lockedCell]}>
                  {locked.has(i) && <Animated.View style={fresh.has(i) ? { transform: [{ scale: drop.interpolate({ inputRange: [0, 1], outputRange: [1.8, 1] }) }], opacity: drop } : undefined}><Cell cell={board[i]} size={size * .92} stake={stake} /></Animated.View>}
                </View>; })}</View>
              : <SpinReel key={reel} index={reel} size={size} width={size * 1.2} reduced={reduced} strip={STRIP} spinning={busy && stopped <= reel}
                cells={Array.from({ length: ROWS }, (_, row) => board[row * REELS + reel])}
                lit={row => rows.includes(row) ? c.gold : null} dim={rows.length > 0}
                render={(cell, cellSize) => <Cell cell={cell} size={cellSize * .86} stake={stake} />} />)}
          </View>
        </MarqueeFrame>
        <View style={[f.linkBar, !link && { opacity: 0 }]} accessibilityElementsHidden={!link}>
          <Text style={f.linkLabel}>RESPINS</Text>
          <View style={f.respins}>{[1, 2, 3].map(n => <View key={n} style={[f.light, n <= left && f.lightOn]} />)}</View>
          <Text style={f.linkLabel}>FIRE LINK</Text><Text style={f.linkTotal} numberOfLines={1} adjustsFontSizeToFit>{cash(linkTotal)}</Text>
        </View>
      </View>;
    }}
  </GameShell>;
}

const f = StyleSheet.create({
  jackpots: { gap: 6, width: 86 },
  jp: { minWidth: 72, alignItems: 'center', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, borderWidth: 1.5, borderColor: c.gold, backgroundColor: '#000000aa' },
  jpGrand: { borderColor: '#ff5a1a', shadowColor: '#ff5a1a', shadowOpacity: 1, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
  jpName: { fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },
  jpValue: { color: '#fff', fontSize: 14, fontWeight: '900' },
  board: { flexDirection: 'row', gap: 4, padding: 2, backgroundColor: '#0a0101' },
  linkCell: { alignItems: 'center', justifyContent: 'center', borderRadius: 6, margin: 1, backgroundColor: '#080101', borderWidth: 1, borderColor: '#3a0a0533' },
  lockedCell: { backgroundColor: '#2a0603', borderColor: '#ff8a2a88' },
  ballText: { position: 'absolute', color: '#fff', fontWeight: '900', paddingHorizontal: 5, borderRadius: 999, backgroundColor: '#000000b0', overflow: 'hidden' },
  linkBar: { width: 96, alignItems: 'center', gap: 6, paddingHorizontal: 6, paddingVertical: 10, borderRadius: 16, borderWidth: 2, borderColor: c.gold, backgroundColor: '#000000aa' },
  respins: { flexDirection: 'row', gap: 6 },
  light: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#3a0a05', borderWidth: 2, borderColor: '#ff8a2a' },
  lightOn: { backgroundColor: '#ffb01f', shadowColor: '#ff8a00', shadowOpacity: 1, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
  linkLabel: { color: '#ff9a5a', fontWeight: '900', letterSpacing: 2, fontSize: 12 },
  linkTotal: { color: '#ffe45c', fontWeight: '900', fontSize: 20 },
  banner: { position: 'absolute', alignSelf: 'center', top: '36%', paddingHorizontal: 30, paddingVertical: 10, borderRadius: 20, borderWidth: 4, borderColor: '#ffb01f', backgroundColor: '#3a0602ee' },
  grand: { borderColor: '#ff5a1a', backgroundColor: '#5a0a02ee' },
  bannerText: { color: '#ffe45c', fontWeight: '900', fontStyle: 'italic', fontSize: 44, textShadowColor: '#ff5a00', textShadowRadius: 18, textShadowOffset: { width: 0, height: 0 } },
});
