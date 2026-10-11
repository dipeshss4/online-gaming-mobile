import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ApiError, Game, MissionClaimed, missionsApi, MissionStatus } from './api';
import { Tap } from './Tap';
import { c, feel } from './theme';
import { sound } from './sound';
import { isPromoShowing, setOtherPopup } from './Popups';

/**
 * Today's missions in the app: a button with how many are ready to claim, and the list with each goal's progress. The
 * server counts progress and pays the claim (DailyMissionService); a claim is free spins on the prize game.
 */
const ICONS: Record<string, string> = { ROUNDS: '🎰', WINS: '🏆', STAKED: '🪙', BIG_WIN: '💥' };
const amount = (kind: string, value: number) => kind === 'STAKED' ? value.toFixed(2) : String(Math.floor(value));
const until = (iso: string | null, now: number) => {
  if (!iso) return '';
  const left = Math.max(0, new Date(iso).getTime() - now), h = Math.floor(left / 3_600_000), m = Math.floor(left / 60_000) % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
};

export function MissionsButton({ token, games, onPlay }: { token: string; games: Game[]; onPlay: (game: Game) => void }) {
  const [status, setStatus] = useState<MissionStatus | null>(null), [open, setOpen] = useState(false);
  const load = useCallback(() => missionsApi.read(token).then(setStatus).catch(() => setStatus(null)), [token]);
  useEffect(() => {
    void load();
    const timer = setInterval(() => { if (AppState.currentState === 'active') void load(); }, 45_000);
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void load(); });
    return () => { clearInterval(timer); listener.remove(); };
  }, [load]);
  if (!status?.enabled || !Array.isArray(status.missions)) return null;
  const ready = status.missions.filter(mission => mission.done && !mission.claimed).length;
  const finished = status.missions.filter(mission => mission.claimed).length;
  return <>
    <Tap haptic="heavy" accessibilityLabel={ready ? `Daily missions, ${ready} ready to claim` : 'Daily missions'}
      onPress={() => { if (!isPromoShowing()) { setOtherPopup(true); setOpen(true); void load(); } }} style={[m.launch, ready > 0 && m.launchReady]}>
      <View style={m.launchIcon}><Text style={{ fontSize: 20 }}>🎯</Text>{ready > 0 && <View style={m.count}><Text style={m.countText}>{ready}</Text></View>}</View>
      <View><Text style={m.launchTitle}>MISSIONS</Text><Text style={m.launchSub}>{ready ? `${ready} ready!` : `${finished}/${status.missions.length} done`}</Text></View>
    </Tap>
    {open && <MissionsDialog token={token} status={status} games={games} onPlay={onPlay} onClose={() => { setOpen(false); setOtherPopup(false); void load(); }}
      onClaimed={claimed => setStatus(current => current && { ...current, missions: current.missions.map(item => item.index === claimed.index ? { ...item, claimed: true } : item) })} />}
  </>;
}

function MissionsDialog({ token, status, games, onClose, onPlay, onClaimed }: {
  token: string; status: MissionStatus; games: Game[]; onClose: () => void; onPlay: (game: Game) => void; onClaimed: (claimed: MissionClaimed) => void;
}) {
  const [busy, setBusy] = useState<number | null>(null), [error, setError] = useState(''), [won, setWon] = useState<MissionClaimed | null>(null), [now] = useState(Date.now());
  async function claim(index: number) {
    setBusy(index); setError('');
    try { const claimed = await missionsApi.claim(token, index); feel('win'); sound.play('coins'); setWon(claimed); onClaimed(claimed); }
    catch (e) { feel('warn'); setError(e instanceof ApiError ? e.message : 'The mission could not be claimed. Check your connection.'); }
    finally { setBusy(null); }
  }
  const prize = games.find(game => game.code === status.gameCode);
  return <Modal transparent visible animationType="fade" onRequestClose={onClose} supportedOrientations={['portrait', 'landscape-left', 'landscape-right']}>
    <Pressable accessible={false} style={m.backdrop} onPress={onClose}>
      <Pressable onPress={() => undefined} style={m.card} accessibilityViewIsModal>
        <LinearGradient colors={['#0b3a6e', '#06102a']} style={StyleSheet.absoluteFill} />
        <Tap haptic="select" accessibilityLabel="Close" onPress={onClose} style={m.close}><Text style={m.closeText}>×</Text></Tap>
        <ScrollView contentContainerStyle={m.body}>
          <Text style={m.kicker}>TODAY'S</Text>
          <Text style={m.title}>MISSIONS</Text>
          <Text style={m.sub}>Finish one, claim free spins on {status.gameName}. New missions in {until(status.resetsAt, now)}.</Text>
          {!!error && <Text style={m.error} accessibilityRole="alert">{error}</Text>}
          {won && <View style={m.won} accessibilityLiveRegion="polite">
            <Text style={m.wonText}>+{won.spins} free spins on {won.gameName}!</Text>
            {prize && <Tap haptic="heavy" accessibilityLabel={`Play ${prize.name} now`} onPress={() => { onClose(); onPlay(prize); }} style={m.playWrap}><Text style={m.play}>PLAY NOW</Text></Tap>}
          </View>}
          <View style={{ alignSelf: 'stretch', gap: 10 }}>{status.missions.map(mission => {
            const percent = Math.min(100, Math.round(mission.progress * 100 / mission.target));
            return <View key={mission.index} style={[m.row, mission.done && !mission.claimed && m.rowDone, mission.claimed && { opacity: .6 }]}>
              <View style={m.icon}><Text style={{ fontSize: 20 }}>{ICONS[mission.kind] ?? '⭐'}</Text></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={m.rowTitle} numberOfLines={2}>{mission.title}</Text>
                <View style={m.bar} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: percent }}>
                  <LinearGradient colors={['#22e1ff', '#ffd23f']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ width: `${percent}%`, height: '100%', borderRadius: 4 }} />
                </View>
                <Text style={m.rowCount}>{amount(mission.kind, mission.progress)} / {amount(mission.kind, mission.target)}</Text>
              </View>
              {mission.claimed ? <View style={m.tick} accessibilityLabel="Claimed"><Text style={m.tickText}>✓</Text></View>
                : <Tap haptic="heavy" accessibilityLabel={`Claim ${mission.spins} free spins`} disabled={!mission.done || busy !== null} onPress={() => void claim(mission.index)}
                  style={[m.claim, !mission.done && m.claimOff]}><Text style={[m.claimText, !mission.done && { color: '#a9d8f0' }]}>{busy === mission.index ? '…' : mission.done ? `CLAIM ${mission.spins}` : `${mission.spins} spins`}</Text></Tap>}
            </View>;
          })}</View>
          <Text style={m.rule}>Progress counts today's (UTC) rounds on your own balance; free spins don't count. Each mission pays once a day. Free spins expire after {status.expiresInDays} days.</Text>
        </ScrollView>
      </Pressable>
    </Pressable>
  </Modal>;
}

