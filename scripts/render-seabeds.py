"""
Renders each fish table's sea floor in 3D with Blender (Cycles), seen from straight above as the games are played:
sand with ripples and light caught in it, rocks, corals and plants towards the edges (the middle stays calm for the
creatures), and each table's own story: Dragon Tide's sunken temple on a coral reef, Kraken's Deep's wreck in the
glowing abyss, Shark Frenzy's bright shallows with a dive cage and an anchor. All modelled here.

    blender --background --python scripts/render-seabeds.py -- <out-dir> [TABLE ...]

Writes <out-dir>/SEABED_<TABLE>.png (1920x1080) and CAUSTICS.png (a tile the games scroll over the floor);
scripts/pack-fish.py packs them.
"""
import bpy, bmesh, math, os, random, sys

HERE = os.path.dirname(os.path.abspath(__file__))
_fish = open(os.path.join(HERE, 'render-fish.py')).read()
_symbols = open(os.path.join(HERE, 'render-symbols.py')).read()
exec(_symbols[:_symbols.index('\n# ---------------------------------------------------------------- symbols')], globals())
ARGS_KEEP = ARGS
exec(_fish[_fish.index('FRAMES = 8'):_fish.index('# ---------------------------------------------------------------- the casts')], globals())
exec(_fish[_fish.index('def C(*rgb):'):_fish.index('def spikes(')], globals())

WIDTH, HEIGHT = 32., 18.


def scene(sun_color, sun_power, water, ambient):
    reset()
    sc = bpy.context.scene
    for o in list(sc.objects): bpy.data.objects.remove(o, do_unlink=True)
    sc.render.film_transparent = False
    sc.cycles.samples = int(os.environ.get('SEABED_SAMPLES', '96'))
    sc.render.resolution_x, sc.render.resolution_y = 1920, 1080
    sc.view_settings.look = 'Medium Contrast'
    cam = bpy.data.objects.new('Camera', bpy.data.cameras.new('Camera')); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = WIDTH; cam.location = (0, 0, 30)
    # Light from above through the water: a tinted sun, and the water's own colour all round.
    nt = sc.world.node_tree
    for node in list(nt.nodes):
        if node.type not in ('OUTPUT_WORLD',): nt.nodes.remove(node)
    bg = nt.nodes.new('ShaderNodeBackground'); bg.inputs['Color'].default_value = (*water, 1); bg.inputs['Strength'].default_value = ambient
    nt.links.new(bg.outputs[0], nt.nodes['World Output'].inputs['Surface'])
    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN')); sc.collection.objects.link(sun)
    sun.data.energy = sun_power; sun.data.color = sun_color; sun.data.angle = math.radians(8); sun.rotation_euler = (math.radians(18), math.radians(-12), 0)


