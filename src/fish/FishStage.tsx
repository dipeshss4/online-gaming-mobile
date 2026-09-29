import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ScrollView, StyleSheet, Text, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import { Canvas, Picture, Skia, type SkPicture } from '@shopify/react-native-skia';
import { useSharedValue } from 'react-native-reanimated';
import { randomUUID } from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { ApiError, type Balance, type Game, type PlayResult, request } from '../api';
import { sound } from '../sound';
import { Tap } from '../Tap';
import { Ctx2D } from './skiaCtx';
import { CANNON, DRAGON_TRAIL, H, SPECIES, TAU, TRAIL_GAP, W, byCode, drawCannon, drawDragonBody, paintSeabed, type Fish, type Species } from './art';

/**
 * Dragon Tide on the phone: the website's fish table (frontend/src/FishTable.tsx), drawn with Skia. Each bullet that
 * touches a creature is one bet on catching it; the server decides the catch and the wallet moves with its answer.
 * The table is recorded as a picture every frame on the JS thread and handed to the canvas through a shared value.
 */
type Bullet = { x: number; y: number; vx: number; vy: number; life: number; lock: number | null; level: number; hit: boolean };
type Net = { x: number; y: number; t: number; gold: boolean };
type Coin = { x: number; y: number; t: number; dur: number; delay: number; big: boolean };
type Label = { x: number; y: number; t: number; text: string; size: number };
type Banner = { text: string; mega: boolean };
export type FishProps = { game: Game; token: string; initialBalance: Balance | null; onClose: () => void; onSettled: () => void };

const money = (n: number) => n.toFixed(2);

