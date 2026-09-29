import type { Ctx2D, Gradient } from './skiaCtx'

/**
 * Dragon Tide's art, the same drawings as the website's fish table (frontend/src/FishTable.tsx), drawn through a
 * canvas-like context so both platforms show the same creatures. Keep the two in step when a creature changes.
 */
export const W = 1280, H = 720
export const CANNON = { x: W / 2, y: H - 34 }
export const TAU = Math.PI * 2

export type Draw = (c: Ctx2D, r: number, t: number) => void
export type Species = { code: string; r: number; speed: [number, number]; weight: number; draw: Draw; hit: number }
export type Fish = {
  id: number; s: Species; x: number; y: number; dir: 1 | -1; speed: number; baseY: number; amp: number; freq: number; phase: number
  t: number; heading: number; caught: number; flash: number; trail: { x: number; y: number }[]
}

// ------------------------------------------------------------------ creature art (drawn facing +x, centred)

const grad = (c: Ctx2D, r: number, stops: [number, string][]) => {
  const g = c.createLinearGradient(0, -r, 0, r); stops.forEach(([at, color]) => g.addColorStop(at, color)); return g
}
const eye = (c: Ctx2D, x: number, y: number, size: number, iris = '#111') => {
  c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y, size, 0, TAU); c.fill()
  c.fillStyle = iris; c.beginPath(); c.arc(x + size * .25, y, size * .6, 0, TAU); c.fill()
  c.fillStyle = '#fff'; c.beginPath(); c.arc(x + size * .4, y - size * .3, size * .22, 0, TAU); c.fill()
}
const tail = (c: Ctx2D, x: number, r: number, t: number, speed: number, fill: string | Gradient, fork = .55) => {
  const wag = Math.sin(t * speed) * .35
  c.save(); c.translate(x, 0); c.rotate(wag); c.fillStyle = fill
  c.beginPath(); c.moveTo(r * .1, 0); c.quadraticCurveTo(-r * .35, -r * .15, -r * .55, -r * fork); c.quadraticCurveTo(-r * .35, 0, -r * .55, r * fork); c.quadraticCurveTo(-r * .35, r * .15, r * .1, 0); c.fill()
  c.restore()
}

const drawShrimp: Draw = (c, r, t) => {
  for (let i = 5; i >= 0; i--) {
    const x = r * .8 - i * r * .36, y = Math.sin(i * .6 + t * 6) * r * .12 + i * i * r * .02
    c.fillStyle = grad(c, r * .6, [[0, '#ffd0a8'], [.5, '#ff7b39'], [1, '#c8431a']])
    c.beginPath(); c.ellipse(x, y, r * (.5 - i * .04), r * (.45 - i * .045), 0, 0, TAU); c.fill()
    c.strokeStyle = '#ffffff40'; c.lineWidth = 1; c.stroke()
  }
  c.fillStyle = '#ff9255'; c.beginPath(); c.moveTo(-r * 1.1, r * .55); c.lineTo(-r * 1.55, r * .15); c.lineTo(-r * 1.5, r * .85); c.fill()
  c.strokeStyle = '#ffb07a'; c.lineWidth = 1.2
  for (const k of [-1, 1]) { c.beginPath(); c.moveTo(r * 1.1, -r * .2); c.quadraticCurveTo(r * 1.9, -r * (.6 + k * .2) + Math.sin(t * 5 + k) * r * .2, r * 2.4, -r * (.3 + k * .3)); c.stroke() }
  eye(c, r * .95, -r * .2, r * .14)
}

const drawClown: Draw = (c, r, t) => {
  const body = grad(c, r * .62, [[0, '#ffc07a'], [.45, '#ff7a1a'], [1, '#d24a05']])
  tail(c, -r * .85, r, t, 11, body)
  c.fillStyle = '#ff8a2a'; c.beginPath(); c.ellipse(-r * .1, -r * .55, r * .45, r * .2, -.2, 0, TAU); c.fill()
  c.save(); c.beginPath(); c.ellipse(0, 0, r, r * .62, 0, 0, TAU); c.fillStyle = body; c.fill(); c.clip()
  for (const x of [-r * .55, r * .05, r * .55]) { c.fillStyle = '#1b1b1b'; c.fillRect(x - r * .16, -r, r * .32, r * 2); c.fillStyle = '#fff'; c.fillRect(x - r * .11, -r, r * .22, r * 2) }
  c.restore()
  c.fillStyle = '#ff9a3c'; c.beginPath(); c.ellipse(r * .1, r * .35, r * .25, r * .12, .6 + Math.sin(t * 9) * .3, 0, TAU); c.fill()
  eye(c, r * .66, -r * .12, r * .15)
}

