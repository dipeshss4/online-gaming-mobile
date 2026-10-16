"""
Renders the fish tables' creatures in 3D with Blender (Cycles): each table has its own cast of twelve, modelled here
from code (so all of it is our own), each in an 8-frame swimming loop for the games to play as a sprite sheet.

    blender --background --python scripts/render-fish.py -- <out-dir> [TABLE | TABLE:CODE ...]

Writes <out-dir>/FISH_<TABLE>_<CODE>_<frame>.png; scripts/pack-fish.py lays the frames out into sheets and writes the
lists both games read. Two kinds of creature:

  side  seen from the side, swimming to the right; the game mirrors it to swim left (fish, sharks, whales, eels).
  top   seen from above, head to the right; the game turns it to any heading (turtles, rays, octopuses, bosses).

Every creature is lofted along a spine that bends a little more each frame, so the swim is in the body itself, and its
patterns are painted in the body's own coordinates (along it, around it), so they bend with it.
"""
import bpy, bmesh, math, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
_source = open(os.path.join(HERE, 'render-symbols.py')).read()
exec(_source[:_source.index('\n# ---------------------------------------------------------------- symbols')], globals())

FRAMES = 8
SAMPLES = int(os.environ.get('FISH_SAMPLES', '48'))
TAU = math.pi * 2


# ---------------------------------------------------------------- scene: a camera straight above, lights per table
RIMS = {'DRAGON_TIDE': (1, .72, .35), 'KRAKENS_DEEP': (.7, .4, 1), 'SHARK_FRENZY': (.5, .95, 1)}

def stage(box, px, rim):
    """A fresh scene: an orthographic camera looking straight down at a {box} (width, height) area, rendered {px} wide."""
    reset()
    scene = bpy.context.scene
    for o in list(scene.objects): bpy.data.objects.remove(o, do_unlink=True)
    scene.cycles.samples = SAMPLES
    scene.view_settings.exposure = float(os.environ.get('FISH_EXPOSURE', '0'))
    w, h = box
    scene.render.resolution_x = int(px); scene.render.resolution_y = int(round(px * h / w / 2) * 2)
    cam = bpy.data.objects.new('Camera', bpy.data.cameras.new('Camera')); scene.collection.objects.link(cam); scene.camera = cam
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = max(w, h); cam.location = (0, 0, 20); cam.rotation_euler = (0, 0, 0)
    light('Key', (-4, 4, 9), 380, (1, .97, .92), 4)
    light('Fill', (5, -2, 6), 110, (.85, .92, 1), 5)
    light('Rim', (0, -7, 1.5), 420, rim, 4)
    light('Top', (0, 0, 10), 70, (1, 1, 1), 8)
    # Dimmer reflections than the slot symbols: a fish's colour, not the studio, should fill its body.
    for node in bpy.context.scene.world.node_tree.nodes:
        if node.type == 'BACKGROUND': node.inputs['Strength'].default_value = .35 if node.name == 'Background' else 1.3


# ---------------------------------------------------------------- materials painted in the body's own coordinates
def _ramp(nt, socket, lo, hi, points, interp='LINEAR'):
    N, L = nt.nodes, nt.links
    mr = N.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = lo; mr.inputs['From Max'].default_value = hi
    L.new(socket, mr.inputs['Value'])
    r = N.new('ShaderNodeValToRGB'); cr = r.color_ramp; cr.interpolation = interp
    els = cr.elements; els.remove(els[1])
    els[0].position = points[0][0]; els[0].color = points[0][1]
    for pos, col in points[1:]: e = els.new(pos); e.color = col
    L.new(mr.outputs['Result'], r.inputs['Fac'])
    return r

def _mix(nt, factor, a, b):
    m = nt.nodes.new('ShaderNodeMix'); m.data_type = 'RGBA'
    nt.links.new(factor, m.inputs['Factor']); nt.links.new(a, m.inputs[6])
    if isinstance(b, tuple): m.inputs[7].default_value = (*b, 1)
    else: nt.links.new(b, m.inputs[7])
    return m.outputs[2]

def _math(nt, op, a, b=None):
    m = nt.nodes.new('ShaderNodeMath'); m.operation = op
    for i, v in enumerate((a, b)):
        if v is None: continue
        if isinstance(v, (int, float)): m.inputs[i].default_value = v
        else: nt.links.new(v, m.inputs[i])
    return m.outputs[0]

def _band(nt, socket, lo, hi, soft):
    """1 between lo and hi (softened by {soft}), else 0."""
    a = _math(nt, 'SUBTRACT', socket, lo); b = _math(nt, 'SUBTRACT', hi, socket)
    fa = _math(nt, 'MINIMUM', _math(nt, 'DIVIDE', a, soft), _math(nt, 'DIVIDE', b, soft))
    return _math(nt, 'MINIMUM', _math(nt, 'MAXIMUM', fa, 0.), 1.)

def skin(name, colors, along=None, patches=(), spots=None, metallic=0., rough=.32, coat=.35, glow=None, alpha=1., bump=.0,
         sheen=.0, plates=None, top=False):
    """
    A creature's skin. {colors}: (position, rgb) stops from the belly (0) to the back (1). {along}: (position, rgb, alpha)
    stops from tail (0) to head (1) laid over it. {patches}: (u0, u1, v0, v1, rgb, soft) rectangles in (along, up) with
    up from -1 (belly) to 1 (back). {spots}: (rgb, scale, size) round spots. {glow}: (rgb, strength, where) with where
    'all', 'spots', 'patches' or 'rim' (the outline). {plates}: (seam rgb, scale) for shells. {top}: a creature seen from
    above, whose 'up' runs from its edge (0) to its spine (1).
    """
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N, L = nt.nodes, nt.links
    p = N['Principled BSDF']
    rest = N.new('ShaderNodeUVMap'); rest.uv_map = 'rest'; sep = N.new('ShaderNodeSeparateXYZ'); L.new(rest.outputs['UV'], sep.inputs[0])
    rest2 = N.new('ShaderNodeUVMap'); rest2.uv_map = 'rest2'; sep2 = N.new('ShaderNodeSeparateXYZ'); L.new(rest2.outputs['UV'], sep2.inputs[0])
    u = sep.outputs['X']
    # Up: for a side view the ring's cosine (belly -1 to back 1); seen from above, its sine (edge 0 to spine 1).
    up = sep2.outputs['Y'] if top else sep.outputs['Y']
    base = _ramp(nt, up, 0. if top else -1., 1., [(pos, (*c, 1)) for pos, c in colors])
    color = base.outputs['Color']
    if along:
        r = _ramp(nt, u, 0., 1., [(pos, (*c, a)) for pos, c, a in along])
        color = _mix(nt, r.outputs['Alpha'], color, r.outputs['Color'])
    patch_mask = None
    for u0, u1, v0, v1, c, soft in patches:
        mask = _math(nt, 'MULTIPLY', _band(nt, u, u0, u1, soft), _band(nt, up, v0, v1, soft * 2))
        color = _mix(nt, mask, color, c)
        patch_mask = mask if patch_mask is None else _math(nt, 'MAXIMUM', patch_mask, mask)
    tc = N.new('ShaderNodeTexCoord')
    spot_mask = None
    if spots:
        c, scale, size = spots
        v = N.new('ShaderNodeTexVoronoi'); v.inputs['Scale'].default_value = scale; L.new(tc.outputs['Object'], v.inputs['Vector'])
        spot_mask = _math(nt, 'LESS_THAN', v.outputs['Distance'], size)
        color = _mix(nt, spot_mask, color, c)
    if plates:
        seam, scale = plates
        v = N.new('ShaderNodeTexVoronoi'); v.feature = 'DISTANCE_TO_EDGE'; v.inputs['Scale'].default_value = scale
        L.new(tc.outputs['Object'], v.inputs['Vector'])
        edge = _math(nt, 'LESS_THAN', v.outputs['Distance'], .045)
        color = _mix(nt, edge, color, seam)
        bmp = N.new('ShaderNodeBump'); bmp.inputs['Strength'].default_value = .5; L.new(v.outputs['Distance'], bmp.inputs['Height'])
        L.new(bmp.outputs['Normal'], p.inputs['Normal'])
    L.new(color, p.inputs['Base Color'])
    p.inputs['Metallic'].default_value = metallic; p.inputs['Roughness'].default_value = rough
    p.inputs['Coat Weight'].default_value = coat; p.inputs['Alpha'].default_value = alpha
    p.inputs['Sheen Weight'].default_value = sheen
    if bump and not plates:
        n = N.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = 40; n.inputs['Detail'].default_value = 6
        L.new(tc.outputs['Object'], n.inputs['Vector'])
        b = N.new('ShaderNodeBump'); b.inputs['Strength'].default_value = bump; L.new(n.outputs['Fac'], b.inputs['Height']); L.new(b.outputs['Normal'], p.inputs['Normal'])
    if glow:
        c, strength, where = glow
        p.inputs['Emission Color'].default_value = (*c, 1)
        mask = {'spots': spot_mask, 'patches': patch_mask}.get(where)
        if where == 'rim':
            mask = _math(nt, 'GREATER_THAN', _math(nt, 'ABSOLUTE', sep.outputs['Y']), .9)
        if mask is None: p.inputs['Emission Strength'].default_value = strength
        else: L.new(_math(nt, 'MULTIPLY', mask, strength), p.inputs['Emission Strength'])
    return m

