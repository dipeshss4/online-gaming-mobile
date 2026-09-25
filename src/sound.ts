import { AppState, Platform } from 'react-native';
import { useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';

/**
 * The app's sound: the website's casino sounds (scripts/make-sounds.mjs renders them), with music per scene and
 * effects for spins, reels, wins and messages. The same settings as the website decide it — Admin → Site content
 * → Sound for the lobby and master volume, Admin → Games → Gameplay & sound for each game — and the player's
 * own switch wins over both.
 */
export type Scene = 'lobby' | 'slots' | 'roulette' | 'crash';
export type SiteSound = { lobbyMusic: boolean; introSound: boolean; masterVolume: number };
export type GameSound = { enabled: boolean; music: boolean; effects: boolean; musicVolume: number; effectsVolume: number };
type Effect = 'chime' | 'spin' | 'reel-stop' | 'lose' | 'win-small' | 'win-good' | 'win-big' | 'crash' | 'cashout' | 'tap' | 'message' | 'fanfare' | 'intro';

const EFFECTS: Record<Effect, number> = {
  chime: require('../assets/sounds/chime.wav'), spin: require('../assets/sounds/spin.wav'), 'reel-stop': require('../assets/sounds/reel-stop.wav'),
  lose: require('../assets/sounds/lose.wav'), 'win-small': require('../assets/sounds/win-small.wav'), 'win-good': require('../assets/sounds/win-good.wav'),
  'win-big': require('../assets/sounds/win-big.wav'), crash: require('../assets/sounds/crash.wav'), cashout: require('../assets/sounds/cashout.wav'),
  tap: require('../assets/sounds/tap.wav'), message: require('../assets/sounds/message.wav'), fanfare: require('../assets/sounds/fanfare.wav'),
  intro: require('../assets/sounds/intro.wav'),
};
const MUSIC: Record<Scene, number> = {
  lobby: require('../assets/sounds/music-lobby.wav'), slots: require('../assets/sounds/music-slots.wav'),
  roulette: require('../assets/sounds/music-roulette.wav'), crash: require('../assets/sounds/music-crash.wav'),
};
const FULL: GameSound = { enabled: true, music: true, effects: true, musicVolume: 70, effectsVolume: 80 };
const KEY = 'loot777x-sound';

const store = {
  async read() { try { return Platform.OS === 'web' ? localStorage.getItem(KEY) : await SecureStore.getItemAsync(KEY); } catch { return null; } },
  async write(value: string) { try { if (Platform.OS === 'web') localStorage.setItem(KEY, value); else await SecureStore.setItemAsync(KEY, value); } catch { /* remembered for this run only */ } },
};

class SoundDirector {
  private on = true;
  private site: SiteSound = { lobbyMusic: true, introSound: true, masterVolume: 80 };
  private mix: GameSound = FULL;
  private scene: Scene | null = null;
  private music: AudioPlayer | null = null;
  private musicScene: Scene | null = null;
  // Reel stops land a few hundred milliseconds apart, so they get a player each instead of cutting each other off.
  private effects = new Map<Effect, AudioPlayer[]>();
  private turn = new Map<Effect, number>();
  private listeners = new Set<(on: boolean) => void>();
  private started = false;

  /** Loads the player's choice and sets up playback. Sound is on until the player turns it off. */
  async start() {
    if (this.started) return;
    this.started = true;
    this.on = (await store.read()) !== 'off';
    this.emit();
    try { await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers', shouldPlayInBackground: false }); } catch { /* the defaults still play */ }
    AppState.addEventListener('change', state => { if (state === 'active') this.applyMusic(); else this.music?.pause(); });
  }

  isOn() { return this.on; }
  subscribe(listener: (on: boolean) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private emit() { for (const listener of this.listeners) listener(this.on); }

  async setOn(on: boolean) {
    this.on = on;
    this.emit();
    await store.write(on ? 'on' : 'off');
    this.applyMusic();
    if (on) this.play('chime');
  }

  /** Site-wide sound, from /api/site. */
  configureSite(site?: Partial<SiteSound> | null) {
    if (site) this.site = { ...this.site, ...site };
    this.applyMusic();
  }

  /** Where the player is. A game brings its own mix; the lobby uses the site's. */
  setScene(scene: Scene | null, game?: { settings?: { sound?: GameSound } } | null) {
    this.scene = scene;
    this.mix = scene && scene !== 'lobby' ? game?.settings?.sound ?? FULL : FULL;
    this.applyMusic();
  }

  // ---- effects
  play(effect: Effect) {
    if (!this.on || !this.mix.enabled || !this.mix.effects) return;
    const volume = this.level() * this.mix.effectsVolume / 100;
    if (volume <= 0) return;
    try {
      const pool = this.effects.get(effect) ?? [];
      const size = effect === 'reel-stop' || effect === 'tap' ? 3 : 1;
      let index = this.turn.get(effect) ?? 0;
      if (!pool[index]) { pool[index] = createAudioPlayer(EFFECTS[effect]); this.effects.set(effect, pool); }
      this.turn.set(effect, (index + 1) % size);
      const player = pool[index];
      player.volume = volume;
      void player.seekTo(0).then(() => player.play(), () => player.play());
    } catch { /* a missing sound never stops play */ }
  }
  /** The round's result: a fanfare that grows with the multiplier, or a soft tone for a loss. */
  result(multiplier: number) { this.play(multiplier <= 0 ? 'lose' : multiplier >= 10 ? 'win-big' : multiplier >= 2 ? 'win-good' : 'win-small'); }
  /** The site's welcome sound, when the site has it switched on. */
  welcome() { if (this.site.introSound) this.play('fanfare'); }

  // ---- music
  private level() { return Math.max(0, Math.min(100, this.site.masterVolume)) / 100 * .9; }
  private applyMusic() {
    const scene = this.scene;
    const wanted = this.on && scene && (scene === 'lobby' ? this.site.lobbyMusic : this.mix.enabled && this.mix.music) ? scene : null;
    if (!wanted) { this.music?.pause(); return; }
    try {
      if (this.musicScene !== wanted || !this.music) {
        this.music?.remove();
        this.music = createAudioPlayer(MUSIC[wanted]);
        this.music.loop = true;
        this.musicScene = wanted;
      }
      this.music.volume = this.level() * (wanted === 'lobby' ? .5 : this.mix.musicVolume / 100) * .6;
      this.music.play();
    } catch { /* music is decoration */ }
  }
}

export const sound = new SoundDirector();

/** The player's sound switch, for the speaker button. */
export function useSoundOn() {
  const [on, setOn] = useState(sound.isOn());
  useEffect(() => sound.subscribe(setOn), []);
  return on;
}