const drawPuffer: Draw = (c, r, t) => {
  const puff = 1 + Math.sin(t * 3) * .06
  c.save(); c.scale(puff, puff)
  c.fillStyle = '#e8b64a'
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * TAU; c.beginPath()
    c.moveTo(Math.cos(a - .1) * r * .9, Math.sin(a - .1) * r * .9); c.lineTo(Math.cos(a) * r * 1.22, Math.sin(a) * r * 1.22); c.lineTo(Math.cos(a + .1) * r * .9, Math.sin(a + .1) * r * .9); c.fill()
  }
  const g = c.createRadialGradient(-r * .3, -r * .4, r * .1, 0, 0, r)
  g.addColorStop(0, '#fff6c8'); g.addColorStop(.6, '#ffd24a'); g.addColorStop(1, '#c98a14')
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill()
  c.fillStyle = '#8a5a0c66'; for (const [x, y] of [[-.4, -.3], [-.1, -.55], [-.55, .1], [.15, -.35]]) { c.beginPath(); c.arc(x * r, y * r, r * .08, 0, TAU); c.fill() }
  c.fillStyle = '#fff4d6'; c.beginPath(); c.ellipse(0, r * .45, r * .7, r * .4, 0, 0, Math.PI); c.fill()
  c.restore()
  c.fillStyle = '#ffcf5a'; c.beginPath(); c.ellipse(-r * 1.05, 0, r * .3, r * .22 + Math.sin(t * 12) * r * .08, 0, 0, TAU); c.fill()
  eye(c, r * .45, -r * .25, r * .24)
  c.strokeStyle = '#8a4b0c'; c.lineWidth = 2; c.beginPath(); c.arc(r * .85, r * .12, r * .1, 0, TAU); c.stroke()
}

const drawAngel: Draw = (c, r, t) => {
  const wave = Math.sin(t * 4) * r * .12
  c.fillStyle = '#ffd94a'
  c.beginPath(); c.moveTo(r * .1, -r * .7); c.quadraticCurveTo(-r * .6, -r * 1.4, -r * 1.2, -r * 1.5 + wave); c.quadraticCurveTo(-r * .6, -r * .8, -r * .5, -r * .3); c.fill()
  c.beginPath(); c.moveTo(r * .1, r * .7); c.quadraticCurveTo(-r * .6, r * 1.4, -r * 1.2, r * 1.5 - wave); c.quadraticCurveTo(-r * .6, r * .8, -r * .5, r * .3); c.fill()
  tail(c, -r * .6, r * .8, t, 7, '#ffd94a', .7)
  c.save(); c.beginPath(); c.moveTo(r, 0); c.quadraticCurveTo(r * .4, -r * .95, -r * .2, -r * .85); c.lineTo(-r * .65, 0); c.lineTo(-r * .2, r * .85); c.quadraticCurveTo(r * .4, r * .95, r, 0)
  c.fillStyle = grad(c, r, [[0, '#6ee7ff'], [.5, '#1f7cff'], [1, '#0b2f8a']]); c.fill(); c.clip()
  c.fillStyle = '#0a1a4a'; for (const x of [-.35, .05, .45]) c.fillRect(x * r, -r, r * .13, r * 2)
  c.fillStyle = '#ffe36688'; c.fillRect(-r, -r * .08, r * 2, r * .16)
  c.restore()
  eye(c, r * .62, -r * .12, r * .13)
}