def fin(name, color, edge=None, alpha=.85, glow=None):
    """A fin: thin and a little translucent, with rays; {edge} colours its outer rim."""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N, L = nt.nodes, nt.links; p = N['Principled BSDF']
    tc = N.new('ShaderNodeTexCoord')
    wave = N.new('ShaderNodeTexWave'); wave.wave_type = 'RINGS'; wave.inputs['Scale'].default_value = 2.2; wave.inputs['Distortion'].default_value = 0
    L.new(tc.outputs['Object'], wave.inputs['Vector'])
    rays = _math(nt, 'MULTIPLY', wave.outputs['Fac'], .07)
    c = _mix(nt, rays, nt.nodes.new('ShaderNodeRGB').outputs[0], (1, 1, 1))
    nt.nodes['RGB'].outputs[0].default_value = (*color, 1)
    L.new(c, p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = .35; p.inputs['Coat Weight'].default_value = .4; p.inputs['Alpha'].default_value = alpha
    if glow:
        p.inputs['Emission Color'].default_value = (*glow[0], 1); p.inputs['Emission Strength'].default_value = glow[1]
    m['edge'] = edge or color
    return m

def glossy(color, rough=.08, glow=None):
    m = mat('Gloss', color, rough=rough, coat=1)
    if glow:
        p = m.node_tree.nodes['Principled BSDF']; p.inputs['Emission Color'].default_value = (*glow[0], 1); p.inputs['Emission Strength'].default_value = glow[1]
    return m


# ---------------------------------------------------------------- geometry
def prof(points, u):
    """A smooth profile through (u, value) points."""
    if u <= points[0][0]: return points[0][1]
    for (u0, a), (u1, b) in zip(points, points[1:]):
        if u <= u1:
            k = (u - u0) / (u1 - u0); k = k * k * (3 - 2 * k)
            return a + (b - a) * k
    return points[-1][1]

def loft(path, rw, rh, material, ring=28, off=None, name='Body', caps=(True, True), subsurf=1):
    """
    A tube along {path} (points in the camera's plane): at point i an ellipse {rw}[i] across the path (in the plane) by
    {rh}[i] towards the camera, its centre {off}[i] across. UV map 'rest' holds (along, cos) and 'rest2' (along, sin).
    """
    n = len(path); verts, au, ac, a_s = [], [], [], []
    for i, (x, y) in enumerate(path):
        a, b = path[min(i + 1, n - 1)], path[max(i - 1, 0)]
        tx, ty = a[0] - b[0], a[1] - b[1]; l = math.hypot(tx, ty) or 1; tx, ty = tx / l, ty / l
        sx, sy = -ty, tx; o = off[i] if off else 0
        for j in range(ring):
            th = TAU * j / ring; c, s = math.cos(th), math.sin(th)
            verts.append((x + sx * (o + rw[i] * c), y + sy * (o + rw[i] * c), rh[i] * s))
            au.append(i / (n - 1)); ac.append(c); a_s.append(s)
    faces = []
    for i in range(n - 1):
        for j in range(ring):
            faces.append((i * ring + j, i * ring + (j + 1) % ring, (i + 1) * ring + (j + 1) % ring, (i + 1) * ring + j))
    for end, at in ((0, 0), (1, n - 1)):
        if not caps[end]: continue
        x, y = path[at]; o = off[at] if off else 0
        a, b = path[min(at + 1, n - 1)], path[max(at - 1, 0)]
        tx, ty = a[0] - b[0], a[1] - b[1]; l = math.hypot(tx, ty) or 1
        verts.append((x - ty / l * o, y + tx / l * o, 0)); au.append(at / (n - 1)); ac.append(0); a_s.append(0)
        c = len(verts) - 1
        for j in range(ring): faces.append((c, at * ring + (j + 1) % ring, at * ring + j))
    mesh = bpy.data.meshes.new(name); mesh.from_pydata(verts, [], faces); mesh.update()
    bm = bmesh.new(); bm.from_mesh(mesh); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(mesh); bm.free()
    uv1, uv2 = mesh.uv_layers.new(name='rest'), mesh.uv_layers.new(name='rest2')
    for poly in mesh.polygons:
        poly.use_smooth = True
        for li in poly.loop_indices:
            vi = mesh.loops[li].vertex_index; uv1.data[li].uv = (au[vi], ac[vi]); uv2.data[li].uv = (au[vi], a_s[vi])
    o = bpy.data.objects.new(name, mesh); bpy.context.scene.collection.objects.link(o)
    if subsurf: sub = o.modifiers.new('Sub', 'SUBSURF'); sub.levels = sub.render_levels = subsurf
    return add(o, material)

def curve(points, k=5):
    """A smooth closed outline through {points} (Catmull-Rom), {k} points per side."""
    n = len(points); out = []
    for i in range(n):
        p0, p1, p2, p3 = points[i - 1], points[i], points[(i + 1) % n], points[(i + 2) % n]
        for j in range(k):
            t = j / k; t2, t3 = t * t, t * t * t
            out.append(tuple(.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3) for a, b, c, d in zip(p0, p1, p2, p3)))
    return out

def flat(points, material, z=0., depth=.02, name='Fin', smooth=True):
    """A thin flat shape in the camera's plane, centred on {z}, its outline smoothed."""
    o = prism(curve(points) if smooth else points, depth, z + depth / 2, material, .0); o.name = name
    # Painted like the middle of a body (side view) or its back (top view).
    a, b = o.data.uv_layers.new(name='rest'), o.data.uv_layers.new(name='rest2')
    for poly in o.data.polygons:
        poly.use_smooth = True
        for li in poly.loop_indices: a.data[li].uv = (.5, 0); b.data[li].uv = (.5, 1)
    return o

def cone(base, tip, radius, material, segments=12):
    """A spike from {base} to {tip} (3D points)."""
    bx, by, bz = base; tx, ty, tz = tip
    d = math.sqrt((tx - bx) ** 2 + (ty - by) ** 2 + (tz - bz) ** 2)
    bpy.ops.mesh.primitive_cone_add(vertices=segments, radius1=radius, radius2=0, depth=d, location=((bx + tx) / 2, (by + ty) / 2, (bz + tz) / 2))
    o = bpy.context.object
    from mathutils import Vector
    o.rotation_euler = (Vector((tx - bx, ty - by, tz - bz))).to_track_quat('Z', 'Y').to_euler()
    bpy.ops.object.shade_smooth(); return add(o, material)

class Spine:
    """A bent spine (points from tail to head) that maps (along, across) to the plane, past either end too."""
    def __init__(self, pts, lag=1.3):
        self.p = pts; self.n = len(pts); self.lag = lag
    def frame(self, i):
        a, b = self.p[min(i + 1, self.n - 1)], self.p[max(i - 1, 0)]
        tx, ty = a[0] - b[0], a[1] - b[1]; l = math.hypot(tx, ty) or 1
        return tx / l, ty / l
    def length(self):
        return sum(math.dist(a, b) for a, b in zip(self.p, self.p[1:]))
    def at(self, u, v=0.):
        if 0 <= u <= 1:
            f = u * (self.n - 1); i = min(int(f), self.n - 2); k = f - i
            x = self.p[i][0] + (self.p[i + 1][0] - self.p[i][0]) * k; y = self.p[i][1] + (self.p[i + 1][1] - self.p[i][1]) * k
            tx, ty = self.frame(i if k < .5 else i + 1)
            return x - ty * v, y + tx * v
        end = 0 if u < 0 else self.n - 1; tx, ty = self.frame(end)
        if u < 0:
            # Past the tail the fin swings further than the body: its angle lags and grows.
            a = math.atan2(ty, tx) * self.lag; tx, ty = math.cos(a), math.sin(a)
        d = (u if u < 0 else u - 1) * self.length()
        x, y = self.p[end][0] + tx * d, self.p[end][1] + ty * d
        return x - ty * v, y + tx * v
    def angle(self, u):
        i = max(0, min(self.n - 1, int(u * (self.n - 1)))); tx, ty = self.frame(i); return math.atan2(ty, tx)

def spine(phase, length, amp, waves, head=.08, arch=None, steps=48, plane=True):
    """Points from tail to head along x, bent by a travelling wave strongest at the tail."""
    pts = []
    for i in range(steps):
        u = i / (steps - 1); x = -length / 2 + length * u
        a = amp * ((1 - u) ** 2 + head * u)
        y = a * math.sin(TAU * phase + waves * TAU * u) + (arch(u) if arch else 0)
        pts.append((x, y))
    return pts


