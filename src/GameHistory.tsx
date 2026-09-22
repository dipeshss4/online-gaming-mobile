import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ApiError, Game, HistoryItem, HistoryPage, HistoryTotal, request } from './api';
import { s } from './styles';
import { Tap } from './Tap';
import { SymbolArt } from './WebLook';
import { c, radius, sp } from './theme';

/**
 * The player's own rounds: under each game (that game only), and on the History tab (every game, or one).
 *
 * Pages come from /api/bets/history by time cursor, so "Show more" never repeats or skips a round while play
 * continues. A server that predates that endpoint answers 404; the app then shows the latest rounds the older
 * endpoints still give, and says that is all it can show, rather than showing nothing.
 */
const money = (n: number) => n.toFixed(2);
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(2)}`;
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;
const net = (item: HistoryItem) => item.payout - (item.freeSpin ? 0 : item.stake);
const POCKETS: Record<string, string> = { RED: '#a73542', BLACK: '#23232c', GREEN: '#226548' };

function dayLabel(iso: string) {
  const date = new Date(iso), today = new Date();
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((start(today) - start(date)) / 86400000);
  return days === 0 ? 'Today' : days === 1 ? 'Yesterday' : date.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
}

type Legacy = { betId: string; gameCode: string; stake: number; payout: number; symbols?: string[]; multiplier?: number; settledAt: string; balanceAfter?: number };
type LegacyFlight = { id: string; startedAt: string; status: 'FLYING' | 'COLLECTED' | 'CRASHED'; multiplier: number; tickets: { stake: number; payout: number }[] };
const pretty = (code: string) => code.toLowerCase().split('_').map(w => w[0]?.toUpperCase() + w.slice(1)).join(' ');

/** What an older server can still tell us: the latest bets and flights, without totals. */
async function legacyPage(token: string, game: string | null, names: Map<string, string>): Promise<HistoryPage> {
  const crash = game === null || game === 'ASCENT_CRASH';
  const [bets, flights] = await Promise.all([
    game === 'ASCENT_CRASH' ? Promise.resolve({ items: [] as Legacy[] }) : request<{ items: Legacy[] }>('/api/bets?page=0&size=100', token),
    crash ? request<LegacyFlight[]>('/api/crash', token).catch(() => [] as LegacyFlight[]) : Promise.resolve([] as LegacyFlight[]),
  ]);
  const rounds: HistoryItem[] = bets.items.filter(b => !game || b.gameCode === game).map(b => ({
    id: b.betId, kind: 'ROUND', gameCode: b.gameCode, gameName: names.get(b.gameCode) ?? pretty(b.gameCode), stake: b.stake, payout: b.payout,
    multiplier: b.multiplier ?? (b.stake ? b.payout / b.stake : 0), result: b.payout > b.stake ? 'WIN' : b.payout === b.stake ? 'EVEN' : 'LOSS',
    outcome: null, symbols: b.symbols ?? [], notes: [], freeSpin: false, balanceAfter: b.balanceAfter ?? null, playedAt: b.settledAt }));
  const flown: HistoryItem[] = (Array.isArray(flights) ? flights : []).map(f => {
    const stake = f.tickets.reduce((sum, t) => sum + t.stake, 0), payout = f.tickets.reduce((sum, t) => sum + t.payout, 0);
    return { id: f.id, kind: 'CRASH', gameCode: 'ASCENT_CRASH', gameName: names.get('ASCENT_CRASH') ?? 'Ascent Crash', stake, payout,
      multiplier: stake ? payout / stake : 0, result: f.status === 'FLYING' ? 'OPEN' : payout > stake ? 'WIN' : payout === stake ? 'EVEN' : 'LOSS',
      outcome: null, symbols: [], notes: f.status === 'CRASHED' ? [`Crashed at ${f.multiplier.toFixed(2)}×`] : [], freeSpin: false, balanceAfter: null, playedAt: f.startedAt };
  });
  const items = [...rounds, ...flown].sort((a, b) => b.playedAt.localeCompare(a.playedAt));
  return { items, nextBefore: null, games: null, summary: null };
}

export function useHistory(token: string, game: string | null, refresh: number, size: number, games: Game[] = []) {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [summary, setSummary] = useState<HistoryTotal | null>(null);
  const [totals, setTotals] = useState<HistoryTotal[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [legacy, setLegacy] = useState(false);
  const call = useRef(0);
  const names = new Map(games.map(g => [g.code, g.name]));

  const load = useCallback(async (before: string | null) => {
    const id = ++call.current;
    setLoading(true); setError('');
    try {
      const query = `size=${size}${game ? `&game=${encodeURIComponent(game)}` : ''}${before ? `&before=${encodeURIComponent(before)}` : ''}`;
      let page: HistoryPage, old = false;
      try { page = await request<HistoryPage>(`/api/bets/history?${query}`, token); }
      catch (e) { if (!(e instanceof ApiError) || ![400, 404, 405].includes(e.status)) throw e; page = await legacyPage(token, game, names); old = true; }
      if (id !== call.current) return;
      setLegacy(old);
      setItems(current => before ? [...current, ...page.items.filter(i => !current.some(k => k.id === i.id))] : page.items);
      setNext(page.nextBefore);
      if (page.summary) setSummary(page.summary);
      if (page.games) setTotals(page.games);
    } catch (e) {
      if (id === call.current) setError(e instanceof Error ? e.message : 'History is unavailable');
    } finally { if (id === call.current) setLoading(false); }
  }, [token, game, size, games.length]);

  // A new game, or a round just settled: start again from the newest.
  useEffect(() => { void load(null); }, [load, refresh]);
  useEffect(() => { setItems([]); setSummary(null); setNext(null); }, [game]);
  return { items, summary, totals, next, loading, error, legacy, more: () => next && void load(next), reload: () => void load(null) };
}

/** What the round showed: the reels, the roulette pocket, or how a flight went. */
function Face({ item, size = 22 }: { item: HistoryItem; size?: number }) {
  if (item.kind === 'CRASH') return <Text numberOfLines={1} style={h.note}>{item.notes.join(' · ') || (item.result === 'OPEN' ? 'In flight' : 'Flight')}</Text>;
  if (POCKETS[item.symbols[1]]) return <View style={h.face}>
    <View style={[h.pocket, { backgroundColor: POCKETS[item.symbols[1]] }]}><Text style={h.pocketText}>{item.symbols[0]}</Text></View>
    <Text numberOfLines={1} style={h.note}>{item.symbols[1].toLowerCase()} · {item.symbols[2].toLowerCase()}</Text>
  </View>;
  return <View style={h.face}>{item.symbols.slice(0, 9).map((symbol, i) => <View key={i} style={h.symbol}><SymbolArt symbol={symbol} size={size} /></View>)}</View>;
}

export function HistoryRow({ item, showGame = true }: { item: HistoryItem; showGame?: boolean }) {
  const [open, setOpen] = useState(false);
  const value = net(item), won = item.result === 'WIN';
  return <Tap haptic="select" scale={0.99} accessibilityLabel={`${item.gameName}, ${item.result === 'OPEN' ? 'in play' : `net ${signed(value)}`}`}
    onPress={() => setOpen(o => !o)} style={[h.row, won && h.rowWin]}>
    <View style={[h.bar, won ? { backgroundColor: c.win } : item.result === 'OPEN' ? { backgroundColor: c.gold } : null]} />
    <View style={h.rowMain}>
      <View style={{ flex: 1, gap: 5, minWidth: 0 }}>
        <Text numberOfLines={1} style={h.rowTitle}>{showGame ? item.gameName : time(item.playedAt)}{item.freeSpin ? '  · FREE SPIN' : ''}</Text>
        <Text style={s.small}>{showGame ? `${time(item.playedAt)} · ` : ''}Stake {money(item.stake)}</Text>
        <Face item={item} />
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={[h.amount, won ? { color: c.win } : value < 0 ? { color: c.muted } : null]}>{item.result === 'OPEN' ? 'In play' : signed(value)}</Text>
        <View style={[h.badge, won && { backgroundColor: '#7ad3a022' }]}><Text style={[h.badgeText, won && { color: c.win }]}>{item.result === 'OPEN' ? 'LIVE' : `${item.multiplier.toFixed(2)}×`}</Text></View>
      </View>
    </View>
    {open && <View style={h.details}>
      <Detail label="Payout" value={money(item.payout)} />
      {item.balanceAfter != null && <Detail label="Balance after" value={money(item.balanceAfter)} />}
      <Detail label="Played" value={new Date(item.playedAt).toLocaleString()} />
      <Detail label="Round ID" value={item.id.slice(0, 8)} />
    </View>}
  </Tap>;
}
const Detail = ({ label, value }: { label: string; value: string }) => <View style={{ minWidth: 110, gap: 2 }}><Text style={h.detailLabel}>{label}</Text><Text style={h.detailValue}>{value}</Text></View>;

function Totals({ total }: { total: HistoryTotal }) {
  const result = total.returned - total.staked;
  return <View style={h.totals}>
    <Stat label="Net" value={signed(result)} tone={result > 0 ? c.win : result < 0 ? '#ee8f98' : undefined} />
    <Stat label="Rounds" value={String(total.rounds)} />
    <Stat label="Win rate" value={`${total.rounds ? Math.round(total.wins / total.rounds * 100) : 0}%`} />
    <Stat label="Best" value={`${total.bestMultiplier.toFixed(2)}×`} tone={c.gold} />
  </View>;
}
const Stat = ({ label, value, tone }: { label: string; value: string; tone?: string }) =>
  <View style={h.stat}><Text style={[h.statValue, tone ? { color: tone } : null]}>{value}</Text><Text style={h.statLabel}>{label}</Text></View>;

/** Under a game: that game's rounds, newest first. {@code refresh} changes whenever a round settles. */
export function GameHistory({ token, game, refresh }: { token: string; game: Game; refresh: number }) {
  const history = useHistory(token, game.code, refresh, 8, [game]);
  return <View style={h.panel}>
    <View style={h.panelHead}>
      <View style={{ flex: 1 }}><Text style={s.kicker}>YOUR HISTORY</Text><Text style={h.panelTitle}>{game.name}</Text></View>
      {history.loading && <ActivityIndicator color={c.gold} />}
    </View>
    {history.summary && history.summary.rounds > 0 && <Totals total={history.summary} />}
    {!!history.error && <Text style={s.error}>{history.error}</Text>}
    {history.items.map(item => <HistoryRow key={item.id} item={item} showGame={false} />)}
    {!history.loading && !history.error && !history.items.length && <Text style={s.muted}>No rounds of {game.name} yet. Your first one will appear here.</Text>}
    {history.next && <Tap haptic="select" disabled={history.loading} onPress={history.more} style={s.secondary}><Text style={s.secondaryText}>{history.loading ? 'Loading…' : 'Show older rounds'}</Text></Tap>}
    {history.legacy && <Text style={s.small}>Showing your latest rounds. Full history needs the updated server.</Text>}
  </View>;
}

/** The History tab: every game, or one picked from the row of chips. */
export function HistoryScreen({ token, games, refresh }: { token: string; games: Game[]; refresh: number }) {
  const [game, setGame] = useState<string | null>(null);
  const history = useHistory(token, game, refresh, 25, games);
  const [known, setKnown] = useState<HistoryTotal[]>([]);
  // The chips come from the all-games page and stay put while one game is picked.
  useEffect(() => { if (!game && history.totals.length) setKnown(history.totals); }, [game, history.totals]);
  const groups: { label: string; items: HistoryItem[] }[] = [];
  for (const item of history.items) {
    const label = dayLabel(item.playedAt);
    if (groups[groups.length - 1]?.label === label) groups[groups.length - 1].items.push(item); else groups.push({ label, items: [item] });
  }
  const all = known.reduce((sum, t) => sum + t.rounds, 0);
  return <View style={{ gap: sp.m }}>
    <View><Text style={s.kicker}>YOUR ACCOUNT</Text><Text style={[s.title, { fontSize: 28 }]}>History</Text><Text style={s.muted}>Every round you have played, newest first.</Text></View>
    {known.length > 0 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: sp.s, paddingRight: sp.l }}>
      <Chip label="All games" count={all} on={game === null} onPress={() => setGame(null)} />
      {known.map(t => <Chip key={t.code} label={t.name} count={t.rounds} on={game === t.code} onPress={() => setGame(t.code)} />)}
    </ScrollView>}
    {history.summary && history.summary.rounds > 0 && <Totals total={history.summary} />}
    {!!history.error && <View style={s.card}><Text style={s.error}>{history.error}</Text><Tap onPress={history.reload} style={s.secondary}><Text style={s.secondaryText}>Retry</Text></Tap></View>}
    {groups.map(group => <View key={group.label} style={{ gap: sp.s }}>
      <View style={h.dayHead}><Text style={h.day}>{group.label}</Text><Text style={s.small}>{plural(group.items.length, 'round')} · {signed(group.items.reduce((sum, i) => sum + net(i), 0))}</Text></View>
      {group.items.map(item => <HistoryRow key={item.id} item={item} />)}
    </View>)}
    {history.loading && !history.items.length && <ActivityIndicator color={c.gold} style={{ padding: 30 }} />}
    {!history.loading && !history.error && !history.items.length && <View style={s.card}><Text style={s.gameName}>No rounds yet</Text><Text style={s.muted}>Every round you play is recorded here with its stake, payout and result.</Text></View>}
    {history.next && <Tap haptic="select" disabled={history.loading} onPress={history.more} style={s.secondary}><Text style={s.secondaryText}>{history.loading ? 'Loading…' : 'Load more rounds'}</Text></Tap>}
    {!history.next && history.items.length > 0 && <Text style={[s.small, { textAlign: 'center' }]}>{history.legacy ? 'Showing your latest rounds. Full history needs the updated server.' : 'That’s everything.'}</Text>}
  </View>;
}

function Chip({ label, count, on, onPress }: { label: string; count: number; on: boolean; onPress: () => void }) {
  return <Tap haptic="select" accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={onPress} style={[h.chip, on && h.chipOn]}>
    <Text style={[h.chipText, on && { color: c.goldInk }]}>{label}</Text><Text style={[h.chipCount, on && { color: c.goldInk }]}>{count}</Text>
  </Tap>;
}

const h = StyleSheet.create({
  panel: { gap: sp.s, padding: sp.m, borderRadius: radius.l, borderWidth: 1, borderColor: c.line, backgroundColor: '#15141a' },
  panelHead: { flexDirection: 'row', alignItems: 'center', gap: sp.s },
  panelTitle: { color: c.text, fontSize: 17, fontWeight: '700', marginTop: 2 },
  totals: { flexDirection: 'row', gap: sp.s },
  stat: { flex: 1, paddingVertical: sp.s, paddingHorizontal: sp.s, borderRadius: radius.m, backgroundColor: c.surface, gap: 2, minWidth: 0 },
  statValue: { color: c.text, fontSize: 16, fontWeight: '800' },
  statLabel: { color: c.faint, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' },
  row: { borderRadius: radius.m, backgroundColor: c.surface, borderWidth: 1, borderColor: '#ffffff0d', overflow: 'hidden' },
  rowWin: { borderColor: '#7ad3a033' },
  bar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: '#ee8f9855' },
  rowMain: { flexDirection: 'row', alignItems: 'center', gap: sp.m, paddingVertical: 10, paddingLeft: 14, paddingRight: 12 },
  rowTitle: { color: c.text, fontWeight: '700', fontSize: 14 },
  amount: { color: c.text, fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: '#ffffff0d' },
  badgeText: { color: c.muted, fontSize: 11, fontWeight: '700' },
  face: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  symbol: { padding: 2, borderRadius: 6, backgroundColor: '#ffffff08' },
  pocket: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#ffffff33' },
  pocketText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  note: { color: c.muted, fontSize: 12, flexShrink: 1 },
  details: { flexDirection: 'row', flexWrap: 'wrap', gap: sp.m, paddingHorizontal: 14, paddingBottom: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#ffffff0d' },
  detailLabel: { color: c.faint, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' },
  detailValue: { color: c.text, fontSize: 13 },
  dayHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: sp.xs },
  day: { color: c.gold, fontWeight: '700', fontSize: 13 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, minHeight: 40, borderRadius: radius.pill, borderWidth: 1, borderColor: c.lineStrong, backgroundColor: c.surface },
  chipOn: { backgroundColor: c.gold, borderColor: c.gold },
  chipText: { color: c.text, fontWeight: '700', fontSize: 13 },
  chipCount: { color: c.faint, fontSize: 12, fontWeight: '700' },
});