const drawTurtle: Draw = (c, r, t) => {
  const paddle = Math.sin(t * 3.2)
  c.fillStyle = '#5fae6a'
  for (const [x, y, s] of [[r * .45, -r * .65, 1], [r * .45, r * .65, -1], [-r * .55, -r * .5, 1], [-r * .55, r * .5, -1]] as const) {
    c.save(); c.translate(x, y); c.rotate(s * (.5 + paddle * .45) * (x > 0 ? 1 : .6)); c.beginPath(); c.ellipse(r * .2 * (x > 0 ? 1 : -.6), 0, r * (x > 0 ? .55 : .3), r * .16, 0, 0, TAU); c.fill(); c.restore()
  }
  c.fillStyle = '#7cc47f'; c.beginPath(); c.ellipse(r * .95, 0, r * .3, r * .22, 0, 0, TAU); c.fill()
  eye(c, r * 1.07, -r * .08, r * .07)
  const shell = c.createRadialGradient(-r * .1, -r * .2, r * .1, 0, 0, r * .8)
  shell.addColorStop(0, '#b8e07a'); shell.addColorStop(.6, '#3f8f3f'); shell.addColorStop(1, '#1e5a2a')
  c.fillStyle = shell; c.beginPath(); c.ellipse(0, 0, r * .8, r * .62, 0, 0, TAU); c.fill()
  c.strokeStyle = '#1b4a22'; c.lineWidth = 2
  const hex = (x: number, y: number, s: number) => { c.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; c.lineTo(x + Math.cos(a) * s, y + Math.sin(a) * s) } c.closePath(); c.stroke() }
  hex(0, 0, r * .22); for (let i = 0; i < 6; i++) hex(Math.cos(i / 6 * TAU) * r * .42, Math.sin(i / 6 * TAU) * r * .32, r * .15)
  c.strokeStyle = '#d9f0a3'; c.lineWidth = 2.5; c.beginPath(); c.ellipse(0, 0, r * .8, r * .62, 0, 0, TAU); c.stroke()
}

const drawLantern: Draw = (c, r, t) => {
  const glow = .7 + Math.sin(t * 4) * .3
  const g = c.createRadialGradient(r * 1.35, -r * 1.05, 0, r * 1.35, -r * 1.05, r * .9)
  g.addColorStop(0, `rgba(255,248,170,${glow})`); g.addColorStop(1, 'rgba(255,220,80,0)')
  c.fillStyle = g; c.beginPath(); c.arc(r * 1.35, -r * 1.05, r * .9, 0, TAU); c.fill()
  c.strokeStyle = '#4d6a8a'; c.lineWidth = 2; c.beginPath(); c.moveTo(r * .3, -r * .6); c.quadraticCurveTo(r * .9, -r * 1.6, r * 1.35, -r * 1.05); c.stroke()
  c.fillStyle = '#fffbe0'; c.beginPath(); c.arc(r * 1.35, -r * 1.05, r * .14, 0, TAU); c.fill()
  const body = grad(c, r * .8, [[0, '#35527a'], [.6, '#1a2742'], [1, '#0b111f']])
  tail(c, -r * .8, r, t, 6, body)
  c.fillStyle = body; c.beginPath(); c.ellipse(0, 0, r, r * .8, 0, 0, TAU); c.fill()
  c.fillStyle = '#0a0d18'; c.beginPath(); c.moveTo(r * 1.02, -r * .05); c.lineTo(r * .3, r * .1); c.lineTo(r * .95, r * .5); c.fill()
  c.fillStyle = '#e8f0ff'; for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(r * (.45 + i * .12), r * .12); c.lineTo(r * (.5 + i * .12), r * .28); c.lineTo(r * (.55 + i * .12), r * .14); c.fill() }
  eye(c, r * .45, -r * .35, r * .16, '#ffcc33')
  c.fillStyle = '#6fd5ff55'; for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(-r * .5 + i * r * .25, r * .45, r * .05, 0, TAU); c.fill() }
}

const drawOctopus: Draw = (c, r, t) => {
  for (let k = 0; k < 6; k++) {
    const y0 = (k - 2.5) * r * .18
    c.beginPath(); c.moveTo(-r * .3, y0)
    for (let s = 1; s <= 10; s++) { const x = -r * .3 - s * r * .17, y = y0 * (1 + s * .12) + Math.sin(t * 5 - s * .7 + k) * r * .1 * s * .35; c.lineTo(x, y) }
    c.strokeStyle = '#9b3fd1'; c.lineWidth = r * .16; c.lineCap = 'round'; c.stroke()
    c.strokeStyle = '#f0b8ff'; c.lineWidth = r * .05; c.stroke()
  }
  const head = c.createRadialGradient(r * .1, -r * .35, r * .1, 0, 0, r * .9)
  head.addColorStop(0, '#f5b3ff'); head.addColorStop(.55, '#b44ce6'); head.addColorStop(1, '#5a1a8a')
  c.fillStyle = head; c.beginPath(); c.ellipse(r * .15, 0, r * .8, r * .62, 0, 0, TAU); c.fill()
  c.fillStyle = '#e39bff88'; for (const [x, y] of [[.35, -.3], [.55, .05], [0, -.35], [.2, .3]]) { c.beginPath(); c.arc(x * r, y * r, r * .07, 0, TAU); c.fill() }
  eye(c, r * .55, -r * .28, r * .14); eye(c, r * .55, r * .28, r * .14)
}