def floor(sand_a, sand_b, caustic, caustic_strength, ripple=.35):
    """The sea floor: gentle dunes, sand of two shades, ripples, pebbles, and the light the water throws on it."""
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=240, y_subdivisions=140, size=1); g = bpy.context.object
    g.scale = (WIDTH * 1.1, HEIGHT * 1.15, 1); bpy.ops.object.transform_apply(scale=True)
    tex = bpy.data.textures.new('Dunes', 'CLOUDS'); tex.noise_scale = 3.5
    d = g.modifiers.new('Dunes', 'DISPLACE'); d.texture = tex; d.strength = .5
    bpy.ops.object.shade_smooth()
    m = bpy.data.materials.new('Sand'); m.use_nodes = True; nt = m.node_tree; N, L = nt.nodes, nt.links; p = N['Principled BSDF']
    tc = N.new('ShaderNodeTexCoord')
    noise = N.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = .35; noise.inputs['Detail'].default_value = 8; L.new(tc.outputs['Object'], noise.inputs['Vector'])
    col = _mix(nt, noise.outputs['Fac'], N.new('ShaderNodeRGB').outputs[0], sand_b); N['RGB'].outputs[0].default_value = (*sand_a, 1)
    peb = N.new('ShaderNodeTexVoronoi'); peb.inputs['Scale'].default_value = 7; L.new(tc.outputs['Object'], peb.inputs['Vector'])
    col = _mix(nt, _math(nt, 'MULTIPLY', _math(nt, 'LESS_THAN', peb.outputs['Distance'], .12), .35), col, tuple(c * .55 for c in sand_a))
    L.new(col, p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = .9
    wave = N.new('ShaderNodeTexWave'); wave.inputs['Scale'].default_value = 1.6; wave.inputs['Distortion'].default_value = 6; wave.inputs['Detail'].default_value = 3
    L.new(tc.outputs['Object'], wave.inputs['Vector'])
    bump = N.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = ripple; L.new(wave.outputs['Fac'], bump.inputs['Height']); L.new(bump.outputs['Normal'], p.inputs['Normal'])
    # Caustics: the bright net of light a rippled surface throws on the floor.
    v = N.new('ShaderNodeTexVoronoi'); v.feature = 'DISTANCE_TO_EDGE'; v.inputs['Scale'].default_value = 1.7
    warp = N.new('ShaderNodeTexNoise'); warp.inputs['Scale'].default_value = .6
    L.new(tc.outputs['Object'], warp.inputs['Vector'])
    vec = N.new('ShaderNodeVectorMath'); vec.operation = 'ADD'; L.new(tc.outputs['Object'], vec.inputs[0]); L.new(warp.outputs['Color'], vec.inputs[1])
    L.new(vec.outputs[0], v.inputs['Vector'])
    lines = _math(nt, 'POWER', _math(nt, 'SUBTRACT', 1., _math(nt, 'MINIMUM', _math(nt, 'MULTIPLY', v.outputs['Distance'], 15.), 1.)), 3.)
    p.inputs['Emission Color'].default_value = (*caustic, 1); L.new(_math(nt, 'MULTIPLY', lines, caustic_strength), p.inputs['Emission Strength'])
    g.data.materials.append(m)
    return g

def ground_z(x, y):
    """Roughly where the floor is, so things sit on it."""
    return .0


# ---------------------------------------------------------------- placing things towards the edges
RNG = random.Random(7)

def edge_spot(margin=1.2, calm=(11.5, 5.8)):
    """A random point, kept out of the calm middle where the creatures swim."""
    while True:
        x = RNG.uniform(-WIDTH / 2 + margin * .3, WIDTH / 2 - margin * .3); y = RNG.uniform(-HEIGHT / 2 + margin * .3, HEIGHT / 2 - margin * .3)
        if (x / calm[0]) ** 2 + (y / calm[1]) ** 2 > 1: return x, y

def rock(x, y, size, color, moss=None):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=4, radius=size, location=(x, y, size * .15)); o = bpy.context.object
    o.scale = (1, RNG.uniform(.6, 1), RNG.uniform(.35, .6)); o.rotation_euler = (0, 0, RNG.uniform(0, 6.3))
    t = bpy.data.textures.new('Rock', 'VORONOI'); t.noise_scale = .6 * size
    d = o.modifiers.new('Rough', 'DISPLACE'); d.texture = t; d.strength = size * .35
    bpy.ops.object.shade_smooth()
    m = mat('Rock', color, rough=.8, bump=.6, bump_scale=8 / size)
    if moss:
        p = m.node_tree.nodes['Principled BSDF']; nt = m.node_tree
        geo = nt.nodes.new('ShaderNodeNewGeometry'); sep = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(geo.outputs['Normal'], sep.inputs[0])
        nt.links.new(_mix(nt, _math(nt, 'MULTIPLY', _math(nt, 'POWER', _math(nt, 'MAXIMUM', sep.outputs['Z'], 0.), 6.), .55), nt.nodes.new('ShaderNodeRGB').outputs[0], moss), p.inputs['Base Color'])
        [n for n in nt.nodes if n.type == 'RGB'][-1].outputs[0].default_value = (*color, 1)
    return add(o, m)

