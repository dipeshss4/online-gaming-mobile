import React, { useEffect, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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

/**
 * The scratch tickets in the app: Triple Match (nine prize spots and a Tripler box) and Lotería (a 4x4 tabla and ten
 * called cards). Buying a ticket is one bet, settled by the server at once; the ticket arrives covered in silver and
 * the player rubs the spots off with a finger (any spot the finger passes over clears) or reveals it all.
 */
export const supportsScratch = (game: Game) => ['SCRATCH_MATCH3', 'SCRATCH_LOTERIA'].includes(game.engine?.layout ?? '');
const LOTERIA: Record<string, [string, string]> = {
  EL_GALLO: ['🐓', 'El Gallo'], LA_DAMA: ['💃', 'La Dama'], EL_SOL: ['☀️', 'El Sol'], LA_LUNA: ['🌙', 'La Luna'], LA_ESTRELLA: ['⭐', 'La Estrella'],
  EL_CORAZON: ['❤️', 'El Corazón'], LA_SIRENA: ['🧜‍♀️', 'La Sirena'], LA_ROSA: ['🌹', 'La Rosa'], EL_PESCADO: ['🐟', 'El Pescado'], LA_SANDIA: ['🍉', 'La Sandía'],
  EL_ARBOL: ['🌳', 'El Árbol'], LA_CORONA: ['👑', 'La Corona'], EL_BARRIL: ['🛢️', 'El Barril'], LA_MANO: ['✋', 'La Mano'], EL_VALIENTE: ['🗡️', 'El Valiente'],
  EL_GORRITO: ['👒', 'El Gorrito'], LA_CALAVERA: ['💀', 'La Calavera'], EL_ALACRAN: ['🦂', 'El Alacrán'], LA_BANDERA: ['🚩', 'La Bandera'], EL_MUSICO: ['🎺', 'El Músico'],
  LA_ARANA: ['🕷️', 'La Araña'], EL_PARAGUAS: ['☂️', 'El Paraguas'], EL_NOPAL: ['🌵', 'El Nopal'], LA_CAMPANA: ['🔔', 'La Campana'],
};
const CHARM: Record<string, string> = { STAR: '★', CLOVER: '☘', HORSESHOE: 'U', DIAMOND: '◆' };
const LINES = [[0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10, 11], [12, 13, 14, 15], [0, 4, 8, 12], [1, 5, 9, 13], [2, 6, 10, 14], [3, 7, 11, 15], [0, 5, 10, 15], [3, 6, 9, 12]];
const cash = (n: number) => n.toFixed(2);

/** A spot under silver coating; it fades away when {@code revealed} turns true. */
function Spot({ revealed, width, height, lit, children }: { revealed: boolean; width: number; height: number; lit?: boolean; children: React.ReactNode }) {
  const coat = useRef(new Animated.Value(revealed ? 0 : 1)).current;
  useEffect(() => { Animated.timing(coat, { toValue: revealed ? 0 : 1, duration: revealed ? 260 : 0, useNativeDriver: true }).start(); }, [revealed]); // eslint-disable-line react-hooks/exhaustive-deps
  return <View style={[n.spot, { width, height }, lit && n.lit]}>
    <View style={n.under}>{children}</View>
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: coat }]}>
      <LinearGradient colors={['#e2e6ee', '#9aa1b2', '#f2f4f8', '#8a91a3']} locations={[0, .45, .55, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <Text style={[n.coatText, { fontSize: Math.max(11, Math.min(height * .14, width * .13)) }]}>SCRATCH</Text>
    </Animated.View>
  </View>;
}

function LoteriaCard({ card, width, height, marked, called }: { card: string; width: number; height: number; marked?: boolean; called?: boolean }) {
  const [glyph, name] = LOTERIA[card] ?? ['?', card];
  return <View style={[n.card, { width, height }, called && { borderColor: '#0b6b3a' }]}>
    <Text style={{ fontSize: width * (width < 70 ? .58 : .5), marginTop: width < 70 ? 'auto' : 0, marginBottom: width < 70 ? 'auto' : 0 }}>{glyph}</Text>
    {/* A small card shows its picture alone; its name would be too small to read. */}
    {width >= 70 && <Text style={[n.cardName, { fontSize: Math.max(11, width * .12) }]} numberOfLines={1}>{name}</Text>}
    {marked && <View style={[n.bean, { width: width * .44, height: width * .44, borderRadius: width, top: height * .14 }]} />}
  </View>;
}

export function NativeScratch({ game, token, userId, initialBalance, onClose, onSettled }: { game: Game; token: string; userId: string; initialBalance: Balance | null; onClose: () => void; onSettled: () => void }) {
  const loteria = game.engine?.layout === 'SCRATCH_LOTERIA';
  const [stake, setStake] = useState(game.minStake), [wallet, setWallet] = useState(initialBalance);
  const [pending, setPending] = useState<PendingBet | null>(null), [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [ticket, setTicket] = useState<PlayResult | null>(null), [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [win, setWin] = useState<Win | null>(null);
  const alive = useRef(true), lock = useRef(false), settled = useRef<PlayResult | null>(null);
  // Where each spot is on screen (page coordinates), so a finger dragged across the ticket clears what it touches.
  const frames = useRef<Map<number, { x: number; y: number; w: number; h: number }>>(new Map());
  const refs = useRef<Map<number, View | null>>(new Map());
  useEffect(() => {
    alive.current = true;
    readPending(userId).then(value => { if (alive.current) { setPending(value); setReady(true); } }).catch(() => setError('Cannot read saved bet. Play is locked to prevent duplicate bets.'));
    return () => { alive.current = false; };
  }, [userId]);
  const all = !!ticket && revealed.size >= 10;

  // The win and the balance land once the ticket is fully scratched.
  useEffect(() => {
    if (!all || !settled.current) return;
    const data = settled.current; settled.current = null;
    setWallet(current => current ? { ...current, balance: data.balance, currency: data.currency } : current);
    feel(data.payout > 0 ? 'win' : 'tap'); sound.result(data.payout > 0 ? data.multiplier : 0);
    if (data.payout > 0) setWin({ payout: data.payout, stake: data.stake, multiplier: data.multiplier, currency: data.currency, id: data.betId });
    onSettled();
  }, [all]); // eslint-disable-line react-hooks/exhaustive-deps

  const reveal = (i: number) => setRevealed(previous => previous.has(i) ? previous : (sound.play('tap'), new Set(previous).add(i)));
  const measureAll = () => refs.current.forEach((view, i) => view?.measure((_x, _y, w, h, px, py) => frames.current.set(i, { x: px, y: py, w, h })));
  const touch = (x: number, y: number) => frames.current.forEach((f, i) => { if (x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h) reveal(i); });
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true, onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: event => { measureAll(); touch(event.nativeEvent.pageX, event.nativeEvent.pageY); },
    onPanResponderMove: event => touch(event.nativeEvent.pageX, event.nativeEvent.pageY),
  })).current;

  async function buy() {
    if (lock.current || !ready || (pending && pending.gameCode !== game.code)) return;
    if (!pending && wallet && stake > wallet.balance) { setError('Insufficient available balance.'); return; }
    lock.current = true; setBusy(true); setError(''); setWin(null);
    let submitted = false;
    try {
      const bet = pending || { gameCode: game.code, requestId: randomUUID(), stake };
      await savePending(userId, bet); setPending(bet); submitted = true;
      sound.play('chime');
      const data = await request<PlayResult>(`/api/games/${encodeURIComponent(game.code)}/play`, token, { requestId: bet.requestId, stake: bet.stake });
      if (data.requestId !== bet.requestId || data.gameCode !== game.code || data.symbols.length !== (loteria ? 26 : 10)) throw new Error('Unexpected result. Keep this request for reconciliation.');
      await clearPending(userId); setPending(null);
      if (!alive.current) return;
      settled.current = data; setTicket(data); setRevealed(new Set());
    } catch (e) {
      if (!alive.current) return;
      if (!pending && e instanceof ApiError && [400, 401, 403, 404, 422, 429].includes(e.status)) await clearPending(userId).then(() => setPending(null)).catch(() => {});
      feel('warn'); setError(`${e instanceof Error ? e.message : 'Unable to play'}${submitted ? ' If a bet is pending, use Recover with the same request ID.' : ''}`);
    } finally { lock.current = false; if (alive.current) setBusy(false); }
  }

  const symbols = ticket?.symbols ?? [];
  const matched = !loteria && all ? ['P100', 'P30', 'P10', 'P3', 'P1'].find(p => symbols.slice(0, 9).filter(x => x === p).length >= 3) : undefined;
  const tabla = symbols.slice(0, 16), calls = symbols.slice(16);
  const calledNow = new Set(calls.filter((_, i) => revealed.has(i)));
  const marked = new Set(tabla.map((card, i) => calledNow.has(card) ? i : -1).filter(i => i >= 0));
  const lit = all ? new Set(LINES.filter(line => line.every(cell => marked.has(cell))).flat()) : new Set<number>();
  const status = !ticket ? 'BUY A TICKET TO PLAY' : !all ? 'RUB THE SILVER TO SCRATCH' : ticket.payout > 0 ? `YOU WON ${cash(ticket.payout)}!` : 'NOT A WINNER · TRY AGAIN';
  const setRef = (i: number) => (view: View | null) => { refs.current.set(i, view); };

  return <GameShell game={game} balance={wallet} onBack={onClose} backDisabled={busy} status={status}
    notice={error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text>
      : pending && !busy ? `Pending: ${pending.gameCode} · ${cash(pending.stake)}. ${pending.gameCode !== game.code ? 'Open that game to recover the ticket.' : 'BUY resends this exact ticket, not a new one.'}` : undefined}
    bet={<BetBar inline label="TICKET PRICE" value={pending ? pending.stake : stake} onChange={setStake} min={game.minStake} max={game.maxStake} disabled={busy || !!pending || (!!ticket && !all)} />}
    win={cash(all && ticket ? ticket.payout : 0)}
    spin={ticket && !all
      ? { label: 'OPEN', accessibilityLabel: 'Reveal all', onPress: () => setRevealed(new Set(Array.from({ length: 10 }, (_, i) => i))) }
      : { busy, label: busy ? 'BUY' : pending ? 'RECOVER' : 'BUY', accessibilityLabel: pending ? 'Recover ticket' : 'Buy ticket', onPress: buy, disabled: busy || !ready || (!!pending && pending.gameCode !== game.code) }}
    overlay={<><WinCelebration win={win} /><BigWin win={win} /></>}
    info={<>
      {game.engine?.paytable?.map((line, i) => <PayRow key={i} label={line.label} pays={`${line.multiplier}×`} />)}
      {!loteria && <PayRow label="3X in the Tripler box" pays="×3" />}
      <Rules rules={game.engine?.rules} />
    </>}>
    {stage => {
      if (!loteria) {
        // Nine spots and the Tripler box, as big as the stage allows.
        const cell = Math.floor(Math.min((stage.height - 76) / 3, (stage.width * .6) / 3.5));
        return <LinearGradient colors={['#2a63e8', '#1a46bd']} style={n.ticket} {...pan.panHandlers}>
          <View style={n.art}><Text style={n.artSmall}>INSTANT</Text><Text style={[n.artTitle, { fontSize: cell * .42 }]}>TRIPLE</Text><Text style={[n.artTitle, n.artGold, { fontSize: cell * .42 }]}>MATCH</Text>
            <Text style={n.artNote}>Find a 3X to win{'\n'}TRIPLE the prize</Text><Text style={n.upTo}>WIN UP TO {cash(300 * (ticket?.stake ?? stake))}</Text></View>
          <View style={[n.grid, { width: cell * 1.15 * 3 + 6 * 2 + 16 + 6 }]}>{Array.from({ length: 9 }, (_, i) => <View key={i} ref={setRef(i)} collapsable={false}>
            <Spot revealed={!ticket || revealed.has(i)} width={cell * 1.15} height={cell} lit={!!matched && symbols[i] === matched}>
              <Text style={[n.prize, { fontSize: cell * .26 }]}>{ticket ? cash(Number(symbols[i].slice(1)) * ticket.stake) : '$'}</Text></Spot></View>)}</View>
          <View style={{ alignItems: 'center', gap: 4 }}><Text style={n.boxLabel}>TRIPLER BOX</Text>
            <View ref={setRef(9)} collapsable={false}><Spot revealed={!ticket || revealed.has(9)} width={cell * 1.1} height={cell * 1.1} lit={!!matched && symbols[9] === 'X3'}>
              <LinearGradient colors={['#ffb01f', '#ff7a1a']} style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={[n.x3, { fontSize: cell * .4 }]}>{!ticket || symbols[9] === 'X3' ? '3X' : CHARM[symbols[9]] ?? '★'}</Text></LinearGradient></Spot></View>
            <Text style={n.boxNote}>Match 3 to win</Text></View>
        </LinearGradient>;
      }
      // Lotería: the tabla beside the ten called cards.
      const cardW = Math.floor(Math.min((stage.height - 70) / 4 / 1.3, stage.width * .3 / 4));
      const callW = Math.floor(Math.min((stage.height - 60) / 2 / 1.3, (stage.width - cardW * 4 - 80) / 5.4));
      return <LinearGradient colors={['#0b6b3a', '#06401f']} style={n.ticket} {...pan.panHandlers}>
        <View style={n.tabla}><Text style={n.loTitle}>¡LOTERÍA!</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: cardW * 4 + 12, gap: 4 }}>{Array.from({ length: 16 }, (_, i) => <View key={i} style={lit.has(i) ? n.lit : undefined}>
            {ticket ? <LoteriaCard card={tabla[i]} width={cardW} height={cardW * 1.3} marked={marked.has(i)} /> : <View style={[n.card, { width: cardW, height: cardW * 1.3 }]}><Text style={n.back}>?</Text></View>}</View>)}</View></View>
        <View style={{ gap: 6, alignItems: 'center' }}><Text style={n.callsLabel}>CALLED CARDS</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: callW * 5 + 24, gap: 6 }}>{Array.from({ length: 10 }, (_, i) => <View key={i} ref={setRef(i)} collapsable={false}>
            <Spot revealed={!ticket || revealed.has(i)} width={callW} height={callW * 1.3}>{ticket ? <LoteriaCard card={calls[i]} width={callW} height={callW * 1.3} called /> : <Text style={n.back}>¡L!</Text>}</Spot></View>)}</View>
          <Text style={n.loPays}>Corners 2x · Line 4x · Diagonal 10x · Two lines 25x · Big X 100x</Text></View>
      </LinearGradient>;
    }}
  </GameShell>;
}