export default function FishStage({ game, token, initialBalance, onClose, onSettled }: FishProps) {
  const { width, height } = useWindowDimensions();
  // The table keeps its 16:9 shape and fills as much of the screen as it can.
  const stageW = Math.min(width, height * 16 / 9), stageH = stageW * 9 / 16, scale = stageW / W;
  const stakes = [0.1, 0.2, 0.3, 0.5, 1, 2, 3, 5, 10, 20, 50, 100].filter(s => s >= game.minStake - 1e-9 && s <= game.maxStake + 1e-9);
  const [level, setLevel] = useState(0), [auto, setAuto] = useState(false), [lockMode, setLockMode] = useState(false);
  const [wallet, setWallet] = useState(initialBalance?.balance ?? 0);
  const [banner, setBanner] = useState<Banner | null>(null), [warning, setWarning] = useState(false), [error, setError] = useState(''), [last, setLast] = useState('');
  const [info, setInfo] = useState(false);
  const stake = stakes[Math.min(level, stakes.length - 1)] ?? game.minStake;
  const live = useRef({ stake, level, auto, lockMode, wallet, scale });
  live.current = { stake, level, auto, lockMode, wallet, scale };
  const [blank] = useState(() => { const r = Skia.PictureRecorder(); r.beginRecording(Skia.XYWHRect(0, 0, 1, 1)); return r.finishRecordingAsPicture(); });
  const picture = useSharedValue<SkPicture>(blank);
  const world = useRef({ fish: [] as Fish[], bullets: [] as Bullet[], nets: [] as Net[], coins: [] as Coin[], labels: [] as Label[],
    aim: { x: W / 2, y: H / 2 }, firing: false, cooldown: 0, reserved: 0, lock: null as number | null, nextId: 1, spawnIn: 0, dragonIn: 40,
    shake: 0, recoil: 0, sequence: -1, alive: true });
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (ms: number, fn: () => void) => { timers.current.push(setTimeout(() => { if (world.current.alive) fn() }, ms)); };

  const nameOf = (code: string) => game.engine?.paytable.find(line => line.pattern?.[0] === code)?.label.replace(/ \d+x$/, '') ?? code;
  const settle = useCallback(async (fish: Fish, betStake: number) => {
    const w = world.current;
    try {
      const result = await request<PlayResult>(`/api/games/${game.code}/play`, token, { requestId: randomUUID(), stake: betStake, selection: fish.s.code }, 'POST');
      if (!w.alive) return;
      // Answers can arrive out of order; only a newer wallet state replaces the shown one.
      if (result.walletSequence == null || result.walletSequence > w.sequence) { w.sequence = result.walletSequence ?? w.sequence; setWallet(result.balance); }
      if (result.multiplier > 0) {
        if (!fish.caught) fish.caught = .001;
        const count = Math.min(26, 4 + Math.round(Math.log2(result.multiplier) * 4));
        for (let i = 0; i < count; i++) w.coins.push({ x: fish.x + (Math.random() - .5) * fish.s.r, y: fish.y + (Math.random() - .5) * fish.s.r, t: 0, dur: .8 + Math.random() * .4, delay: .25 + i * .03, big: result.multiplier >= 20 });
        w.labels.push({ x: fish.x, y: fish.y - fish.s.r, t: 0, text: `+${money(result.payout)}`, size: result.multiplier >= 100 ? 54 : result.multiplier >= 20 ? 40 : 30 });
        setLast(`${nameOf(fish.s.code)} ×${result.multiplier} · +${money(result.payout)}`);
        if (result.multiplier >= 100) { w.shake = 1.2; sound.play('fanfare'); void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); setBanner({ text: `MEGA CATCH ×${result.multiplier}`, mega: true }); later(3400, () => setBanner(null)); }
        else if (result.multiplier >= 20) { w.shake = .5; sound.play('win-big'); void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); setBanner({ text: `BIG CATCH ×${result.multiplier}`, mega: false }); later(2400, () => setBanner(null)); }
        else sound.play('coins');
      } else fish.flash = .25;
      onSettled();
    } catch (cause) {
      if (!w.alive) return;
      w.firing = false; setAuto(false);
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'The shot could not be settled');
      try { const b = await request<Balance>('/api/wallet', token); if (w.alive) setWallet(b.balance); } catch { /* keep the last balance */ }
    } finally { w.reserved = Math.max(0, w.reserved - betStake); }
  }, [game.code, token, onSettled]); // eslint-disable-line react-hooks/exhaustive-deps
  const settleRef = useRef(settle); settleRef.current = settle;
  const paytableRef = useRef(game.engine?.paytable ?? []); paytableRef.current = game.engine?.paytable ?? [];

  useEffect(() => {
    const w = world.current; w.alive = true;
    let reduced = false; void AccessibilityInfo.isReduceMotionEnabled().then(value => { reduced = value; });
    // The seabed never changes: record it once and replay it every frame.
    const seabedRecorder = Skia.PictureRecorder();
    paintSeabed(new Ctx2D(seabedRecorder.beginRecording(Skia.XYWHRect(0, 0, W, H))));
    const seabed = seabedRecorder.finishRecordingAsPicture();

    const spawn = (s: Species, from?: { dir: 1 | -1; y: number; x?: number }) => {
      const dir: 1 | -1 = from?.dir ?? (Math.random() < .5 ? 1 : -1), baseY = from?.y ?? 70 + Math.random() * (H - 260);
      const fish: Fish = { id: w.nextId++, s, dir, x: from?.x ?? (dir > 0 ? -s.r * 2.5 : W + s.r * 2.5), baseY, y: baseY,
        speed: s.speed[0] + Math.random() * (s.speed[1] - s.speed[0]), amp: s.code === 'DRAGON' ? 120 : 10 + Math.random() * 40,
        freq: s.code === 'DRAGON' ? .45 : .4 + Math.random() * .9, phase: Math.random() * TAU, t: Math.random() * 10, heading: 0, caught: 0, flash: 0, trail: [] };
      w.fish.push(fish); return fish;
    };
    const pick = () => { const total = SPECIES.reduce((sum, s) => sum + s.weight, 0); let roll = Math.random() * total; for (const s of SPECIES) { roll -= s.weight; if (roll < 0) return s; } return SPECIES[0]; };
    const school = () => {
      const s = byCode[Math.random() < .5 ? 'CLOWNFISH' : 'SHRIMP'], dir: 1 | -1 = Math.random() < .5 ? 1 : -1, y = 120 + Math.random() * (H - 360), ring = Math.random() < .5;
      for (let i = 0; i < 8; i++) {
        const o = ring ? { dx: Math.cos(i / 8 * TAU) * 60, dy: Math.sin(i / 8 * TAU) * 45 } : { dx: i * 42, dy: Math.sin(i) * 12 };
        const f = spawn(s, { dir, y: y + o.dy, x: dir > 0 ? -60 - o.dx : W + 60 + o.dx }); f.speed = 85; f.amp = 12; f.freq = .7; f.phase = 0;
      }
    };
    for (let i = 0; i < 14; i++) spawn(pick(), { dir: Math.random() < .5 ? 1 : -1, y: 70 + Math.random() * (H - 260), x: Math.random() * W });

    let frame = 0, last = Date.now(), clock = 0, schoolIn = 18, hud = 0;
    const multiplierOf = (code: string) => paytableRef.current.find(line => line.pattern?.[0] === code)?.multiplier ?? '';
    const loop = () => {
      const now = Date.now(), dt = Math.min((now - last) / 1000, .05); last = now; clock += dt;
      const L = live.current;
      // ---- spawn
      w.spawnIn -= dt; w.dragonIn -= dt; schoolIn -= dt;
      if (w.spawnIn <= 0 && w.fish.filter(f => !f.caught).length < 22) { spawn(pick()); w.spawnIn = .5 + Math.random() * .9; }
      if (schoolIn <= 0) { school(); schoolIn = 25 + Math.random() * 15; }
      if (w.dragonIn <= 0 && !w.fish.some(f => f.s.code === 'DRAGON' && !f.caught)) {
        setWarning(true); later(2600, () => setWarning(false));
        later(1800, () => { const d = spawn(byCode.DRAGON, { dir: Math.random() < .5 ? 1 : -1, y: H * .38 }); d.x = d.dir > 0 ? -140 : W + 140; });
        w.dragonIn = 75 + Math.random() * 30;
      }
      // ---- fish
      for (const f of w.fish) {
        f.t += dt; f.flash = Math.max(0, f.flash - dt);
        if (f.caught) { f.caught += dt; continue; }
        const px = f.x, py = f.y;
        f.x += f.dir * f.speed * dt; f.y = f.baseY + Math.sin(f.t * f.freq + f.phase) * f.amp; f.heading = Math.atan2(f.y - py, f.x - px);
        if (f.s.code === 'DRAGON') { const head = f.trail[0]; if (!head || Math.hypot(head.x - f.x, head.y - f.y) >= TRAIL_GAP) { f.trail.unshift({ x: f.x, y: f.y }); if (f.trail.length > DRAGON_TRAIL) f.trail.pop(); } }
      }
      const tail = (f: Fish) => f.s.code === 'DRAGON' ? DRAGON_TRAIL * TRAIL_GAP : 0;
      w.fish = w.fish.filter(f => f.caught ? f.caught < 1.1 : f.dir > 0 ? f.x < W + f.s.r * 3 + tail(f) : f.x > -f.s.r * 3 - tail(f));
      if (w.lock !== null && !w.fish.some(f => f.id === w.lock && !f.caught && f.x > 0 && f.x < W)) w.lock = null;
      const locked = w.lock === null ? null : w.fish.find(f => f.id === w.lock) ?? null;
      // ---- fire
      w.cooldown -= dt; w.recoil = Math.max(0, w.recoil - dt * 6);
      const target = locked ? { x: locked.x, y: locked.y } : w.aim;
      if ((w.firing || L.auto) && w.cooldown <= 0) {
        if (L.wallet - w.reserved + 1e-9 < L.stake) { w.firing = false; if (L.auto) setAuto(false); setError('Not enough credits for this bet. Lower the bet or add credits.'); }
        else if (w.bullets.length < 14) {
          const a = Math.atan2(target.y - CANNON.y, target.x - CANNON.x), v = 760;
          w.bullets.push({ x: CANNON.x + Math.cos(a) * 92, y: CANNON.y + Math.sin(a) * 92, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 7, lock: locked ? locked.id : null, level: L.level, hit: false });
          w.reserved += L.stake; w.cooldown = .22; w.recoil = 1; sound.play('shot');
        }
      }
      // ---- bullets: bounce off the walls until they touch a creature
      for (const b of w.bullets) {
        if (b.hit) continue;
        const lockFish = b.lock === null ? null : w.fish.find(f => f.id === b.lock && !f.caught) ?? null;
        if (b.lock !== null && !lockFish) b.lock = null;
        if (lockFish) { const a = Math.atan2(lockFish.y - b.y, lockFish.x - b.x), v = Math.hypot(b.vx, b.vy); b.vx += (Math.cos(a) * v - b.vx) * Math.min(1, dt * 8); b.vy += (Math.sin(a) * v - b.vy) * Math.min(1, dt * 8); }
        b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
        if (b.x < 8) { b.x = 8; b.vx = Math.abs(b.vx); } else if (b.x > W - 8) { b.x = W - 8; b.vx = -Math.abs(b.vx); }
        if (b.y < 8) { b.y = 8; b.vy = Math.abs(b.vy); } else if (b.y > H - 90 && b.vy > 0) b.vy = -Math.abs(b.vy);
        for (const f of lockFish ? [lockFish] : w.fish) {
          if (f.caught || f.x < -20 || f.x > W + 20) continue;
          const points = f.s.code === 'DRAGON' ? [{ x: f.x, y: f.y }, ...f.trail.filter((_, i) => i % 2 === 0)] : [{ x: f.x, y: f.y }];
          const radius = f.s.r * f.s.hit + 8;
          if (points.some((p, i) => Math.hypot(b.x - p.x, b.y - p.y) < (i === 0 ? radius : radius * .5))) {
            b.life = 0; b.hit = true; w.nets.push({ x: b.x, y: b.y, t: 0, gold: (stakes[b.level] ?? 0) >= 5 });
            void settleRef.current(f, stakes[b.level] ?? L.stake); break;
          }
        }
      }
      // A bullet that never found a creature was never a bet: its reservation is released.
      for (const b of w.bullets) if (b.life <= 0 && !b.hit) w.reserved = Math.max(0, w.reserved - (stakes[b.level] ?? 0));
      w.bullets = w.bullets.filter(b => b.life > 0);
      for (const n of w.nets) n.t += dt; w.nets = w.nets.filter(n => n.t < .6);
      for (const c of w.coins) c.t += dt; w.coins = w.coins.filter(c => c.t < c.delay + c.dur);
      for (const l of w.labels) l.t += dt; w.labels = w.labels.filter(l => l.t < 1.4);
      w.shake = Math.max(0, w.shake - dt);

      // ---- draw
      const recorder = Skia.PictureRecorder();
      const c = new Ctx2D(recorder.beginRecording(Skia.XYWHRect(0, 0, W * L.scale, H * L.scale)));
      c.save(); c.scale(L.scale, L.scale);
      if (w.shake > 0 && !reduced) c.translate((Math.random() - .5) * 14 * w.shake, (Math.random() - .5) * 14 * w.shake);
      c.drawPicture(seabed);
      c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 6; i++) {
        const x = (i * 240 + Math.sin(clock * .2 + i) * 60) % (W + 200) - 100, g = c.createLinearGradient(x, 0, x - 120, H * .8);
        g.addColorStop(0, 'rgba(140,240,255,.10)'); g.addColorStop(1, 'rgba(140,240,255,0)');
        c.fillStyle = g; c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 70, 0); c.lineTo(x - 80, H * .8); c.lineTo(x - 190, H * .8); c.fill();
      }
      c.globalCompositeOperation = 'source-over';
      c.lineCap = 'round';
      for (let i = 0; i < 16; i++) {
        const x = 40 + i * 80 + (i % 3) * 13, h = 70 + (i * 37) % 60, sway = Math.sin(clock * 1.3 + i) * 14;
        c.strokeStyle = i % 2 ? '#1f8a6e' : '#2aa37a'; c.lineWidth = 7; c.beginPath(); c.moveTo(x, H - 60); c.quadraticCurveTo(x + sway, H - 60 - h * .5, x + sway * 1.6, H - 60 - h); c.stroke();
      }
      for (const f of [...w.fish].sort((a, b) => a.s.r - b.s.r)) {
        const dying = f.caught > 0;
        if (f.flash > 0) c.saveLayer(); else c.save();
        if (dying) c.globalAlpha = Math.max(0, 1 - f.caught / 1.1);
        if (f.s.code === 'DRAGON') {
          const fire = c.createRadialGradient(f.x, f.y, 10, f.x, f.y, 180); fire.addColorStop(0, 'rgba(255,120,40,.35)'); fire.addColorStop(1, 'rgba(255,60,20,0)');
          c.fillStyle = fire; c.beginPath(); c.arc(f.x, f.y, 180, 0, TAU); c.fill(); drawDragonBody(c, f, f.t);
        }
        c.translate(f.x, f.y);
        let angle = f.heading; if (f.dir < 0) { c.scale(-1, 1); angle = Math.PI - angle; }
        c.rotate(Math.max(-.35, Math.min(.35, Math.atan2(Math.sin(angle), Math.cos(angle)) * .6)));
        if (dying) { c.rotate(f.caught * 9); c.scale(1 + f.caught * .4, 1 + f.caught * .4); }
        f.s.draw(c, f.s.r, f.t);
        if (f.flash > 0) { c.globalCompositeOperation = 'source-atop'; c.fillStyle = `rgba(255,70,70,${Math.min(1, f.flash * 2)})`; c.fillRect(-f.s.r * 2, -f.s.r * 2, f.s.r * 4, f.s.r * 4); }
        c.restore();
        if (!dying && f.s.r >= 56) {
          const tag = f.s.code === 'DRAGON' ? '×100–500' : `×${multiplierOf(f.s.code)}`;
          c.font = '800 20px sans-serif'; c.textAlign = 'center';
          const tw = c.measureText(tag).width + 20;
          c.fillStyle = 'rgba(20,6,40,.75)'; c.beginPath(); c.roundRect(f.x - tw / 2, f.y + f.s.r * .75, tw, 28, 14); c.fill();
          c.fillStyle = '#ffd54a'; c.fillText(tag, f.x, f.y + f.s.r * .75 + 21);
        }
        if (locked && f.id === locked.id) {
          c.strokeStyle = '#ff4fd8'; c.lineWidth = 3; c.setLineDash([10, 8]); c.lineDashOffset = -clock * 40;
          c.beginPath(); c.arc(f.x, f.y, f.s.r * 1.1 + 10, 0, TAU); c.stroke(); c.setLineDash([]);
        }
      }
      c.strokeStyle = 'rgba(200,245,255,.35)'; c.lineWidth = 1.2;
      for (let i = 0; i < 20; i++) { const x = (i * 149 + Math.sin(clock + i) * 12) % W, y = H - ((clock * (22 + i % 5 * 9) + i * 97) % (H + 40)); c.beginPath(); c.arc(x, y, 2 + i % 4, 0, TAU); c.stroke(); }
      for (const b of w.bullets) {
        const gold = (stakes[b.level] ?? 0) >= 5;
        c.save(); c.translate(b.x, b.y); c.rotate(Math.atan2(b.vy, b.vx));
        const g = c.createRadialGradient(0, 0, 1, 0, 0, 16); g.addColorStop(0, '#ffffff'); g.addColorStop(.4, gold ? '#ffd54a' : '#7df9ff'); g.addColorStop(1, 'rgba(0,200,255,0)');
        c.fillStyle = g; c.beginPath(); c.ellipse(-6, 0, 18, 8, 0, 0, TAU); c.fill(); c.restore();
      }
      for (const n of w.nets) {
        const k = n.t / .6, r = 20 + k * 46;
        c.save(); c.globalAlpha = 1 - k; c.strokeStyle = n.gold ? '#ffd54a' : '#9ff6ff'; c.lineWidth = 2;
        c.beginPath(); c.arc(n.x, n.y, r, 0, TAU); c.stroke();
        c.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; c.moveTo(n.x, n.y); c.lineTo(n.x + Math.cos(a) * r, n.y + Math.sin(a) * r); } c.stroke();
        c.beginPath(); c.arc(n.x, n.y, r * .55, 0, TAU); c.stroke(); c.restore();
      }
      for (const coin of w.coins) {
        if (coin.t < coin.delay) continue;
        const k = Math.min(1, (coin.t - coin.delay) / coin.dur), e = k * k * (3 - 2 * k);
        const x = coin.x + (CANNON.x - coin.x) * e, y = coin.y + (CANNON.y - coin.y) * e - Math.sin(k * Math.PI) * 120, s = (coin.big ? 13 : 10) * (1 - k * .3), spin = Math.abs(Math.cos(coin.t * 10));
        const g = c.createRadialGradient(x - s * .3, y - s * .3, 1, x, y, s); g.addColorStop(0, '#fff7c2'); g.addColorStop(.5, '#ffd24a'); g.addColorStop(1, '#b8780a');
        c.fillStyle = g; c.beginPath(); c.ellipse(x, y, s * Math.max(.2, spin), s, 0, 0, TAU); c.fill();
      }
      for (const l of w.labels) {
        const k = l.t / 1.4, y = l.y - k * 70;
        c.save(); c.globalAlpha = k < .8 ? 1 : 1 - (k - .8) / .2; c.font = `900 ${Math.round(l.size * (k < .15 ? .6 + k * 2.6 : 1))}px sans-serif`; c.textAlign = 'center';
        c.lineWidth = 6; c.strokeStyle = '#5a1a00'; c.strokeText(l.text, l.x, y); c.fillStyle = '#ffd54a'; c.fillText(l.text, l.x, y); c.restore();
      }
      const aimAt = locked ? { x: locked.x, y: locked.y } : w.aim, angle = Math.atan2(aimAt.y - CANNON.y, aimAt.x - CANNON.x);
      c.save(); c.strokeStyle = 'rgba(255,255,255,.18)'; c.setLineDash([6, 10]); c.lineWidth = 2;
      c.beginPath(); c.moveTo(CANNON.x + Math.cos(angle) * 110, CANNON.y + Math.sin(angle) * 110); c.lineTo(CANNON.x + Math.cos(angle) * 260, CANNON.y + Math.sin(angle) * 260); c.stroke(); c.restore();
      drawCannon(c, angle, L.level, stakes.length, w.recoil);
      c.restore();
      picture.value = recorder.finishRecordingAsPicture();
      hud += dt;
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => { w.alive = false; cancelAnimationFrame(frame); timers.current.forEach(clearTimeout); timers.current = []; };
  }, [game.code, stakes.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const toWorld = (event: GestureResponderEvent) => ({ x: event.nativeEvent.locationX / scale, y: Math.min(event.nativeEvent.locationY / scale, H - 110) });
  const press = (event: GestureResponderEvent) => {
    const w = world.current, p = toWorld(event); w.aim = p; setError('');
    if (live.current.lockMode) {
      const hit = [...w.fish].filter(f => !f.caught).sort((a, b) => b.s.r - a.s.r).find(f => Math.hypot(f.x - p.x, f.y - p.y) < f.s.r * 1.2 + 24);
      w.lock = hit ? hit.id : null; if (hit) { sound.play('tap'); return; }
    }
    w.firing = true;
  };

  const rows = paytableRows(game);
  return <View style={st.root}>
    <View style={{ width: stageW, height: stageH }}>
      <View style={StyleSheet.absoluteFill} onStartShouldSetResponder={() => true} onMoveShouldSetResponder={() => true}
        onResponderGrant={press} onResponderMove={event => { world.current.aim = toWorld(event); }} onResponderRelease={() => { world.current.firing = false; }} onResponderTerminate={() => { world.current.firing = false; }}
        accessible accessibilityLabel={`${game.name} fish table. Touch and hold to fire at the creatures.`}>
        <Canvas style={{ width: stageW, height: stageH }} pointerEvents="none"><Picture picture={picture} /></Canvas>
      </View>
      <View style={st.top} pointerEvents="box-none">
        <Tap onPress={onClose} style={st.chip} accessibilityLabel="Back to games"><Text style={st.chipText}>‹ Lobby</Text></Tap>
        <Text style={st.title}>{game.name}</Text>
        <View style={st.topRight}>
          <View style={st.credits}><Text style={st.creditsLabel}>CREDITS</Text><Text style={st.creditsValue} testID="fish-balance">{money(wallet)}</Text></View>
          <Tap onPress={() => setInfo(true)} style={st.round} accessibilityLabel="Paytable and rules"><Text style={st.chipText}>i</Text></Tap>
        </View>
      </View>
      {!!last && <View style={st.last} pointerEvents="none"><Text style={st.lastText}>{last}</Text></View>}
      {warning && <View style={st.warning} pointerEvents="none"><Text style={st.warningKicker}>WARNING</Text><Text style={st.warningTitle}>THE TIDE DRAGON APPROACHES</Text><Text style={st.warningSub}>×100 – ×500</Text></View>}
      {banner && <View style={[st.banner, banner.mega && st.bannerMega]} pointerEvents="none"><Text style={[st.bannerText, banner.mega && { fontSize: 34 }]}>{banner.text}</Text></View>}
      {!!error && <Tap onPress={() => setError('')} style={st.error} accessibilityLabel="Dismiss"><Text style={st.errorText}>{error}  ×</Text></Tap>}
      <View style={st.bottom} pointerEvents="box-none">
        <View style={st.bottomSide}>
          <Tap onPress={() => { setLockMode(on => !on); world.current.lock = null; }} style={[st.side, lockMode && st.sideOn]} accessibilityLabel="Lock target" accessibilityState={{ selected: lockMode }}><Text style={st.sideIcon}>🎯</Text><Text style={st.sideText}>Lock</Text></Tap>
        </View>
        <View style={{ width: stageW * .28 }} />
        <View style={[st.bottomSide, { justifyContent: 'flex-start' }]}>
          <View style={st.bet}>
            <Tap onPress={() => setLevel(l => Math.max(0, l - 1))} disabled={level === 0} style={[st.betButton, level === 0 && { opacity: .4 }]} accessibilityLabel="Lower bet"><Text style={st.betButtonText}>−</Text></Tap>
            <View style={st.betValue}><Text style={st.creditsLabel}>BET</Text><Text style={st.betText} testID="fish-stake">{money(stake)}</Text></View>
            <Tap onPress={() => setLevel(l => Math.min(stakes.length - 1, l + 1))} disabled={level >= stakes.length - 1} style={[st.betButton, level >= stakes.length - 1 && { opacity: .4 }]} accessibilityLabel="Raise bet"><Text style={st.betButtonText}>+</Text></Tap>
          </View>
          <Tap onPress={() => { setAuto(on => !on); setError(''); }} style={[st.side, auto && st.sideOn]} accessibilityLabel="Auto fire" accessibilityState={{ selected: auto }}><Text style={st.sideIcon}>⟳</Text><Text style={st.sideText}>Auto</Text></Tap>
        </View>
      </View>
      {info && <View style={st.infoWrap}>
        <View style={st.info}>
          <View style={st.infoHead}><Text style={st.infoTitle}>Paytable</Text><Tap onPress={() => setInfo(false)} style={st.round} accessibilityLabel="Close"><Text style={st.chipText}>×</Text></Tap></View>
          <ScrollView contentContainerStyle={st.pay}>
            {rows.map(row => <View key={row.code} style={st.payRow}><Text style={st.payName}>{row.name}</Text><Text style={st.payValue}>{row.label}</Text></View>)}
            {(game.engine?.rules ?? []).map(rule => <Text key={rule} style={st.rule}>• {rule}</Text>)}
          </ScrollView>
        </View>
      </View>}
    </View>
  </View>;
}

