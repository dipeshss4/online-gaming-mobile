import React, { useState } from 'react';
import { LayoutChangeEvent, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { Balance, Game } from './api';
import { Tap } from './Tap';
import { SoundToggle } from './Popups';
import { c } from './theme';
import { GameLogo, themeOf } from './GameLogo';

/**
 * The frame every game is played in, laid out the way the game rooms do it: the game fills the screen, with a slim
 * bar on top (home, the game's logo, sound and credits) and one console along the bottom (info, the bet, WIN and a big
 * SPIN). Rules and the paytable sit behind the info button instead of taking a column of the screen.
 *
 * {@code children} draws the game into the space left, and is given that space's size so reels can fill it.
 */
export type Stage = { width: number; height: number };

export function GameShell({ game, balance, onBack, backDisabled, status, notice, info, bet, win, spin, controls, overlay, children }: {
  game: Game; balance: Balance | null; onBack: () => void; backDisabled?: boolean;
  /** One line under the game: what is happening now. */
  status?: string;
  /** An error or a pending bet: shown in a strip above the console. */
  notice?: React.ReactNode;
  /** The paytable and rules, shown when the info button is pressed. */
  info: React.ReactNode;
  bet?: React.ReactNode; win?: string;
  spin?: { label: string; onPress: () => void; disabled?: boolean; accessibilityLabel?: string };
  /** Replaces bet, WIN and SPIN, for games with their own controls (crash, roulette). */
  controls?: React.ReactNode;
  /** Drawn over the whole game: banners and celebrations. */
  overlay?: React.ReactNode;
  children: (stage: Stage) => React.ReactNode;
}) {
  const theme = themeOf(game), { width, height } = useWindowDimensions(), landscape = width > height, compact = height < 500 || width < 500;
  const [stage, setStage] = useState<Stage>({ width: 0, height: 0 }), [open, setOpen] = useState(false);
  const measure = (event: LayoutChangeEvent) => { const { width: w, height: h } = event.nativeEvent.layout; if (Math.abs(w - stage.width) > 1 || Math.abs(h - stage.height) > 1) setStage({ width: w, height: h }); };
  const spinSize = compact ? 64 : 84;
  const upright = !landscape && width < 600;
  return <LinearGradient colors={theme.background} style={g.root}>
    <View style={[g.top, compact && { height: 50 }]}>
      <Tap haptic="select" accessibilityLabel="Back to lobby" disabled={backDisabled} onPress={onBack} style={[g.round, { borderColor: theme.frame }, backDisabled && { opacity: .4 }]}><Text style={g.roundText}>⌂</Text></Tap>
      {/* An upright phone has no room beside the buttons: the logo gets its own row below. */}
      <View style={g.logo}>{!upright && <GameLogo game={game} height={compact ? 34 : 46} maxWidth={width - 44 - 44 - 170 - 40} />}</View>
      <SoundToggle />
      <View style={[g.credits, { borderColor: theme.frame }]}><Text style={g.coin}>$</Text><Text style={g.creditsText} numberOfLines={1}>{balance ? balance.balance.toFixed(2) : '—'}</Text></View>
    </View>
    {upright && <View style={g.logoRow}><GameLogo game={game} height={38} maxWidth={width - 24} /></View>}
    <View style={g.stage} onLayout={measure}>{stage.width > 0 && children(stage)}</View>
    {!!status && <Text style={[g.status, { color: theme.accent }]} accessibilityLiveRegion="polite" numberOfLines={1}>{status}</Text>}
    {!!notice && <View style={g.notice}>{typeof notice === 'string' ? <Text style={g.noticeText}>{notice}</Text> : notice}</View>}
    <View style={[g.console, { borderColor: theme.frame }, !landscape && width < 600 && g.consoleStacked]}>
      <Tap haptic="select" accessibilityLabel="Game information" onPress={() => setOpen(true)} style={[g.round, { borderColor: theme.frame }]}><Text style={g.info}>i</Text></Tap>
      {controls ?? <>
        <View style={[g.bet, !landscape && width < 600 && g.betStacked]}>{bet}</View>
        {win !== undefined && <View style={g.win}><Text style={g.winLabel}>WIN</Text><Text style={[g.winValue, { color: theme.accent }]} numberOfLines={1} adjustsFontSizeToFit>{win}</Text></View>}
        {spin && <Tap haptic="heavy" accessibilityLabel={spin.accessibilityLabel ?? spin.label} disabled={spin.disabled} onPress={spin.onPress}
          style={[g.spin, { width: spinSize, height: spinSize, borderRadius: spinSize, borderColor: theme.accent }, spin.disabled && { opacity: .55 }]}>
          <LinearGradient colors={['#ffe45c', '#ff9f1a', '#d1480f']} style={StyleSheet.absoluteFill} />
          <Text style={[g.spinText, { fontSize: spin.label.length > 5 ? 13 : compact ? 18 : 22 }]} numberOfLines={1} adjustsFontSizeToFit>{spin.label}</Text>
        </Tap>}
      </>}
    </View>
    {overlay}
    <Modal visible={open} transparent animationType="fade" supportedOrientations={['landscape-left', 'landscape-right', 'portrait']} onRequestClose={() => setOpen(false)}>
      <Pressable style={g.shade} onPress={() => setOpen(false)} accessibilityLabel="Close game information">
        <Pressable style={[g.sheet, { borderColor: theme.frame }]} onPress={() => undefined}>
          <GameLogo game={game} height={40} />
          <ScrollView contentContainerStyle={{ gap: 8, paddingVertical: 8 }}>{info}</ScrollView>
          <Tap haptic="select" onPress={() => setOpen(false)} style={g.back}><Text style={g.backText}>RETURN TO GAME</Text></Tap>
        </Pressable>
      </Pressable>
    </Modal>
  </LinearGradient>;
}

/** A row of the paytable in the info sheet. */
export function PayRow({ label, pays }: { label: React.ReactNode; pays: string }) {
  return <View style={g.payRow}>{typeof label === 'string' ? <Text style={g.payLabel}>{label}</Text> : label}<Text style={g.payValue}>{pays}</Text></View>;
}
export function Rules({ rules }: { rules?: string[] }) {
  return <>{rules?.map((rule, i) => <Text key={i} style={g.rule}>• {rule}</Text>)}</>;
}

const g = StyleSheet.create({
  root: { flex: 1 },
  top: { height: 62, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10 },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 2, backgroundColor: '#00000066' },
  roundText: { color: '#fff', fontSize: 22, fontWeight: '900' },
  info: { color: '#fff', fontSize: 22, fontWeight: '900', fontStyle: 'italic' },
  logo: { flex: 1, alignItems: 'center', overflow: 'hidden' },
  logoRow: { alignItems: 'center', paddingHorizontal: 12, paddingBottom: 4 },
  credits: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingLeft: 4, paddingRight: 12, borderRadius: 20, borderWidth: 1.5, backgroundColor: '#00000088', maxWidth: 160 },
  coin: { width: 28, height: 28, borderRadius: 14, backgroundColor: c.gold, color: c.goldInk, textAlign: 'center', lineHeight: 28, fontWeight: '900', fontSize: 15, overflow: 'hidden' },
  creditsText: { color: '#fff', fontWeight: '900', fontSize: 16, flexShrink: 1 },
  stage: { flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  status: { textAlign: 'center', fontWeight: '900', fontSize: 14, letterSpacing: 2.5, paddingVertical: 2, textShadowColor: '#000', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } },
  notice: { marginHorizontal: 10, marginBottom: 4, padding: 6, borderRadius: 10, backgroundColor: '#5a0d1ecc', borderWidth: 1, borderColor: c.bad },
  noticeText: { color: c.bad, fontSize: 12, textAlign: 'center' },
  console: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 8, marginBottom: 8, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 18, borderWidth: 2, backgroundColor: '#000000aa' },
  consoleStacked: { flexWrap: 'wrap', justifyContent: 'space-between' },
  bet: { flex: 1, minWidth: 0 },
  betStacked: { flexBasis: '100%', order: 3 } as object,
  win: { alignItems: 'center', minWidth: 84, paddingHorizontal: 8 },
  winLabel: { color: '#ff9a6a', fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  winValue: { fontSize: 22, fontWeight: '900' },
  spin: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 4, shadowColor: '#ff9f1a', shadowOpacity: .7, shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, elevation: 8 },
  spinText: { color: '#3b1600', fontWeight: '900', letterSpacing: 1 },
  shade: { flex: 1, backgroundColor: '#000000cc', alignItems: 'center', justifyContent: 'center', padding: 16 },
  sheet: { width: '100%', maxWidth: 560, maxHeight: '94%', borderRadius: 20, borderWidth: 3, backgroundColor: '#14061f', padding: 14, gap: 6 },
  payRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, backgroundColor: '#ffffff0d' },
  payLabel: { color: '#f2e6ff', fontSize: 14, flexShrink: 1 },
  payValue: { color: c.gold, fontWeight: '900', fontSize: 15 },
  rule: { color: '#c9b8e8', fontSize: 13, lineHeight: 19 },
  back: { alignSelf: 'center', minHeight: 44, paddingHorizontal: 22, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#13a95a', borderWidth: 2, borderColor: '#7dff5a' },
  backText: { color: '#fff', fontWeight: '900', letterSpacing: 1 },
});