const n = StyleSheet.create({
  ticket: { userSelect: 'none', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 12, borderRadius: 18, borderWidth: 3, borderColor: c.gold },
  art: { alignItems: 'flex-start', gap: 2, maxWidth: 170 },
  artSmall: { color: '#cfe6ff', fontSize: 11, fontWeight: '800', letterSpacing: 3 },
  artTitle: { color: '#fff', fontWeight: '900', fontStyle: 'italic', textShadowColor: '#b0105a', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0 },
  artGold: { color: c.gold, textShadowColor: '#b06a0f' },
  artNote: { color: '#fff', fontWeight: '800', fontSize: 12 },
  upTo: { marginTop: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 2, borderColor: c.gold, color: '#ffe45c', fontWeight: '900', fontSize: 11, overflow: 'hidden' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 8, borderRadius: 14, borderWidth: 3, borderColor: '#ffb01f', backgroundColor: '#0b2a7a' },
  spot: { borderRadius: 10, overflow: 'hidden', backgroundColor: '#fff8e6', borderWidth: 2, borderColor: '#ffffff55' },
  under: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  coatText: { position: 'absolute', alignSelf: 'center', top: '42%', color: '#6a7184', fontWeight: '900' },
  lit: { borderColor: c.gold, borderWidth: 3, borderRadius: 10, shadowColor: c.gold, shadowOpacity: 1, shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, elevation: 6 },
  prize: { color: '#b0105a', fontWeight: '900' },
  boxLabel: { color: c.gold, fontWeight: '900', letterSpacing: 2, fontSize: 11 },
  boxNote: { color: '#fff', fontWeight: '800', fontSize: 11 },
  x3: { color: '#fff', fontWeight: '900', textShadowColor: '#b0105a', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  tabla: { padding: 8, borderRadius: 12, backgroundColor: '#fff7e0', borderWidth: 3, borderColor: '#c0187a', alignItems: 'center', gap: 4 },
  loTitle: { color: '#c0187a', fontWeight: '900', fontStyle: 'italic', fontSize: 22, letterSpacing: 2 },
  card: { alignItems: 'center', justifyContent: 'space-between', paddingVertical: 3, borderRadius: 4, borderWidth: 2, borderColor: '#e3462a', backgroundColor: '#fffdf5' },
  cardName: { color: '#2a1a0a', fontWeight: '900', textTransform: 'uppercase', paddingHorizontal: 2 },
  bean: { position: 'absolute', alignSelf: 'center', backgroundColor: '#a0400a', borderWidth: 2, borderColor: '#ffb08a', opacity: .92 },
  back: { color: '#c0187a', fontWeight: '900', fontStyle: 'italic', fontSize: 20, alignSelf: 'center', marginTop: '30%' },
  callsLabel: { color: '#ffe45c', fontWeight: '900', letterSpacing: 2, fontSize: 12 },
  loPays: { color: '#e8ffe8', fontSize: 11, fontWeight: '800' },
});
