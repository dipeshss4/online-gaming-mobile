import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { leaderboardApi, LeaderboardView } from './api';
import { Tap } from './Tap';
import { c } from './theme';

/**
 * This week's top wins in the app: a trophy button that opens the board (each player's best win since Monday UTC, the
 * top ten, the player's own place). Names appear only for players who chose to show them.
 */
const MEDALS = ['🥇', '🥈', '🥉'];
const left = (iso: string, now: number) => {
  const ms = Math.max(0, new Date(iso).getTime() - now), d = Math.floor(ms / 86_400_000), h = Math.floor(ms / 3_600_000) % 24;
  return d > 0 ? `${d}d ${h}h` : `${h}h ${Math.floor(ms / 60_000) % 60}m`;
};

export function LeaderboardButton({ token, round }: { token: string; round?: boolean }) {
  const [board, setBoard] = useState<LeaderboardView | null>(null), [open, setOpen] = useState(false);
  const load = useCallback(() => leaderboardApi.read(token).then(setBoard).catch(() => setBoard(null)), [token]);
  useEffect(() => { void load(); }, [load]);
  if (!board?.enabled) return null;
  return <>
    <Tap haptic="select" accessibilityLabel="This week's top wins" onPress={() => { setOpen(true); void load(); }} style={round ? l.round : l.pill}>
      <Text style={{ fontSize: round ? 20 : 16 }}>🏆</Text>{!round && <Text style={l.pillText}>TOP WINS</Text>}
    </Tap>
    {open && <Board board={board} onClose={() => setOpen(false)} />}
  </>;
}

function Board({ board, onClose }: { board: LeaderboardView; onClose: () => void }) {
  const [now] = useState(Date.now());
  const mineShown = board.entries.some(entry => entry.you);
  return <Modal transparent visible animationType="fade" onRequestClose={onClose} supportedOrientations={['portrait', 'landscape-left', 'landscape-right']}>
    <Pressable accessible={false} style={l.backdrop} onPress={onClose}>
      <Pressable onPress={() => undefined} style={l.card} accessibilityViewIsModal>
        <LinearGradient colors={['#3a1268', '#12052a']} style={StyleSheet.absoluteFill} />
        <Tap haptic="select" accessibilityLabel="Close" onPress={onClose} style={l.close}><Text style={l.closeText}>×</Text></Tap>
        <ScrollView contentContainerStyle={l.body}>
          <Text style={l.kicker}>THIS WEEK</Text>
          <Text style={l.title}>🏆 TOP WINS</Text>
          <Text style={l.sub}>Resets in {left(board.resetsAt, now)}</Text>
          {board.entries.length ? <View style={{ alignSelf: 'stretch', gap: 6, marginTop: 8 }}>{board.entries.map(entry =>
            <View key={entry.rank} style={[l.row, entry.rank === 1 && l.first, entry.you && l.you]} accessibilityLabel={`Rank ${entry.rank}, ${entry.you ? 'you' : entry.name ?? 'a player'}, ${entry.multiplier} times on ${entry.gameName}`}>
              <Text style={l.rank}>{MEDALS[entry.rank - 1] ?? `#${entry.rank}`}</Text>
              <View style={{ flex: 1, minWidth: 0 }}><Text style={l.name} numberOfLines={1}>{entry.you ? 'You' : entry.name ?? 'A player'}</Text><Text style={l.game} numberOfLines={1}>{entry.gameName}</Text></View>
              <View style={{ alignItems: 'flex-end' }}><Text style={l.multiplier}>{entry.multiplier}×</Text><Text style={l.game}>{entry.payout.toFixed(2)}</Text></View>
            </View>)}</View>
            : <Text style={l.sub}>No wins yet this week. The first big one takes the top spot.</Text>}
          {board.you && !mineShown && <Text style={l.mine}>Your best this week: <Text style={{ color: c.gold, fontWeight: '900' }}>{board.you.multiplier}×</Text> on {board.you.gameName} · <Text style={{ color: c.gold, fontWeight: '900' }}>#{board.you.rank}</Text></Text>}
          {!board.you && <Text style={l.mine}>Land a win this week to join the board.</Text>}
        </ScrollView>
      </Pressable>
    </Pressable>
  </Modal>;
}

const l = StyleSheet.create({
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#ffd23f88', backgroundColor: '#04122dcc' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1.5, borderColor: '#ffd23f88', backgroundColor: '#2a0a50' },
  pillText: { color: '#ffe58a', fontWeight: '900', fontSize: 12, letterSpacing: 1.5 },
  backdrop: { flex: 1, backgroundColor: '#05010cdd', alignItems: 'center', justifyContent: 'center', padding: 12 },
  card: { width: '100%', maxWidth: 460, maxHeight: '96%', borderRadius: 24, borderWidth: 3, borderColor: c.gold, overflow: 'hidden' },
  body: { alignItems: 'center', padding: 18 },
  close: { position: 'absolute', top: 4, right: 4, width: 44, height: 44, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  closeText: { color: '#fff', fontSize: 26 },
  kicker: { color: '#ff9ad6', fontWeight: '900', fontSize: 12, letterSpacing: 4 },
  title: { color: '#ffe58a', fontWeight: '900', fontStyle: 'italic', fontSize: 28 },
  sub: { color: '#c9b8e8', fontSize: 12, marginTop: 2, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 14, backgroundColor: '#ffffff0a', borderWidth: 1, borderColor: '#ffffff12' },
  first: { backgroundColor: '#ffd23f22', borderColor: '#ffd23f88' },
  you: { borderColor: '#22e1ff' },
  rank: { width: 40, textAlign: 'center', color: '#c9b8e8', fontWeight: '900', fontSize: 18 },
  name: { color: '#fff', fontWeight: '800', fontSize: 14 },
  game: { color: '#b9a6e0', fontSize: 12 },
  multiplier: { color: '#ffe58a', fontWeight: '900', fontSize: 17 },
  mine: { color: '#d8c8f0', fontSize: 13, marginTop: 12, textAlign: 'center' },
});