const drawRay: Draw = (c, r, t) => {
  const flap = 1 + Math.sin(t * 3) * .28
  c.strokeStyle = '#2d5a6a'; c.lineWidth = 3; c.beginPath(); c.moveTo(-r * .5, 0)
  for (let s = 1; s <= 8; s++) c.lineTo(-r * .5 - s * r * .17, Math.sin(t * 4 - s * .6) * r * .06 * s)
  c.stroke()
  c.save(); c.scale(1, flap)
  c.fillStyle = grad(c, r, [[0, '#79c9d6'], [.5, '#2f8aa0'], [1, '#79c9d6']])
  c.beginPath(); c.moveTo(r * .7, 0); c.quadraticCurveTo(r * .2, -r * .3, -r * .1, -r); c.quadraticCurveTo(-r * .3, -r * .4, -r * .6, 0); c.quadraticCurveTo(-r * .3, r * .4, -r * .1, r); c.quadraticCurveTo(r * .2, r * .3, r * .7, 0); c.fill()
  c.fillStyle = '#cff4ff66'; for (let i = 0; i < 9; i++) { c.beginPath(); c.arc(-r * .25 + (i % 3) * r * .2, (Math.floor(i / 3) - 1) * r * .28, r * .05, 0, TAU); c.fill() }
  c.restore()
  eye(c, r * .4, -r * .12, r * .06); eye(c, r * .4, r * .12, r * .06)
}

const drawSword: Draw = (c, r, t) => {
  const body = grad(c, r * .3, [[0, '#2b5fd6'], [.5, '#4fa3ff'], [.7, '#dbe9ff'], [1, '#b9c9e6']])
  c.save(); c.translate(-r * .95, 0); c.rotate(Math.sin(t * 8) * .25); c.fillStyle = '#2b5fd6'
  c.beginPath(); c.moveTo(r * .1, 0); c.quadraticCurveTo(-r * .2, -r * .15, -r * .35, -r * .5); c.quadraticCurveTo(-r * .15, 0, -r * .35, r * .5); c.quadraticCurveTo(-r * .2, r * .15, r * .1, 0); c.fill(); c.restore()
  c.fillStyle = '#1d3f9a'; c.beginPath(); c.moveTo(r * .3, -r * .22); c.quadraticCurveTo(-r * .1, -r * .95, -r * .4, -r * .8); c.quadraticCurveTo(-r * .3, -r * .4, -r * .4, -r * .2); c.fill()
  c.fillStyle = '#c5cedb'; c.beginPath(); c.moveTo(r * .9, -r * .04); c.lineTo(r * 1.9, 0); c.lineTo(r * .9, r * .05); c.fill()
  c.fillStyle = body; c.beginPath(); c.ellipse(0, 0, r, r * .28, 0, 0, TAU); c.fill()
  c.strokeStyle = '#ffffff55'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(-r * .7, -r * .05); c.lineTo(r * .7, -r * .08); c.stroke()
  eye(c, r * .72, -r * .07, r * .07)
}