# ---------------------------------------------------------------- side-view fish
def side_fish(phase, s):
    """
    A fish seen from the side, head to the right. {s}: length, amp, waves; dorsal/ventral/thick profiles (u, size) from
    tail (0) to nose (1); skin/fins materials; fins: ('D'|'V', [(u, height)]) along the back or belly, ('T', [(u, v)])
    the tail past u=0, ('P', u, v, length, width, angle) a pectoral on the near side; eye (u, v, size); extra(spine, phase).
    """
    pts = spine(phase, s['length'], s['amp'], s.get('waves', .9), arch=s.get('arch'))
    sp = Spine(pts, s.get('lag', 1.35)); n = len(pts); us = [i / (n - 1) for i in range(n)]
    d = [prof(s['dorsal'], u) for u in us]; v = [prof(s['ventral'], u) for u in us]
    body = loft(pts, [(a + b) / 2 for a, b in zip(d, v)], [prof(s['thick'], u) for u in us], s['skin'](), off=[(a - b) / 2 for a, b in zip(d, v)])
    fins = s['fins_mat']()
    for spec in s.get('fins', []):
        kind = spec[0]
        if kind in ('D', 'V'):
            sign = 1 if kind == 'D' else -1; prof_ = s['dorsal'] if kind == 'D' else s['ventral']
            outline = [sp.at(u, sign * (prof(prof_, u) + h - .03)) for u, h in spec[1]]
            flat(outline, spec[2]() if len(spec) > 2 else fins, z=-.005)
        elif kind == 'T':
            flat([sp.at(u, vv) for u, vv in spec[1]], spec[2]() if len(spec) > 2 else fins, z=-.005)
        elif kind == 'P':
            _, u, vv, length, width, ang = spec[:6]
            flap = math.sin(TAU * phase * 2) * .22
            x, y = sp.at(u, vv); a = sp.angle(u) + math.radians(ang) + flap
            o = sphere((x + math.cos(a) * length / 2, y + math.sin(a) * length / 2, prof(s['thick'], u) * .9), (length / 2, width / 2, .012), spec[6]() if len(spec) > 6 else fins, 24)
            o.rotation_euler = (0, 0, a)
    if 'eye' in s:
        u, vv, size = s['eye']; x, y = sp.at(u, vv); z = prof(s['thick'], u) * .78
        sphere((x, y, z), (size, size, size * .55), glossy(s.get('eye_white', (.95, .95, .9)), .2), 24)
        sphere((x + size * .12, y, z + size * .3), (size * .66, size * .66, size * .4), glossy(s.get('iris', (.01, .01, .01)), .04, s.get('eye_glow')), 24)
    if 'extra' in s: s['extra'](sp, phase)
    return sp


# ---------------------------------------------------------------- top-view creatures
def turtle(phase, shell, seam, skin_c, spots_c, rim):
    stroke = math.sin(TAU * phase)
    sphere((0, 0, 0), (.98, .8, .16), skin(rim and 'Rim', [(0, rim), (1, rim)], top=True, rough=.4), 48)
    sphere((0, 0, .02), (.9, .72, .34), skin('Shell', [(0, tuple(c * .65 for c in shell)), (1, shell)], plates=(seam, 2.6), rough=.32, coat=.8, top=True), 64)
    flesh = lambda: skin('Flesh', [(0, tuple(c * .7 for c in skin_c)), (1, skin_c)], spots=(spots_c, 14, .09), rough=.45, coat=.3, top=True)
    neck = [(.7, 0), (.95, math.sin(TAU * phase) * .03), (1.12, math.sin(TAU * phase) * .05)]
    loft(neck, [.15, .14, .13], [.1, .1, .09], flesh(), ring=16, caps=(True, False))
    head = sphere((1.25, math.sin(TAU * phase) * .06, .04), (.24, .18, .13), flesh(), 32)
    for k in (-1, 1):
        sphere((1.33, math.sin(TAU * phase) * .06 + k * .12, .1), (.035, .035, .03), glossy((.02, .02, .02)), 16)
        # Front flippers sweep back and forth; the back ones paddle a little.
        flipper((.45, k * .6), k, math.radians(40 - 38 * stroke), .78, .2, flesh)
        flipper((-.62, k * .48), k, math.radians(70 - 15 * stroke), .32, .13, flesh)
    sphere((-1.0, 0, 0), (.14, .06, .04), flesh(), 16)

def flipper(base, side, sweep, length, width, material):
    """A flat paddle from {base} swept {sweep} radians back from straight out to the {side}."""
    # Out to the side, then curving back.
    pts = []
    for i in range(7):
        t = i / 6; bend = t * t * .5
        dx = -math.sin(sweep) * t * length - bend * length * .5
        dy = side * math.cos(sweep) * t * length
        pts.append((base[0] + dx, base[1] + dy))
    loft(pts, [width * (1 - abs(2 * (i / 6) - .7) * .55) for i in range(7)], [.035] * 7, material(), ring=16)

def octopus(phase, s):
    """Mantle ahead, eyes on the head, eight arms trailing and curling behind."""
    sk = s['skin']
    sphere((.5, 0, .14), (.58, .44, .36), sk(), 48)
    sphere((.02, 0, .08), (.3, .4, .24), sk(), 32)
    for k in (-1, 1):
        sphere((.12, k * .3, .18), (.1, .1, .08), glossy(s.get('eye', (1, .8, .2)), .1, s.get('eye_glow')), 20)
        sphere((.16, k * .32, .23), (.05, .05, .03), glossy((.02, .02, .02)), 12)
    for i in range(8):
        spread = (i - 3.5) / 3.5
        a0 = math.pi + spread * math.radians(62)
        pts = []
        L = s.get('arm', 1.25) * (1 - abs(spread) * .18)
        for j in range(20):
            t = j / 19
            wav = math.sin(TAU * phase + t * 4.5 + i * .9) * .3 * t + spread * t * t * 1.4
            a = a0 + wav + spread * t * .35
            if j == 0: x, y = -.05 + math.cos(a0) * .1, math.sin(a0) * .25
            else:
                px, py = pts[-1]; step = L / 19
                x, y = px + math.cos(a) * step, py + math.sin(a) * step
            pts.append((x, y))
        loft(pts, [.17 * (1 - t / 20) ** 1.3 + .012 for t in range(20)], [.12 * (1 - t / 20) ** 1.3 + .01 for t in range(20)], s['arm_skin'](), ring=16)

def ray(phase, s):
    """A ray from above: a flat diamond of wings that beat, eyes up front, a long thin tail."""
    flapA = math.sin(TAU * phase) * .5
    n = 40; us = [i / (n - 1) for i in range(n)]
    pts = [(-.9 + 1.7 * u, math.sin(TAU * phase + u * 3) * .03) for u in us]
    width = [prof(s['width'], u) for u in us]; thick = [prof([(0, .02), (.5, .13), (.85, .1), (1, .02)], u) for u in us]
    body = loft(pts, width, thick, s['skin'](), ring=36)
    # Beat the wings: points further out bend up more, which from above draws them in.
    for v in body.data.vertices:
        y = v.co.y; r = abs(y)
        if r > .2:
            b = flapA * (r - .2) ** 1.3
            v.co.y = math.copysign(.2 + (r - .2) * math.cos(b), y); v.co.z += (r - .2) * math.sin(b)
    tail = [(-.9 - t * s.get('tail', 1.3), math.sin(TAU * phase + t * 5) * .06 * t) for t in [i / 15 for i in range(16)]]
    loft(tail, [.035 * (1 - t / 17) for t in range(16)], [.03 * (1 - t / 17) for t in range(16)], s['skin'](), ring=10)
    for k in (-1, 1):
        sphere((.55, k * .16, .1), (.045, .04, .035), glossy((.03, .02, .02)), 16)
        if s.get('horns'):
            loft([(.72, k * .2), (.86, k * .26), (.96, k * .22)], [.06, .05, .03], [.03, .03, .02], s['skin'](), ring=12)
    if s.get('extra'): s['extra'](phase)

def kraken(phase, s):
    """The Kraken from above: a long mantle behind, glowing eyes on its head, eight arms and two tentacles reaching ahead."""
    sk = s['skin']
    mantle = [(-1.75 + 1.6 * t, math.sin(TAU * phase + t * 2) * .05 * (1 - t)) for t in [i / 23 for i in range(24)]]
    loft(mantle, [prof([(0, .05), (.3, .32), (.8, .46), (1, .42)], i / 23) for i in range(24)],
         [prof([(0, .04), (.3, .26), (.8, .36), (1, .34)], i / 23) for i in range(24)], sk(), ring=30)
    for k in (-1, 1):
        flat([(-1.75, 0), (-1.45, k * .05), (-1.2, k * .55), (-1.6, k * .5)], s['fin'](), z=-.02)
    sphere((.05, 0, .1), (.5, .48, .38), sk(), 48)
    for k in (-1, 1):
        sphere((.1, k * .38, .26), (.14, .12, .1), glossy((1, .55, .05), .05, ((1, .45, .02), 6)), 24)
        sphere((.17, k * .4, .33), (.05, .09, .03), glossy((.02, .0, .0)), 12)
    for i in range(10):
        tentacle = i in (4, 5)
        spread = (i - 4.5) / 4.5
        a0 = spread * math.radians(80 if not tentacle else 14)
        L = 2.25 if tentacle else 1.55 * (1 - abs(spread) * .2)
        pts = [(.25 + math.cos(a0) * .2, math.sin(a0) * .32)]
        steps = 26
        for j in range(1, steps):
            t = j / (steps - 1)
            a = a0 + math.sin(TAU * phase + t * 4 + i * 1.3) * .35 * t + spread * t * (.5 if not tentacle else .2)
            px, py = pts[-1]; pts.append((px + math.cos(a) * L / steps, py + math.sin(a) * L / steps))
        r0 = .09 if tentacle else .14
        radii = [r0 * (1 - j / steps * .88) for j in range(steps)]
        if tentacle:
            for j in range(steps - 6, steps): radii[j] = r0 * .9 * math.sin(math.pi * (j - steps + 7) / 7) + .01
        loft(pts, radii, [r * .75 for r in radii], s['arm'](), ring=14)

