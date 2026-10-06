/**
 * Renders each game's own sound and the app's opening sound. Every game gets an identity of its own, all original:
 *
 *   assets/sounds/games/<CODE>-music.m4a   a seamless loop in the game's style (lounge jazz, fiesta, western, ...)
 *   assets/sounds/games/<CODE>-open.m4a    the sting when the game opens: its riser, its signature hit, its motif
 *   assets/sounds/games/<CODE>-win.m4a     its win jingle: the motif, quick and bright, landing on the home chord
 *   assets/sounds/intro.wav                the opening film's score, cut to its beats (src/AppIntro.tsx)
 *   src/gameSounds.ts                      the requires for the above, generated so Metro can bundle them
 *   ../frontend/public/sounds/             the same files for the website, with ../frontend/src/gameSounds.ts
 *
 *   node scripts/make-game-sounds.mjs     (macOS: afconvert encodes the AAC)
 *
 * Deterministic: the same script writes the same sounds. A game with no entry here plays its scene's music.
 */
import { cpSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const RATE = 22050
const ROOT = new URL('..', import.meta.url).pathname
const GAMES_DIR = join(ROOT, 'assets/sounds/games')
mkdirSync(GAMES_DIR, { recursive: true })

// ------------------------------------------------------------------ basics
const buf = seconds => new Float32Array(Math.ceil(seconds * RATE))
const midi = m => 440 * Math.pow(2, (m - 69) / 12)
let seed = 11
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
const noise = () => rnd() * 2 - 1
const put = (out, i, v) => { if (i >= 0 && i < out.length) out[i] += v }
/** Attack, decay to sustain, release after `hold` seconds. */
function adsr(t, a, d, s, hold, r) {
  if (t < a) return t / a
  if (t < a + d) return 1 - (1 - s) * (t - a) / d
  if (t < hold) return s
  return t < hold + r ? s * (1 - (t - hold) / r) : 0
}
class LowPass { constructor(cut) { this.y = 0; this.set(cut) } set(cut) { this.a = 1 - Math.exp(-2 * Math.PI * Math.min(cut, RATE * .45) / RATE) } run(x) { return this.y += this.a * (x - this.y) } }
class HighPass { constructor(cut) { this.lp = new LowPass(cut) } run(x) { return x - this.lp.run(x) } }
const saw = p => 2 * (p - Math.floor(p)) - 1
const sq = (p, duty = .5) => (p - Math.floor(p)) < duty ? 1 : -1
const tri = p => { const q = p - Math.floor(p); return 1 - 4 * Math.abs(q - .5) }
const sin = p => Math.sin(2 * Math.PI * p)

// ------------------------------------------------------------------ instruments: (out, at seconds, frequency, length seconds, velocity)
/** Karplus-Strong: a string plucked. `bright` keeps more of the attack, `decay` how long it rings. */
function pluckWith(bright, decay, body = 0) {
  return (out, at, f, len, vel) => {
    const n = Math.max(2, Math.round(RATE / f)), line = new Float32Array(n)
    const lp = new LowPass(2000 + bright * 6000)
    for (let i = 0; i < n; i++) line[i] = lp.run(noise())
    const start = Math.round(at * RATE), total = Math.round((len + decay) * RATE)
    let idx = 0, prev = 0
    for (let i = 0; i < total; i++) {
      const cur = line[idx], next = line[(idx + 1) % n]
      const v = (cur + next) * .5 * (.992 + bright * .007)
      line[idx] = v; idx = (idx + 1) % n
      const damp = i / RATE > len ? Math.pow(.001, (i / RATE - len) / decay) : 1
      const s = cur * damp + body * Math.sin(2 * Math.PI * f * i / RATE) * Math.exp(-i / RATE * 6)
      put(out, start + i, (s + prev) * .5 * vel * .9); prev = s
    }
  }
}
/** Electric piano: a sine with a decaying FM bark and a bell-like tine. */
function epiano(out, at, f, len, vel) {
  const start = Math.round(at * RATE), total = Math.round((len + 1.2) * RATE)
  for (let i = 0; i < total; i++) {
    const t = i / RATE, env = Math.exp(-t * 1.6) * (t > len ? Math.exp(-(t - len) * 8) : 1) * Math.min(1, t / .004)
    const index = 1.8 * Math.exp(-t * 7)
    const v = Math.sin(2 * Math.PI * f * t + index * Math.sin(2 * Math.PI * f * t)) + .12 * Math.sin(2 * Math.PI * f * 14 * t) * Math.exp(-t * 18)
    put(out, start + i, v * env * vel * .45)
  }
}
/** Drawbar organ with a slow leslie wobble. */
function organWith(bars) {
  return (out, at, f, len, vel) => {
    const start = Math.round(at * RATE), total = Math.round((len + .08) * RATE)
    for (let i = 0; i < total; i++) {
      const t = i / RATE, env = Math.min(1, t / .01) * (t > len ? Math.max(0, 1 - (t - len) / .08) : 1)
      const wob = 1 + .004 * Math.sin(2 * Math.PI * 6 * t)
      let v = 0; bars.forEach(([h, w]) => { v += w * Math.sin(2 * Math.PI * f * h * t * wob) })
      put(out, start + i, v * env * vel * .22)
    }
  }
}
/** Brass: a saw whose filter opens on the attack, with vibrato once it is held. */
function brass(out, at, f, len, vel) {
  const start = Math.round(at * RATE), total = Math.round((len + .12) * RATE), lp = new LowPass(400)
  let p = 0, p2 = 0
  for (let i = 0; i < total; i++) {
    const t = i / RATE, env = adsr(t, .03, .12, .8, len, .12)
    lp.set(500 + 3200 * Math.min(1, t / .06) * (.6 + .4 * vel))
    const vib = 1 + (t > .25 ? .006 * Math.sin(2 * Math.PI * 5.5 * t) : 0)
    p += f * vib / RATE; p2 += f * 1.004 * vib / RATE
    put(out, start + i, lp.run(saw(p) + saw(p2) * .6) * env * vel * .32)
  }
}
/** Accordion: two reeds a few cents apart, so it beats, through a soft filter. */
function accordion(out, at, f, len, vel) {
  const start = Math.round(at * RATE), total = Math.round((len + .06) * RATE), lp = new LowPass(2600)
  let p = 0, p2 = 0
  for (let i = 0; i < total; i++) {
    const t = i / RATE, env = adsr(t, .02, .05, .85, len, .06)
    p += f / RATE; p2 += f * 1.006 / RATE
    put(out, start + i, lp.run(sq(p, .42) + sq(p2, .42)) * env * vel * .16)
  }
}
/** Partials with their own decays: bells, steel drum, marimba, music box. */
function partialsWith(parts, attack = .002, bend = 0) {
  return (out, at, f, len, vel) => {
    const start = Math.round(at * RATE), longest = Math.max(...parts.map(p => p[2]))
    const total = Math.round(Math.min(len + longest * 4, 4) * RATE)
    for (let i = 0; i < total; i++) {
      const t = i / RATE, b = 1 + bend * Math.exp(-t * 30)
      let v = 0; for (const [ratio, amp, dec] of parts) v += amp * Math.sin(2 * Math.PI * f * ratio * b * t) * Math.exp(-t / dec)
      put(out, start + i, v * Math.min(1, t / attack) * vel * .4)
    }
  }
}
/** Detuned saws through a filter: synth leads and pads. */
function synthWith({ voices = 2, detune = .006, cut = 2400, a = .01, r = .1, sub = 0, drive = 0, wave = saw, glideFrom = 0 }) {
  return (out, at, f, len, vel) => {
    const start = Math.round(at * RATE), total = Math.round((len + r) * RATE), lp = new LowPass(cut), ph = new Float64Array(voices)
    let ps = 0
    for (let i = 0; i < total; i++) {
      const t = i / RATE, env = adsr(t, a, .1, .85, len, r)
      const g = glideFrom ? 1 + (glideFrom - 1) * Math.exp(-t * 25) : 1
      let v = 0
      for (let k = 0; k < voices; k++) { ph[k] += f * g * (1 + (k - (voices - 1) / 2) * detune) / RATE; v += wave(ph[k]) }
      ps += f * g / 2 / RATE
      v = v / voices + sub * sin(ps)
      if (drive) v = Math.tanh(v * drive) / Math.tanh(drive)
      put(out, start + i, lp.run(v) * env * vel * .3)
    }
  }
}
/** Flute or whistle: a sine with breath and a vibrato that arrives late. */
function flute(out, at, f, len, vel) {
  const start = Math.round(at * RATE), total = Math.round((len + .1) * RATE), hp = new HighPass(1800)
  let p = 0
  for (let i = 0; i < total; i++) {
    const t = i / RATE, env = adsr(t, .05, .1, .8, len, .1)
    p += f * (1 + .007 * Math.min(1, t / .4) * Math.sin(2 * Math.PI * 5 * t)) / RATE
    put(out, start + i, (sin(p) + .08 * sin(2 * p) + .05 * hp.run(noise())) * env * vel * .3)
  }
}
/** Bass voices. */
function bassWith(kind) {
  return (out, at, f, len, vel) => {
    const start = Math.round(at * RATE), total = Math.round((len + .06) * RATE), lp = new LowPass(kind === 'synth' ? 900 : 600)
    let p = 0
    for (let i = 0; i < total; i++) {
      const t = i / RATE
      const env = kind === 'upright' ? Math.exp(-t * 3.2) * Math.min(1, t / .006) * (t > len ? Math.max(0, 1 - (t - len) / .06) : 1) : adsr(t, .005, .15, .7, len, .06)
      p += f / RATE
      let v = kind === 'synth' ? saw(p) : kind === 'slap' ? sin(p) + .5 * tri(2 * p) * Math.exp(-t * 20) : sin(p) + .3 * tri(p)
      if (kind === 'synth') lp.set(300 + 1600 * Math.exp(-t * 9))
      put(out, start + i, lp.run(v) * env * vel * .55)
    }
  }
}
const chip = synthWith({ voices: 1, wave: p => sq(p, .25), cut: 6000, a: .002, r: .03 })

const INSTRUMENTS = {
  guzheng: pluckWith(.75, .9, .15), banjo: pluckWith(.95, .35), guitar: pluckWith(.4, .8), koto: pluckWith(.6, 1.1, .1),
  harp: pluckWith(.5, 1.4), pizz: pluckWith(.3, .25), vihuela: pluckWith(.8, .4),
  epiano, brass, accordion, flute, chip,
  organ: organWith([[1, 1], [2, .6], [3, .35], [4, .3], [6, .15], [8, .2]]),
  darkOrgan: organWith([[.5, .8], [1, 1], [1.5, .5], [2, .5], [3, .2]]),
  skank: organWith([[1, .9], [2, .5], [3, .4], [4, .2]]),
  bell: partialsWith([[1, 1, .9], [2.76, .5, .4], [5.4, .25, .2], [8.93, .12, .1]]),
  glock: partialsWith([[1, 1, .6], [3.9, .3, .15], [9.2, .1, .05]]),
  steel: partialsWith([[1, 1, .5], [2, .5, .3], [3, .25, .2], [4.1, .15, .1]], .002, .015),
  marimba: partialsWith([[1, 1, .35], [4, .3, .06], [9.9, .08, .02]]),
  musicbox: partialsWith([[1, 1, 1.1], [3, .2, .3], [6.3, .08, .1]]),
  lead: synthWith({ voices: 2, detune: .008, cut: 3000 }), softLead: synthWith({ voices: 2, cut: 1600, a: .03, wave: tri }),
  pad: synthWith({ voices: 3, detune: .01, cut: 1300, a: .5, r: .8 }), darkPad: synthWith({ voices: 3, detune: .012, cut: 700, a: .7, r: 1 }),
  stabs: synthWith({ voices: 3, detune: .01, cut: 2600, a: .005, r: .08 }), arp: synthWith({ voices: 1, cut: 2800, a: .003, r: .06, wave: p => sq(p, .3) }),
  power: synthWith({ voices: 2, detune: .006, cut: 2600, a: .005, r: .1, drive: 5 }), clav: synthWith({ voices: 1, cut: 3800, a: .002, r: .03, wave: p => sq(p, .22) }),
  strings: synthWith({ voices: 3, detune: .007, cut: 2200, a: .02, r: .1 }), glideLead: synthWith({ voices: 2, cut: 3200, glideFrom: .94 }),
  upright: bassWith('upright'), synthBass: bassWith('synth'), slap: bassWith('slap'), bass: bassWith('round'),
}

// ------------------------------------------------------------------ drums: (out, at seconds, velocity)
function kick(out, at, vel, low = 45, high = 150, decay = .28) {
  const start = Math.round(at * RATE); let p = 0
  for (let i = 0; i < decay * RATE * 1.2; i++) { const t = i / RATE; p += (low + (high - low) * Math.exp(-t * 28)) / RATE; put(out, start + i, sin(p) * Math.exp(-t / decay * 3) * vel * .9) }
}
function noiseHit(out, at, vel, { decay = .1, cut = 8000, high = 0, tone = 0, toneDecay = .08 }) {
  const start = Math.round(at * RATE), lp = new LowPass(cut), hp = high ? new HighPass(high) : null
  for (let i = 0; i < decay * RATE * 1.4; i++) {
    const t = i / RATE; let n = lp.run(noise()); if (hp) n = hp.run(n)
    put(out, start + i, (n * Math.exp(-t / decay * 3) + (tone ? sin(tone * t) * Math.exp(-t / toneDecay * 3) * .6 : 0)) * vel * .5)
  }
}
const DRUMS = {
  kick: (o, a, v) => kick(o, a, v), softKick: (o, a, v) => kick(o, a, v * .7, 50, 110, .2), boom: (o, a, v) => kick(o, a, v, 38, 120, .55),
  snare: (o, a, v) => noiseHit(o, a, v, { decay: .16, cut: 7000, high: 400, tone: 190, toneDecay: .06 }),
  clap: (o, a, v) => { for (const d of [0, .011, .023]) noiseHit(o, a + d, v * .7, { decay: d === .023 ? .14 : .02, cut: 5000, high: 900 }) },
  hat: (o, a, v) => noiseHit(o, a, v * .45, { decay: .035, cut: 11000, high: 6000 }), openHat: (o, a, v) => noiseHit(o, a, v * .4, { decay: .22, cut: 11000, high: 5500 }),
  shaker: (o, a, v) => noiseHit(o, a, v * .3, { decay: .06, cut: 9000, high: 4000 }), brush: (o, a, v) => noiseHit(o, a, v * .35, { decay: .14, cut: 4500, high: 1500 }),
  rim: (o, a, v) => noiseHit(o, a, v * .6, { decay: .02, cut: 6000, high: 1500, tone: 1700, toneDecay: .02 }),
  ride: (o, a, v) => partialsWith([[1, .5, .5], [1.48, .4, .4], [2.34, .3, .3], [3.71, .2, .2]], .001)(o, a, 520, .05, v * .25),
  taiko: (o, a, v) => { kick(o, a, v, 62, 95, .6); noiseHit(o, a, v * .5, { decay: .05, cut: 1200 }) },
  tom: (o, a, v) => kick(o, a, v * .8, 90, 140, .3), castanet: (o, a, v) => noiseHit(o, a, v * .7, { decay: .015, cut: 9000, high: 2500, tone: 2400, toneDecay: .01 }),
  triangle: (o, a, v) => partialsWith([[1, 1, .8], [2.9, .4, .5]], .001)(o, a, 2600, .1, v * .2),
  woodblock: (o, a, v) => partialsWith([[1, 1, .04], [2.6, .4, .02]], .001)(o, a, 900, .02, v * .6),
}
function gong(out, at, vel) { partialsWith([[1, 1, 2.5], [1.41, .7, 2], [2.11, .5, 1.5], [2.67, .35, 1.2], [3.32, .2, .8]], .02)(out, at, 92, .1, vel * .8); noiseHit(out, at, vel * .3, { decay: .5, cut: 3000 }) }
function crash(out, at, vel) { noiseHit(out, at, vel * .6, { decay: 1.2, cut: 10000, high: 3000 }) }
function riser(out, at, len, vel, from = 300, to = 4000) {
  const start = Math.round(at * RATE), lp = new LowPass(from)
  for (let i = 0; i < len * RATE; i++) { const k = i / (len * RATE); lp.set(from * Math.pow(to / from, k)); put(out, start + i, lp.run(noise()) * k * k * vel * .6) }
}
function sparkle(out, at, len, vel, base = 2200) { for (let i = 0; i < len * 18; i++) INSTRUMENTS.glock(out, at + i / 18 + rnd() * .02, base + (i * 373 % 1500), .05, vel * .35) }
function kaching(out, at, vel) { DRUMS.woodblock(out, at, vel); INSTRUMENTS.bell(out, at + .08, 2093, .2, vel * .7); INSTRUMENTS.bell(out, at + .1, 2637, .2, vel * .6); sparkle(out, at + .12, .4, vel * .7, 2600) }
function bubbles(out, at, len, vel) {
  for (let b = 0; b < len * 5; b++) {
    const t0 = at + b / 5 + rnd() * .15, f0 = 500 + rnd() * 700, start = Math.round(t0 * RATE); let p = 0
    for (let i = 0; i < .07 * RATE; i++) { const t = i / RATE; p += f0 * (1 + t * 14) / RATE; put(out, start + i, sin(p) * Math.exp(-t * 50) * vel * .25) }
  }
}
function laser(out, at, vel, from = 2400, to = 300) { const start = Math.round(at * RATE); let p = 0; for (let i = 0; i < .18 * RATE; i++) { const t = i / RATE; p += (from * Math.pow(to / from, t / .18)) / RATE; put(out, start + i, sq(p) * Math.exp(-t * 14) * vel * .12) } }
function thunder(out, at, vel) { noiseHit(out, at, vel * .9, { decay: .9, cut: 600 }); noiseHit(out, at, vel * .5, { decay: .08, cut: 9000, high: 2000 }) }
function whip(out, at, vel) { riser(out, at, .12, vel, 2000, 9000); noiseHit(out, at + .12, vel, { decay: .03, cut: 12000, high: 3000 }) }
function bellToll(out, at, vel) { partialsWith([[.5, .6, 2], [1, 1, 1.6], [1.19, .5, 1.2], [1.5, .4, 1], [2, .3, .8]], .005)(out, at, 196, .2, vel) }
function hoof(out, at, vel) { for (const d of [0, .09, .2, .29]) DRUMS.woodblock(out, at + d, vel * (d % .2 ? .6 : 1)) }
function cash(out, at, vel) { kaching(out, at, vel) }

/** A small Schroeder reverb, mixed in at `wet`. */
function reverb(signal, wet, size = 1) {
  if (!wet) return signal
  const combs = [557, 593, 641, 677].map(d => ({ d: Math.round(d * size), buf: new Float32Array(Math.round(d * size)), i: 0, lp: 0 }))
  const alls = [113, 277].map(d => ({ d, buf: new Float32Array(d), i: 0 }))
  const out = new Float32Array(signal.length)
  for (let n = 0; n < signal.length; n++) {
    let acc = 0
    for (const c of combs) { const y = c.buf[c.i]; c.lp = y * .7 + c.lp * .3; c.buf[c.i] = signal[n] + c.lp * .8; c.i = (c.i + 1) % c.d; acc += y }
    let y = acc / 4
    for (const a of alls) { const b = a.buf[a.i]; const v = -.5 * y + b; a.buf[a.i] = y + .5 * b; a.i = (a.i + 1) % a.d; y = v }
    out[n] = signal[n] + y * wet
  }
  return out
}

// ------------------------------------------------------------------ the games
/**
 * Each game: tempo, metre, swing, key (MIDI note of the melody's home), four chords (semitones from the key, one per
 * bar, played twice for an eight-bar loop), a melody per bar ("step:semitone:length" in sixteenths), a bass line and
 * a comp pattern (one character per sixteenth: r root, f fifth, o octave, 3 third, x chord, - hold, . rest), drum
 * patterns, the instruments, and the signature hit its opening sting lands on.
 */
const GAMES = {
  HOT_7S: { style: 'Vegas swing', bpm: 128, swing: .17, key: 72, chords: [[0, 4, 7, 9], [-3, 0, 4, 7], [2, 5, 9, 12], [7, 11, 14, 17]],
    melody: ['0:7:2 2:12:2 4:16:3 8:14:2 10:12:2 12:7:4', '0:9:3 4:12:2 6:16:2 8:19:6', '0:17:2 2:14:2 4:12:2 6:9:2 8:14:4 12:12:2', '0:11:3 4:14:3 8:17:2 10:19:6'],
    lead: 'brass', comp: 'epiano', compPattern: '..x...x...x...x.', bass: 'upright', bassPattern: 'r---3---f---o---', wet: .25,
    drums: { kick: 'x.......x.......', snare: '....x.......x...', ride: 'x..xx..xx..xx..x' }, hit: (o, a) => { crash(o, a, 1); kaching(o, a, .8) } },
  FRUIT_RUSH: { style: 'tropical marimba', bpm: 116, key: 77, chords: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]],
    melody: ['0:12:2 3:16:1 4:19:2 6:16:2 8:12:4 12:14:2', '0:17:2 2:16:2 4:14:2 6:12:2 8:9:4', '0:11:2 2:14:2 4:19:4 8:17:2 10:14:2 12:11:2', '0:12:3 3:16:3 6:19:2 8:24:6'],
    lead: 'steel', comp: 'marimba', compPattern: 'x..x..x...x..x..', bass: 'bass', bassPattern: 'r..r..f...o..f..', wet: .2,
    drums: { kick: 'x.....x...x.....', shaker: 'x.xxx.xxx.xxx.xx', woodblock: '....x.......x...' }, hit: (o, a) => { crash(o, a, .7); sparkle(o, a, .6, 1) } },
  ROULETTE: { style: 'Paris café waltz', bpm: 100, meter: 3, key: 74, chords: [[0, 3, 7], [5, 8, 12], [-5, -1, 2, 5], [0, 3, 7]],
    melody: ['0:7:4 4:10:2 6:12:2 8:15:4', '0:14:6 6:12:2 8:8:4', '0:7:2 2:11:2 4:14:4 8:17:4', '0:15:4 4:14:2 6:11:2 8:12:4'],
    lead: 'accordion', comp: 'pizz', compPattern: '....x...x...', bass: 'upright', bassPattern: 'r...........', wet: .3,
    drums: { brush: '....x...x...', triangle: 'x...........' }, hit: (o, a) => { DRUMS.triangle(o, a, 1); bellToll(o, a, .4) } },
  QUICK_HIT: { style: 'lightning electro', bpm: 140, key: 76, chords: [[-12, 0, 3, 7], [-4, 0, 3, 8], [-9, -2, 3, 7], [-5, -1, 2, 7]],
    melody: ['0:12:1 2:15:1 4:19:1 6:15:1 8:24:2 12:22:2', '0:20:2 3:19:1 4:15:2 8:12:4 14:15:2', '0:14:1 2:17:1 4:22:1 6:17:1 8:26:2 12:24:2', '0:23:3 4:19:2 8:26:4 12:24:2'],
    lead: 'lead', comp: 'arp', compPattern: 'xxxxxxxxxxxxxxxx', arp: true, bass: 'synthBass', bassPattern: 'r.r.r.r.r.r.r.r.', wet: .15,
    drums: { kick: 'x...x...x...x...', clap: '....x.......x...', openHat: '..x...x...x...x.' }, hit: (o, a) => { thunder(o, a, 1); laser(o, a + .05, 1, 4000, 200) } },
  TEN_X_TRIPLE: { style: '8-bit arcade', bpm: 132, key: 69, chords: [[0, 4, 7], [-3, 0, 4], [5, 9, 12], [7, 11, 14]],
    melody: ['0:12:1 1:16:1 2:19:1 4:24:2 8:19:1 9:21:1 10:19:2 12:16:4', '0:12:2 4:9:2 6:12:2 8:16:4 12:12:2', '0:17:1 1:21:1 2:24:2 4:21:2 8:17:2 10:21:2 12:24:4', '0:23:2 2:21:2 4:19:2 6:23:2 8:26:2 10:24:6'],
    lead: 'chip', comp: 'arp', compPattern: 'x.x.x.x.x.x.x.x.', arp: true, bass: 'synthBass', bassPattern: 'r.o.r.o.r.o.r.o.', wet: .05,
    drums: { kick: 'x.......x.x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' }, hit: (o, a) => { for (let i = 0; i < 6; i++) INSTRUMENTS.chip(o, a + i * .04, midi(81 + i * 4), .05, .8) } },
  WILD_BUFFALO: { style: 'frontier western', bpm: 104, key: 76, chords: [[-12, -5, 0, 3, 7], [-7, 0, 3, 7], [-14, -2, 2, 7], [-12, -5, 0, 3, 7]],
    melody: ['0:7:4 4:12:2 6:10:2 8:7:6 14:3:2', '0:5:4 4:7:2 6:10:2 8:12:8', '0:14:3 3:12:1 4:10:4 8:7:4 12:10:4', '0:12:4 4:10:2 6:7:2 8:0:8'],
    lead: 'flute', comp: 'banjo', compPattern: 'x.xxx.xxx.xxx.xx', arp: true, bass: 'upright', bassPattern: 'r...f...r...f...', wet: .3,
    drums: { tom: 'x.....x...x.....', woodblock: '....x.......x...' }, hit: (o, a) => { whip(o, a, 1); hoof(o, a + .2, .7) } },
  SIMPLE_DOLLAR: { style: 'cash funk', bpm: 100, swing: .08, key: 67, chords: [[0, 3, 7, 10], [5, 9, 12, 15], [0, 3, 7, 10], [5, 9, 12, 15]],
    melody: ['0:12:1 2:15:1 3:17:2 6:15:1 8:12:2 11:10:1 12:12:3', '0:17:2 3:19:1 4:22:2 8:21:2 10:19:2 12:17:4', '0:12:1 2:15:1 3:17:2 6:19:1 8:22:2 11:24:1 12:22:3', '0:21:2 2:19:2 4:17:2 6:15:2 8:12:6'],
    lead: 'clav', comp: 'organ', compPattern: '..x...x..x....x.', bass: 'slap', bassPattern: 'r..r..o.r.r...f.', wet: .12,
    drums: { kick: 'x..x....x.x.....', snare: '....x.......x...', hat: 'x.xxx.xxx.xxx.xx' }, hit: (o, a) => { cash(o, a, 1) } },
  VEGAS_JACKPOT_DEVIL_HEART: { style: 'devilish organ', bpm: 92, key: 72, chords: [[-12, 0, 3, 7], [-4, 0, 3, 8], [-6, 0, 3, 6], [-5, -1, 2, 7]],
    melody: ['0:7:4 4:6:2 6:7:2 8:12:6 14:11:2', '0:8:4 4:7:2 6:3:2 8:0:8', '0:6:4 4:9:2 6:12:2 8:15:6 14:14:2', '0:11:4 4:14:4 8:12:8'],
    lead: 'darkOrgan', comp: 'darkPad', compPattern: 'x---------------', bass: 'synthBass', bassPattern: 'r.....r.r.....f.', wet: .4,
    drums: { boom: 'x.......x..x....', snare: '........x.......', hat: '..x...x...x...x.' }, hit: (o, a) => { bellToll(o, a, 1); thunder(o, a, .7) } },
  BLAZING_HIT: { style: 'blazing rock', bpm: 138, key: 64, chords: [[-12, -5, 0], [-4, 3, 8], [-2, 5, 10], [-7, 0, 5]],
    melody: ['0:12:2 2:15:2 4:17:2 6:15:2 8:19:4 12:17:4', '0:15:4 4:12:2 6:15:2 8:20:8', '0:22:2 2:19:2 4:17:2 6:19:2 8:22:4 12:24:4', '0:19:4 4:17:4 8:24:8'],
    lead: 'power', comp: 'power', compPattern: 'x.x.x.x.x.x.x.x.', bass: 'synthBass', bassPattern: 'r.r.r.r.r.r.r.r.', wet: .15, leadOctave: 0,
    drums: { kick: 'x.x...x.x.x...x.', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' }, hit: (o, a) => { crash(o, a, 1); DRUMS.boom(o, a, 1) } },
  LUCKY_FIRE_BLITZ: { style: 'prosperity guzheng and taiko', bpm: 108, key: 74, chords: [[0, 7, 12], [-3, 4, 9], [5, 9, 12], [7, 14, 19]],
    melody: ['0:12:2 2:14:2 4:16:2 6:19:2 8:21:4 12:19:4', '0:16:2 2:14:2 4:12:4 8:9:4 12:12:4', '0:14:2 2:16:2 4:19:4 8:24:2 10:21:2 12:19:4', '0:16:4 4:19:2 6:14:2 8:12:8'],
    lead: 'guzheng', comp: 'guzheng', compPattern: 'x...x...x...x.x.', arp: true, bass: 'bass', bassPattern: 'r.......f.......', wet: .3,
    drums: { taiko: 'x.....x...x.....', woodblock: '..x...x...x...x.' }, hit: (o, a) => { gong(o, a, 1); DRUMS.taiko(o, a, 1) } },
  ASCENT_CRASH: { style: 'synthwave climb', bpm: 120, key: 69, chords: [[-12, 0, 3, 7], [-7, 5, 8, 12], [-4, 3, 8, 12], [-2, 2, 7, 10]],
    melody: ['0:12:4 4:15:4 8:19:6 14:17:2', '0:17:4 4:20:4 8:24:8', '0:15:4 4:19:4 8:20:6 14:22:2', '0:22:4 4:26:4 8:24:8'],
    lead: 'glideLead', comp: 'arp', compPattern: 'xxxxxxxxxxxxxxxx', arp: true, bass: 'synthBass', bassPattern: 'r.r.r.r.r.r.r.r.', wet: .3, pad: 'pad',
    drums: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.' }, hit: (o, a) => { riser(o, a - .6, .6, 1, 400, 9000); DRUMS.boom(o, a, 1); crash(o, a, .8) } },
  DRAGON_TIDE: { style: 'deep-sea fantasy', bpm: 84, key: 75, chords: [[0, 4, 7, 11], [2, 6, 9, 14], [-3, 0, 4, 7], [-5, 2, 7, 11]],
    melody: ['0:7:4 4:11:4 8:14:4 12:18:4', '0:16:8 8:14:4 12:11:4', '0:12:4 4:16:4 8:19:6 14:21:2', '0:19:4 4:18:4 8:14:8'],
    lead: 'musicbox', comp: 'harp', compPattern: 'x.x.x.x.x.x.x.x.', arp: true, bass: 'bass', bassPattern: 'r-------f-------', wet: .5, pad: 'pad',
    drums: { softKick: 'x.......x.......', shaker: '..x...x...x...x.' }, extra: (o, at, len) => bubbles(o, at, len, .6), hit: (o, a) => { bubbles(o, a - .3, .8, 1.2); INSTRUMENTS.bell(o, a, midi(75), .5, 1); INSTRUMENTS.bell(o, a, midi(82), .5, .7) } },
  GALAXY_KENO: { style: 'space arpeggios', bpm: 112, key: 78, chords: [[-12, 0, 3, 7, 10], [-4, 0, 3, 8], [-7, 0, 5, 8], [-2, 2, 5, 10]],
    melody: ['0:12:2 4:19:2 8:22:4 12:24:4', '0:20:4 4:19:4 8:15:8', '0:17:2 4:20:2 8:24:4 12:27:4', '0:26:4 4:22:4 8:24:8'],
    lead: 'softLead', comp: 'arp', compPattern: 'xxxxxxxxxxxxxxxx', arp: true, bass: 'synthBass', bassPattern: 'r.......r.r.....', wet: .45, pad: 'darkPad',
    drums: { kick: 'x.......x.......', clap: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' }, extra: (o, at, len) => { for (let i = 0; i < len / 4; i++) laser(o, at + i * 4 + 3.5, .4, 3000, 900) }, hit: (o, a) => { laser(o, a, 1, 300, 3000); sparkle(o, a, .8, 1, 3000) } },
  TRIPLE_MATCH_SCRATCH: { style: 'bubbly pop', bpm: 124, key: 70, chords: [[0, 4, 7], [7, 11, 14], [-3, 0, 4], [5, 9, 12]],
    melody: ['0:12:2 2:12:2 4:16:2 6:19:2 8:16:4 12:12:4', '0:14:2 2:14:2 4:19:2 6:23:2 8:19:8', '0:12:2 2:16:2 4:21:4 8:19:2 10:16:2 12:12:4', '0:17:2 2:16:2 4:14:2 6:12:2 8:12:8'],
    lead: 'glock', comp: 'stabs', compPattern: '..x...x...x...x.', bass: 'synthBass', bassPattern: 'r.....r...r.....', wet: .2,
    drums: { kick: 'x.......x.......', clap: '....x.......x...', shaker: 'x.x.x.x.x.x.x.x.' }, hit: (o, a) => { sparkle(o, a, .8, 1.2, 2400); DRUMS.clap(o, a, 1) } },
  LOTERIA_SCRATCH: { style: 'Mexican fiesta', bpm: 132, key: 67, chords: [[0, 4, 7], [-5, -1, 2, 5], [-5, -1, 2, 5], [0, 4, 7]],
    melody: ['0:7:2 2:12:2 4:16:2 6:14:2 8:12:2 10:11:2 12:12:4', '0:14:2 2:17:2 4:16:2 6:14:2 8:11:2 10:7:2 12:11:4', '0:14:2 2:16:2 4:17:2 6:19:2 8:17:2 10:14:2 12:11:4', '0:12:2 2:16:2 4:19:2 6:16:2 8:12:8'],
    lead: 'accordion', comp: 'vihuela', compPattern: '..x...x...x...x.', bass: 'bass', bassPattern: 'r.......f.......', wet: .2,
    drums: { softKick: 'x.......x.......', castanet: '..x...x.x.x...x.', snare: '....o.......o...' }, hit: (o, a) => { DRUMS.castanet(o, a, 1); DRUMS.castanet(o, a + .07, 1); INSTRUMENTS.brass(o, a, midi(79), .3, .9); INSTRUMENTS.brass(o, a, midi(83), .3, .9) } },
  BREAK_THE_BANK: { style: 'heist inferno', bpm: 128, key: 72, chords: [[-12, 0, 3, 7], [-12, 0, 3, 7], [-4, 0, 3, 8], [-5, -1, 2, 7]],
    melody: ['0:12:1 2:12:1 4:15:2 8:12:1 10:12:1 12:17:2 14:15:2', '0:12:1 2:12:1 4:15:2 6:17:2 8:19:8', '0:20:2 2:19:2 4:15:2 6:12:2 8:20:4 12:19:4', '0:14:4 4:17:4 8:23:4 12:24:4'],
    lead: 'brass', comp: 'strings', compPattern: 'x.x.x.x.x.x.x.x.', bass: 'synthBass', bassPattern: 'r.rrr.rrr.rrr.r.', wet: .2,
    drums: { boom: 'x.......x.......', snare: '....x.......x...', hat: 'xxxxxxxxxxxxxxxx' }, hit: (o, a) => { DRUMS.boom(o, a, 1); crash(o, a, 1); riser(o, a - .5, .5, .8, 300, 6000) } },
  LUXURY_LIFE: { style: 'lounge jazz', bpm: 96, swing: .2, key: 73, chords: [[2, 5, 9, 12], [7, 11, 14, 17], [0, 4, 7, 11], [-3, 0, 4, 7]],
    melody: ['0:9:3 4:12:2 6:14:2 8:17:6', '0:16:4 4:14:2 6:11:2 8:7:6', '0:11:2 2:12:2 4:16:4 8:19:4 12:23:4', '0:21:6 6:19:2 8:16:8'],
    lead: 'epiano', comp: 'epiano', compPattern: 'x.....x...x.....', bass: 'upright', bassPattern: 'r---3---f---3---', wet: .3, leadOctave: 0,
    drums: { brush: 'x.x.x.x.x.x.x.x.', ride: 'x..x..x.x..x..x.', rim: '....x.......x...' }, hit: (o, a) => { kaching(o, a, .7); INSTRUMENTS.epiano(o, a, midi(73 + 11), .8, .6) } },
  SEVEN_STARS_DELUXE: { style: 'starlight bells', bpm: 118, key: 76, chords: [[0, 4, 7], [7, 11, 14], [-3, 0, 4], [5, 9, 12]],
    melody: ['0:16:2 2:19:2 4:24:4 8:23:2 10:19:2 12:16:4', '0:14:2 2:19:2 4:23:4 8:21:4 12:19:4', '0:12:2 2:16:2 4:21:4 8:19:2 10:16:2 12:12:4', '0:17:2 2:21:2 4:24:4 8:23:8'],
    lead: 'bell', comp: 'epiano', compPattern: 'x...x...x...x...', bass: 'bass', bassPattern: 'r.......f.......', wet: .35,
    drums: { kick: 'x.......x.......', snare: '....x.......x...', hat: '..x...x...x...x.' }, extra: (o, at, len) => sparkle(o, at, len, .25, 3000), hit: (o, a) => { sparkle(o, a, 1, 1.4, 2800); INSTRUMENTS.bell(o, a, midi(88), .5, .9) } },
  SOLAR_SEVENS: { style: 'sunshine disco', bpm: 120, key: 69, chords: [[0, 4, 7, 11], [-3, 0, 4, 7], [2, 5, 9, 12], [7, 11, 14, 17]],
    melody: ['0:12:2 2:16:2 4:19:2 6:23:2 8:21:4 12:19:4', '0:16:6 6:14:2 8:12:8', '0:14:2 2:17:2 4:21:2 6:24:2 8:23:4 12:21:4', '0:19:4 4:23:4 8:24:8'],
    lead: 'strings', comp: 'clav', compPattern: '..x...x...x...x.', bass: 'slap', bassPattern: 'r.o.r.o.r.o.r.o.', wet: .2,
    drums: { kick: 'x...x...x...x...', clap: '....x.......x...', openHat: '..x...x...x...x.' }, hit: (o, a) => { crash(o, a, .8); for (let i = 0; i < 4; i++) INSTRUMENTS.strings(o, a + i * .05, midi(81 + [0, 4, 7, 12][i]), .5, .5) } },
  CITRUS_COAST: { style: 'island ska', bpm: 90, key: 74, chords: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [5, 9, 12]],
    melody: ['0:12:3 3:14:1 4:16:4 8:19:2 10:16:2 12:14:4', '0:17:4 4:16:2 6:14:2 8:12:8', '0:12:3 3:14:1 4:16:4 8:21:2 10:19:2 12:16:4', '0:14:4 4:11:2 6:14:2 8:12:8'],
    lead: 'steel', comp: 'skank', compPattern: '..x...x...x...x.', bass: 'bass', bassPattern: 'r..r....f..f....', wet: .25,
    drums: { softKick: '........x.......', rim: '........x.......', hat: '..x...x...x...x.' }, hit: (o, a) => { INSTRUMENTS.steel(o, a, midi(86), .4, 1); INSTRUMENTS.steel(o, a + .08, midi(90), .4, .9); INSTRUMENTS.steel(o, a + .16, midi(93), .6, .9) } },
  JADE_FORTUNE: { style: 'jade garden koto', bpm: 88, key: 69, chords: [[0, 7, 12], [-4, 3, 8], [-7, 0, 5], [-5, 2, 7]],
    melody: ['0:7:4 4:8:2 6:12:2 8:14:6 14:15:2', '0:14:4 4:12:4 8:8:8', '0:7:2 2:8:2 4:12:4 8:15:4 12:14:4', '0:12:4 4:8:4 8:7:8'],
    lead: 'flute', comp: 'koto', compPattern: 'x.x...x.x...x...', arp: true, bass: 'bass', bassPattern: 'r-------r-------', wet: .45, pad: 'pad',
    drums: { woodblock: 'x.......x...x...', shaker: '....x.......x...' }, hit: (o, a) => { gong(o, a, .6); INSTRUMENTS.koto(o, a, midi(69), .6, 1); INSTRUMENTS.koto(o, a + .1, midi(76), .6, .9) } },
  MIDNIGHT_BARS: { style: 'midnight blues', bpm: 72, swing: .22, key: 70, chords: [[0, 4, 7, 10], [5, 9, 12, 15], [0, 4, 7, 10], [7, 10, 14, 17]],
    melody: ['0:7:3 3:10:1 4:12:4 8:15:2 10:12:2 12:10:4', '0:9:4 4:12:2 6:15:2 8:17:8', '0:15:3 3:12:1 4:10:4 8:7:4 12:3:4', '0:5:4 4:7:4 8:0:8'],
    lead: 'brass', comp: 'epiano', compPattern: 'x.....x.........', bass: 'upright', bassPattern: 'r---3---f---6---', wet: .35, leadOctave: -12,
    drums: { brush: 'x.x.x.x.x.x.x.x.', snare: '....o.......o...', ride: 'x..x..x.x..x..x.' }, hit: (o, a) => { DRUMS.ride(o, a, 1.5); INSTRUMENTS.brass(o, a, midi(58 + 10), .7, .8); INSTRUMENTS.upright(o, a, midi(46), .7, 1) } },
}

// ------------------------------------------------------------------ the arranger
function parseMelody(bar) { return bar.trim().split(/\s+/).map(token => token.split(':').map(Number)) }
const bassNote = (chord, ch, key) => {
  const root = chord[0] % 12 < 0 ? chord[0] % 12 + 12 : chord[0] % 12, base = key - 24 + root - (root > 7 ? 12 : 0)
  return base + ({ r: 0, f: 7, o: 12, 3: (chord[1] - chord[0] + 12) % 12, 6: 9 }[ch] ?? 0)
}
/** Plays `bars` bars of the game's arrangement from second `at`. */
function arrange(out, game, at, { bars = 8, melodyOnly = false, tempo = 1 } = {}) {
  const meter = game.meter ?? 4, steps = meter * 4, step = 60 / (game.bpm * tempo) / 4
  const time = (bar, s) => at + (bar * steps + s) * step + (s % 2 ? (game.swing ?? 0) * step : 0)
  const lead = INSTRUMENTS[game.lead], comp = INSTRUMENTS[game.comp], bass = INSTRUMENTS[game.bass]
  for (let bar = 0; bar < bars; bar++) {
    const chord = game.chords[bar % game.chords.length], second = bar >= game.chords.length
    for (const [s, semi, len] of parseMelody(game.melody[bar % game.melody.length])) {
      const up = second && bar % 4 === 3 ? 0 : 0
      lead(out, time(bar, s), midi(game.key + (game.leadOctave ?? 0) + semi + up), len * step * .95, second ? .95 : .85)
    }
    if (melodyOnly) continue
    // Comp: chords on the pattern's hits, or an arpeggio walking up and down the chord.
    const pattern = game.compPattern.padEnd(steps, '.').slice(0, steps)
    let arpIndex = 0
    for (let s = 0; s < steps; s++) {
      if (pattern[s] !== 'x') continue
      let hold = 1; while (s + hold < steps && pattern[s + hold] === '-') hold++
      const notes = chord.map(n => game.key - 12 + n)
      if (game.arp) {
        const seq = [...notes, ...notes.slice(1, -1).reverse()]
        comp(out, time(bar, s), midi(seq[arpIndex++ % seq.length] + 12), step * hold * .9, .5)
      } else for (const n of notes) comp(out, time(bar, s), midi(n), step * Math.max(hold, 1.5) * .9, .45 / Math.sqrt(notes.length) * 1.6)
    }
    if (game.pad) for (const n of chord) INSTRUMENTS[game.pad](out, time(bar, 0), midi(game.key - 12 + n), step * steps, .35)
    const bp = game.bassPattern.padEnd(steps, '.').slice(0, steps)
    for (let s = 0; s < steps; s++) {
      const ch = bp[s]; if (ch === '.' || ch === '-') continue
      let hold = 1; while (s + hold < steps && bp[s + hold] === '-') hold++
      bass(out, time(bar, s), midi(bassNote(chord, ch, game.key)), step * hold * .9, .8)
    }
    for (const [name, pat] of Object.entries(game.drums)) {
      const p = pat.padEnd(steps, '.').slice(0, steps)
      for (let s = 0; s < steps; s++) if (p[s] !== '.') DRUMS[name](out, time(bar, s), p[s] === 'o' ? .55 : (s % 4 === 0 ? 1 : .8))
    }
  }
  return bars * steps * step
}

// ------------------------------------------------------------------ mastering and writing
function master(samples, { level = .9, rms = 0 } = {}) {
  let peak = 0, sum = 0
  for (const s of samples) { peak = Math.max(peak, Math.abs(s)); sum += s * s }
  const r = Math.sqrt(sum / samples.length) || 1
  const gain = rms ? Math.min(rms / r, level * 1.6 / peak) : level / (peak || 1)
  return samples.map(s => Math.tanh(s * gain * 1.1) / Math.tanh(1.1))
}
function wav(samples) {
  const data = Buffer.alloc(44 + samples.length * 2)
  data.write('RIFF', 0); data.writeUInt32LE(36 + samples.length * 2, 4); data.write('WAVE', 8)
  data.write('fmt ', 12); data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22)
  data.writeUInt32LE(RATE, 24); data.writeUInt32LE(RATE * 2, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34)
  data.write('data', 36); data.writeUInt32LE(samples.length * 2, 40)
  samples.forEach((s, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), 44 + i * 2))
  return data
}
const TMP = join(tmpdir(), 'loot777x-sounds'); mkdirSync(TMP, { recursive: true })
function m4a(name, samples, bitrate = 64000) {
  const source = join(TMP, `${name}.wav`), target = join(GAMES_DIR, `${name}.m4a`)
  writeFileSync(source, wav(samples))
  execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', String(bitrate), '-q', '127', source, target])
  console.log(`${name}.m4a  ${(samples.length / RATE).toFixed(1)}s`)
}

// ------------------------------------------------------------------ render every game
for (const [code, game] of Object.entries(GAMES)) {
  seed = [...code].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) & 0x7fffffff
  // The loop: eight bars, with everything that rings past the end folded back onto the start so it wraps unheard.
  const meter = game.meter ?? 4, length = 8 * meter * 4 * 60 / game.bpm / 4
  const raw = buf(length + 3)
  arrange(raw, game, 0)
  game.extra?.(raw, 0, length)
  const wet = reverb(raw, game.wet ?? .2)
  const loop = new Float32Array(Math.round(length * RATE))
  for (let i = 0; i < wet.length; i++) loop[i % loop.length] += wet[i]
  m4a(`${code}-music`, master(loop, { rms: .16 }), 64000)

  // The opening sting: a riser, the game's signature hit, its first two bars at a lift, the home chord held.
  const open = buf(3.4), hitAt = .55
  riser(open, 0, hitAt, .5)
  game.hit(open, hitAt)
  const played = arrange(open, game, hitAt, { bars: 1, melodyOnly: true, tempo: 1.35 })
  const home = game.chords[0].map(n => game.key - 12 + n)
  for (const n of home) INSTRUMENTS[game.comp](open, hitAt + played, midi(n), 1.1, .4)
  INSTRUMENTS[game.lead](open, hitAt + played, midi(game.key + (game.leadOctave ?? 0) + 12), 1, .8)
  INSTRUMENTS[game.bass](open, hitAt + played, midi(game.key - 24), 1, .8)
  m4a(`${code}-open`, master(reverb(open, (game.wet ?? .2) + .1)), 64000)

  // The win jingle: the motif quick and an octave up, then the home chord rolled with a sparkle.
  const win = buf(2), first = parseMelody(game.melody[0]).slice(0, 5)
  first.forEach(([, semi], i) => INSTRUMENTS[game.lead](win, i * .085, midi(game.key + (game.leadOctave ?? 0) + semi + 12), .12, .9))
  const land = first.length * .085 + .05
  home.forEach((n, i) => INSTRUMENTS[game.comp](win, land + i * .03, midi(n + 12), .7, .5))
  sparkle(win, land, .5, .8, 2600)
  m4a(`${code}-win`, master(reverb(win, (game.wet ?? .2) * .7)), 64000)
}