const drawShark: Draw = (c, r, t) => {
  c.save(); c.translate(-r * .95, 0); c.rotate(Math.sin(t * 5) * .22); c.fillStyle = '#5d7488'
  c.beginPath(); c.moveTo(r * .15, 0); c.lineTo(-r * .3, -r * .55); c.quadraticCurveTo(-r * .15, 0, -r * .25, r * .4); c.closePath(); c.fill(); c.restore()
  c.fillStyle = '#4b6173'; c.beginPath(); c.moveTo(r * .05, -r * .3); c.lineTo(-r * .3, -r * .78); c.quadraticCurveTo(-r * .3, -r * .45, -r * .45, -r * .25); c.fill()
  c.beginPath(); c.moveTo(r * .9, 0); c.bezierCurveTo(r * .7, -r * .42, -r * .5, -r * .38, -r * 1, -r * .05); c.lineTo(-r * 1, r * .05); c.bezierCurveTo(-r * .5, r * .36, r * .7, r * .38, r * .9, 0)
  const body = grad(c, r * .4, [[0, '#4d6378'], [.45, '#7f97aa'], [.62, '#e9f1f6'], [1, '#c5d3dc']]); c.fillStyle = body; c.fill()
  c.fillStyle = '#56708a'; c.beginPath(); c.moveTo(r * .25, r * .2); c.lineTo(-r * .05, r * .62); c.lineTo(-r * .1, r * .25); c.fill()
  c.strokeStyle = '#2f4050'; c.lineWidth = 1.6; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(r * (.42 - i * .07), -r * .12); c.lineTo(r * (.38 - i * .07), r * .12); c.stroke() }
  c.strokeStyle = '#3a1a1a'; c.lineWidth = 2; c.beginPath(); c.moveTo(r * .88, r * .06); c.quadraticCurveTo(r * .72, r * .2, r * .55, r * .17); c.stroke()
  c.fillStyle = '#fff'; for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(r * (.58 + i * .06), r * .17); c.lineTo(r * (.6 + i * .06), r * .24); c.lineTo(r * (.62 + i * .06), r * .16); c.fill() }
  c.fillStyle = '#0c0c0c'; c.beginPath(); c.arc(r * .68, -r * .1, r * .045, 0, TAU); c.fill()
}

const drawWhale: Draw = (c, r, t) => {
  const aura = c.createRadialGradient(0, 0, r * .4, 0, 0, r * 1.5)
  aura.addColorStop(0, 'rgba(255,214,90,.35)'); aura.addColorStop(1, 'rgba(255,214,90,0)')
  c.fillStyle = aura; c.beginPath(); c.arc(0, 0, r * 1.5, 0, TAU); c.fill()
  const gold = grad(c, r * .6, [[0, '#fff3b0'], [.35, '#ffcf3c'], [.75, '#d99a0e'], [1, '#8a5a06']])
  c.save(); c.translate(-r * 1.05, 0); c.rotate(Math.sin(t * 2.4) * .3); c.fillStyle = gold
  c.beginPath(); c.moveTo(r * .2, 0); c.quadraticCurveTo(-r * .1, -r * .1, -r * .35, -r * .45); c.quadraticCurveTo(-r * .2, 0, -r * .35, r * .45); c.quadraticCurveTo(-r * .1, r * .1, r * .2, 0); c.fill(); c.restore()
  c.beginPath(); c.moveTo(r, r * .05); c.bezierCurveTo(r * 1.05, -r * .55, r * .1, -r * .62, -r * .5, -r * .3); c.quadraticCurveTo(-r * .95, -r * .12, -r * 1.05, 0); c.quadraticCurveTo(-r * .9, r * .2, -r * .4, r * .3); c.bezierCurveTo(r * .2, r * .5, r * .95, r * .45, r, r * .05)
  c.fillStyle = gold; c.fill(); c.strokeStyle = '#fff7cf'; c.lineWidth = 2; c.stroke()
  c.strokeStyle = '#a86f08aa'; c.lineWidth = 2; for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(r * (.85 - i * .12), r * .2); c.lineTo(r * (.55 - i * .12), r * .4); c.stroke() }
  c.fillStyle = '#e7ae1d'; c.beginPath(); c.ellipse(r * .1, r * .35, r * .3, r * .1, .6 + Math.sin(t * 2.4) * .25, 0, TAU); c.fill()
  eye(c, r * .62, -r * .05, r * .07)
  for (let i = 0; i < 6; i++) {
    const a = t * 1.3 + i, x = Math.cos(a * 1.7) * r * 1.1, y = Math.sin(a * 1.1) * r * .7, s = 2 + (Math.sin(t * 6 + i) + 1) * 2
    c.fillStyle = '#fff7c0'; c.beginPath(); c.moveTo(x, y - s * 2); c.lineTo(x + s * .5, y - s * .5); c.lineTo(x + s * 2, y); c.lineTo(x + s * .5, y + s * .5); c.lineTo(x, y + s * 2); c.lineTo(x - s * .5, y + s * .5); c.lineTo(x - s * 2, y); c.lineTo(x - s * .5, y - s * .5); c.fill()
  }
}