def branch_coral(x, y, size, color, tip, depth=4):
    """Staghorn coral seen from above: branches spreading out and up from a base."""
    m, tm = mat('Coral', color, rough=.5, coat=.3, bump=.3, bump_scale=30), mat('CoralTip', tip, rough=.4, emission=tip, strength=.15)
    def grow(p, a, tilt, length, r, d):
        end = (p[0] + math.cos(a) * math.cos(tilt) * length, p[1] + math.sin(a) * math.cos(tilt) * length, p[2] + math.sin(tilt) * length)
        tube([p, ((p[0] + end[0]) / 2, (p[1] + end[1]) / 2, (p[2] + end[2]) / 2), end], r, m)
        if d == 0: sphere(end, (r * 1.3,) * 3, tm, 12); return
        for k in range(RNG.choice((2, 3))):
            grow(end, a + RNG.uniform(-.8, .8), max(.2, tilt - RNG.uniform(0, .3)), length * .72, r * .75, d - 1)
    for k in range(RNG.randint(4, 6)):
        grow((x, y, 0), RNG.uniform(0, 6.3), RNG.uniform(.6, 1.1), size * .45, size * .07, depth)

def brain_coral(x, y, size, color, groove):
    o = sphere((x, y, 0), (size, size * RNG.uniform(.8, 1), size * .55), None, 48)
    m = bpy.data.materials.new('Brain'); m.use_nodes = True; nt = m.node_tree; N, L = nt.nodes, nt.links; p = N['Principled BSDF']
    tc = N.new('ShaderNodeTexCoord'); w = N.new('ShaderNodeTexWave'); w.inputs['Scale'].default_value = 3 / size; w.inputs['Distortion'].default_value = 14; w.inputs['Detail'].default_value = 4
    L.new(tc.outputs['Object'], w.inputs['Vector'])
    L.new(_mix(nt, w.outputs['Fac'], N.new('ShaderNodeRGB').outputs[0], groove), p.inputs['Base Color']); [n for n in N if n.type == 'RGB'][-1].outputs[0].default_value = (*color, 1)
    b = N.new('ShaderNodeBump'); b.inputs['Strength'].default_value = .8; L.new(w.outputs['Fac'], b.inputs['Height']); L.new(b.outputs['Normal'], p.inputs['Normal'])
    p.inputs['Roughness'].default_value = .6
    return add(o, m)

def anemone(x, y, size, body, tips):
    sphere((x, y, 0), (size * .4,) * 3, mat('AnemoneBase', body, rough=.4), 24)
    tm = mat('AnemoneTip', tips, rough=.3, emission=tips, strength=.4)
    for i in range(26):
        a = i / 26 * math.tau + RNG.uniform(-.1, .1); r = size * RNG.uniform(.25, .4)
        base = (x + math.cos(a) * r, y + math.sin(a) * r, size * .2); tip = (x + math.cos(a) * size * RNG.uniform(.85, 1.1), y + math.sin(a) * size * RNG.uniform(.85, 1.1), size * .45)
        cone(base, tip, size * .06, mat('Tentacle', body, rough=.4)); sphere(tip, (size * .06,) * 3, tm, 10)

def fan_coral(x, y, size, color):
    """A sea fan lying across the floor: a lace of branches in one plane."""
    m = mat('Fan', color, rough=.5, emission=color, strength=.05)
    a0 = RNG.uniform(0, 6.3)
    def grow(p, a, length, r, d):
        end = (p[0] + math.cos(a) * length, p[1] + math.sin(a) * length, p[2] + .02)
        tube([p, end], r, m)
        if d: [grow(end, a + s * RNG.uniform(.25, .6), length * .78, r * .8, d - 1) for s in (-1, 1)]
    grow((x, y, .05), a0, size * .35, size * .03, 6)

def grass(x, y, size, color, blades=18):
    m = mat('Grass', color, rough=.5, coat=.2)
    for i in range(blades):
        a = RNG.uniform(0, 6.3); l = size * RNG.uniform(.5, 1)
        base = (x + RNG.uniform(-.2, .2) * size, y + RNG.uniform(-.2, .2) * size, 0)
        pts = [base] + [(base[0] + math.cos(a + t * .4) * l * t, base[1] + math.sin(a + t * .4) * l * t, .1 + .25 * t * (1 - t)) for t in (.33, .66, 1)]
        tube(pts, size * .025, m).data.bevel_resolution = 1