// ------------------------------------------------------------------ the app's opening: scored to AppIntro's beats
{
  seed = 777
  const b = buf(4.4)
  // 0.00-0.80  the chest falls in: a deep whoosh rising to it.
  riser(b, 0, .78, .9, 150, 3500)
  // 0.80  it lands: a sub boom, a metallic chest clank and the ring of light.
  DRUMS.boom(b, .8, 1.2); noiseHit(b, .8, .6, { decay: .08, cut: 5000, high: 800, tone: 320, toneDecay: .1 }); crash(b, .8, .5)
  // 0.70-1.50  the coins burst out.
  for (let i = 0; i < 16; i++) INSTRUMENTS.glock(b, .78 + i * .045 + rnd() * .02, 2100 + (i * 397) % 1700, .06, .55)
  // 0.90 and 1.00  LOOT slides in, 777X slams after it: two brass hits.
  for (const [t, notes] of [[.9, [55, 62, 67]], [1.02, [60, 64, 67, 72]]]) { DRUMS.snare(b, t, .9); DRUMS.kick(b, t, 1); for (const n of notes) INSTRUMENTS.brass(b, t, midi(n), .22, .75) }
  // 1.60-2.30  the sheen sweeps the wordmark: a rising glitter.
  for (let i = 0; i < 12; i++) INSTRUMENTS.bell(b, 1.6 + i * .055, midi(79 + [0, 2, 4, 7, 9, 12][i % 6] + (i >= 6 ? 12 : 0)), .1, .35)
  // 1.90  THE ORIGINAL COLLECTION: the brand's three notes, seven-seven-seven up the chord, over a warm held chord.
  for (const [i, n] of [72, 76, 79].entries()) { INSTRUMENTS.brass(b, 1.9 + i * .16, midi(n), .2, .7); INSTRUMENTS.bell(b, 1.9 + i * .16, midi(n + 12), .3, .5) }
  for (const n of [48, 55, 60, 64, 67, 71, 74]) INSTRUMENTS.pad(b, 2.35, midi(n), 1.3, .5)
  INSTRUMENTS.brass(b, 2.38, midi(84), 1, .7); DRUMS.boom(b, 2.38, .8); crash(b, 2.38, .45)
  sparkle(b, 2.4, 1, .6, 2800)
  writeFileSync(join(ROOT, 'assets/sounds/intro.wav'), wav(master(reverb(b, .35, 1.3), { level: .92 })))
  console.log('intro.wav  4.4s')
}