def dragon(phase, s):
    """The Tide Dragon from above: a long body in S-curves with a gold crest, clawed legs, a big horned head and whiskers."""
    length = 4.2; n = 72
    pts = [(-2.5 + length * (i / (n - 1)), .34 * math.sin(TAU * phase + 1.2 * TAU * (i / (n - 1))) * (.35 + .65 * (1 - i / (n - 1)))) for i in range(n)]
    sp = Spine(pts); us = [i / (n - 1) for i in range(n)]
    rw = [prof([(0, .04), (.12, .13), (.45, .27), (.8, .33), (.93, .27), (1, .25)], u) for u in us]
    loft(pts, rw, [r * .8 for r in rw], s['skin'](), ring=28, caps=(True, False))
    gold, mane = s['gold'], s['mane']
    # A crest of gold blades along the back, leaning alternately left and right.
    for i in range(3, n - 3, 2):
        u = us[i]; x, y = pts[i]; a = sp.angle(u); k = 1 if i % 4 == 1 else -1; size = .16 + .14 * math.sin(math.pi * u)
        back = a + math.pi
        flat([(x + math.cos(a) * .05, y + math.sin(a) * .05), (x + math.cos(back + k * .5) * size * 1.4, y + math.sin(back + k * .5) * size * 1.4), (x + math.cos(back) * size * .5, y + math.sin(back) * size * .5)],
             gold(), z=rw[i] * .8, depth=.015, smooth=False)
    # Four legs with three-clawed feet.
    for u0 in (.78, .42):
        for k in (-1, 1):
            r0 = prof([(0, .04), (.45, .27), (.8, .33)], u0); x, y = sp.at(u0, k * r0 * .7)
            a = sp.angle(u0) + k * math.radians(105) + math.sin(TAU * phase + u0 * 7) * .3 * k
            knee = (x + math.cos(a) * .28, y + math.sin(a) * .28); foot = (knee[0] + math.cos(a - k * .9) * .26, knee[1] + math.sin(a - k * .9) * .26)
            loft([(x, y), knee, foot], [.13, .1, .075], [.11, .085, .065], s['skin'](), ring=14)
            for c in (-1, 0, 1):
                ca = a - k * .9 + c * .5; cone((foot[0], foot[1], .05), (foot[0] + math.cos(ca) * .14, foot[1] + math.sin(ca) * .14, .03), .03, gold())
    # The head: a long snout, a heavy brow, glowing eyes, antler horns, a beard, a flowing mane and whiskers.
    hx, hy = pts[-1]; ha = sp.angle(1.)
    def h(dx, dy): return hx + math.cos(ha) * dx - math.sin(ha) * dy, hy + math.sin(ha) * dx + math.cos(ha) * dy
    loft([h(-.1, 0), h(.1, 0), h(.32, 0), h(.55, 0), h(.75, 0), h(.88, 0)], [.3, .37, .36, .27, .21, .12], [.24, .28, .26, .2, .16, .1], s['skin'](), ring=28)
    sphere((*h(.86, 0), .07), (.07, .13, .06), s['skin'](), 20)
    for k in (-1, 1):
        sphere((*h(.82, k * .09), .12), (.03, .03, .02), mat('Nostril', (.05, .0, .0), rough=.5), 10)
        sphere((*h(.33, k * .2), .2), (.09, .07, .06), glossy((1, .78, .15), .05, ((1, .6, .05), 6)), 20)
        sphere((*h(.36, k * .21), .24), (.03, .05, .02), glossy((.02, .0, .0)), 10)
        loft([h(.38, k * .12), h(.36, k * .22), h(.33, k * .27)], [.05, .045, .03], [.06, .05, .03], s['skin'](), ring=12)
        # Antlers: a main beam sweeping back with two tines.
        beam = [h(.2, k * .15), h(-.05, k * .3), h(-.35, k * .38), h(-.62, k * .34)]
        loft(beam, [.055, .045, .035, .015], [.05, .04, .03, .015], gold(), ring=14)
        for t, off in ((1, .14), (2, .12)):
            bx, by = beam[t]; loft([(bx, by), h(-.05 - t * .26, k * (.48 + t * .04)), h(-.1 - t * .3, k * (.56 + t * .03))], [.03, .02, .008], [.03, .02, .008], gold(), ring=10)
        # Whiskers: long, gold, waving.
        wh = [h(.8, k * .1)] + [h(.8 - t * 1.5, k * (.16 + t * .55) + math.sin(TAU * phase + t * 5 + k) * .16 * t) for t in (.1, .25, .4, .55, .7, .85, 1)]
        loft(wh, [.028, .025, .022, .018, .014, .01, .007, .003], [.02] * 8, gold(), ring=8)
        # The mane: flames along the back of the head and neck.
        for j in range(6):
            u = .99 - j * .025; x, y = sp.at(u, k * .2) if j else h(0, k * .22); a = (sp.angle(u) if j else ha) + k * math.radians(145) + math.sin(TAU * phase + j) * .15
            L = .42 - j * .04
            flat([(x, y), (x + math.cos(a - k * .25) * L, y + math.sin(a - k * .25) * L), (x + math.cos(a) * L * .55, y + math.sin(a) * L * .55),
                  (x + math.cos(a + k * .3) * L * .8, y + math.sin(a + k * .3) * L * .8), (x + math.cos(a + k * .5) * L * .3, y + math.sin(a + k * .5) * L * .3)], mane(), z=.12, depth=.015)
    flat([h(.75, -.06), h(.55, -.04), h(.3, 0), h(.55, .04), h(.75, .06)], mane(), z=-.05)
    # The tail ends in a flame-like tuft.
    tx, ty = pts[0]; ta = sp.angle(0)
    for k in (-1, 0, 1):
        a = ta + math.pi + k * .5
        flat([(tx + math.cos(ta) * .1, ty + math.sin(ta) * .1), (tx + math.cos(a - .2) * .45, ty + math.sin(a - .2) * .45), (tx + math.cos(a) * .3, ty + math.sin(a) * .3), (tx + math.cos(a + .2) * .5, ty + math.sin(a + .2) * .5)], mane(), z=.02, depth=.015)

def hammerhead(phase, s):
    """A hammerhead from above: its body swings side to side, the hammer leads with an eye at each end."""
    n = 48; us = [i / (n - 1) for i in range(n)]
    pts = spine(phase, 2.2, .2, .8, head=.04)
    sp = Spine(pts, 1.4)
    rw = [prof([(0, .03), (.2, .07), (.6, .2), (.85, .18), (1, .08)], u) for u in us]
    loft(pts, rw, [r * .9 for r in rw], s['skin'](), ring=28)
    hx, hy = sp.at(1.); ha = sp.angle(1.)
    foil = [(-.05, -.42), (.06, -.44), (.12, -.2), (.16, 0), (.12, .2), (.06, .44), (-.05, .42), (-.02, 0)]
    pts2 = [(hx + math.cos(ha) * x - math.sin(ha) * y, hy + math.sin(ha) * x + math.cos(ha) * y) for x, y in foil]
    flat(pts2, s['skin'](), z=.02, depth=.07)
    for k in (-1, 1):
        x, y = hx + math.cos(ha) * .02 - math.sin(ha) * k * .43, hy + math.sin(ha) * .02 + math.cos(ha) * k * .43
        sphere((x, y, .07), (.03, .03, .025), glossy((.02, .02, .02)), 12)
        # Pectorals out to the sides, swept back.
        u = .62; px, py = sp.at(u, k * .15); a = sp.angle(u) + k * math.radians(125)
        flat([(px, py), (px + math.cos(a) * .55, py + math.sin(a) * .55), (px + math.cos(a + k * .45) * .38, py + math.sin(a + k * .45) * .38), (px + math.cos(sp.angle(u) + math.pi) * .2, py + math.sin(sp.angle(u) + math.pi) * .2)], s['skin'](), z=-.02, depth=.04)
    tail = [sp.at(u, v) for u, v in ((.02, 0), (-.12, .1), (-.25, .3), (-.18, .02), (-.2, -.16), (.02, -.03))]
    flat(tail, s['skin'](), z=0, depth=.04)
    x, y = sp.at(.58); a = sp.angle(.58)
    sphere((x, y, .2), (.22, .02, .1), s['skin'](), 16).rotation_euler = (0, 0, a)


# ---------------------------------------------------------------- the casts
def C(*rgb):
    """A colour as written for the web (0-255, sRGB), in the linear values Blender works in."""
    return tuple((v / 255) ** 2.2 for v in rgb)

def spikes(sp, phase, thick, dorsal, ventral, material, tip=None, count=(9, 5), length=.16):
    """Spikes over the near side of a round fish."""
    for i in range(count[0]):
        u = .18 + .72 * i / (count[0] - 1)
        for j in range(count[1]):
            t = -.85 + 1.7 * j / (count[1] - 1)
            d, v = prof(dorsal, u), prof(ventral, u); centre = (d - v) / 2; rad = (d + v) / 2
            vv = centre + rad * t; z = prof(thick, u) * math.sqrt(max(0, 1 - t * t)) * .95
            x, y = sp.at(u, vv); nx, ny = sp.at(u, vv + t * .1)
            dx, dy = nx - x, ny - y; l = math.hypot(dx, dy) or 1
            out = (x + dx / l * length * .6, y + dy / l * length * .6, z + length * .8 * math.sqrt(max(0, 1 - t * t)))
            cone((x, y, z), out, .04, material())
            if tip: sphere(out, (.022,) * 3, tip(), 8)