def starfish(x, y, size, color):
    pts = []
    for i in range(10):
        r = size * (1 if i % 2 == 0 else .4); a = i * math.pi / 5 + RNG.uniform(0, 1)
        pts.append((x + math.cos(a) * r, y + math.sin(a) * r))
    o = flat(pts, mat('Star', color, rough=.5, bump=.5, bump_scale=60), z=.08, depth=.1)
    b = o.modifiers.new('Bevel', 'BEVEL'); b.width = size * .12; b.segments = 4

def shell(x, y, size, color):
    o = sphere((x, y, .02), (size, size * .8, size * .35), None, 32)
    m = bpy.data.materials.new('Shell'); m.use_nodes = True; nt = m.node_tree; p = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexCoord'); w = nt.nodes.new('ShaderNodeTexWave'); w.wave_type = 'RINGS'; w.inputs['Scale'].default_value = 1.2 / size
    nt.links.new(tc.outputs['Object'], w.inputs['Vector'])
    nt.links.new(_mix(nt, w.outputs['Fac'], nt.nodes.new('ShaderNodeRGB').outputs[0], (1, .95, .9)), p.inputs['Base Color']); [n for n in nt.nodes if n.type == 'RGB'][-1].outputs[0].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = .3; p.inputs['Coat Weight'].default_value = .6
    add(o, m)

def coins(x, y, count, spread):
    g = mat('Gold', (1, .76, .3), metallic=1, rough=.2)
    for i in range(count):
        bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=.16, depth=.04, location=(x + RNG.gauss(0, spread), y + RNG.gauss(0, spread), .05))
        o = bpy.context.object; o.rotation_euler = (RNG.uniform(-.3, .3), RNG.uniform(-.3, .3), 0); add(o, g)


# ---------------------------------------------------------------- each table's story
def pagoda_roof(x, y, size, angle):
    """A sunken temple's roof from above: red tiles to a gold ridge, upturned gold corners."""
    red = mat('Tiles', C(170, 25, 20), rough=.45, coat=.4)
    gold = mat('Gold', (1, .72, .25), metallic=1, rough=.25)
    bm = bmesh.new(); s = size
    v = [bm.verts.new(p) for p in ((-s, -s * .7, 0), (s, -s * .7, 0), (s, s * .7, 0), (-s, s * .7, 0), (-s * .45, 0, s * .6), (s * .45, 0, s * .6))]
    for f in ((0, 1, 5, 4), (1, 2, 5), (2, 3, 4, 5), (3, 0, 4)): bm.faces.new([v[i] for i in f])
    mesh = bpy.data.meshes.new('Roof'); bm.to_mesh(mesh); bm.free()
    o = bpy.data.objects.new('Roof', mesh); bpy.context.scene.collection.objects.link(o); o.location = (x, y, .1); o.rotation_euler = (0, 0, angle)
    # Tile rows.
    m = red; nt = m.node_tree; tc = nt.nodes.new('ShaderNodeTexCoord'); w = nt.nodes.new('ShaderNodeTexWave'); w.inputs['Scale'].default_value = 3
    nt.links.new(tc.outputs['Object'], w.inputs['Vector']); b = nt.nodes.new('ShaderNodeBump'); b.inputs['Strength'].default_value = .7
    nt.links.new(w.outputs['Fac'], b.inputs['Height']); nt.links.new(b.outputs['Normal'], nt.nodes['Principled BSDF'].inputs['Normal'])
    add(o, red)
    ca, sa = math.cos(angle), math.sin(angle)
    def w2(px, py, pz): return (x + px * ca - py * sa, y + px * sa + py * ca, .1 + pz)
    tube([w2(-s * .45, 0, s * .6), w2(s * .45, 0, s * .6)], s * .06, gold)
    for cx, cy in ((-s, -s * .7), (s, -s * .7), (s, s * .7), (-s, s * .7)):
        tube([w2(cx * .45, 0, s * .6), w2(cx, cy, 0), w2(cx * 1.12, cy * 1.12, s * .18)], s * .045, gold)
    sphere(w2(0, 0, s * .66), (s * .1,) * 3, gold, 24)