// ------------------------------------------------------------------ the requires, for Metro
const lines = Object.keys(GAMES).map(code => `  ${code}: { music: require('../assets/sounds/games/${code}-music.m4a'), open: require('../assets/sounds/games/${code}-open.m4a'), win: require('../assets/sounds/games/${code}-win.m4a') },`)
writeFileSync(join(ROOT, 'src/gameSounds.ts'), `// Generated by scripts/make-game-sounds.mjs: do not edit by hand.
/** Each game's own sound: its music loop, the sting when it opens, and its win jingle. */
export type GameSoundSet = { music: number; open: number; win: number };
export const GAME_SOUNDS: Record<string, GameSoundSet> = {
${lines.join('\n')}
};
/** What each game sounds like, for the admin and the docs. */
export const GAME_STYLES: Record<string, string> = ${JSON.stringify(Object.fromEntries(Object.entries(GAMES).map(([k, g]) => [k, g.style])), null, 2)};
`)
console.log(`src/gameSounds.ts  ${Object.keys(GAMES).length} games`)

// The website plays the same sounds when this app sits beside it in the main repository.
const WEB = join(ROOT, '../frontend')
if (existsSync(join(WEB, 'src'))) {
  mkdirSync(join(WEB, 'public/sounds/games'), { recursive: true })
  cpSync(GAMES_DIR, join(WEB, 'public/sounds/games'), { recursive: true })
  execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '64000', join(ROOT, 'assets/sounds/intro.wav'), join(WEB, 'public/sounds/intro.m4a')])
  writeFileSync(join(WEB, 'src/gameSounds.ts'), `// Generated by mobile/scripts/make-game-sounds.mjs: do not edit by hand.
/** Games with a sound of their own: /sounds/games/<code>-music.m4a, -open.m4a and -win.m4a. */
export const GAME_SOUND_CODES: ReadonlySet<string> = new Set(${JSON.stringify(Object.keys(GAMES))})
`)
  console.log('../frontend/public/sounds  copied')
}
rmSync(TMP, { recursive: true, force: true })