function paytableRows(game: Game) {
  const rows = new Map<string, { code: string; name: string; values: number[] }>();
  for (const line of game.engine?.paytable ?? []) {
    const code = line.pattern?.[0] ?? line.label;
    const row = rows.get(code) ?? { code, name: line.label.replace(/ \d+x$/, ''), values: [] };
    row.values.push(line.multiplier); rows.set(code, row);
  }
  return [...rows.values()].map(row => ({ ...row, label: row.values.length > 1 ? `×${Math.min(...row.values)}–${Math.max(...row.values)}` : `×${row.values[0]}` }));
}

const gold = '#ffd54a', ink = '#ffffff', dim = '#bfe9ff', panel = 'rgba(10,20,50,.8)';
const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#041630', alignItems: 'center', justifyContent: 'center' },
  top: { position: 'absolute', top: 4, left: 8, right: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, backgroundColor: panel, borderWidth: 1, borderColor: 'rgba(255,255,255,.3)', justifyContent: 'center' },
  chipText: { color: ink, fontWeight: '800', fontSize: 14 },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: panel, borderWidth: 1, borderColor: 'rgba(255,255,255,.3)', alignItems: 'center', justifyContent: 'center' },
  title: { color: gold, fontWeight: '900', fontSize: 18, letterSpacing: 1.5, textShadowColor: '#6b21a8', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  credits: { paddingHorizontal: 12, paddingVertical: 3, borderRadius: 12, backgroundColor: panel, borderWidth: 1, borderColor: 'rgba(255,213,74,.6)', alignItems: 'flex-end' },
  creditsLabel: { color: dim, fontSize: 11, letterSpacing: 1.2, fontWeight: '700' },
  creditsValue: { color: gold, fontSize: 17, fontWeight: '900', fontVariant: ['tabular-nums'] },
  last: { position: 'absolute', left: 8, top: 54, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: panel },
  lastText: { color: '#ffe68a', fontWeight: '800', fontSize: 13 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 6, flexDirection: 'row', alignItems: 'flex-end' },
  bottomSide: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10 },
  side: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#2a1266', borderWidth: 2, borderColor: 'rgba(255,255,255,.35)', alignItems: 'center', justifyContent: 'center' },
  sideOn: { backgroundColor: '#9b1c8a', borderColor: '#ff4fd8' },
  sideIcon: { color: ink, fontSize: 15 }, sideText: { color: ink, fontSize: 11, fontWeight: '800' },
  bet: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 4, borderRadius: 24, backgroundColor: 'rgba(18,5,43,.88)', borderWidth: 2, borderColor: gold },
  betButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: gold, alignItems: 'center', justifyContent: 'center' },
  betButtonText: { color: '#4a1d00', fontSize: 24, fontWeight: '900', lineHeight: 26 },
  betValue: { minWidth: 50, alignItems: 'center' }, betText: { color: gold, fontSize: 15, fontWeight: '900', fontVariant: ['tabular-nums'] },
  warning: { position: 'absolute', left: 0, right: 0, top: '38%', paddingVertical: 10, alignItems: 'center', backgroundColor: 'rgba(160,10,10,.85)' },
  warningKicker: { color: '#ffd0c8', fontSize: 11, letterSpacing: 6, fontWeight: '900' },
  warningTitle: { color: ink, fontSize: 22, fontWeight: '900', letterSpacing: 1 }, warningSub: { color: gold, fontWeight: '900' },
  banner: { position: 'absolute', alignSelf: 'center', top: '22%', paddingHorizontal: 22, paddingVertical: 8, borderRadius: 18, backgroundColor: 'rgba(122,42,0,.6)' },
  bannerMega: { backgroundColor: 'rgba(160,60,0,.75)' },
  bannerText: { color: ink, fontSize: 26, fontWeight: '900', textShadowColor: '#ffb800', textShadowRadius: 12, textShadowOffset: { width: 0, height: 0 } },
  error: { position: 'absolute', alignSelf: 'center', bottom: '16%', maxWidth: '86%', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, backgroundColor: 'rgba(120,10,30,.92)' },
  errorText: { color: ink, fontWeight: '700', fontSize: 13 },
  infoWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(4,6,20,.72)', alignItems: 'center', justifyContent: 'center', padding: 12 },
  info: { width: '80%', maxHeight: '92%', borderRadius: 18, padding: 14, backgroundColor: '#0b2c4d', borderWidth: 2, borderColor: 'rgba(255,213,74,.6)' },
  infoHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  infoTitle: { color: gold, fontSize: 18, fontWeight: '900' },
  pay: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  payRow: { width: '32%', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, backgroundColor: 'rgba(255,255,255,.07)' },
  payName: { color: ink, fontWeight: '700', fontSize: 12 }, payValue: { color: gold, fontWeight: '900', fontSize: 12 },
  rule: { width: '100%', color: '#cfe7ff', fontSize: 12, marginTop: 4 },
});