def bill(sp, length, base, material):
    pts = [sp.at(1 + t * length / sp.length()) for t in (0, .25, .5, .75, 1)]
    loft(pts, [base, base * .7, base * .5, base * .3, .005], [base * .8, base * .55, base * .4, base * .25, .005], material(), ring=12)

def lure(sp, phase, glow_c):
    x, y = sp.at(.93, .22); sway = math.sin(TAU * phase) * .06
    stalk = [(x, y), (x + .12, y + .28), (x + .35, y + .36 + sway), (x + .5, y + .22 + sway)]
    loft(stalk, [.02, .018, .015, .012], [.02, .018, .015, .012], skin('Stalk', [(0, C(70, 50, 40)), (1, C(110, 80, 60))]), ring=8)
    sphere((x + .52, y + .18 + sway, .05), (.08, .08, .08), glossy(glow_c, .1, (glow_c, 3.5)), 20)
    sphere((x + .52, y + .18 + sway, .05), (.16, .16, .02), mat('Halo', glow_c, emission=glow_c, strength=1.2), 20).data.materials[0].node_tree.nodes['Principled BSDF'].inputs['Alpha'].default_value = .35

def shrimp_legs(sp, phase, material, antenna):
    for i in range(5):
        u = .45 + i * .09; x, y = sp.at(u, -prof([(0, .05), (.5, .15), (1, .1)], u))
        a = -math.pi / 2 - .5 + math.sin(TAU * phase * 2 + i) * .3
        loft([(x, y), (x + math.cos(a) * .12, y + math.sin(a) * .12), (x + math.cos(a + .6) * .2, y + math.sin(a + .6) * .2)], [.012, .01, .006], [.01] * 3, material(), ring=8)
    for k in (0, 1):
        x, y = sp.at(1., .05 + k * .03)
        # Swept back over the body, waving.
        pts = [(x - t * 1.3, y + .12 + t * (.22 + k * .12) + math.sin(TAU * phase + t * 4 + k) * .08 * t) for t in (0, .15, .35, .55, .75, 1)]
        loft(pts, [.012, .01, .008, .006, .004, .002], [.01] * 6, antenna(), ring=8)

def shrimp_tail(sp, material):
    for a in (-.6, -.3, 0, .3, .6):
        x, y = sp.at(0.); ang = sp.angle(0.) + math.pi + a
        flat([(x, y), (x + math.cos(ang - .14) * .3, y + math.sin(ang - .14) * .3), (x + math.cos(ang) * .34, y + math.sin(ang) * .34), (x + math.cos(ang + .14) * .3, y + math.sin(ang + .14) * .3)], material(), z=.0)

SHRIMP_BODY = dict(length=1.6, amp=.03, waves=.4, arch=lambda u: -.35 * (1 - u) ** 2 + .05,
                   dorsal=[(0, .05), (.3, .13), (.6, .17), (.9, .14), (1, .03)], ventral=[(0, .04), (.3, .1), (.6, .13), (.9, .11), (1, .02)],
                   thick=[(0, .04), (.4, .11), (.8, .13), (1, .03)], eye=(.93, .1, .045))

def shrimp(skin_fn, fin_fn, antenna_fn):
    def extra(sp, phase):
        shrimp_legs(sp, phase, fin_fn, antenna_fn); shrimp_tail(sp, fin_fn)
        x, y = sp.at(1.); a = sp.angle(1.)
        cone((x - .05, y + .05, .02), (x + math.cos(a + .2) * .28, y + math.sin(a + .2) * .28 + .06, .02), .03, fin_fn())
    return dict(SHRIMP_BODY, skin=skin_fn, fins_mat=fin_fn, extra=extra, eye_white=(.15, .1, .08))

def segments(base):
    """A shrimp's shell plates: a dark line between each."""
    out = []
    for i in range(1, 8):
        p = i / 8; out += [(p - .02, base, 0), (p, (.15, .05, .03), .7), (p + .02, base, 0)]
    return [(0, base, 0)] + out + [(1, base, 0)]

ROUND = dict(dorsal=[(0, .06), (.15, .12), (.45, .5), (.75, .55), (.95, .3), (1, .05)], ventral=[(0, .05), (.15, .1), (.45, .46), (.75, .5), (.95, .25), (1, .04)],
             thick=[(0, .04), (.4, .42), (.8, .4), (1, .05)])
OVAL = dict(dorsal=[(0, .06), (.15, .13), (.5, .3), (.8, .27), (.96, .12), (1, .02)], ventral=[(0, .05), (.15, .1), (.5, .25), (.8, .22), (.96, .09), (1, .02)],
            thick=[(0, .03), (.4, .14), (.8, .13), (1, .03)])
DISC = dict(dorsal=[(0, .06), (.15, .14), (.45, .52), (.75, .5), (.95, .2), (1, .03)], ventral=[(0, .05), (.15, .12), (.45, .45), (.75, .42), (.95, .15), (1, .02)],
            thick=[(0, .03), (.4, .1), (.8, .09), (1, .02)])
TORPEDO = dict(dorsal=[(0, .05), (.12, .07), (.45, .22), (.75, .24), (.93, .16), (1, .02)], ventral=[(0, .04), (.12, .06), (.45, .2), (.75, .21), (.93, .1), (1, .02)],
               thick=[(0, .03), (.4, .17), (.8, .17), (1, .03)])
EEL = dict(dorsal=[(0, .01), (.2, .05), (.6, .085), (.95, .07), (1, .02)], ventral=[(0, .01), (.2, .05), (.6, .08), (.95, .06), (1, .02)],
           thick=[(0, .01), (.5, .07), (1, .02)])

FORK = [(.03, .04), (-.14, .34), (-.2, .4), (-.1, .06), (-.1, -.06), (-.2, -.4), (-.14, -.34), (.03, -.04)]
ROUND_TAIL = [(.03, .05), (-.1, .22), (-.18, .2), (-.21, 0), (-.18, -.2), (-.1, -.22), (.03, -.05)]
LUNATE = [(.03, .04), (-.06, .3), (-.2, .62), (-.12, .2), (-.12, -.2), (-.2, -.62), (-.06, -.3), (.03, -.04)]
SHARK_TAIL = [(.03, .05), (-.12, .3), (-.3, .6), (-.16, .1), (-.14, -.04), (-.22, -.3), (-.06, -.1), (.03, -.04)]
FLUKE = [(.03, .05), (-.1, .18), (-.26, .34), (-.2, .1), (-.13, 0), (-.2, -.1), (-.26, -.34), (-.1, -.18), (.03, -.05)]

def fish(length, shape, skin_fn, fins_fn, fins, eye, amp=.12, waves=.9, **extra):
    return dict(shape, length=length, amp=amp, waves=waves, skin=skin_fn, fins_mat=fins_fn, fins=fins, eye=eye, **extra)

def shark_fins(tail=SHARK_TAIL):
    return [('D', [(.5, 0), (.55, .32), (.6, .38), (.66, .2), (.72, 0)]), ('D', [(.15, 0), (.18, .08), (.22, 0)]),
            ('V', [(.22, 0), (.25, .07), (.3, 0)]), ('T', tail), ('P', .7, -.12, .45, .14, -150)]

GREY = lambda: skin('Shark', [(0, C(235, 235, 230)), (.45, C(200, 205, 210)), (.55, C(110, 125, 140)), (1, C(70, 85, 100))], rough=.35, coat=.5)

