import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import { ApiError, LiveSnapshot, floor } from './api';
import { s } from './styles';
import { FloorSkeleton } from './Skeleton';

/**
 * What the floor is doing: how much everyone together has played lately, the day's best returns, and the newest
 * rounds. The same data the web lobby shows.
 *
 * The web gets this pushed on its event stream; this app asks for it on a timer instead, because React Native
 * has no EventSource and streamed fetch is unreliable across the two platforms. Asking every few seconds costs
 * one small request and keeps the screen honest about how fresh it is.
 */
const REFRESH_MS = 6000;

export type FloorState = ReturnType<typeof useFloor>;

/**
 * One poll, two places on the screen. The totals sit above the games so the room feels alive the moment the
 * app opens; the boards sit below them, because a player came to play and the games should not be pushed off
 * the first screen by a scoreboard.
 */
export function useFloor(token: string) {
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);
  const [at, setAt] = useState<Date | null>(null);
  // Why it failed decides what to say. Only a 404 means this server has no floor; a 401 that survives the
  // session renewal in api.ts means the session itself is over, which is not the same thing at all.
  const [failed, setFailed] = useState<{ missing: boolean } | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try { setSnapshot(await floor.read(token)); setAt(new Date()); setFailed(null); }
    catch (cause) { setFailed({ missing: cause instanceof ApiError && cause.status === 404 }); }
  }, [token]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    // A backgrounded app should not poll; it catches up when it comes back.
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void load(); });
    return () => { clearInterval(timer); listener.remove(); };
  }, [load]);

  return { snapshot, at, failed };
}

const money = (value: number) => value.toFixed(2);
const ago = (date: Date | string) => {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(date).getTime()) / 1000));
  return seconds < 60 ? `${seconds}s ago` : seconds < 3600 ? `${Math.round(seconds / 60)}m ago` : `${Math.round(seconds / 3600)}h ago`;
};
const who = (snapshot: LiveSnapshot, player: string | null, ref?: string) =>
  ref && ref === snapshot.you ? 'You' : player || 'Private player';

/** The one-line pulse of the room: rounds, money staked, players, best return. */
export function FloorTotals({ floor, currency = 'USD' }: { floor: FloorState; currency?: string }) {
  const { snapshot, failed } = floor;
  // Rendering nothing at all is what makes a missing floor look like a missing feature: say why instead.
  if (!snapshot) {
    if (!failed) return <FloorSkeleton />;
    return <View style={s.card}>
      <Text style={s.kicker}>THE FLOOR</Text>
      <Text style={s.muted}>{failed.missing
        ? 'This server does not provide live activity. It needs a backend with /api/live — the deployed demo may be older than this app.'
        : 'Cannot load live activity right now. It appears here as soon as the connection is back.'}</Text>
    </View>;
  }
  const { totals } = snapshot;
  const window = totals.minutes >= 60 ? `${Math.round(totals.minutes / 60)}h` : `${totals.minutes}m`;
  return <View style={f.strip}>
    <Stat value={String(totals.rounds)} label={`rounds · last ${window}`} />
    <Stat value={money(totals.staked)} label={`staked (${currency})`} />
    <Stat value={String(totals.players)} label={totals.players === 1 ? 'player' : 'players'} />
    <Stat value={`${totals.biggestMultiplier.toFixed(2)}×`} label="best today" accent />
  </View>;
}

/** The day's best returns and the newest rounds, shown under the games. */
export function FloorBoards({ floor }: { floor: FloorState }) {
  const { snapshot, at, failed } = floor;
  if (!snapshot) return null;
  const { scoreboard, rounds } = snapshot;
  const name = (player: string | null, ref?: string) => who(snapshot, player, ref);

  return <View style={{ gap: 12 }}>
    <View style={s.card}>
      <Text style={s.kicker}>TODAY’S BIGGEST WINS</Text>
      {/* An empty board still says the feature is here and the floor is simply quiet. */}
      {!scoreboard.length && <Text style={s.muted}>No wins in the last 24 hours yet.</Text>}
      {scoreboard.slice(0, 3).map((win, place) => <View key={`${win.settledAt}-${place}`} style={f.row}>
        <Text style={f.place}>{place + 1}</Text>
        <View style={s.grow}>
          <Text style={s.gameName}>{win.gameName}</Text>
          <Text style={s.small}>{name(win.player)} · {ago(win.settledAt)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={f.win}>{win.multiplier.toFixed(2)}×</Text>
          <Text style={s.small}>{money(win.payout)}</Text>
        </View>
      </View>)}
      <Text style={s.small}>Rolling 24 hours · demo credits</Text>
    </View>

    <View style={s.card}>
      <Text style={s.kicker}>ON THE FLOOR</Text>
      {!rounds.length && <Text style={s.muted}>No rounds have been settled yet. Play one and it appears here.</Text>}
      {rounds.slice(0, 6).map(round => <View key={round.betId} style={f.row}>
        <View style={s.grow}>
          <Text style={s.gameName}>{round.gameName}</Text>
          <Text style={s.small}>{name(round.player, round.playerRef)} · {ago(round.settledAt)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={round.payout > round.stake ? f.win : s.muted}>{round.multiplier.toFixed(2)}×</Text>
          <Text style={s.small}>{money(round.stake)} → {money(round.payout)}</Text>
        </View>
      </View>)}
      <Text style={s.small}>
        Real settled rounds; players are named only if they chose to be.
        {failed ? ' Reconnecting…' : at ? ` Updated ${ago(at)}.` : ''}
      </Text>
    </View>
  </View>;
}

function Stat({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return <View style={f.stat}>
    <Text style={[f.statValue, accent && { color: '#7ad3a0' }]}>{value}</Text>
    <Text style={s.small}>{label}</Text>
  </View>;
}

const f = {
  strip: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 18, alignItems: 'center' as const,
    padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#bba16a2b', backgroundColor: '#17151c' },
  stat: { gap: 2, minWidth: 0 },
  statValue: { color: '#f4efe4', fontSize: 19, fontWeight: '700' as const },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, paddingVertical: 8 },
  place: { color: '#938c9e', fontSize: 12, width: 16 },
  win: { color: '#7ad3a0', fontWeight: '700' as const, fontSize: 15 },
};
