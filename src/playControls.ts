import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { Game } from './api';

/**
 * How a reel game's round is paced, and the player's controls over it: TURBO (shorter spins and pauses, where the
 * admin allows it in Admin → Games → Gameplay), STOP (a tap during the spin rushes the rest of the show: the result
 * was the server's from the start, so nothing about the outcome changes) and AUTO (a run of rounds, where the admin
 * has switched autoplay on; each is still its own server bet, so limits, breaks and balance checks apply to every one).
 *
 * A game waits with {@code pace.wait(ms)} instead of a plain timer, calls {@code pace.begin()} as a round starts and
 * {@code pace.report(...)} as it settles; GameShell draws the buttons and runs autoplay from that.
 */
export type RoundReport = { payout: number; stake: number; multiplier: number };
export type AutoplayRules = { enabled: boolean; maxRounds: number; stopOnAnyWin: boolean; stopOnBigWin: boolean };

const TURBO_KEY = 'play-turbo';
const TURBO_FACTOR = .4;
/** A win this many times the bet ends an autoplay run when the admin's stop-on-big-win is set. */
export const BIG_WIN = 10;

export class Pace {
  turbo = false;
  reduced = false;
  private hurrying = false;
  private wakers = new Set<() => void>();
  last: RoundReport | null = null;
  rounds = 0;

  /** A pause in the show: shorter in turbo, cut short by STOP, a blink with reduced motion. */
  wait = (ms: number) => new Promise<void>(resolve => {
    let length = this.reduced ? Math.min(ms, 100) : this.turbo ? ms * TURBO_FACTOR : ms;
    if (this.hurrying) length = Math.min(length, 40);
    const done = () => { clearTimeout(timer); this.wakers.delete(done); resolve(); };
    const timer = setTimeout(done, length);
    this.wakers.add(done);
  });
  /** A new round: the show plays at its normal pace again. */
  begin() { this.hurrying = false; this.last = null; }
  /** STOP: every pause still to come, and the one running now, ends at once. */
  hurry() { this.hurrying = true; for (const wake of [...this.wakers]) wake(); }
  get hurried() { return this.hurrying; }
  report(round: RoundReport) { this.last = round; this.rounds++; }
}

async function readTurbo() {
  try { return (Platform.OS === 'web' ? localStorage.getItem(TURBO_KEY) : await SecureStore.getItemAsync(TURBO_KEY)) === 'on'; } catch { return false; }
}
function saveTurbo(on: boolean) {
  try { if (Platform.OS === 'web') localStorage.setItem(TURBO_KEY, on ? 'on' : 'off'); else void SecureStore.setItemAsync(TURBO_KEY, on ? 'on' : 'off'); } catch { /* this visit only */ }
}

/** What the admin allows for a game, from its settings; autoplay is off unless switched on. */
export function rulesOf(game: Game): { turboAllowed: boolean; autoplay: AutoplayRules } {
  const settings = game.settings;
  return {
    turboAllowed: settings?.pacing?.turboAllowed ?? true,
    autoplay: { enabled: settings?.autoplay?.enabled ?? false, maxRounds: settings?.autoplay?.maxRounds ?? 50,
      stopOnAnyWin: settings?.autoplay?.stopOnAnyWin ?? false, stopOnBigWin: settings?.autoplay?.stopOnBigWin ?? true },
  };
}

/** A game's pace, with the player's turbo switch (remembered across games) and the admin's rules. */
export function usePace(game: Game) {
  const pace = useRef(new Pace()).current;
  const rules = rulesOf(game);
  const [turbo, setTurboState] = useState(false);
  useEffect(() => {
    void readTurbo().then(on => { pace.turbo = on && rules.turboAllowed; setTurboState(pace.turbo); });
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { pace.reduced = value; });
  }, [game.code]); // eslint-disable-line react-hooks/exhaustive-deps
  const setTurbo = (on: boolean) => { pace.turbo = on && rules.turboAllowed; setTurboState(pace.turbo); saveTurbo(on); };
  return { pace, turbo, setTurbo, rules };
}
export type PlayControls = ReturnType<typeof usePace>;