def cast():
    T = {}
    # ---------------------------------------------------------------- Dragon Tide: a sunlit coral reef
    orange, white, black = C(255, 110, 10), C(250, 250, 245), C(20, 15, 15)
    T['DRAGON_TIDE'] = {
        'SHRIMP': ('side', 1.0, shrimp(lambda: skin('Shrimp', [(0, C(255, 190, 150)), (1, C(235, 80, 30))], along=segments(C(235, 80, 30)), rough=.25, coat=1, alpha=.97),
                                       lambda: fin('ShrimpFin', C(255, 120, 60), alpha=.8), lambda: skin('Antenna', [(0, C(255, 150, 90)), (1, C(255, 150, 90))]))),
        'CLOWNFISH': ('side', 1.0, fish(1.7, OVAL, lambda: skin('Clown', [(0, C(255, 150, 60)), (1, orange)], along=[
                (0, orange, 0), (.09, black, .9), (.12, white, 1), (.2, white, 1), (.23, black, .9), (.26, orange, 0), (.42, orange, 0), (.45, black, .9), (.48, white, 1),
                (.58, white, 1), (.61, black, .9), (.64, orange, 0), (.72, orange, 0), (.75, black, .9), (.78, white, 1), (.84, white, 1), (.87, black, .9), (.9, orange, 0), (1, orange, 0)], rough=.25, coat=1),
            lambda: fin('ClownFin', C(255, 120, 20), alpha=.95),
            [('D', [(.3, 0), (.35, .14), (.5, .2), (.62, .12), (.72, 0)]), ('V', [(.3, 0), (.36, .12), (.46, .1), (.5, 0)]), ('T', ROUND_TAIL), ('P', .72, -.05, .26, .14, -140)], (.88, .06, .06))),
        'PUFFER': ('side', 1.0, fish(1.5, ROUND, lambda: skin('Puffer', [(0, C(255, 250, 220)), (.4, C(255, 230, 120)), (1, C(235, 180, 40))], spots=(C(120, 70, 20), 9, .12), rough=.3, coat=.8),
            lambda: fin('PufferFin', C(250, 200, 60), alpha=.85), [('T', ROUND_TAIL), ('D', [(.2, 0), (.24, .1), (.3, 0)]), ('P', .7, 0, .22, .14, -150)], (.85, .2, .1), amp=.05,
            extra=lambda sp, ph: spikes(sp, ph, ROUND['thick'], ROUND['dorsal'], ROUND['ventral'], lambda: skin('Spike', [(0, C(250, 230, 160)), (1, C(250, 230, 160))])))),
        'ANGELFISH': ('side', 1.0, fish(1.5, DISC, lambda: skin('Emperor', [(i / 12, (C(20, 70, 200) if i % 2 else C(255, 210, 40))) for i in range(13)], patches=[(.78, .9, -1, 1, C(10, 20, 60), .02)], rough=.25, coat=1),
            lambda: fin('EmperorFin', C(40, 110, 230), alpha=.92),
            [('D', [(.15, 0), (.2, .12), (.4, .2), (.62, .1), (.72, 0)]), ('V', [(.15, 0), (.2, .12), (.38, .16), (.55, .06), (.6, 0)]), ('T', ROUND_TAIL, lambda: fin('EmperorTail', C(255, 200, 30))), ('P', .7, -.05, .24, .12, -140)], (.86, .1, .06))),
        'TURTLE': ('top', 1.0, dict(build=lambda ph: turtle(ph, C(70, 120, 60), C(30, 45, 20), C(130, 150, 90), C(80, 95, 50), C(90, 70, 40)))),
        'LANTERN': ('side', 1.0, fish(1.6, dict(dorsal=[(0, .05), (.2, .12), (.6, .38), (.85, .42), (1, .2)], ventral=[(0, .05), (.2, .1), (.6, .35), (.85, .4), (1, .28)], thick=[(0, .03), (.6, .3), (1, .18)]),
            lambda: skin('Angler', [(0, C(110, 80, 60)), (1, C(60, 40, 30))], spots=(C(150, 110, 70), 18, .1), bump=.3, rough=.6, coat=.2),
            lambda: fin('AnglerFin', C(90, 60, 45), alpha=.9), [('T', ROUND_TAIL), ('P', .6, -.1, .25, .14, -140)], (.85, .2, .07), amp=.06, eye_white=(.9, .85, .4),
            extra=lambda sp, ph: (lure(sp, ph, (.35, 1, .9)), teeth(sp)))),
        'OCTOPUS': ('top', 1.0, dict(build=lambda ph: octopus(ph, dict(skin=lambda: skin('Octo', [(0, C(255, 140, 90)), (1, C(200, 50, 30))], spots=(C(255, 190, 150), 16, .08), top=True, rough=.3, coat=.8),
                                                                    arm_skin=lambda: skin('OctoArm', [(0, C(255, 170, 120)), (1, C(200, 55, 35))], top=True, rough=.3, coat=.8))))),
        'STINGRAY': ('top', 1.0, dict(build=lambda ph: ray(ph, dict(width=[(0, .05), (.25, .5), (.5, .78), (.75, .55), (.95, .2), (1, .02)],
                                                              skin=lambda: skin('Ray', [(0, C(150, 110, 60)), (.3, C(185, 140, 80)), (1, C(140, 100, 55))], spots=(C(30, 120, 255), 7, .14), glow=(C(40, 140, 255), 1.2, 'spots'), top=True, rough=.4, coat=.4))))),
        'SWORDFISH': ('side', 1.0, fish(2.0, TORPEDO, lambda: skin('Sword', [(0, C(230, 235, 240)), (.45, C(180, 195, 215)), (.6, C(60, 90, 160)), (1, C(30, 50, 110))], metallic=.5, rough=.2, coat=1),
            lambda: fin('SwordFin', C(40, 70, 140), alpha=.9), [('D', [(.55, 0), (.6, .3), (.66, .34), (.7, .1), (.74, 0)]), ('T', LUNATE), ('P', .72, -.1, .35, .1, -150)], (.88, .02, .045),
            extra=lambda sp, ph: bill(sp, .8, .04, lambda: skin('Bill', [(0, C(60, 70, 90)), (1, C(30, 40, 60))])))),
        'SHARK': ('side', 1.0, fish(2.2, TORPEDO, GREY, lambda: fin('SharkFin', C(90, 105, 120), alpha=1), shark_fins(), (.88, .05, .035), amp=.1)),
        'WHALE': ('side', 1.0, fish(2.4, dict(dorsal=[(0, .03), (.15, .07), (.5, .28), (.8, .32), (.97, .2), (1, .05)], ventral=[(0, .03), (.15, .06), (.5, .3), (.8, .34), (.97, .22), (1, .05)], thick=[(0, .02), (.5, .28), (1, .06)]),
            lambda: skin('Whale', [(0, C(235, 240, 245)), (.4, C(210, 220, 235)), (.55, C(60, 90, 140)), (1, C(30, 55, 100))], patches=[(.6, 1, -1, -.45, C(240, 240, 240), .04)], rough=.35, coat=.7),
            lambda: fin('WhaleFin', C(60, 90, 140), alpha=1), [('T', FLUKE), ('D', [(.35, 0), (.38, .05), (.42, 0)]), ('P', .72, -.18, .7, .16, -130, lambda: fin('Flipper', C(235, 240, 245), alpha=1))], (.86, -.02, .03), amp=.12, waves=.6)),
        'DRAGON': ('top', 1.0, dict(build=lambda ph: dragon(ph, dict(skin=lambda: skin('Dragon', [(0, C(255, 215, 90)), (.3, C(240, 150, 30)), (.42, C(200, 25, 15)), (1, C(130, 8, 8))], plates=(C(90, 0, 0), 9), top=True, metallic=.3, rough=.28, coat=.6),
                                                                      gold=lambda: mat('Gold', (1, .76, .3), metallic=1, rough=.15), mane=lambda: fin('Mane', C(255, 150, 30), alpha=.9, glow=(C(255, 120, 20), 1.5)))))),
    }
    # ---------------------------------------------------------------- Kraken's Deep: the abyss, where things glow
    violet, cyan = C(170, 80, 255), C(60, 240, 255)
    T['KRAKENS_DEEP'] = {
        'SHRIMP': ('side', 1.0, shrimp(lambda: skin('GlowShrimp', [(0, C(255, 190, 220)), (1, C(200, 60, 140))], along=segments(C(200, 60, 140)), spots=(cyan, 14, .06), glow=(cyan, 8, 'spots'), rough=.15, coat=1, alpha=.9),
                                       lambda: fin('GlowShrimpFin', C(220, 90, 170), alpha=.7, glow=(C(255, 80, 200), .8)), lambda: skin('GlowAntenna', [(0, cyan), (1, cyan)], glow=(cyan, 3, 'all')))),
        'CLOWNFISH': ('side', 1.0, fish(1.6, OVAL, lambda: skin('Darter', [(0, C(30, 20, 60)), (1, C(10, 10, 30))], patches=[(.1, .9, .05, .3, cyan, .03), (.05, .45, -.9, -.2, C(255, 40, 120), .05)], glow=(cyan, 5, 'patches'), rough=.2, coat=1),
            lambda: fin('DarterFin', C(40, 30, 90), alpha=.75, glow=(C(80, 60, 255), .6)),
            [('D', [(.35, 0), (.4, .12), (.5, .14), (.6, 0)]), ('V', [(.3, 0), (.35, .1), (.45, 0)]), ('T', FORK), ('P', .72, -.05, .24, .1, -140)], (.88, .06, .055), eye_glow=(cyan, 2))),
        'PUFFER': ('side', 1.0, fish(1.5, ROUND, lambda: skin('SpinePuffer', [(0, C(120, 80, 160)), (1, C(50, 20, 90))], spots=(C(200, 120, 255), 10, .1), glow=(violet, 2, 'spots'), rough=.3, coat=.9),
            lambda: fin('SpinePufferFin', C(90, 50, 150), alpha=.8), [('T', ROUND_TAIL), ('P', .7, 0, .22, .14, -150)], (.85, .2, .1), amp=.05, eye_glow=((1, .3, .8), 3),
            extra=lambda sp, ph: spikes(sp, ph, ROUND['thick'], ROUND['dorsal'], ROUND['ventral'], lambda: skin('VSpike', [(0, C(60, 30, 90)), (1, C(60, 30, 90))]), tip=lambda: glossy(C(255, 120, 255), .1, (C(255, 80, 255), 10)), length=.2))),
        'ANGELFISH': ('side', 1.0, fish(1.5, DISC, lambda: skin('AbyssAngel', [(0, C(45, 25, 70)), (1, C(12, 6, 25))], patches=[(.47, .52, -1, 1, violet, .01), (.69, .73, -1, 1, violet, .01), (.05, .95, .9, 1, violet, .02)], glow=(violet, 4, 'patches'), rough=.2, coat=.6),
            lambda: fin('AbyssFin', C(40, 15, 70), alpha=.85, glow=(violet, .9)),
            [('D', [(.05, 0), (.1, .3), (.25, .55), (.45, .25), (.6, 0)]), ('V', [(.05, 0), (.12, .3), (.28, .5), (.45, .15), (.55, 0)]), ('T', ROUND_TAIL), ('P', .7, -.05, .24, .12, -140)], (.86, .1, .06), eye_glow=(violet, 3))),
        'TURTLE': ('top', 1.0, dict(build=lambda ph: turtle(ph, C(50, 45, 70), C(120, 255, 200), C(80, 90, 100), C(120, 255, 200), C(30, 25, 40)))),
        'LANTERN': ('side', 1.0, fish(2.4, EEL, lambda: skin('LanternEel', [(0, C(40, 40, 70)), (1, C(15, 15, 35))], spots=(C(120, 255, 230), 12, .07), glow=(C(120, 255, 230), 8, 'spots'), rough=.25, coat=1),
            lambda: fin('EelFin', C(25, 30, 60), alpha=.8, glow=(C(60, 200, 255), .15)), [('D', [(0, 0), (.05, .035), (.6, .04), (.7, 0)]), ('V', [(0, 0), (.05, .03), (.45, .03), (.5, 0)]), ('P', .9, 0, .12, .07, -140)],
            (.95, .02, .03), amp=.22, waves=1.6, eye_glow=(C(120, 255, 230), 4))),
        'OCTOPUS': ('top', 1.0, dict(build=lambda ph: octopus(ph, dict(skin=lambda: skin('BlueRing', [(0, C(90, 60, 140)), (1, C(40, 20, 80))], spots=(C(40, 170, 255), 6, .16), glow=(C(40, 170, 255), 5, 'spots'), top=True, rough=.3, coat=.5, bump=.2),
                                                                    arm_skin=lambda: skin('BlueRingArm', [(0, C(110, 80, 160)), (1, C(45, 25, 90))], spots=(C(40, 170, 255), 9, .13), glow=(C(40, 160, 255), 4, 'spots'), top=True, rough=.3, coat=.8), eye_glow=(C(255, 220, 60), 2))))),
        'STINGRAY': ('top', 1.0, dict(build=lambda ph: ray(ph, dict(width=[(0, .05), (.25, .55), (.5, .95), (.75, .6), (.95, .25), (1, .05)], horns=True,
                                                              skin=lambda: skin('ShadowRay', [(0, C(30, 30, 45)), (1, C(8, 8, 15))], glow=(cyan, 6, 'rim'), top=True, rough=.3, coat=.8))))),
        'SWORDFISH': ('side', 1.0, fish(2.0, TORPEDO, lambda: skin('BladeMarlin', [(0, C(230, 220, 250)), (.45, C(170, 160, 210)), (.6, C(80, 50, 150)), (1, C(30, 15, 70))], along=[(0, violet, 0), (.3, violet, 0), (.32, cyan, .9), (.34, violet, 0), (.5, violet, 0), (.52, cyan, .9), (.54, violet, 0), (1, violet, 0)], metallic=.6, rough=.15, coat=1),
            lambda: fin('MarlinFin', C(60, 30, 130), alpha=.85, glow=(violet, .8)), [('D', [(.45, 0), (.5, .38), (.62, .4), (.75, .1), (.8, 0)]), ('T', LUNATE), ('P', .72, -.1, .35, .1, -150)], (.88, .02, .045), eye_glow=(cyan, 3),
            extra=lambda sp, ph: bill(sp, .9, .04, lambda: skin('GlowBill', [(0, C(200, 240, 255)), (1, C(120, 200, 255))], glow=(cyan, 2, 'all'))))),
        'SHARK': ('side', 1.0, fish(2.2, dict(TORPEDO, dorsal=[(0, .05), (.12, .07), (.45, .2), (.75, .22), (.9, .14), (1, .06)]),
            lambda: skin('Goblin', [(0, C(200, 170, 185)), (.45, C(150, 115, 135)), (.6, C(80, 55, 80)), (1, C(45, 30, 50))], rough=.4, coat=.4, bump=.15),
            lambda: fin('GoblinFin', C(70, 45, 70), alpha=1), shark_fins(), (.86, .05, .035), amp=.1, eye_glow=((1, .2, .2), 4),
            extra=lambda sp, ph: bill(sp, .5, .1, lambda: skin('Snout', [(0, C(180, 140, 160)), (1, C(90, 60, 85))])))),
        'WHALE': ('side', 1.0, fish(2.4, dict(dorsal=[(0, .03), (.15, .07), (.5, .28), (.8, .32), (.97, .2), (1, .05)], ventral=[(0, .03), (.15, .06), (.5, .3), (.8, .34), (.97, .22), (1, .05)], thick=[(0, .02), (.5, .28), (1, .06)]),
            lambda: skin('Ghost', [(0, C(170, 200, 230)), (.5, C(110, 150, 200)), (1, C(50, 80, 140))], spots=(C(150, 240, 255), 9, .07), glow=(C(120, 230, 255), 5, 'spots'), rough=.2, coat=.6, alpha=.95),
            lambda: fin('GhostFin', C(90, 130, 190), alpha=.75, glow=(C(120, 220, 255), .5)), [('T', FLUKE), ('P', .72, -.18, .7, .16, -130)], (.86, -.02, .03), amp=.12, waves=.6, eye_glow=(cyan, 4))),
        'DRAGON': ('top', 1.0, dict(build=lambda ph: kraken(ph, dict(skin=lambda: skin('Kraken', [(0, C(210, 90, 110)), (.5, C(130, 20, 60)), (1, C(70, 5, 40))], spots=(C(255, 120, 200), 7, .06), glow=(C(255, 90, 200), 3, 'spots'), top=True, rough=.25, coat=1, bump=.2),
                                                                      arm=lambda: skin('KrakenArm', [(0, C(230, 120, 140)), (1, C(110, 15, 50))], top=True, rough=.25, coat=1, bump=.2),
                                                                      fin=lambda: fin('KrakenFin', C(120, 20, 60), alpha=.9))))),
    }
    # ---------------------------------------------------------------- Shark Frenzy: bright tropical shallows
    T['SHARK_FRENZY'] = {
        'SHRIMP': ('side', 1.0, shrimp(lambda: skin('Cleaner', [(0, C(255, 220, 120)), (.75, C(220, 30, 30)), (.8, C(250, 250, 250)), (1, C(250, 250, 250))], rough=.2, coat=1),
                                       lambda: fin('CleanerFin', C(230, 50, 40), alpha=.85), lambda: skin('WhiteAntenna', [(0, C(250, 250, 250)), (1, C(250, 250, 250))]))),
        'CLOWNFISH': ('side', 1.0, fish(1.6, OVAL, lambda: skin('Tang', [(0, C(40, 110, 255)), (1, C(20, 60, 200))], patches=[(.15, .75, .15, .6, C(10, 15, 40), .04), (.3, .55, -.2, .15, C(10, 15, 40), .05)], rough=.2, coat=1),
            lambda: fin('TangFin', C(20, 60, 200), alpha=.95),
            [('D', [(.1, 0), (.15, .1), (.6, .12), (.8, 0)]), ('V', [(.1, 0), (.15, .09), (.5, .1), (.6, 0)]), ('T', FORK, lambda: fin('TangTail', C(255, 220, 30), alpha=1)), ('P', .72, -.05, .26, .12, -140, lambda: fin('TangPec', C(255, 220, 30)))], (.88, .08, .05))),
        'PUFFER': ('side', 1.0, fish(1.5, ROUND, lambda: skin('Porcupine', [(0, C(255, 255, 250)), (.5, C(245, 230, 210)), (1, C(210, 170, 120))], spots=(C(60, 40, 30), 11, .08), rough=.3, coat=.8),
            lambda: fin('PorcFin', C(230, 200, 150), alpha=.85), [('T', ROUND_TAIL), ('P', .7, 0, .22, .14, -150)], (.85, .2, .11), amp=.05, iris=(.05, .25, .3),
            extra=lambda sp, ph: spikes(sp, ph, ROUND['thick'], ROUND['dorsal'], ROUND['ventral'], lambda: skin('WSpike', [(0, C(250, 245, 230)), (1, C(250, 245, 230))]), length=.24))),
        'ANGELFISH': ('side', 1.0, fish(1.4, DISC, lambda: skin('Idol', [(0, C(255, 230, 60)), (1, C(255, 230, 60))], along=[(0, C(20, 20, 20), 1), (.1, C(20, 20, 20), 1), (.13, C(250, 250, 250), 1), (.3, C(250, 250, 250), 1), (.33, C(20, 20, 20), 1), (.48, C(20, 20, 20), 1), (.51, C(255, 230, 60), 0), (.68, C(20, 20, 20), .0), (.7, C(20, 20, 20), 1), (.82, C(20, 20, 20), 1), (.85, C(255, 230, 60), 0), (1, C(255, 120, 40), .6)], rough=.2, coat=1),
            lambda: fin('IdolFin', C(250, 250, 250), alpha=.95),
            [('D', [(.35, 0), (.45, .3), (.55, .7), (.42, .9), (.3, 1.05), (.36, .85), (.4, .5), (.33, .2), (.3, 0)]), ('V', [(.25, 0), (.3, .25), (.4, .3), (.55, 0)]), ('T', FORK, lambda: fin('IdolTail', C(25, 25, 25))), ('P', .7, -.05, .22, .1, -140)], (.8, .12, .05))),
        'TURTLE': ('top', 1.0, dict(build=lambda ph: turtle(ph, C(190, 120, 50), C(70, 35, 10), C(200, 170, 120), C(90, 60, 30), C(120, 70, 30)))),
        'LANTERN': ('side', 1.0, fish(1.8, OVAL, lambda: skin('Parrot', [(0, C(120, 240, 210)), (1, C(20, 170, 150))], patches=[(.82, .97, -.5, .5, C(255, 120, 170), .03), (.4, .75, -.3, .4, C(255, 160, 200), .06)], spots=(C(255, 200, 80), 16, .05), rough=.2, coat=1),
            lambda: fin('ParrotFin', C(255, 120, 170), alpha=.9), [('D', [(.15, 0), (.2, .1), (.75, .12), (.85, 0)]), ('V', [(.15, 0), (.2, .09), (.45, .1), (.55, 0)]), ('T', LUNATE), ('P', .72, -.05, .28, .12, -140)], (.88, .1, .05))),
        'OCTOPUS': ('top', 1.0, dict(build=lambda ph: octopus(ph, dict(skin=lambda: skin('ReefOcto', [(0, C(150, 230, 210)), (1, C(30, 140, 150))], spots=(C(240, 255, 200), 12, .1), top=True, rough=.3, coat=.8),
                                                                    arm_skin=lambda: skin('ReefOctoArm', [(0, C(170, 240, 220)), (1, C(30, 150, 160))], spots=(C(240, 255, 200), 18, .08), top=True, rough=.3, coat=.8))))),
        'STINGRAY': ('top', 1.0, dict(build=lambda ph: ray(ph, dict(width=[(0, .05), (.25, .55), (.5, 1.0), (.75, .6), (.95, .22), (1, .04)], horns=True, tail=.6,
                                                              skin=lambda: skin('Manta', [(0, C(250, 250, 250)), (.2, C(40, 40, 50)), (1, C(15, 15, 20))], patches=[(.6, .85, 0, .45, C(240, 240, 240), .06)], top=True, rough=.3, coat=.8))))),
        'SWORDFISH': ('side', 1.0, fish(2.0, TORPEDO, lambda: skin('Sail', [(0, C(240, 245, 250)), (.45, C(190, 210, 230)), (.55, C(30, 80, 200)), (1, C(10, 30, 110))], along=[(0, C(40, 140, 255), 0), (.3, C(40, 140, 255), 0), (.31, C(140, 200, 255), .8), (.33, C(40, 140, 255), 0), (.45, C(40, 140, 255), 0), (.46, C(140, 200, 255), .8), (.48, C(40, 140, 255), 0), (1, C(40, 140, 255), 0)], metallic=.5, rough=.18, coat=1),
            lambda: fin('SailFin', C(30, 90, 220), alpha=.9), [('D', [(.2, 0), (.28, .3), (.4, .5), (.6, .6), (.75, .5), (.85, 0)], lambda: skin('SailDots', [(0, C(30, 90, 220)), (1, C(30, 90, 220))], spots=(C(10, 20, 80), 14, .1), alpha=.9)), ('T', LUNATE), ('P', .72, -.1, .35, .1, -150)], (.88, .02, .045),
            extra=lambda sp, ph: bill(sp, .7, .035, lambda: skin('SailBill', [(0, C(40, 50, 70)), (1, C(20, 30, 50))])))),
        'SHARK': ('top', 1.0, dict(build=lambda ph: hammerhead(ph, dict(skin=lambda: skin('Hammer', [(0, C(190, 200, 210)), (.4, C(130, 145, 160)), (1, C(95, 110, 125))], top=True, rough=.35, coat=.5))))),
        'WHALE': ('side', 1.0, fish(2.6, dict(dorsal=[(0, .03), (.15, .07), (.5, .26), (.85, .3), (.98, .25), (1, .08)], ventral=[(0, .03), (.15, .06), (.5, .26), (.85, .28), (.98, .22), (1, .08)], thick=[(0, .02), (.5, .26), (1, .14)]),
            lambda: skin('WhaleShark', [(0, C(230, 235, 240)), (.4, C(200, 210, 220)), (.55, C(50, 70, 100)), (1, C(30, 45, 75))], spots=(C(240, 245, 250), 8, .12), rough=.35, coat=.5),
            lambda: fin('WSFin', C(40, 60, 90), alpha=1), shark_fins(), (.95, .05, .03), amp=.1, waves=.7)),
        'DRAGON': ('side', 1.0, fish(2.8, dict(TORPEDO, dorsal=[(0, .05), (.12, .08), (.45, .26), (.75, .28), (.92, .2), (1, .06)], ventral=[(0, .04), (.12, .07), (.45, .24), (.75, .26), (.92, .16), (1, .04)]),
            lambda: skin('Megalodon', [(0, C(225, 220, 215)), (.45, C(175, 175, 175)), (.55, C(55, 60, 70)), (1, C(30, 32, 40))], along=[(0, C(255, 255, 255), 0), (.55, C(255, 255, 255), 0), (.56, C(210, 210, 210), .6), (.57, C(255, 255, 255), 0), (.6, C(255, 255, 255), 0), (.61, C(210, 210, 210), .6), (.62, C(255, 255, 255), 0), (1, C(255, 255, 255), 0)], rough=.4, coat=.5, bump=.15),
            lambda: fin('MegFin', C(45, 50, 60), alpha=1), shark_fins(), (.88, .07, .03), amp=.09, eye_glow=((1, .1, .05), 5), iris=(.4, .02, .02),
            extra=lambda sp, ph: teeth(sp, big=True))),
    }
    return T

