/**
 * Renders the app's sounds to assets/sounds/*.wav. They are the website's sounds (frontend/src/audio.ts builds
 * them live with Web Audio), rendered ahead of time because a phone app has no Web Audio to build them with.
 *
 *   node scripts/make-sounds.mjs
 *
 * Deterministic: the same script writes the same files, so re-running it only changes what was changed here.
 */
import { mkdirSync, writeFileSync } from 'node:fs'

const RATE = 22050
const OUT = new URL('../assets/sounds/', import.meta.url)
mkdirSync(OUT, { recursive: true })

const buffer = seconds => new Float32Array(Math.ceil(seconds * RATE))
const wave = (kind, phase) => {
  const p = phase - Math.floor(phase)
  if (kind === 'sine') return Math.sin(2 * Math.PI * p)
  if (kind === 'square') return p < .5 ? .8 : -.8
  if (kind === 'sawtooth') return 2 * p - 1
  return 1 - 4 * Math.abs(p - .5) // triangle
}
/** The web's tone(): a fast attack then an exponential fall to silence. Wraps past the end when `loop` is set. */
function tone(out, frequency, at, duration, kind, volume, loop = false) {
  const start = Math.round(at * RATE), length = Math.round((duration + .03) * RATE)
  for (let i = 0; i < length; i++) {
    const t = i / RATE
    const envelope = t < .025 ? .001 * Math.pow(volume / .001, t / .025) : t < duration ? volume * Math.pow(.001 / volume, (t - .025) / (duration - .025)) : 0
    let index = start + i
    if (index >= out.length) { if (!loop) break; index %= out.length }
    out[index] += envelope * wave(kind, frequency * t)
  }
}
/** A pitch sweep through a low-pass filter: the reels spinning up. */
function sweep(out, from, to, at, duration, kind, peak, cutoffFrom = 0, cutoffTo = 0) {
  let phase = 0, filtered = 0
  const start = Math.round(at * RATE), length = Math.round(duration * RATE)
  for (let i = 0; i < length && start + i < out.length; i++) {
    const progress = i / length, frequency = from * Math.pow(to / from, progress)
    phase += frequency / RATE
    const rise = Math.min(1, i / (.12 * RATE)), fall = Math.min(1, (length - i) / (.2 * RATE))
    let sample = wave(kind, phase) * peak * rise * fall
    if (cutoffFrom) {
      const cutoff = cutoffFrom * Math.pow(cutoffTo / cutoffFrom, progress), alpha = 1 - Math.exp(-2 * Math.PI * cutoff / RATE)
      filtered += alpha * (sample - filtered); sample = filtered
    }
    out[start + i] += sample
  }
}
/** Seeded noise, so every render is identical. */
let seed = 7
const noise = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x3fffffff - 1 }
function burst(out, at, duration, volume, cutoff) {
  let filtered = 0
  const alpha = 1 - Math.exp(-2 * Math.PI * cutoff / RATE), start = Math.round(at * RATE), length = Math.round(duration * RATE)
  for (let i = 0; i < length && start + i < out.length; i++) {
    filtered += alpha * (noise() - filtered)
    out[start + i] += filtered * volume * Math.pow(.001, i / length)
  }
}
/** A soft casino-floor murmur under the music: band-limited noise, looped. */
function murmur(out, volume) {
  let low = 0, high = 0
  for (let i = 0; i < out.length; i++) {
    const n = noise() * (.35 + .15 * Math.sin(i / 1700))
    low += .11 * (n - low); high += .02 * (low - high)
    out[i] += (low - high) * volume
  }
}

function write(name, samples, gain = 1) {
  let peak = 0
  for (const s of samples) peak = Math.max(peak, Math.abs(s))
  const scale = peak > 0 ? Math.min(gain / peak, 2.2) * .92 : 0
  const data = Buffer.alloc(44 + samples.length * 2)
  data.write('RIFF', 0); data.writeUInt32LE(36 + samples.length * 2, 4); data.write('WAVE', 8)
  data.write('fmt ', 12); data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22)
  data.writeUInt32LE(RATE, 24); data.writeUInt32LE(RATE * 2, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34)
  data.write('data', 36); data.writeUInt32LE(samples.length * 2, 40)
  samples.forEach((s, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s * scale)) * 32767), 44 + i * 2))
  writeFileSync(new URL(`${name}.wav`, OUT), data)
  console.log(`${name}.wav  ${(samples.length / RATE).toFixed(2)}s`)
}

