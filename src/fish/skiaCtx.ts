import { Platform } from 'react-native';
import { BlendMode, ClipOp, PaintStyle, Skia, StrokeCap, TileMode, matchFont, type SkCanvas, type SkColor, type SkFont, type SkPaint, type SkPath, type SkPicture, type SkShader } from '@shopify/react-native-skia';

/**
 * The part of the browser's CanvasRenderingContext2D that the fish table draws with, on a Skia canvas. The creature
 * art is shared with the website (see art.ts), so it is written against this rather than against Skia directly.
 */
type Stop = [number, string];
export class Gradient {
  private shader: SkShader | null = null;
  readonly stops: Stop[] = [];
  constructor(private readonly make: (colors: SkColor[], positions: number[]) => SkShader) {}
  addColorStop(at: number, color: string) { this.stops.push([at, color]); this.shader = null; }
  build() { return this.shader ??= this.make(this.stops.map(([, c]) => Skia.Color(c)), this.stops.map(([at]) => at)); }
}
type Style = string | Gradient;

const fonts = new Map<string, SkFont | null>();
function fontOf(spec: string): SkFont | null {
  if (!fonts.has(spec)) {
    const size = Number(/(\d+(?:\.\d+)?)px/.exec(spec)?.[1] ?? 16), weight = /\b([1-9]00)\b/.exec(spec)?.[1] ?? 'bold';
    try { fonts.set(spec, matchFont({ fontFamily: Platform.select({ ios: 'Helvetica', default: 'sans-serif' }), fontSize: size, fontWeight: weight as '800' })); }
    catch { fonts.set(spec, null); }
  }
  return fonts.get(spec)!;
}

type State = { fill: Style; stroke: Style; lineWidth: number; lineCap: 'butt' | 'round' | 'square'; alpha: number; blend: string; dash: number[]; dashOffset: number; font: string; align: string };

export class Ctx2D {
  private path: SkPath = Skia.Path.Make();
  private state: State = { fill: '#000', stroke: '#000', lineWidth: 1, lineCap: 'butt', alpha: 1, blend: 'source-over', dash: [], dashOffset: 0, font: '16px sans-serif', align: 'start' };
  private stack: State[] = [];
  private readonly paint: SkPaint = Skia.Paint();
  constructor(readonly canvas: SkCanvas) { this.paint.setAntiAlias(true); }

  get fillStyle() { return this.state.fill as never; } set fillStyle(v: Style) { this.state.fill = v; }
  get strokeStyle() { return this.state.stroke as never; } set strokeStyle(v: Style) { this.state.stroke = v; }
  get lineWidth() { return this.state.lineWidth; } set lineWidth(v: number) { this.state.lineWidth = v; }
  get lineCap() { return this.state.lineCap; } set lineCap(v: State['lineCap']) { this.state.lineCap = v; }
  get globalAlpha() { return this.state.alpha; } set globalAlpha(v: number) { this.state.alpha = v; }
  get globalCompositeOperation() { return this.state.blend; } set globalCompositeOperation(v: string) { this.state.blend = v; }
  get lineDashOffset() { return this.state.dashOffset; } set lineDashOffset(v: number) { this.state.dashOffset = v; }
  get font() { return this.state.font; } set font(v: string) { this.state.font = v; }
  get textAlign() { return this.state.align; } set textAlign(v: string) { this.state.align = v; }
  setLineDash(v: number[]) { this.state.dash = v; }

  save() { this.stack.push({ ...this.state }); this.canvas.save(); }
  restore() { const s = this.stack.pop(); if (s) this.state = s; this.canvas.restore(); }
  /** An offscreen layer, so "source-atop" tints only what was drawn inside it (the browser composites per canvas). */
  saveLayer() { this.stack.push({ ...this.state }); this.canvas.saveLayer(); }
  translate(x: number, y: number) { this.canvas.translate(x, y); }
  rotate(radians: number) { this.canvas.rotate(radians * 180 / Math.PI, 0, 0); }
  scale(x: number, y: number) { this.canvas.scale(x, y); }

