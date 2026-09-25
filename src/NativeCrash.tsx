import React, { useEffect, useRef, useState } from 'react';
import { AppState, LayoutChangeEvent, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { randomUUID } from 'expo-crypto';
import { LinearGradient } from 'expo-linear-gradient';
import { Game, request } from './api';
import { s } from './styles';
import { Tap } from './Tap';
import { c as t, feel } from './theme';
import { Win, WinCelebration } from './WinCelebration';
import { LandscapeGame } from './LandscapeGame';
import { GameHistory } from './GameHistory';

type Ticket = { panel: number; stake: number; payout: number; collectedAt: number | null; status: string };
type Flight = { id: string; serverTime: string; startedAt: string; status: 'FLYING' | 'COLLECTED' | 'CRASHED'; multiplier: number; tickets: Ticket[]; growthRate?: number };
type Attempt = { requestId: string; stakeOne: number; stakeTwo: number };
/** Where the local clock stands against the server's, and how fast this flight climbs. */
type Anchor = { id: string; started: number; offset: number; growth: number };

const SEGMENTS = 36;
const FRAME_MS = 33;

/**
 * Ascent Crash. The server decides everything: when a flight ends and what a cash-out pays. The screen flies the
 * plane on the same curve the server uses (e^(growth × seconds) from the server's start time, corrected for the
 * difference between the two clocks), so the climb is smooth between the half-second status checks instead of
 * jumping. The number shown is never an authority: a cash-out pays what the server says when it receives it.
 */
export function NativeCrash({ game, token, userId, onClose, onSettled }: { game: Game; token: string; userId: string; onClose: () => void; onSettled: () => void }) {
  const [stakes, setStakes] = useState([String(game.minStake), '0']), [round, setRound] = useState<Flight | null>(null), [history, setHistory] = useState<Flight[]>([]);
  const [attempt, setAttempt] = useState<Attempt | null>(null), [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [win, setWin] = useState<Win | null>(null), [played, setPlayed] = useState(0);
  const [live, setLive] = useState(1), [elapsed, setElapsed] = useState(0), [size, setSize] = useState({ w: 0, h: 0 });
  const alive = useRef(true), lock = useRef(false), polling = useRef(false), version = useRef(0), anchor = useRef<Anchor | null>(null);
  const callback = useRef(onSettled); callback.current = onSettled;
  const confirmed = useRef(1); confirmed.current = round?.multiplier ?? 1;
  const key = `crash-attempt-${userId}`;

  async function persist(a: Attempt | null) { if (Platform.OS === 'web') { if (a) localStorage.setItem(key, JSON.stringify(a)); else localStorage.removeItem(key); } else if (a) await SecureStore.setItemAsync(key, JSON.stringify(a)); else await SecureStore.deleteItemAsync(key); }
  function apply(next: Flight) {
    if (!alive.current) return;
    if (next.status === 'FLYING') anchor.current = { id: next.id, started: Date.parse(next.startedAt), offset: Date.parse(next.serverTime) - Date.now(), growth: next.growthRate ?? 0.12 };
    setRound(previous => {
      if (previous?.id === next.id && previous.status === 'FLYING' && next.status === 'CRASHED') feel('warn');
      return next;
    });
    setError(''); setHistory(previous => [next, ...previous.filter(r => r.id !== next.id)].slice(0, 20));
    if (next.status !== 'FLYING') { setPlayed(n => n + 1); callback.current(); }
  }
  async function restore() {
    setError('');
    try {
      const saved = Platform.OS === 'web' ? localStorage.getItem(key) : await SecureStore.getItemAsync(key);
      const a: Attempt | null = saved ? JSON.parse(saved) : null;
      const flights = await request<Flight[]>('/api/crash', token);
      if (!alive.current) return;
      setAttempt(a); setHistory(flights);
      const current = flights.find(f => f.status === 'FLYING') || flights[0] || null;
      if (current?.status === 'FLYING') apply(current); else setRound(current);
      setReady(true);
    } catch (e) { if (alive.current) setError((e as Error).message); }
  }
  useEffect(() => { alive.current = true; void restore(); return () => { alive.current = false; version.current++; }; }, []);

  async function status() {
    if (!round || lock.current || polling.current) return;
    polling.current = true; const v = version.current;
    try { const next = await request<Flight>(`/api/crash/${encodeURIComponent(round.id)}`, token); if (v === version.current) apply(next); }
    catch { if (alive.current) setError('Connection interrupted. The screen shows the last confirmed status; a cash-out is not guaranteed.'); }
    finally { polling.current = false; }
  }
  useEffect(() => {
    if (round?.status !== 'FLYING') return;
    const timer = setInterval(() => void status(), 500);
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void status(); });
    return () => { clearInterval(timer); listener.remove(); };
  }, [round?.id, round?.status]);

  // The climb itself, a frame at a time, between the server's answers.
  const flying = round?.status === 'FLYING';
  useEffect(() => {
    if (!flying) return;
    let frame = 0, last = 0;
    const tick = (now: number) => {
      const a = anchor.current;
      if (a && a.id === round?.id && now - last >= FRAME_MS) {
        last = now;
        const seconds = Math.max(0, (Date.now() + a.offset - a.started) / 1000);
        setElapsed(seconds);
        setLive(Math.max(confirmed.current, Math.floor(Math.exp(a.growth * seconds) * 100) / 100));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [flying, round?.id]);

  async function launch() {
    if (lock.current || !ready || (!attempt && flying)) return;
    const values = stakes.map(Number);
    if (!attempt && (stakes.some(v => !/^\d+(\.\d{1,2})?$/.test(v)) || values.some(v => v !== 0 && v < game.minStake) || values[0] + values[1] < game.minStake || values[0] + values[1] > game.maxStake)) {
      setError(`Use zero to skip a panel, otherwise at least ${game.minStake}. Combined maximum ${game.maxStake}.`); feel('warn'); return;
    }
    lock.current = true; version.current++; setBusy(true); setError(''); setWin(null); setLive(1); setElapsed(0);
    try {
      const a = attempt || { requestId: randomUUID(), stakeOne: values[0], stakeTwo: values[1] };
      await persist(a); if (alive.current) setAttempt(a);
      const next = await request<Flight>('/api/crash', token, a);
      await persist(null);
      if (alive.current) { setAttempt(null); apply(next); setPlayed(n => n + 1); callback.current(); }
    } catch (e) { if (alive.current) setError(`${(e as Error).message} Recover keeps the same request and stakes.`); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  async function collect(panel: number) {
    if (lock.current || !flying || !round) return;
    lock.current = true; version.current++; setBusy(true); setError('');
    try {
      const next = await request<Flight>(`/api/crash/${encodeURIComponent(round.id)}/collect/${panel}`, token, {});
      apply(next);
      // Only a server-confirmed collection is celebrated; the displayed multiplier is never the authority.
      const paid = next.tickets.find(x => x.panel === panel);
      if (paid && paid.payout > 0) { feel('win'); setWin({ payout: paid.payout, stake: paid.stake, multiplier: Number((paid.payout / (paid.stake || 1)).toFixed(2)), currency: '', id: `${next.id}-${panel}-${paid.payout}` }); }
      setPlayed(n => n + 1); callback.current();
    } catch { if (alive.current) setError('Cash-out not confirmed. Retry the same panel; only the server can confirm it.'); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }

  // ---- The flight on screen ----
  const shown = flying ? live : round?.multiplier ?? 1;
  // A finished flight is drawn to where it ended: the crash point, or the last cash-out.
  const seconds = flying ? elapsed : round && anchor.current?.id === round.id ? Math.log(Math.max(1, shown)) / (round.growthRate ?? 0.12) : 0;
  const growth = round?.growthRate ?? 0.12;
  const span = Math.max(8, seconds * 1.2), top = Math.max(2, shown * 1.25);
  // The top of the sky belongs to the multiplier; the curve climbs underneath it.
  const pad = { left: 34, right: 44, top: 128, bottom: 28 };
  const point = (second: number) => {
    const m = Math.exp(growth * second);
    return { x: pad.left + (second / span) * (size.w - pad.left - pad.right), y: size.h - pad.bottom - ((Math.min(m, top) - 1) / (top - 1)) * (size.h - pad.top - pad.bottom) };
  };
  const trail = round && seconds > 0 && size.w ? Array.from({ length: SEGMENTS }, (_, i) => [point(seconds * i / SEGMENTS), point(seconds * (i + 1) / SEGMENTS)]) : [];
  const head = trail.length ? trail[trail.length - 1][1] : { x: pad.left, y: size.h - pad.bottom };
  const angle = trail.length ? Math.atan2(trail[trail.length - 1][0].y - head.y, head.x - trail[trail.length - 1][0].x) : 0;
  const crashed = round?.status === 'CRASHED', collected = round?.status === 'COLLECTED';
  const tone = crashed ? '#ef7b6b' : collected ? t.win : t.gold;
  const open = round?.tickets.filter(x => x.status === 'OPEN') ?? [];
  const recent = history.filter(f => f.status !== 'FLYING').slice(0, 10);
  const measure = (e: LayoutChangeEvent) => { const { width, height } = e.nativeEvent.layout; setSize({ w: width, h: height }); };

  const total = stakes.map(Number).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  const quick = [...new Set([game.minStake, 1, 2, 5].filter(v => v >= game.minStake && v <= game.maxStake))];

  return <LandscapeGame stage={0.62} stageItems={2} below={<GameHistory token={token} game={game} refresh={played} />}>
    <View style={x.topBar}>
      <Tap haptic="select" disabled={busy} onPress={onClose} style={s.inlineButton}><Text style={s.link}>‹ Back</Text></Tap>
      <Text numberOfLines={1} style={[s.title, { flex: 1, fontSize: 20 }]}>{game.name}</Text>
      <View style={[x.liveDot, flying && { backgroundColor: t.win }]} /><Text style={s.kicker}>{flying ? 'IN FLIGHT' : 'READY'}</Text>
    </View>

    <LinearGradient colors={['#3a0f5e', '#1c0b4d', '#0e0822']} style={x.sky} onLayout={measure}>
      {[0.25, 0.5, 0.75].map(f => <View key={f} style={[x.gridLine, { top: pad.top + f * (size.h - pad.top - pad.bottom) }]} />)}
      <View style={[x.axis, { left: pad.left, bottom: pad.bottom, width: Math.max(0, size.w - pad.left - 12) }]} />
      <View style={[x.axisY, { left: pad.left, bottom: pad.bottom, top: pad.top - 20 }]} />
      {/* Recent crash points, newest first, coloured by how far each flight went. */}
      <View style={x.recent}>{recent.map(f => <View key={f.id} style={[x.recentChip, { backgroundColor: f.status === 'COLLECTED' ? '#2ee57a22' : f.multiplier >= 2 ? '#ffd23f1f' : '#ef7b6b1c' }]}>
        <Text style={[x.recentText, { color: f.status === 'COLLECTED' ? t.win : f.multiplier >= 2 ? t.gold : '#ef9a8c' }]}>{f.multiplier.toFixed(2)}×</Text></View>)}</View>

      {trail.map(([a, b], i) => {
        const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
        return <View key={i} style={[x.segment, { width: length + 1, left: (a.x + b.x) / 2 - (length + 1) / 2, top: (a.y + b.y) / 2 - 1.5, backgroundColor: tone, opacity: 0.35 + 0.65 * (i / SEGMENTS), transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }] }]} />;
      })}
      {size.w > 0 && <Text style={[x.plane, { left: head.x - 20, top: head.y - 26, color: tone, transform: [{ rotate: crashed ? '0deg' : `${-Math.min(angle, 1.2)}rad` }] }]}>{crashed ? '💥' : '✈'}</Text>}

      <View pointerEvents="none" style={x.center}>
        <Text accessibilityLiveRegion="polite" style={[x.multiplier, { color: crashed ? '#ef7b6b' : collected ? t.win : '#fff1d2' }]}>{shown.toFixed(2)}×</Text>
        <Text style={[x.caption, { color: tone }]}>{crashed ? 'FLEW AWAY' : collected ? 'CASHED OUT' : flying ? 'CLIMBING' : round ? 'PLACE YOUR NEXT BET' : 'PLACE YOUR BET'}</Text>
      </View>

      <WinCelebration win={win} />
    </LinearGradient>

    {/* The one big button: Launch before a flight, Cash out during one. Top of the column, never scrolled away. */}
    {flying && open.length > 0 ? <View style={x.cashRow}>{open.map(ticket => <Tap key={ticket.panel} haptic="heavy" disabled={busy} onPress={() => void collect(ticket.panel)} style={x.cashButton}>
        <Text style={x.cashLabel}>CASH OUT{open.length > 1 ? ` · BET ${ticket.panel}` : ''}</Text>
        <Text style={x.cashValue}>≈ {(ticket.stake * shown).toFixed(2)}</Text>
      </Tap>)}</View>
      : <Tap haptic="heavy" disabled={busy || !ready || (!attempt && flying)} onPress={launch} style={[x.launch, (busy || !ready || (!attempt && flying)) && { opacity: 0.45 }]}>
        <Text style={x.launchText}>{busy ? 'Please wait…' : attempt ? 'Recover flight' : flying ? 'Flight in progress' : `Launch · ${total.toFixed(2)}`}</Text>
      </Tap>}
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {!ready && <Tap onPress={restore} style={s.secondary}><Text style={s.secondaryText}>Reload flights</Text></Tap>}
    {attempt && <Text style={s.muted}>Unresolved launch: {attempt.stakeOne.toFixed(2)} + {attempt.stakeTwo.toFixed(2)}. Recover it before starting another flight.</Text>}

    {[0, 1].map(index => {
      const ticket = round?.tickets.find(x => x.panel === index + 1);
      const value = attempt ? String(index === 0 ? attempt.stakeOne : attempt.stakeTwo) : stakes[index];
      const editable = !busy && !attempt && !flying;
      return <View key={index} style={x.panel}>
        <View style={x.panelHead}><Text style={s.kicker}>BET {index + 1}</Text>
          {ticket && ticket.status !== 'UNUSED' && <Text style={[x.ticket, ticket.status === 'COLLECTED' && { color: t.win }, ticket.status === 'LOST' && { color: '#ef9a8c' }]}>
            {ticket.status === 'OPEN' ? `In flight · ${ticket.stake.toFixed(2)}` : ticket.status === 'COLLECTED' ? `Won ${ticket.payout.toFixed(2)} @ ${ticket.collectedAt?.toFixed(2)}×` : `Lost ${ticket.stake.toFixed(2)}`}</Text>}
        </View>
        <TextInput accessibilityLabel={`Bet ${index + 1} stake`} keyboardType="decimal-pad" value={value} editable={editable}
          onChangeText={v => setStakes(old => old.map((o, i) => i === index ? v : o))} style={[s.input, x.stake, !editable && { opacity: 0.6 }]} />
        <View style={x.stakeRow}>
          {index === 1 && <Tap haptic="select" disabled={!editable} onPress={() => setStakes(old => [old[0], '0'])} style={x.quick}><Text style={x.quickText}>Off</Text></Tap>}
          {quick.slice(0, index === 1 ? 3 : 4).map(v => <Tap key={v} haptic="select" disabled={!editable} onPress={() => setStakes(old => old.map((o, i) => i === index ? v.toFixed(2) : o))} style={x.quick}><Text style={x.quickText}>{v.toFixed(v < 1 ? 2 : 0)}</Text></Tap>)}
        </View>
      </View>;
    })}

    <Text style={s.small}>Set a panel to Off to fly with one bet. Launch debits both stakes. A cash-out pays at the multiplier when the server receives it, not the one on screen. Leaving this screen does not stop the flight. No autoplay or automatic cash-out.</Text>
  </LandscapeGame>;
}

const x = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#6d6878' },
  sky: { height: 300, borderRadius: 18, borderWidth: 1, borderColor: '#22e1ff66', overflow: 'hidden' },
  gridLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: '#ffffff0a' },
  axis: { position: 'absolute', height: 1, backgroundColor: '#bdc6d533' },
  axisY: { position: 'absolute', width: 1, backgroundColor: '#bdc6d533' },
  recent: { position: 'absolute', top: 10, left: 10, right: 10, flexDirection: 'row', gap: 6, overflow: 'hidden' },
  recentChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  recentText: { fontSize: 11, fontWeight: '800' },
  segment: { position: 'absolute', height: 3, borderRadius: 2 },
  plane: { position: 'absolute', width: 40, textAlign: 'center', fontSize: 34 },
  center: { position: 'absolute', left: 0, right: 0, top: 38, alignItems: 'center' },
  multiplier: { fontSize: 58, fontWeight: '900', letterSpacing: -1, fontVariant: ['tabular-nums'] },
  caption: { fontSize: 12, fontWeight: '800', letterSpacing: 2 },
  cashRow: { flexDirection: 'row', gap: 8 },
  cashButton: { flex: 1, minHeight: 58, borderRadius: 14, backgroundColor: '#2ee57a', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#9ff0c4' },
  cashLabel: { color: '#08251a', fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  cashValue: { color: '#08251a', fontSize: 18, fontWeight: '900' },
  panel: { gap: 8, padding: 12, borderRadius: 14, backgroundColor: t.surface, borderWidth: 1, borderColor: t.line },
  panelHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  ticket: { color: t.gold, fontSize: 12, fontWeight: '700' },
  stakeRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  stake: { minHeight: 44, paddingVertical: 8, paddingHorizontal: 12, fontSize: 16 },
  quick: { flex: 1, minWidth: 44, minHeight: 44, paddingHorizontal: 8, borderRadius: 10, borderWidth: 1, borderColor: t.lineStrong, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2e1660' },
  quickText: { color: t.gold, fontWeight: '800', fontSize: 13 },
  launch: { minHeight: 56, borderRadius: 14, backgroundColor: t.gold, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff0c4' },
  launchText: { color: t.goldInk, fontWeight: '900', fontSize: 16, letterSpacing: 0.5 },
});
