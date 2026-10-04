import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ImageBackground, StyleSheet, Text, View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { ApiError, Balance, Game, PlayResult, request } from './api';
import { clearPending, PendingBet, readPending, savePending } from './pendingBet';
import { s } from './styles';
import { GameShell, PayRow, Rules } from './GameShell';
import { themeOf } from './GameLogo';
import { SpinReel } from './fx/SpinReel';
import { Paylines } from './fx/Paylines';

import { MarqueeFrame } from './fx/MarqueeFrame';
import { SymbolArt } from './WebLook';
import { Tap } from './Tap';
import { BetBar } from './BetBar';
import { feel } from './theme';
import { Win, WinCelebration } from './WinCelebration';
import { BigWin } from './fx/BigWin';
import { sound } from './sound';

export const supportsNativeSlots = (game: Game) => ['REEL_3', 'GRID_3X3'].includes(game.engine?.layout || '');
const glyphs: Record<string, string> = { '7': '7', CHERRY: '🍒', LEMON: '🍋', ORANGE: '🍊', BELL: '🔔', STAR: '★', BAR: 'BAR', DIAMOND: '◆', KOI: '🐟', RED_LANTERN: '🏮', JADE_LION: '🦁', JADE_COMPASS: '◈', CRANE: '🪽', FLAME_LOTUS: '🪷' };
const cash = (n: number) => n.toFixed(2);
export function NativeSlots({ game, token, userId, initialBalance, onClose, onSettled }: { game: Game; token: string; userId: string; initialBalance: Balance | null; onClose: () => void; onSettled: () => void }) {
  const [stake, setStake] = useState(String(game.minStake));
  const [wallet, setWallet] = useState(initialBalance);
  const [pending, setPending] = useState<PendingBet | null>(null);
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [result, setResult] = useState<PlayResult | null>(null), [stopped, setStopped] = useState(3), [reduced, setReduced] = useState(false);
  const [win, setWin] = useState<Win | null>(null), [tease, setTease] = useState(false);
  const locked = useRef(false), alive = useRef(true);
  const grid = game.engine?.layout === 'GRID_3X3';
  const count = grid ? 9 : 3;
  const idle = Array.from({ length: count }, (_, i) => game.engine?.symbols?.[i % (game.engine.symbols.length || 1)] || '7');
  useEffect(() => {
    alive.current = true;
    readPending(userId).then(value => { if (alive.current) { setPending(value); setReady(true); } }).catch(() => setError('Cannot read saved bet. Play is locked to prevent duplicate bets.'));
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => { alive.current = false; listener.remove(); };
  }, [userId]);
  async function spin() {
    if (locked.current || !ready || (pending && pending.gameCode !== game.code)) return;
    const amount = Number(stake);
    if (!pending && (!/^\d+(\.\d{1,2})?$/.test(stake) || amount < game.minStake || amount > Math.min(game.maxStake, 1000))) { setError(`Enter a stake between ${game.minStake} and ${Math.min(game.maxStake, 1000)}, with at most 2 decimals.`); return; }
    if (!pending && wallet && amount > wallet.balance) { setError('Insufficient available balance.'); return; }
    locked.current = true; setBusy(true); setError(''); setResult(null); setStopped(0); setWin(null);
    let submitted = false;
    try {
      const bet = pending || { gameCode: game.code, requestId: randomUUID(), stake: amount };
      // Persist before sending; never create a new request ID after an uncertain response.
      await savePending(userId, bet); setPending(bet); submitted = true;
      sound.play('spin');
      const data = await request<PlayResult>(`/api/games/${encodeURIComponent(game.code)}/play`, token, { requestId: bet.requestId, stake: bet.stake });
      if (data.requestId !== bet.requestId || data.gameCode !== game.code || data.symbols.length !== count) throw new Error('Unexpected result. Keep this request for reconciliation.');
      if (!alive.current) return;
      setResult(data);
      // The last reel teases (spins on, slower, glowing) when the first two already line up on the paying row.
      const row = (col: number) => grid ? data.symbols[3 + col] : data.symbols[col];
      const teasing = row(0) === row(1);
      setTease(teasing);
      for (let reel = 1; reel <= 3; reel++) {
        if (reel === 3 && teasing) sound.play('tease');
        if (!reduced) await new Promise(resolve => setTimeout(resolve, reel === 1 ? 900 : reel === 3 && teasing ? 1500 : 350));
        if (!alive.current) return;
        setStopped(reel); sound.play('reel-land');
      }
      await clearPending(userId); setPending(null);
      setWallet({ ...wallet, balance: data.balance, currency: data.currency });
      feel(data.payout > 0 ? 'win' : 'tap'); sound.result(data.payout > 0 ? data.multiplier : 0);
      if (data.payout > 0) setWin({ payout: data.payout, stake: data.stake, multiplier: data.multiplier, currency: data.currency, id: data.betId });
      onSettled();
    } catch (e) {
      if (!alive.current) return;
      // A first-attempt validation/auth rejection did not settle. Uncertain retries stay locked.
      if (!pending && e instanceof ApiError && [400, 401, 403, 404, 422, 429].includes(e.status)) {
        await clearPending(userId).then(() => setPending(null)).catch(() => {});
      }
      feel('warn');
      setError(`${e instanceof Error ? e.message : 'Unable to play'}${submitted ? ' If a bet is pending, use Recover bet with the same request ID.' : ''}`);
      setStopped(3); onSettled();
    } finally { locked.current = false; if (alive.current) setBusy(false); }
  }
  const display = result?.symbols || idle;
  const settled = result && !busy;
  const status = busy ? 'GOOD LUCK!' : settled ? (result.payout > 0 ? `WIN ${cash(result.payout)} · ${result.multiplier}×` : 'SO CLOSE · SPIN AGAIN') : grid ? 'CENTER ROW PAYS' : 'ONE PAYLINE · CENTER ROW';
  return <GameShell game={game} balance={wallet} onBack={onClose} backDisabled={busy} status={status}
    notice={error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text>
      : pending && !busy ? `Pending: ${pending.gameCode} · ${cash(pending.stake)}. ${pending.gameCode !== game.code ? 'Open that game to recover the round.' : 'SPIN resends this exact bet, not a new one.'}` : undefined}
    bet={<BetBar inline label="BET PER SPIN" value={pending ? pending.stake : Number(stake)} onChange={value => setStake(value.toFixed(2))} min={game.minStake} max={game.maxStake} disabled={busy || !!pending} />}
    win={cash(settled ? result.payout : 0)}
    spin={{ busy, label: busy ? 'SPIN' : pending ? 'RECOVER' : 'SPIN', accessibilityLabel: pending ? 'Recover bet' : 'Spin', onPress: spin, disabled: busy || !ready || (!!pending && pending.gameCode !== game.code) }}
    overlay={<><WinCelebration win={win} /><BigWin win={win} /></>}
    info={<>
      {game.engine?.paytable?.map((line, i) => <PayRow key={i} label={line.label} pays={`${line.multiplier}×`} />)}
      <Text style={s.small}>Each spin debits the bet shown. Returns include the bet. Outcomes and payouts are decided by the game server.</Text>
      <Rules rules={game.engine?.rules} />
    </>}>
    {stage => {
      // Three reels, as large as the stage allows: three rows high, three reels (and the cabinet's border) wide.
      const cellHeight = Math.max(44, Math.floor(Math.min((stage.height - 38) / 3, (stage.width - 84) / 3.9)));
      const theme = themeOf(game), strip = game.engine?.symbols?.length ? game.engine.symbols : ['7', 'BAR', 'CHERRY'];
      const paid = !!settled && result.payout > 0;
      return <MarqueeFrame colors={grid ? ['#ffd08a', '#a8300f', '#4a0d04'] : game.presentation?.skin === 'fruit' ? ['#b4ffd0', '#0b7a5a', '#043a24'] : ['#fff1b0', '#b06a0f', '#4a1a00']} excited={paid} reduced={reduced}>
        <ImageBackground source={grid ? require('../assets/web/lucky-fire-blitz-bg-v1.png') : undefined}
          style={[g.cabinet, { backgroundColor: game.presentation?.skin === 'fruit' ? '#063a33' : theme.reels }]} imageStyle={{ opacity: .55 }}>
          <View style={g.reels}>{[0, 1, 2].map(col => <SpinReel key={col} index={col} size={cellHeight} width={cellHeight * 1.2} reduced={reduced} strip={strip}
            spinning={busy && stopped <= col} tease={busy && tease && col === 2 && stopped === 2}
            cells={grid ? [display[col], display[col + 3], display[col + 6]] : [strip[(col + 1) % strip.length], display[col], strip[(col + 3) % strip.length]]}
            lit={row => paid && row === 1 ? '#ffd23f' : null} dim={paid}
            render={(symbol, size) => <SymbolArt symbol={symbol} size={size - 8} />} />)}
            <Paylines geometry={{ left: 0, top: 0, width: cellHeight * 1.2, height: cellHeight, gap: 10 }} lines={paid ? [{ color: '#ffd23f', cells: [[0, 1], [1, 1], [2, 1]] }] : []} />
          </View>
          {!grid && <View pointerEvents="none" style={[g.payline, { top: 8 + cellHeight * 1.5 }]} />}
        </ImageBackground>
      </MarqueeFrame>;
    }}
  </GameShell>;
}
const g = StyleSheet.create({
  cabinet: { overflow: 'hidden', padding: 4, borderRadius: 10 },
  payline: { position: 'absolute', left: 4, right: 4, height: 2, backgroundColor: '#ffd23f', opacity: .7 },
  reels: { flexDirection: 'row', gap: 10, justifyContent: 'center', alignSelf: 'center' },
});