const m = StyleSheet.create({
  launch: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingLeft: 6, paddingRight: 14, borderRadius: 24, borderWidth: 2, borderColor: '#22e1ff', backgroundColor: '#0b2a5a' },
  launchReady: { shadowColor: '#22e1ff', shadowOpacity: .9, shadowRadius: 12, shadowOffset: { width: 0, height: 0 }, elevation: 8 },
  launchIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff14' },
  count: { position: 'absolute', top: -5, right: -6, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: c.pink, alignItems: 'center', justifyContent: 'center' },
  countText: { color: '#fff', fontWeight: '900', fontSize: 11 },
  launchTitle: { color: '#9ff1ff', fontWeight: '900', fontSize: 12, letterSpacing: 1.5 },
  launchSub: { color: '#d8f6ff', fontSize: 11 },
  backdrop: { flex: 1, backgroundColor: '#05010cdd', alignItems: 'center', justifyContent: 'center', padding: 12 },
  card: { width: '100%', maxWidth: 480, maxHeight: '96%', borderRadius: 24, borderWidth: 3, borderColor: '#22e1ff', overflow: 'hidden' },
  body: { alignItems: 'center', padding: 18, gap: 4 },
  close: { position: 'absolute', top: 4, right: 4, width: 44, height: 44, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  closeText: { color: '#fff', fontSize: 26 },
  kicker: { color: c.gold, fontWeight: '900', fontSize: 12, letterSpacing: 8 },
  title: { color: '#9ff1ff', fontWeight: '900', fontStyle: 'italic', fontSize: 30, textShadowColor: '#22e1ff', textShadowRadius: 14, textShadowOffset: { width: 0, height: 0 } },
  sub: { color: '#d8f6ff', fontSize: 13, textAlign: 'center', marginBottom: 8 },
  error: { color: '#ffb5ad', fontSize: 13, textAlign: 'center' },
  won: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: c.gold, backgroundColor: '#ffd23f22', marginBottom: 6 },
  wonText: { color: '#ffe58a', fontWeight: '900', fontSize: 14 },
  playWrap: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: c.gold, alignItems: 'center', justifyContent: 'center' },
  play: { color: '#3b1600', fontWeight: '900', fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 16, borderWidth: 1, borderColor: '#ffffff1a', backgroundColor: '#ffffff0d' },
  rowDone: { borderColor: c.gold, backgroundColor: '#ffd23f14' },
  icon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff14' },
  rowTitle: { color: '#fff', fontWeight: '800', fontSize: 14 },
  bar: { height: 8, borderRadius: 4, backgroundColor: '#ffffff1a', overflow: 'hidden', marginVertical: 5 },
  rowCount: { color: '#a9d8f0', fontSize: 12 },
  claim: { minWidth: 92, minHeight: 44, paddingHorizontal: 10, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffb01f' },
  claimOff: { backgroundColor: '#ffffff14' },
  claimText: { color: '#3b1600', fontWeight: '900', fontSize: 13 },
  tick: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2ee57a33' },
  tickText: { color: '#2ee57a', fontWeight: '900', fontSize: 20 },
  rule: { color: '#9ab8d8', fontSize: 11, marginTop: 10, textAlign: 'center' },
});