def stone_lantern(x, y, size):
    stone = mat('Stone', C(150, 160, 150), rough=.8, bump=.4, bump_scale=30)
    rounded_box((size, size, size * .6), size * .12, stone, loc=(x, y, .2))
    sphere((x, y, size * .7), (size * .25,) * 3, mat('LanternGlow', (1, .7, .3), emission=(1, .6, .2), strength=6), 16)

def wreck(x, y, length, angle):
    """A wreck from above: a broken wooden hull, its deck planks, a fallen mast, cannons."""
    wood = mat('Hull', C(80, 55, 35), rough=.75, bump=.5, bump_scale=10)
    deck = bpy.data.materials.new('Deck'); deck.use_nodes = True; nt = deck.node_tree; p = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexCoord'); brick = nt.nodes.new('ShaderNodeTexBrick'); brick.inputs['Scale'].default_value = 3.5
    brick.inputs['Color1'].default_value = (*C(95, 70, 45), 1); brick.inputs['Color2'].default_value = (*C(70, 50, 32), 1); brick.inputs['Mortar'].default_value = (*C(25, 18, 12), 1)
    brick.inputs['Mortar Size'].default_value = .01; brick.offset = .5; brick.squash = 4
    nt.links.new(tc.outputs['Object'], brick.inputs['Vector']); nt.links.new(brick.outputs['Color'], p.inputs['Base Color']); p.inputs['Roughness'].default_value = .8
    n = 24; pts = [(-length / 2 + length * i / (n - 1), 0) for i in range(n)]
    w = [length * .2 * math.sin(math.pi * (.15 + .85 * i / (n - 1))) ** .7 for i in range(n)]
    hull = loft(pts, w, [length * .06] * n, wood, ring=24, caps=(True, True), subsurf=1); hull.location = (x, y, .1); hull.rotation_euler = (0, 0, angle)
    dk = loft(pts[2:-1], [v * .82 for v in w[2:-1]], [length * .062] * (n - 3), deck, ring=24); dk.location = (x, y, .12); dk.rotation_euler = (0, 0, angle)
    # A broken gap amidships, dark inside.
    sphere((x + math.cos(angle) * length * .08, y + math.sin(angle) * length * .08, length * .065), (length * .12, length * .11, .02), mat('Hole', (.01, .01, .015), rough=1), 24).rotation_euler = (0, 0, angle + .4)
    ca, sa = math.cos(angle), math.sin(angle)
    mast = [(x - length * .3 * ca + length * .15 * sa, y - length * .3 * sa - length * .15 * ca, .3), (x + length * .45 * ca + length * .35 * sa, y + length * .45 * sa - length * .35 * ca, .3)]
    tube(mast, length * .025, wood)
    iron = mat('Iron', C(40, 40, 45), metallic=.7, rough=.5)
    for i in range(3):
        px, py = x + ca * (length * (.1 + i * .12)) - sa * length * .17, y + sa * (length * (.1 + i * .12)) + ca * length * .17
        tube([(px, py, .25), (px - sa * .5, py + ca * .5, .25)], .09, iron)

def glow_plant(x, y, size, color):
    """Bioluminescent tube worms: thin stalks with glowing crowns."""
    stalk = mat('Stalk', C(60, 50, 70), rough=.5)
    glow = mat('Crown', color, emission=color, strength=5)
    for i in range(RNG.randint(5, 9)):
        px, py = x + RNG.gauss(0, size * .25), y + RNG.gauss(0, size * .25); h = size * RNG.uniform(.4, .9)
        tube([(px, py, 0), (px + RNG.uniform(-.1, .1), py + RNG.uniform(-.1, .1), h)], size * .04, stalk)
        sphere((px, py, h), (size * .12, size * .12, size * .05), glow, 16)