// ---- effects
{ const b = buffer(.3); tone(b, 660, 0, .25, 'sine', .14); write('chime', b, .6) }
{ const b = buffer(.95); sweep(b, 62, 235, 0, .9, 'sawtooth', .075, 420, 1250); write('spin', b, .55) }
{ const b = buffer(.28); tone(b, 565, 0, .1, 'square', .16); tone(b, 283, .055, .18, 'triangle', .2); write('reel-stop', b, .6) }
{ const b = buffer(.25); tone(b, 145, 0, .16, 'triangle', .11); write('lose', b, .35) }
for (const [name, notes] of [['win-small', [440, 554]], ['win-good', [330, 440, 554, 659]], ['win-big', [392, 523, 659, 784, 1047]]]) {
  const b = buffer(notes.length * .1 + .9)
  notes.forEach((note, i) => tone(b, note, i * .1, .3, 'triangle', .18))
  if (name === 'win-big') [1319, 1568, 2093, 1568, 2093, 2637].forEach((note, i) => tone(b, note, .5 + i * .07, .22, 'sine', .07))
  write(name, b, name === 'win-small' ? .6 : .8)
}
{ const b = buffer(1.1); burst(b, 0, .9, .9, 900); sweep(b, 420, 70, 0, .8, 'sawtooth', .18, 1200, 200); write('crash', b, .75) }
{ const b = buffer(.9); [988, 1319, 1568, 1976].forEach((note, i) => { tone(b, note, i * .07, .35, 'sine', .12); tone(b, note * 2, i * .07 + .01, .12, 'square', .02) }); write('cashout', b, .7) }
{ const b = buffer(.25); tone(b, 880, 0, .08, 'sine', .12); tone(b, 1175, .06, .14, 'sine', .1); write('tap', b, .35) }
// Message arrived: a two-note bell.
{ const b = buffer(1.2); for (const [note, at] of [[1047, 0], [1319, .16]]) { tone(b, note, at, .9, 'sine', .14); tone(b, note * 2.01, at, .4, 'sine', .04) } write('message', b, .6) }
// The welcome pop-up: a rising sparkle and a coin shower.
{
  const b = buffer(2.2)
  ;[523, 659, 784, 1047, 1319, 1568].forEach((note, i) => tone(b, note, i * .09, .5, 'triangle', .14))
  for (let i = 0; i < 14; i++) tone(b, 2200 + (i * 373) % 1400, .55 + i * .08, .18, 'sine', .05)
  write('fanfare', b, .8)
}
// The web's intro: four low pulses and a rising sweep.
{
  const b = buffer(3.2)
  ;[0, .72, 1.44, 2.16].forEach((offset, i) => { tone(b, 55 + i * 10, offset, .18, 'sine', .42); tone(b, 330 + i * 92, offset + .05, .35, 'triangle', .16) })
  sweep(b, 90, 780, 0, 2.95, 'sawtooth', .1)
  write('intro', b, .8)
}

// ---- music: each scene's loop from the web, eight steps long so it wraps without a seam
const scenes = {
  lobby: { notes: [110, 165, 220, 277], pace: .9, wave: 'sine' }, slots: { notes: [196, 247, 294, 392], pace: .52, wave: 'triangle' },
  roulette: { notes: [130, 196, 233, 311], pace: .76, wave: 'sine' }, crash: { notes: [82, 123, 164, 246], pace: .43, wave: 'sawtooth' },
}
for (const [name, { notes, pace, wave: kind }] of Object.entries(scenes)) {
  const steps = 16, b = buffer(steps * pace)
  for (let step = 0; step < steps; step++) {
    const at = step * pace
    tone(b, notes[step % notes.length], at, .58, kind, .085, true)
    if (step % 4 === 0) tone(b, notes[0] / 2, at, .26, 'sine', .12, true)
    // A light sparkle every other bar, so the loop has a shape.
    if (step % 8 === 6) tone(b, notes[3] * 4, at + pace / 2, .3, 'sine', .025, true)
  }
  murmur(b, .05)
  write(`music-${name}`, b, .5)
}