  beginPath() { this.path = Skia.Path.Make(); }
  closePath() { this.path.close(); }
  moveTo(x: number, y: number) { this.path.moveTo(x, y); }
  lineTo(x: number, y: number) { if (this.path.countPoints() === 0) this.path.moveTo(x, y); else this.path.lineTo(x, y); }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number) { this.path.quadTo(cx, cy, x, y); }
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number) { this.path.cubicTo(c1x, c1y, c2x, c2y, x, y); }
  arc(x: number, y: number, r: number, start: number, end: number, ccw = false) { this.ellipse(x, y, r, r, 0, start, end, ccw); }
  ellipse(x: number, y: number, rx: number, ry: number, rotation: number, start: number, end: number, ccw = false) {
    let sweep = end - start
    if (!ccw && sweep < 0) sweep += Math.PI * 2; else if (ccw && sweep > 0) sweep -= Math.PI * 2
    sweep = Math.max(-Math.PI * 2, Math.min(Math.PI * 2, sweep))
    const oval = Skia.XYWHRect(x - rx, y - ry, rx * 2, ry * 2), full = Math.abs(sweep) >= Math.PI * 2 - 1e-6
    const part = Skia.Path.Make()
    if (rotation) {
      // A rotated ellipse (a fin): its outline as points, turned about the centre.
      const steps = 32, cos = Math.cos(rotation), sin = Math.sin(rotation)
      for (let i = 0; i <= steps; i++) {
        const a = start + sweep * i / steps, ex = Math.cos(a) * rx, ey = Math.sin(a) * ry
        const px = x + ex * cos - ey * sin, py = y + ex * sin + ey * cos
        if (i === 0) part.moveTo(px, py); else part.lineTo(px, py)
      }
      if (full) part.close()
    } else if (full) part.addOval(oval); else part.arcToOval(oval, start * 180 / Math.PI, sweep * 180 / Math.PI, true)
    // The browser draws a line from the current point to where the arc starts; addPath(extend) does the same.
    this.path.addPath(part, undefined, !full && this.path.countPoints() > 0);
  }
  roundRect(x: number, y: number, w: number, h: number, r: number) { this.path.addRRect(Skia.RRectXY(Skia.XYWHRect(x, y, w, h), r, r)); }

  createLinearGradient(x0: number, y0: number, x1: number, y1: number) {
    return new Gradient((colors, pos) => Skia.Shader.MakeLinearGradient({ x: x0, y: y0 }, { x: x1, y: y1 }, colors, pos, TileMode.Clamp));
  }
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number) {
    return new Gradient((colors, pos) => Skia.Shader.MakeTwoPointConicalGradient({ x: x0, y: y0 }, r0, { x: x1, y: y1 }, r1, colors, pos, TileMode.Clamp));
  }

  private prepare(style: Style, stroke: boolean) {
    const p = this.paint
    p.setShader(null); p.setPathEffect(null)
    p.setStyle(stroke ? PaintStyle.Stroke : PaintStyle.Fill)
    if (typeof style === 'string') { const color = Skia.Color(style); p.setColor(color); p.setAlphaf(color[3] * this.state.alpha) }
    else { p.setColor(Skia.Color('#000')); p.setShader(style.build()); p.setAlphaf(this.state.alpha) }
    if (stroke) {
      p.setStrokeWidth(this.state.lineWidth)
      p.setStrokeCap(this.state.lineCap === 'round' ? StrokeCap.Round : this.state.lineCap === 'square' ? StrokeCap.Square : StrokeCap.Butt)
      if (this.state.dash.length) p.setPathEffect(Skia.PathEffect.MakeDash(this.state.dash, this.state.dashOffset))
    }
    p.setBlendMode(this.state.blend === 'lighter' ? BlendMode.Plus : this.state.blend === 'source-atop' ? BlendMode.SrcATop : BlendMode.SrcOver)
    return p
  }
  fill() { this.canvas.drawPath(this.path, this.prepare(this.state.fill, false)); }
  stroke() { this.canvas.drawPath(this.path, this.prepare(this.state.stroke, true)); }
  clip() { this.canvas.clipPath(this.path, ClipOp.Intersect, true); }
  fillRect(x: number, y: number, w: number, h: number) { this.canvas.drawRect(Skia.XYWHRect(x, y, w, h), this.prepare(this.state.fill, false)); }

  measureText(text: string) { const font = fontOf(this.state.font); return { width: font ? font.measureText(text).width : text.length * 9 }; }
  private text(text: string, x: number, y: number, stroke: boolean) {
    const font = fontOf(this.state.font); if (!font) return
    const width = font.measureText(text).width, left = this.state.align === 'center' ? x - width / 2 : this.state.align === 'right' ? x - width : x
    this.canvas.drawText(text, left, y, this.prepare(stroke ? this.state.stroke : this.state.fill, stroke), font)
  }
  fillText(text: string, x: number, y: number) { this.text(text, x, y, false); }
  strokeText(text: string, x: number, y: number) { this.text(text, x, y, true); }
  drawPicture(picture: SkPicture) { this.canvas.drawPicture(picture); }
}