def mushroom(x, y, size, color):
    stem = mat('Stem', C(70, 60, 90), rough=.6)
    cap = mat('Cap', color, rough=.4, emission=color, strength=1.6)
    tube([(x, y, 0), (x, y, size * .5)], size * .12, stem)
    sphere((x, y, size * .5), (size * .5, size * .5, size * .2), cap, 32)
    for i in range(5):
        a = RNG.uniform(0, 6.3); sphere((x + math.cos(a) * size * .25, y + math.sin(a) * size * .25, size * .66), (size * .05,) * 3, mat('Dot', (1, 1, 1), emission=(1, 1, 1), strength=3), 8)

def vent(x, y, size):
    """A volcanic vent: a dark cone cracked with orange light."""
    o = sphere((x, y, 0), (size, size, size * .45), None, 48)
    m = bpy.data.materials.new('Vent'); m.use_nodes = True; nt = m.node_tree; p = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexCoord'); v = nt.nodes.new('ShaderNodeTexVoronoi'); v.feature = 'DISTANCE_TO_EDGE'; v.inputs['Scale'].default_value = 3 / size
    nt.links.new(tc.outputs['Object'], v.inputs['Vector'])
    p.inputs['Base Color'].default_value = (*C(25, 20, 25), 1); p.inputs['Roughness'].default_value = .9
    p.inputs['Emission Color'].default_value = (1, .35, .05, 1); nt.links.new(_math(nt, 'MULTIPLY', _math(nt, 'LESS_THAN', v.outputs['Distance'], .03), 8.), p.inputs['Emission Strength'])
    add(o, m)
    sphere((x, y, size * .42), (size * .2, size * .2, .05), mat('Mouth', (1, .4, .05), emission=(1, .45, .1), strength=10), 20)

def anchor(x, y, size, angle):
    iron = mat('Anchor', C(70, 60, 55), metallic=.6, rough=.6, bump=.4, bump_scale=20)
    ca, sa = math.cos(angle), math.sin(angle)
    def w2(px, py): return (x + px * ca - py * sa, y + px * sa + py * ca, .2)
    tube([w2(-size, 0), w2(size * .8, 0)], size * .07, iron)
    tube([w2(size * .55, -size * .35), w2(size * .55, size * .35)], size * .05, iron)
    tube([w2(-size * .75, -size * .6), w2(-size * 1.05, -size * .3), w2(-size * 1.1, 0), w2(-size * 1.05, size * .3), w2(-size * .75, size * .6)], size * .07, iron)
    for k in (-1, 1): cone(w2(-size * .75, k * size * .6) , w2(-size * .55, k * size * .72), size * .12, iron)
    bpy.ops.mesh.primitive_torus_add(major_radius=size * .15, minor_radius=size * .035, location=w2(size * .95, 0)); add(bpy.context.object, iron)
    # Its chain trails off across the sand.
    for i in range(14):
        px, py, _ = w2(size * 1.1 + i * size * .2, math.sin(i * .5) * size * .3)
        bpy.ops.mesh.primitive_torus_add(major_radius=size * .08, minor_radius=size * .025, location=(px, py, .1), rotation=(math.pi / 2 * (i % 2), 0, angle)); add(bpy.context.object, iron)

def dive_cage(x, y, size, angle):
    steel = mat('Cage', C(190, 195, 200), metallic=1, rough=.25)
    ca, sa = math.cos(angle), math.sin(angle)
    def w2(px, py, z): return (x + px * ca - py * sa, y + px * sa + py * ca, z)
    s = size
    for px in [i / 6 * 2 - 1 for i in range(7)]:
        tube([w2(px * s, -s * .7, 1.2), w2(px * s, s * .7, 1.2)], .04, steel)
    for py in (-s * .7, s * .7):
        tube([w2(-s, py, 1.2), w2(s, py, 1.2)], .06, steel)
    for px, py in ((-s, -s * .7), (s, -s * .7), (s, s * .7), (-s, s * .7)): tube([w2(px, py, 0), w2(px, py, 1.2)], .07, steel)
    rounded_box((s * .5, s * .3, .2), .05, mat('Float', C(255, 200, 30), rough=.3, coat=.6), loc=w2(0, 0, 1.35))