/** The dragon's head; its body is drawn along its trail by {@link drawDragonBody}. */
const drawDragonHead: Draw = (c, r, t) => {
  const s = r * .42
  c.strokeStyle = '#ffd36a'; c.lineWidth = 2.5; c.lineCap = 'round'
  for (const k of [-1, 1]) { c.beginPath(); c.moveTo(s * 1.2, k * s * .25); c.bezierCurveTo(s * 2, k * s * (.6 + Math.sin(t * 3) * .3), s * 2.4, k * s * .1, s * 3, k * s * (.7 + Math.sin(t * 3 + 1) * .3)); c.stroke() }
  c.fillStyle = '#ffcf4a'; for (const k of [-1, 1]) { c.beginPath(); c.moveTo(-s * .2, k * s * .45); c.quadraticCurveTo(-s * .9, k * s * 1.3, -s * 1.5, k * s * 1.1); c.quadraticCurveTo(-s * .8, k * s * .8, -s * .4, k * s * .25); c.fill() }
  const head = c.createRadialGradient(s * .3, -s * .3, s * .1, 0, 0, s * 1.4)
  head.addColorStop(0, '#ff8a5c'); head.addColorStop(.5, '#e0241b'); head.addColorStop(1, '#7a0a0a')
  c.fillStyle = head; c.beginPath(); c.moveTo(s * 1.5, -s * .15); c.quadraticCurveTo(s * 1.1, -s * .75, 0, -s * .7); c.quadraticCurveTo(-s * .8, -s * .5, -s * .8, 0); c.quadraticCurveTo(-s * .8, s * .5, 0, s * .7); c.quadraticCurveTo(s * 1.1, s * .75, s * 1.5, s * .15); c.closePath(); c.fill()
  c.strokeStyle = '#ffd36a'; c.lineWidth = 2; c.stroke()
  c.fillStyle = '#fff4c2'; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(s * (1.4 - i * .18), s * .12); c.lineTo(s * (1.32 - i * .18), s * .32); c.lineTo(s * (1.24 - i * .18), s * .12); c.fill() }
  const glow = c.createRadialGradient(s * .55, 0, 0, s * .55, 0, s * .6); glow.addColorStop(0, '#fff7a8'); glow.addColorStop(1, 'rgba(255,200,40,0)')
  for (const k of [-1, 1]) { c.fillStyle = glow; c.beginPath(); c.arc(s * .55, k * s * .38, s * .35, 0, TAU); c.fill(); c.fillStyle = '#2a0000'; c.beginPath(); c.ellipse(s * .6, k * s * .38, s * .06, s * .14, 0, 0, TAU); c.fill() }
}
export const drawDragonBody = (c: Ctx2D, fish: Fish, t: number) => {
  const pts = fish.trail, r = fish.s.r * .42, n = pts.length
  for (let i = n - 1; i >= 1; i -= 1) {
    const p = pts[i], q = pts[i - 1], w = r * (1 - i / n * .75), a = Math.atan2(q.y - p.y, q.x - p.x)
    c.save(); c.translate(p.x, p.y); c.rotate(a)
    if (i % 3 === 0) { c.fillStyle = '#ffcf4a'; c.beginPath(); c.moveTo(-w * .3, -w * .9); c.lineTo(0, -w * 1.5); c.lineTo(w * .3, -w * .9); c.fill() }
    if (i === 7 || i === 17) for (const k of [-1, 1]) { c.strokeStyle = '#b3160f'; c.lineWidth = w * .35; c.lineCap = 'round'; c.beginPath(); c.moveTo(0, k * w * .6); c.lineTo(-w * .6, k * w * (1.6 + Math.sin(t * 5 + i) * .3)); c.stroke(); c.fillStyle = '#ffd36a'; c.beginPath(); c.arc(-w * .6, k * w * (1.6 + Math.sin(t * 5 + i) * .3), w * .22, 0, TAU); c.fill() }
    const g = c.createLinearGradient(0, -w, 0, w); g.addColorStop(0, '#ff5a3a'); g.addColorStop(.45, '#c8140f'); g.addColorStop(.7, '#ffcf4a'); g.addColorStop(1, '#b8860b')
    c.fillStyle = g; c.beginPath(); c.ellipse(0, 0, w * 1.1, w * .95, 0, 0, TAU); c.fill()
    c.strokeStyle = '#7a0a0a88'; c.lineWidth = 1.2; c.beginPath(); c.arc(-w * .2, 0, w * .7, -1, 1); c.stroke()
    c.restore()
  }
  const tipA = n > 1 ? Math.atan2(pts[n - 2].y - pts[n - 1].y, pts[n - 2].x - pts[n - 1].x) : 0
  c.save(); c.translate(pts[n - 1].x, pts[n - 1].y); c.rotate(tipA); c.fillStyle = '#ff7a2a'
  c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-r * .8, -r * .9 - Math.sin(t * 6) * r * .3, -r * 1.4, -r * .2); c.quadraticCurveTo(-r * .7, 0, -r * 1.4, r * .4); c.quadraticCurveTo(-r * .8, r * .7, 0, 0); c.fill(); c.restore()
}

