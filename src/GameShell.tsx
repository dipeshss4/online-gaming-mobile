import React, { useEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { Balance, Game } from './api';
import { Tap } from './Tap';
import { SoundToggle } from './Popups';
import { c } from './theme';
import { GameLogo, themeOf } from './GameLogo';
import { SpinButton } from './fx/SpinButton';
import { Ambience } from './fx/Ambience';
import { BIG_WIN, PlayControls } from './playControls';

/**
 * The frame every game is played in, laid out the way the game rooms do it: the game fills the screen, with a slim
 * bar on top (home, the game's logo, sound and credits) and one console along the bottom (info, the bet, WIN and a big
 * SPIN). Rules and the paytable sit behind the info button instead of taking a column of the screen.
 *
 * {@code children} draws the game into the space left, and is given that space's size so reels can fill it.
 *
 * Reel games pass {@code play} (src/playControls.ts) and get the round controls: SPIN turns into STOP while the reels
 * run (a tap on the reels does the same), ⚡ TURBO where the admin allows it, and AUTO where the admin has switched
 * autoplay on: a run of 10 to the admin's maximum rounds that stops on the admin's stop rules, on any error or pending
 * bet, when the balance cannot cover the next bet, when the player taps STOP, or when the game is left.
 */
export type Stage = { width: number; height: number };

const AUTO_COUNTS = [10, 25, 50, 100];

export function GameShell({ game, balance, onBack, backDisabled, status, notice, info, bet, win, spin, controls, overlay, play, children }: {
  game: Game; balance: Balance | null; onBack: () => void; backDisabled?: boolean;
  /** One line under the game: what is happening now. */
  status?: string;
  /** An error or a pending bet: shown in a strip above the console. */
  notice?: React.ReactNode;
  /** The paytable and rules, shown when the info button is pressed. */
  info: React.ReactNode;
  bet?: React.ReactNode; win?: string;
  spin?: { label: string; onPress: () => void; disabled?: boolean; busy?: boolean; accessibilityLabel?: string };
  /** Replaces bet, WIN and SPIN, for games with their own controls (crash, roulette). */
  controls?: React.ReactNode;
  /** Drawn over the whole game: banners and celebrations. */
  overlay?: React.ReactNode;
  /** A reel game's pace and the admin's rules: STOP, TURBO and AUTO. */
  play?: PlayControls & { stake: number };
  children: (stage: Stage) => React.ReactNode;
}) {
  const theme = themeOf(game), { width, height } = useWindowDimensions(), landscape = width > height, compact = height < 500 || width < 500;
  const [stage, setStage] = useState<Stage>({ width: 0, height: 0 }), [open, setOpen] = useState(false);
  const measure = (event: LayoutChangeEvent) => { const { width: w, height: h } = event.nativeEvent.layout; if (Math.abs(w - stage.width) > 1 || Math.abs(h - stage.height) > 1) setStage({ width: w, height: h }); };
  const spinSize = compact ? 58 : 84;
  const upright = !landscape && width < 600;

  // ---- autoplay: one round after another while the run lasts and nothing calls for the player.
  const [autoLeft, setAutoLeft] = useState(0), [picking, setPicking] = useState(false);
  const busy = !!spin?.busy, wasBusy = useRef(false), started = useRef(0), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopAuto = () => { setAutoLeft(0); if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => {
    const ended = wasBusy.current && !busy; if (busy && !wasBusy.current) started.current++; wasBusy.current = busy;
    if (!play || !spin || autoLeft <= 0 || busy || !ended) return;
    const last = play.pace.last, rules = play.rules.autoplay;
    const stopFor = !last ? 'the round did not settle'
      : rules.stopOnAnyWin && last.payout > 0 ? 'a win'
      : rules.stopOnBigWin && last.multiplier >= BIG_WIN ? 'a big win'
      : notice ? 'a message' : spin.disabled ? 'the next bet is not possible'
      : balance && balance.balance < play.stake ? 'the balance is below the bet' : null;
    if (stopFor || autoLeft <= 1) { stopAuto(); return; }
    setAutoLeft(left => left - 1);
    timer.current = setTimeout(() => { timer.current = null; next(); }, play.turbo ? 250 : 650);
  }, [busy]); // eslint-disable-line react-hooks/exhaustive-deps
  // A round the game refuses to start (a low balance, a pending bet) never turns busy: the run ends instead of waiting.
  const next = () => { const before = started.current; spin?.onPress(); setTimeout(() => { if (started.current === before) stopAuto(); }, 2500); };
  const startAuto = (count: number) => { setPicking(false); if (!spin || spin.disabled || busy) return; setAutoLeft(count); next(); };
  const auto = autoLeft > 0;
  // While the reels run, SPIN is STOP: it rushes the show (and ends an autoplay run).
  const spinButton = spin && play && (busy || auto)
    ? { label: auto ? `STOP ${autoLeft}` : 'STOP', disabled: false, busy, accessibilityLabel: auto ? `Stop autoplay, ${autoLeft} rounds left` : 'Skip to the result',
        onPress: () => { if (auto) stopAuto(); if (busy) play.pace.hurry(); } }
    : spin;
  return <LinearGradient colors={theme.background} style={g.root}>
    <Ambience mood={theme.mood} tint={theme.frame} />
    <View style={[g.top, compact && { height: 50 }]}>
      <Tap haptic="select" accessibilityLabel="Back to lobby" disabled={backDisabled} onPress={onBack} style={[g.round, { borderColor: theme.frame }, backDisabled && { opacity: .4 }]}><Text style={g.roundText}>⌂</Text></Tap>
      {/* An upright phone has no room beside the buttons: the logo gets its own row below. */}
      <View style={g.logo}>{!upright && <GameLogo game={game} height={compact ? 34 : 46} maxWidth={width - 44 - 44 - 170 - 40} />}</View>
      <SoundToggle />
      <View style={[g.credits, { borderColor: theme.frame }]}><Text style={g.coin}>$</Text><Text style={g.creditsText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={.7}>{balance ? balance.balance.toFixed(2) : '—'}</Text></View>
    </View>
    {upright && <View style={g.logoRow}><GameLogo game={game} height={38} maxWidth={width - 24} /></View>}
    <View style={g.stage} onLayout={measure} onTouchStart={play && busy ? () => play.pace.hurry() : undefined}>{stage.width > 0 && children(stage)}</View>
    {!!status && <Text style={[g.status, { color: theme.accent }]} accessibilityLiveRegion="polite" numberOfLines={1}>{status}</Text>}
    {!!notice && <View style={g.notice}>{typeof notice === 'string' ? <Text style={g.noticeText}>{notice}</Text> : notice}</View>}
    <View style={[g.console, { borderColor: theme.frame }, !landscape && width < 600 && g.consoleStacked]}>
      <Tap haptic="select" accessibilityLabel="Game information" onPress={() => setOpen(true)} style={[g.round, { borderColor: theme.frame }]}><Text style={g.info}>i</Text></Tap>
      {controls ?? <>
        <View style={[g.bet, !landscape && width < 600 && g.betStacked]}>{bet}</View>
        {win !== undefined && <View style={g.win}><Text style={g.winLabel}>WIN</Text><Text style={[g.winValue, { color: theme.accent }]} numberOfLines={1} adjustsFontSizeToFit>{win}</Text></View>}
        {play && (play.rules.turboAllowed || play.rules.autoplay.enabled) && <View style={g.side}>
          {play.rules.autoplay.enabled && <Tap haptic="select" accessibilityLabel={auto ? 'Stop autoplay' : 'Autoplay'} accessibilityState={{ selected: auto }}
            disabled={!auto && (busy || !!spin?.disabled)} onPress={() => auto ? stopAuto() : setPicking(true)}
            style={[g.small, { borderColor: theme.frame }, auto && { backgroundColor: theme.frame }, !auto && (busy || spin?.disabled) && { opacity: .45 }]}>
            <Text style={[g.smallText, auto && { color: '#100418' }]}>{auto ? '■' : 'AUTO'}</Text></Tap>}
          {play.rules.turboAllowed && <Tap haptic="select" accessibilityLabel={play.turbo ? 'Turbo on' : 'Turbo off'} accessibilityState={{ selected: play.turbo }}
            onPress={() => play.setTurbo(!play.turbo)} style={[g.small, { borderColor: theme.frame }, play.turbo && { backgroundColor: theme.accent }]}>
            <Text style={[g.smallText, { fontSize: 11 }, play.turbo && { color: '#100418' }]}>TURBO</Text></Tap>}
        </View>}
        {spinButton && <View style={{ marginRight: 4 }}><SpinButton label={spinButton.label} size={spinSize} ring={theme.accent} busy={spinButton.busy} disabled={spinButton.disabled}
          accessibilityLabel={spinButton.accessibilityLabel ?? spinButton.label} onPress={spinButton.onPress} /></View>}
      </>}
    </View>
    {overlay}
    <Modal visible={picking} transparent animationType="fade" supportedOrientations={['landscape-left', 'landscape-right', 'portrait']} onRequestClose={() => setPicking(false)}>
      <Pressable style={g.shade} onPress={() => setPicking(false)} accessibilityLabel="Close autoplay">
        <Pressable style={[g.picker, { borderColor: theme.frame }]} onPress={() => undefined}>
          <Text style={g.pickerTitle}>AUTOPLAY</Text>
          <View style={g.pickerRow}>{AUTO_COUNTS.filter(n => n <= (play?.rules.autoplay.maxRounds ?? 0)).concat(
            AUTO_COUNTS.some(n => n <= (play?.rules.autoplay.maxRounds ?? 0)) ? [] : [play?.rules.autoplay.maxRounds ?? 0]).map(n =>
            <Tap key={n} haptic="heavy" accessibilityLabel={`Autoplay ${n} rounds`} onPress={() => startAuto(n)} style={[g.count, { borderColor: theme.frame }]}>
              <Text style={g.countText}>{n}</Text></Tap>)}</View>
          <Text style={g.pickerNote}>Each round is a separate bet of {play?.stake.toFixed(2)}.{play?.rules.autoplay.stopOnAnyWin ? ' Stops on any win.' : play?.rules.autoplay.stopOnBigWin ? ` Stops on a win of ${BIG_WIN}× or more.` : ''} Tap STOP at any time.</Text>
        </Pressable>
      </Pressable>
    </Modal>
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
  side: { gap: 6, alignItems: 'center' },
  small: { minWidth: 48, height: 44, paddingHorizontal: 8, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 2, backgroundColor: '#00000066' },
  smallText: { color: '#fff', fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  picker: { alignSelf: 'center', marginTop: 'auto', marginBottom: 'auto', minWidth: 320, maxWidth: 480, padding: 18, gap: 12, borderRadius: 18, borderWidth: 2, backgroundColor: '#140826' },
  pickerTitle: { color: '#ffe58a', fontSize: 16, fontWeight: '900', letterSpacing: 3, textAlign: 'center' },
  pickerRow: { flexDirection: 'row', justifyContent: 'center', gap: 10 },
  count: { minWidth: 60, minHeight: 52, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff12' },
  countText: { color: '#fff', fontSize: 20, fontWeight: '900' },
  pickerNote: { color: '#d8c8f0', fontSize: 12, textAlign: 'center' },
  logo: { flex: 1, alignItems: 'center', overflow: 'hidden' },
  logoRow: { alignItems: 'center', paddingHorizontal: 12, paddingBottom: 4 },
  credits: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingLeft: 4, paddingRight: 12, borderRadius: 20, borderWidth: 1.5, backgroundColor: '#00000088', maxWidth: 220 },
  coin: { width: 28, height: 28, borderRadius: 14, backgroundColor: c.gold, color: c.goldInk, textAlign: 'center', lineHeight: 28, fontWeight: '900', fontSize: 15, overflow: 'hidden' },
  creditsText: { color: '#fff', fontWeight: '900', fontSize: 16, flexShrink: 1 },
  stage: { flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  status: { textAlign: 'center', fontWeight: '900', fontSize: 14, letterSpacing: 2.5, paddingVertical: 2, textShadowColor: '#000', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } },
  notice: { marginHorizontal: 10, marginBottom: 4, padding: 6, borderRadius: 10, backgroundColor: '#5a0d1ecc', borderWidth: 1, borderColor: c.bad },
  noticeText: { color: c.bad, fontSize: 12, textAlign: 'center' },
  console: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 8, marginBottom: 8, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 18, borderWidth: 2, backgroundColor: '#000000aa' },
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