def teeth(sp, big=False):
    """A gaping mouth of white teeth along the jaw."""
    jaw = [(.9, -.02), (.96, .0), (1.0, .02)] if not big else [(.84, -.06), (.9, -.04), (.96, -.02)]
    for i, (u, v) in enumerate(jaw * 2):
        x, y = sp.at(u + (i // 3) * .02, v - .03 * (i // 3)); a = sp.angle(u) - math.pi / 2 * (1 if i < 3 else -1)
        cone((x, y, .12 if big else .1), (x + math.cos(a) * .06, y + math.sin(a) * .06, .12 if big else .1), .022, mat('Tooth', (.95, .95, .9), rough=.2, coat=1))


# ---------------------------------------------------------------- framing and rendering
def measure():
    """The plane box of everything built (x0, y0, x1, y1)."""
    bpy.context.view_layer.update(); deps = bpy.context.evaluated_depsgraph_get()
    lo, hi = [1e9, 1e9], [-1e9, -1e9]
    for o in bpy.context.scene.objects:
        if o.type != 'MESH': continue
        ev = o.evaluated_get(deps); mesh = ev.to_mesh()
        for v in mesh.vertices:
            w = o.matrix_world @ v.co; lo = [min(lo[0], w.x), min(lo[1], w.y)]; hi = [max(hi[0], w.x), max(hi[1], w.y)]
        ev.to_mesh_clear()
    return lo[0], lo[1], hi[0], hi[1]

def build(kind, spec, phase):
    if kind == 'top': spec['build'](phase)
    else: side_fish(phase, spec)

PREVIEW = os.environ.get('FISH_PREVIEW') == '1'

def render_creature(table, code, kind, spec, px):
    # The frame is the union of the creature over its whole swim, measured once, so every frame lines up.
    box = [1e9, 1e9, -1e9, -1e9]
    for i in ((0,) if PREVIEW else range(0, FRAMES, 2)):
        stage((10, 10), 64, RIMS[table]); build(kind, spec, i / FRAMES)
        x0, y0, x1, y1 = measure(); box = [min(box[0], x0), min(box[1], y0), max(box[2], x1), max(box[3], y1)]
    # Centred on the body's middle (the origin), so the game's hit circle sits on it: wide enough for both ends.
    pad = .06
    w = max(abs(box[0] - pad), abs(box[2] + pad)) * 2; h = max(abs(box[1] - pad), abs(box[3] + pad)) * 2
    for i in ((0,) if PREVIEW else range(FRAMES)):
        stage((w, h), px, RIMS[table]); build(kind, spec, i / FRAMES)
        scene = bpy.context.scene
        scene.render.filepath = os.path.join(OUT, f'FISH_{table}_{code}_{i}.png')
        bpy.ops.render.render(write_still=True)
    with open(os.path.join(OUT, f'FISH_{table}_{code}.box'), 'w') as f: f.write(f'{kind} {w:.4f} {h:.4f}\n')
    print('rendered', table, code, kind, round(w, 2), round(h, 2))

# Sheet pixel width per frame: the bosses and the biggest creatures get more.
PX = {'SHRIMP': 200, 'CLOWNFISH': 220, 'PUFFER': 230, 'ANGELFISH': 240, 'TURTLE': 300, 'LANTERN': 280, 'OCTOPUS': 320, 'STINGRAY': 340,
      'SWORDFISH': 380, 'SHARK': 420, 'WHALE': 480, 'DRAGON': 640}

for table, creatures in cast().items():
    for code, (kind, _, spec) in creatures.items():
        if ONLY and table not in ONLY and f'{table}:{code}' not in ONLY and code not in ONLY: continue
        render_creature(table, code, kind, spec, PX[code])