def life_ring(x, y, size):
    bpy.ops.mesh.primitive_torus_add(major_radius=size, minor_radius=size * .3, major_segments=48, location=(x, y, .15)); o = bpy.context.object
    m = bpy.data.materials.new('Ring'); m.use_nodes = True; nt = m.node_tree; p = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(tc.outputs['Object'], sep.inputs[0])
    ang = _math(nt, 'ARCTAN2', sep.outputs['Y'], sep.outputs['X']); stripes = _math(nt, 'GREATER_THAN', _math(nt, 'SINE', _math(nt, 'MULTIPLY', ang, 4.)), 0.)
    nt.links.new(_mix(nt, stripes, nt.nodes.new('ShaderNodeRGB').outputs[0], (.95, .95, .95)), p.inputs['Base Color']); [n for n in nt.nodes if n.type == 'RGB'][-1].outputs[0].default_value = (*C(230, 60, 30), 1)
    p.inputs['Roughness'].default_value = .4
    add(o, m)


def dragon_tide():
    scene((.85, 1, .95), 2.6, C(40, 150, 170), .8)
    floor(C(205, 185, 135), C(170, 150, 105), (.75, 1, .95), .22)
    pagoda_roof(-12.6, 6.2, 2.6, .25); stone_lantern(-9.2, 7.6, .7); stone_lantern(-14.6, 2.6, .7)
    coins(-10, 4.4, 26, .9); coins(12.5, -6.6, 18, .7)
    for x, y, s, c, t in ((13.2, 6.4, 2.2, C(230, 70, 90), C(255, 200, 220)), (-13.8, -6.2, 2.0, C(255, 140, 40), C(255, 230, 150)), (8.5, 7.8, 1.5, C(170, 80, 220), C(240, 200, 255)), (-5.6, -7.9, 1.4, C(240, 90, 60), C(255, 210, 160)), (14.6, -1.8, 1.6, C(255, 180, 50), C(255, 240, 180))):
        branch_coral(x, y, s, c, t)
    for x, y, s in ((10.8, 4.2, 1.1), (-15, -2.4, 1.2), (5.5, -8.4, .9), (-8, 8.3, .8)): brain_coral(x, y, s, C(220, 190, 90), C(150, 110, 50))
    for x, y in ((15, 2.6), (-11.5, -8), (2.5, 8.6), (11.8, -8.2)): anemone(x, y, .9, C(255, 120, 160), C(255, 230, 120))
    for x, y in ((-3, 8.5), (7, -8.6), (-15.3, 5.4)): fan_coral(x, y, 2.2, C(200, 60, 160))
    for i in range(16): x, y = edge_spot(); rock(x, y, RNG.uniform(.5, 1.3), C(120, 120, 110), moss=C(60, 120, 60))
    for i in range(9): x, y = edge_spot(); grass(x, y, 1.2, C(40, 140, 70))
    for i in range(7): x, y = edge_spot(); starfish(x, y, .45, RNG.choice((C(255, 120, 40), C(230, 50, 60), C(255, 200, 60))))
    for i in range(10): shell(RNG.uniform(-14, 14), RNG.uniform(-8, 8), RNG.uniform(.15, .3), C(240, 200, 180))

def krakens_deep():
    scene((.55, .6, 1), 1.6, C(25, 15, 60), .6)
    floor(C(60, 52, 80), C(36, 32, 54), (.6, .4, 1), .1, ripple=.2)
    wreck(-10.5, 4.6, 9, -.35)
    for x, y, s in ((12.5, 6, 1.6), (-13.5, -6.5, 1.3), (13.8, -5.4, 1.1)): vent(x, y, s)
    for i in range(22): x, y = edge_spot(); rock(x, y, RNG.uniform(.6, 1.6), C(35, 30, 45))
    for i in range(11): x, y = edge_spot(); glow_plant(x, y, 1.1, RNG.choice((C(80, 255, 230), C(255, 90, 220), C(150, 120, 255))))
    for i in range(9): x, y = edge_spot(); mushroom(x, y, RNG.uniform(.5, .9), RNG.choice((C(80, 220, 255), C(220, 90, 255))))
    for x, y in ((6.5, 8.4), (-4.6, -8.6), (9.5, -8.3)): fan_coral(x, y, 2.4, C(120, 60, 200))
    coins(-8.5, 2.2, 22, .8)