export const SPECIES: Species[] = [
  { code: 'SHRIMP', r: 13, speed: [70, 110], weight: 22, draw: drawShrimp, hit: 1.3 },
  { code: 'CLOWNFISH', r: 17, speed: [65, 100], weight: 20, draw: drawClown, hit: 1 },
  { code: 'PUFFER', r: 21, speed: [45, 75], weight: 14, draw: drawPuffer, hit: 1.1 },
  { code: 'ANGELFISH', r: 24, speed: [50, 80], weight: 12, draw: drawAngel, hit: .9 },
  { code: 'TURTLE', r: 30, speed: [35, 55], weight: 8, draw: drawTurtle, hit: 1 },
  { code: 'LANTERN', r: 26, speed: [40, 65], weight: 7, draw: drawLantern, hit: 1 },
  { code: 'OCTOPUS', r: 32, speed: [40, 60], weight: 6, draw: drawOctopus, hit: .9 },
  { code: 'STINGRAY', r: 40, speed: [45, 70], weight: 5, draw: drawRay, hit: .8 },
  { code: 'SWORDFISH', r: 42, speed: [80, 120], weight: 4, draw: drawSword, hit: .6 },
  { code: 'SHARK', r: 56, speed: [45, 65], weight: 3, draw: drawShark, hit: .7 },
  { code: 'WHALE', r: 72, speed: [30, 42], weight: 1.4, draw: drawWhale, hit: .8 },
  { code: 'DRAGON', r: 95, speed: [48, 56], weight: 0, draw: drawDragonHead, hit: .55 },
]
export const byCode = Object.fromEntries(SPECIES.map(s => [s.code, s]))
export const DRAGON_TRAIL = 26, TRAIL_GAP = 13

// ------------------------------------------------------------------ the static seabed, drawn once