def shark_frenzy():
    scene((.9, 1, 1), 2.8, C(60, 200, 220), .8)
    floor(C(232, 222, 196), C(208, 194, 162), (.85, 1, 1), .28)
    dive_cage(12.2, 5.8, 2.2, .3); anchor(-11.2, -5.6, 1.8, .5); life_ring(-13.4, 6.4, .9)
    for x, y in ((-14, 3), (14.6, -2.4), (-6, 8.4), (6.6, -8.4), (13, -7.2), (-14.5, -1.4), (2, 8.7)):
        grass(x, y, 2.2, C(60, 170, 80), blades=30)
    for x, y, s in ((10.2, 8.2, 1), (-9.5, 8.2, 1.2), (15, 1, .9), (-4, -8.4, .8)): brain_coral(x, y, s, C(200, 170, 120), C(150, 120, 70))
    for x, y, s, c, t in ((-15, -7.6, 1.6, C(240, 140, 60), C(255, 230, 160)), (9, -6.4, 1.3, C(80, 160, 230), C(200, 240, 255))): branch_coral(x, y, s, c, t)
    for i in range(12): x, y = edge_spot(); rock(x, y, RNG.uniform(.4, 1), C(200, 190, 170))
    for i in range(10): x, y = edge_spot(); starfish(x, y, .5, RNG.choice((C(255, 120, 40), C(60, 120, 255), C(255, 80, 120))))
    for i in range(16): shell(RNG.uniform(-14, 14), RNG.uniform(-8, 8), RNG.uniform(.15, .32), RNG.choice((C(255, 200, 180), C(250, 230, 200), C(240, 170, 190))))


def caustics():
    """A tile of light lines that wraps at its edges, for the games to slide over the floor."""
    import numpy as np
    size, cells = 512, 9
    pts = np.random.default_rng(3).random((cells * cells, 2)) * size
    yy, xx = np.mgrid[0:size, 0:size]
    d1 = np.full((size, size), 1e9); d2 = np.full((size, size), 1e9)
    for px, py in pts:
        for ox in (-size, 0, size):
            for oy in (-size, 0, size):
                d = np.hypot(xx - (px + ox), yy - (py + oy))
                d2 = np.where(d < d1, d1, np.minimum(d2, d)); d1 = np.minimum(d1, d)
    edge = d2 - d1; v = np.clip(1 - edge / 9, 0, 1) ** 2.5
    img = bpy.data.images.new('Caustics', size, size, alpha=True)
    rgba = np.zeros((size, size, 4), np.float32); rgba[..., 0] = rgba[..., 1] = rgba[..., 2] = 1; rgba[..., 3] = v
    img.pixels = rgba.ravel(); img.filepath_raw = os.path.join(OUT, 'CAUSTICS.png'); img.file_format = 'PNG'; img.save()
    print('rendered caustics')


TABLES = {'DRAGON_TIDE': dragon_tide, 'KRAKENS_DEEP': krakens_deep, 'SHARK_FRENZY': shark_frenzy}
for name, build_floor in TABLES.items():
    if ARGS_KEEP[1:] and name not in ARGS_KEEP[1:]: continue
    RNG.seed(list(TABLES).index(name) + 7)
    build_floor()
    bpy.context.scene.render.filepath = os.path.join(OUT, f'SEABED_{name}.png')
    bpy.ops.render.render(write_still=True)
    print('rendered', name)
if not ARGS_KEEP[1:] or 'CAUSTICS' in ARGS_KEEP[1:]: caustics()