export function paintSeabed(c: Ctx2D) {
  const sea = c.createLinearGradient(0, 0, 0, H)
  sea.addColorStop(0, '#0e6c8f'); sea.addColorStop(.35, '#0a4467'); sea.addColorStop(.75, '#06264a'); sea.addColorStop(1, '#041630')
  c.fillStyle = sea; c.fillRect(0, 0, W, H)
  const glow = c.createRadialGradient(W / 2, -80, 40, W / 2, -80, 700); glow.addColorStop(0, '#7fe9ff55'); glow.addColorStop(1, '#7fe9ff00')
  c.fillStyle = glow; c.fillRect(0, 0, W, H)
  // Far rocks, then sand, then near coral.
  c.fillStyle = '#0a2b45'
  c.beginPath(); c.moveTo(0, H); for (let x = 0; x <= W; x += 40) c.lineTo(x, H - 150 - Math.sin(x / 130) * 40 - Math.sin(x / 47) * 12); c.lineTo(W, H); c.fill()
  const sand = c.createLinearGradient(0, H - 110, 0, H); sand.addColorStop(0, '#2c5a6e'); sand.addColorStop(1, '#173347')
  c.fillStyle = sand; c.beginPath(); c.moveTo(0, H); for (let x = 0; x <= W; x += 20) c.lineTo(x, H - 78 - Math.sin(x / 90) * 14); c.lineTo(W, H); c.fill()
  const coral = (x: number, y: number, color: string, scale: number) => {
    c.strokeStyle = color; c.lineCap = 'round'
    const branch = (bx: number, by: number, a: number, len: number, w: number, depth: number) => {
      if (depth === 0) return
      const ex = bx + Math.cos(a) * len, ey = by + Math.sin(a) * len
      c.lineWidth = w; c.beginPath(); c.moveTo(bx, by); c.lineTo(ex, ey); c.stroke()
      branch(ex, ey, a - .45, len * .72, w * .7, depth - 1); branch(ex, ey, a + .4, len * .7, w * .7, depth - 1)
    }
    branch(x, y, -Math.PI / 2, 38 * scale, 9 * scale, 5)
  }
  coral(90, H - 70, '#e2507a', 1.1); coral(210, H - 64, '#f39a3b', .8); coral(1080, H - 72, '#b35be0', 1.2); coral(1190, H - 66, '#e2507a', .75); coral(700, H - 60, '#f39a3b', .6)
  for (const [x, y, rx] of [[330, H - 60, 60], [940, H - 56, 80], [560, H - 48, 40]]) {
    const rock = c.createRadialGradient(x - rx * .3, y - 20, 5, x, y, rx); rock.addColorStop(0, '#46708a'); rock.addColorStop(1, '#16324a')
    c.fillStyle = rock; c.beginPath(); c.ellipse(x, y, rx, rx * .45, 0, Math.PI, 0); c.fill()
  }
  // Treasure chest, half buried.
  c.save(); c.translate(1010, H - 70)
  c.fillStyle = '#6b3b12'; c.fillRect(-34, -26, 68, 34); c.fillStyle = '#8a4e18'; c.beginPath(); c.ellipse(0, -26, 34, 14, 0, Math.PI, 0); c.fill()
  c.fillStyle = '#ffd24a'; c.fillRect(-36, -28, 72, 5); c.fillRect(-4, -30, 8, 36); c.fillStyle = '#fff3a8'; c.beginPath(); c.arc(0, -12, 4, 0, TAU); c.fill()
  c.restore()
}


export function drawCannon(c: Ctx2D, angle: number, level: number, levels: number, recoil: number) {
  const tier = levels <= 1 ? 0 : level / (levels - 1)
  const colors = tier > .66 ? ['#fff3b0', '#ffc02e', '#8a5a06'] : tier > .33 ? ['#f5c6ff', '#c05cff', '#4a1380'] : ['#c8f7ff', '#39c6e6', '#0b4a66']
  // Base platform.
  const base = c.createLinearGradient(0, H - 70, 0, H); base.addColorStop(0, '#3a1a6e'); base.addColorStop(1, '#12052b')
  c.fillStyle = base; c.beginPath(); c.moveTo(CANNON.x - 170, H); c.lineTo(CANNON.x - 120, H - 58); c.lineTo(CANNON.x + 120, H - 58); c.lineTo(CANNON.x + 170, H); c.fill()
  c.strokeStyle = '#ffd54a'; c.lineWidth = 2; c.stroke()
  c.save(); c.translate(CANNON.x, CANNON.y); c.rotate(angle + Math.PI / 2)
  c.translate(0, recoil * 8)
  const barrel = c.createLinearGradient(-18, 0, 18, 0); barrel.addColorStop(0, colors[2]); barrel.addColorStop(.5, colors[0]); barrel.addColorStop(1, colors[2])
  const width = 18 + tier * 8
  c.fillStyle = barrel; c.beginPath(); c.roundRect(-width, -96, width * 2, 92, 9); c.fill()
  c.strokeStyle = colors[2]; c.lineWidth = 2; c.stroke()
  c.fillStyle = colors[1]; c.beginPath(); c.roundRect(-width - 5, -104, width * 2 + 10, 14, 5); c.fill()
  c.fillStyle = '#ffffff55'; c.fillRect(-width * .45, -92, width * .3, 80)
  if (tier > .33) { c.fillRect(-width - 6, -40, 6, 26); c.fillRect(width, -40, 6, 26) }
  c.restore()
  const hub = c.createRadialGradient(CANNON.x - 10, CANNON.y - 12, 4, CANNON.x, CANNON.y, 40); hub.addColorStop(0, colors[0]); hub.addColorStop(.6, colors[1]); hub.addColorStop(1, colors[2])
  c.fillStyle = hub; c.beginPath(); c.arc(CANNON.x, CANNON.y, 36, 0, TAU); c.fill()
  c.strokeStyle = '#ffffff88'; c.lineWidth = 2; c.stroke()
}

