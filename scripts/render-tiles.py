"""
Renders each game's lobby tile in 3D with Blender (Cycles): a full scene (a glowing backdrop with light rays and
sparkles, the game's own 3D pieces) under its name in big bevelled gold letters. Every model comes from
render-symbols.py and render-casino.py, so the tiles match the games and all of the art is our own. The fonts are
free (SIL OFL / Apache) and live in scripts/fonts. (Fonts drawn from overlapping shapes, such as Bungee and Alfa
Slab, bevel into slivers, so titles use Titan One, Luckiest Guy and Abril Fatface; Bungee is kept for the small
kicker lines.)

    blender --background --python scripts/render-tiles.py -- <out-dir> [GAME_CODE ...]

Then scripts/pack-tiles.py writes them to assets/tiles/ (app) and frontend/public/art/tiles/ (website).
"""
import bpy, math, os, random, sys

HERE = os.path.dirname(os.path.abspath(__file__))
_source = open(os.path.join(HERE, 'render-casino.py')).read()
exec(_source[:_source.index('\nCASINO = {')], globals())

FONTS = os.path.join(HERE, 'fonts')
FACE = {'titan': 'TitanOne-Regular.ttf', 'lucky': 'LuckiestGuy-Regular.ttf',
        'bungee': 'Bungee-Regular.ttf', 'abril': 'AbrilFatface-Regular.ttf'}
W, H = 6.0, 5.0          # the tile, in scene units on the z=0 plane (6:5, like the lobby's tiles)
PX = 960                 # render width; height follows the tile's shape


# ---------------------------------------------------------------- scene
def stage(width=W, height=H, px=PX):
    reset()
    scene = bpy.context.scene
    scene.render.film_transparent = False
    scene.render.resolution_x, scene.render.resolution_y = px, round(px * height / width)
    scene.cycles.samples = 128
    cam = scene.camera
    cam.data.lens = 50; cam.data.sensor_fit = 'HORIZONTAL'; cam.data.sensor_width = 36
    # Looking down at the tile from in front and a little below, so the pieces and the letters show their depth.
    cam.location = (0, -1.5, width * 50 / 36); cam.rotation_euler = (math.atan(1.5 / (width * 50 / 36)), 0, 0)
    # Bloom on whatever glows (the fire, the rays' hot centre, the sparkles), as a casino sign does.
    scene.use_nodes = True
    nt = scene.node_tree; layers = nt.nodes['Render Layers']; out = nt.nodes['Composite']
    glare = nt.nodes.new('CompositorNodeGlare'); glare.glare_type = 'FOG_GLOW'; glare.quality = 'HIGH'; glare.threshold = 1.15; glare.size = 8; glare.mix = -.55
    nt.links.new(layers.outputs['Image'], glare.inputs['Image']); nt.links.new(glare.outputs['Image'], out.inputs['Image'])


def backdrop(hot, mid, edge, rays=18, ray_strength=.22, centre=(0, .7), reach=5.2):
    """The glowing wall behind the pieces: a radial burst from {hot} through {mid} to {edge}, with rays of light."""
    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, -3)); plane = bpy.context.object
    m = bpy.data.materials.new('Backdrop'); m.use_nodes = True; nt = m.node_tree; n, l = nt.nodes, nt.links
    for node in list(n):
        if node.type != 'OUTPUT_MATERIAL': n.remove(node)
    coords = n.new('ShaderNodeTexCoord'); xyz = n.new('ShaderNodeSeparateXYZ'); l.new(coords.outputs['Object'], xyz.inputs[0])
    def math_node(op, a, b=None):
        node = n.new('ShaderNodeMath'); node.operation = op
        for i, v in enumerate((a, b)):
            if v is None: continue
            if isinstance(v, (int, float)): node.inputs[i].default_value = v
            else: l.new(v, node.inputs[i])
        return node.outputs[0]
    x = math_node('SUBTRACT', xyz.outputs['X'], centre[0]); y = math_node('SUBTRACT', xyz.outputs['Y'], centre[1] * 1.4)
    dist = math_node('SQRT', math_node('ADD', math_node('MULTIPLY', x, x), math_node('MULTIPLY', y, y)))
    radial = math_node('MAXIMUM', math_node('SUBTRACT', 1, math_node('DIVIDE', dist, reach)), 0)
    angle = math_node('ARCTAN2', y, x)
    wave = math_node('POWER', math_node('ADD', .5, math_node('MULTIPLY', .5, math_node('SINE', math_node('MULTIPLY', angle, rays)))), 3)
    value = math_node('MINIMUM', math_node('ADD', radial, math_node('MULTIPLY', math_node('MULTIPLY', wave, radial), ray_strength)), 1)
    ramp = n.new('ShaderNodeValToRGB'); els = ramp.color_ramp.elements
    els[0].position = .05; els[0].color = (*edge, 1); els[1].position = .97; els[1].color = (*hot, 1)
    els.new(.5).color = (*mid, 1)
    l.new(value, ramp.inputs['Fac'])
    emit = n.new('ShaderNodeEmission'); l.new(ramp.outputs['Color'], emit.inputs['Color']); emit.inputs['Strength'].default_value = 1.15
    l.new(emit.outputs[0], n['Material Output'].inputs['Surface'])
    add(plane, m)


def sparkles(count=46, color=(1, .85, .55), seed=7):
    rng = random.Random(seed)
    glow = GLOW(color, 7)
    for _ in range(count):
        r = rng.uniform(.012, .04)
        sphere((rng.uniform(-W * .62, W * .62), rng.uniform(-H * .2, H * .62), rng.uniform(-2.4, -.6)), (r, r, r), glow, 10)


def group(build, loc, size, rot=(0, 0, 0)):
    """Builds a model on its own, then scales it so its widest side is {size} and puts its centre at {loc}."""
    before = set(bpy.context.scene.objects)
    build()
    new = set(bpy.context.scene.objects) - before
    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()
    lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
    for o in new:
        if o.type not in ('MESH', 'CURVE', 'FONT'): continue
        ev = o.evaluated_get(deps)
        try: mesh = ev.to_mesh()
        except RuntimeError: continue
        for v in mesh.vertices:
            w = o.matrix_world @ v.co; lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
        ev.to_mesh_clear()
    span = max(hi.x - lo.x, hi.y - lo.y) or 1; centre = (lo + hi) / 2; k = size / span
    pivot = bpy.data.objects.new('Group', None); bpy.context.scene.collection.objects.link(pivot)
    holder = bpy.data.objects.new('Holder', None); bpy.context.scene.collection.objects.link(holder); holder.parent = pivot
    holder.location = (-centre.x * k, -centre.y * k, -centre.z * k); holder.scale = (k, k, k)
    for o in new:
        if o.parent is None: o.parent = holder
    pivot.location = loc; pivot.rotation_euler = tuple(math.radians(a) for a in rot)
    return pivot


def gold_face():
    """The letters' face, painted like a casino sign: bright yellow at the top to deep orange at the bottom. Glossy but
    not metal, so it stays gold in any light instead of mirroring the studio's white."""
    m = mat('TitleGold', (1, .7, .2), rough=.25, coat=.5)
    nt = m.node_tree; p = nt.nodes['Principled BSDF']
    coords = nt.nodes.new('ShaderNodeTexCoord'); xyz = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(coords.outputs['Generated'], xyz.inputs[0])
    ramp = nt.nodes.new('ShaderNodeValToRGB'); els = ramp.color_ramp.elements
    els[0].position = .12; els[0].color = (.75, .2, .0, 1); els[1].position = .8; els[1].color = (1, .8, .16, 1)
    els.new(.45).color = (1, .52, .03, 1)
    nt.links.new(xyz.outputs['Y'], ramp.inputs['Fac']); nt.links.new(ramp.outputs['Color'], p.inputs['Base Color'])
    nt.links.new(ramp.outputs['Color'], p.inputs['Emission Color']); p.inputs['Emission Strength'].default_value = .2
    return m


def letters(body, font, z, material, extrude=.02, bevel=0., size=1.):
    data = bpy.data.curves.new('Letters', 'FONT'); data.body = body; data.font = bpy.data.fonts.load(os.path.join(FONTS, FACE[font]), check_existing=True)
    data.size = size; data.extrude = extrude; data.bevel_depth = bevel; data.bevel_resolution = 3
    data.align_x = 'CENTER'; data.align_y = 'CENTER'; data.space_line = .82
    o = bpy.data.objects.new('Letters', data); bpy.context.scene.collection.objects.link(o); o.location = (0, 0, z)
    return add(o, material)


def bounds(o):
    bpy.context.view_layer.update()
    ev = o.evaluated_get(bpy.context.evaluated_depsgraph_get()); mesh = ev.to_mesh()
    lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
    for v in mesh.vertices: lo = Vector(map(min, lo, v.co)); hi = Vector(map(max, hi, v.co))
    ev.to_mesh_clear()
    return lo, hi


def fit(lines, y, max_w, max_h, top=None, gap=.06):
    """Stacks lines of letter layers (each line a list of layers, its outermost last) one under another, scales the
    stack to fit max_w x max_h centred at y (or hung from {top}), and returns its top and bottom."""
    boxes = [bounds(layers[-1]) for layers in lines]
    width = max(hi.x - lo.x for lo, hi in boxes)
    height = sum(hi.y - lo.y for lo, hi in boxes) + gap * (len(lines) - 1)
    pivot = bpy.data.objects.new('LettersGroup', None); bpy.context.scene.collection.objects.link(pivot)
    cursor = height / 2
    for layers, (lo, hi) in zip(lines, boxes):
        holder = bpy.data.objects.new('Line', None); bpy.context.scene.collection.objects.link(holder); holder.parent = pivot
        holder.location = (-(lo.x + hi.x) / 2, cursor - hi.y, 0); cursor -= (hi.y - lo.y) + gap
        for o in layers: o.parent = holder
    k = min(max_w / width, max_h / height); size = height * k
    if top is not None: y = top - size / 2
    pivot.scale = (k, k, k); pivot.location = (0, y, .9); pivot.rotation_euler = (math.radians(8), 0, 0)
    return y + size / 2, y - size / 2


def title(body, font, y, max_w, max_h, outline=(.12, .02, .0)):
    """The game's name in layers: the painted gold face, a thin polished-gold edge, a thick dark outline and an outer
    gold rim. The outlines are round bevels of the letters (not offsets), so sharp serifs never spike. Each line is
    its own set of letters (a line break inside one text bevels into a sliver)."""
    polished = mat('Polished', (1, .78, .35), metallic=1, rough=.18)
    face, edge = gold_face(), mat('Outline', outline, rough=.5)
    lines = [[letters(line, font, .06, face, extrude=.04),
              letters(line, font, 0, polished, extrude=.03, bevel=.025),
              letters(line, font, -.12, edge, extrude=.01, bevel=.085),
              letters(line, font, -.26, polished, extrude=.01, bevel=.125)] for line in body.split('\n')]
    return fit(lines, y, max_w, max_h)


def kicker(body, top, max_w=W * .7, color=(1, .97, .9), font='bungee'):
    """A small line with the title (e.g. VEGAS JACKPOT), cream on a dark outline."""
    parts = [letters(body, font, .03, mat('Kicker', color, rough=.3, emission=color, strength=.4)),
             letters(body, font, -.04, mat('KickerEdge', (.05, .0, .02), rough=.4), bevel=.06)]
    return fit([parts], 0, max_w, .42, top=top)


def coin_pile(loc, size, seed=1):
    def build():
        rng = random.Random(seed)
        for i in range(7):
            lux_coin_at((rng.uniform(-1.4, 1.4), rng.uniform(-.5, .4), i * .05), (rng.uniform(55, 80), rng.uniform(-20, 20), rng.uniform(0, 360)))
    return group(build, loc, size)



# ---------------------------------------------------------------- Money Monsoon's pieces
STEEL = lambda: mat('Steel', (.55, .57, .62), metallic=1, rough=.22)
DARK_STEEL = lambda: mat('DarkSteel', (.12, .13, .16), metallic=1, rough=.3)

def vault_parts():
    """A bank vault door: a steel body, a round gold-rimmed door with a three-spoke wheel and a dial."""
    rounded_box((2.4, 2.4, .7), .16, DARK_STEEL(), loc=(0, 0, -.3))
    bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=1.0, depth=.3, location=(0, 0, .15)); door = bpy.context.object
    b = door.modifiers.new('Bevel', 'BEVEL'); b.width = .05; b.segments = 4; bpy.ops.object.shade_smooth(); add(door, STEEL())
    bpy.ops.mesh.primitive_torus_add(major_radius=1.02, minor_radius=.07, major_segments=96, location=(0, 0, .3)); add(bpy.context.object, GOLD()); bpy.ops.object.shade_smooth()
    for i in range(12):
        a = i * math.pi / 6
        sphere((.86 * math.cos(a), .86 * math.sin(a), .33), (.05, .05, .04), GOLD(), 16)
    for i in range(3):
        a = i * math.tau / 3 + .3
        bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=.06, depth=1.2, location=(.3 * math.cos(a), .3 * math.sin(a), .45))
        o = bpy.context.object; o.rotation_euler = (0, math.pi / 2, a); add(o, GOLD()); bpy.ops.object.shade_smooth()
        sphere((.62 * math.cos(a), .62 * math.sin(a), .45), (.1, .1, .1), GOLD(), 24)
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=.2, depth=.16, location=(0, 0, .5)); add(bpy.context.object, GOLD()); bpy.ops.object.shade_smooth()

def vault(): tilted(vault_parts, (-12, 14, 0))

def cash_coin():
    """A plain gold coin, face on, whose prize the game prints on it."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=1.0, depth=.2, location=(0, 0, 0)); coin = bpy.context.object
    b = coin.modifiers.new('Bevel', 'BEVEL'); b.width = .05; b.segments = 4
    bpy.ops.object.shade_smooth(); add(coin, GOLD())
    # The face is painted bright gold (not mirror metal), so the prize printed over it always reads.
    bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=.82, depth=.02, location=(0, 0, .105)); add(bpy.context.object, mat('CoinFace', (.95, .58, .08), rough=.45, coat=.25, emission=(1, .5, .05), strength=.12)); bpy.ops.object.shade_smooth()
    bpy.ops.mesh.primitive_torus_add(major_radius=.84, minor_radius=.05, major_segments=96, location=(0, 0, .11)); add(bpy.context.object, DARK_GOLD()); bpy.ops.object.shade_smooth()
    for i in range(24):
        a = i * math.tau / 24
        sphere((.93 * math.cos(a), .93 * math.sin(a), .1), (.03, .03, .02), DARK_GOLD(), 10)

def cloud(colour=(.85, .88, .95)):
    m = mat('Cloud', colour, rough=.8, sss=.3)
    for x, y, r in ((-.9, 0, .55), (-.3, .25, .75), (.4, .2, .7), (1.0, -.05, .5), (0, -.2, .6)):
        sphere((x, y, 0), (r, r * .8, r * .7), m, 32)

def rain_cloud():
    """A storm cloud with gold coins falling out of it."""
    cloud((.45, .5, .6))
    for i, (x, y) in enumerate(((-.7, -1.0), (.1, -1.4), (.8, -1.05), (-.3, -1.9), (.5, -2.2))):
        lux_coin_at((x, y, 0), (60 + i * 7, 10 * (i % 3), i * 40))

MONSOON = {'CROWN': crown, 'DIAMOND': lux_ring, 'GOLD': lambda: lux_bars(GOLD()), 'WATCH': lux_watch, 'CHIPS': chips, 'DICE': dice,
           'CARDS': cards, 'WILD': video_wild, 'CASH': cash_coin, 'VAULT': vault}

def monsoon_symbol(name, build):
    reset(); build(); render(f'MM_{name}')


# ---------------------------------------------------------------- Sheriff's Gold's pieces (the old West)
FELT = lambda: mat('Felt', (.09, .045, .015), rough=.75, bump=.08, bump_scale=120)
LEATHER = lambda: mat('Leather', (.13, .045, .012), rough=.4, coat=.5, bump=.06, bump_scale=60)
ROPE = lambda: mat('Rope', (.3, .18, .06), rough=.8, bump=.3, bump_scale=90)
CACTUS_GREEN = lambda: mat('Cactus', (.015, .13, .035), rough=.5, coat=.3, bump=.12, bump_scale=40)
PAPER = lambda: mat('Paper', (.86, .74, .5), rough=.9, bump=.05, bump_scale=30)
INK = lambda: mat('Ink', (.18, .07, .02), rough=.7)

def hat_parts():
    """A cowboy hat: a pinched crown over a wide brim that curls up at the sides, with a band."""
    lathe([(0, .95), (.3, .98), (.5, .9), (.56, .6), (.58, .25), (.6, .2), (1.05, .16), (1.3, .26), (1.42, .42)], FELT(), thickness=.05)
    bpy.ops.mesh.primitive_torus_add(major_radius=.585, minor_radius=.06, location=(0, 0, .3)); add(bpy.context.object, LEATHER()); bpy.ops.object.shade_smooth()
    star_badge((.0, -.62, .34), .14, SATIN_GOLD())
    for o in bpy.context.scene.objects:
        if o.name.startswith('Lathe'): o.scale = (1, .82, 1)
def cowboy_hat(): tilted(hat_parts, (-62, 0, 0))

def boot():
    """A cowboy boot side on, with a heel, a pointed toe and a gold star on the shaft."""
    outline = [(-.45, 1.2), (.15, 1.2), (.2, .2), (.55, .05), (1.05, -.15), (1.1, -.35), (.4, -.42), (.2, -.62), (-.15, -.62), (-.2, -.42), (-.45, -.4)]
    prism(outline, .45, .22, LEATHER(), .06)
    prism([(-.47, 1.22), (.17, 1.22), (.17, 1.05), (-.47, 1.05)], .5, .25, mat('Trim', (.15, .05, .02), rough=.4, coat=.6), .03)
    star_badge((-.15, .55, .26), .22, SATIN_GOLD())

def horseshoe():
    """A gold horseshoe, open end up, with its nail holes."""
    pts = [(math.cos(a) * .85, math.sin(a) * .95 - .1, 0) for a in [math.radians(d) for d in range(-30, 211, 20)]]
    o = tube(pts, .16, SATIN_GOLD()); o.data.bevel_resolution = 8
    for a in [math.radians(d) for d in (0, 40, 140, 180)]:
        sphere((math.cos(a) * .85, math.sin(a) * .95 - .1, .14), (.05, .05, .02), DARK_GOLD(), 12)

def cactus():
    """A saguaro: a ribbed trunk with two arms and a pink flower."""
    g = CACTUS_GREEN()
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=.32, depth=2.0, location=(0, 0, 0)); trunk = bpy.context.object
    trunk.rotation_euler = (math.radians(90), 0, 0); add(trunk, g); bpy.ops.object.shade_smooth()
    sphere((0, 1.0, 0), (.32, .32, .32), g, 24)
    tube([(.3, .1, 0), (.75, .15, 0), (.8, .55, 0), (.8, .85, 0)], .2, g); sphere((.8, .9, 0), (.2, .2, .2), g, 20)
    tube([(-.3, -.2, 0), (-.7, -.15, 0), (-.75, .2, 0), (-.75, .45, 0)], .18, g); sphere((-.75, .5, 0), (.18, .18, .18), g, 20)
    sphere((.05, 1.3, .1), (.14, .1, .1), mat('Flower', (1, .25, .55), rough=.4, sss=.3), 16)

def poster():
    """A WANTED poster on aged paper, nailed up."""
    rounded_box((1.5, 2.0, .06), .03, PAPER(), loc=(0, 0, 0))
    text('WANTED', .34, .02, .005, INK(), loc=(0, .62, .05))
    text('$', 1.0, .03, .01, INK(), loc=(0, -.05, .05))
    text('REWARD', .2, .02, .004, INK(), loc=(0, -.68, .05))
    sphere((0, .9, .07), (.06, .06, .03), DARK_STEEL(), 12)

def lasso():
    """A coiled lasso: a loop of rope and its tail."""
    bpy.ops.mesh.primitive_torus_add(major_radius=.85, minor_radius=.09, major_segments=96, location=(0, 0, 0)); loop = bpy.context.object
    loop.scale = (1, .8, 1); add(loop, ROPE()); bpy.ops.object.shade_smooth()
    bpy.ops.mesh.primitive_torus_add(major_radius=.72, minor_radius=.09, major_segments=96, location=(.08, -.05, .12)); add(bpy.context.object, ROPE()); bpy.ops.object.shade_smooth()
    tube([(.7, -.5, .1), (1.0, -.8, .1), (1.1, -1.2, .1), (.9, -1.45, .1)], .09, ROPE())

def wild_sign():
    """WILD burned into a wooden plank, gold letters."""
    rounded_box((2.4, 1.1, .2), .06, WOOD(), loc=(0, 0, 0))
    text('WILD', .78, .08, .02, GOLD(), loc=(0, -.04, .14))
    for x in (-1.05, 1.05): sphere((x, .4, .12), (.06, .06, .03), DARK_STEEL(), 12)

def star_badge(loc, size, material, centre=None):
    """A six-pointed sheriff's star with a ball on each point; {centre} paints its middle disc (for a printed prize)."""
    pts = []
    for i in range(12):
        r = size * (1 if i % 2 == 0 else .52); a = math.pi / 2 + i * math.pi / 6
        pts.append((loc[0] + r * math.cos(a), loc[1] + r * math.sin(a)))
    star = prism(pts, size * .16, loc[2] + size * .08, material, size * .03)
    for i in range(6):
        a = math.pi / 2 + i * math.pi / 3
        sphere((loc[0] + size * 1.04 * math.cos(a), loc[1] + size * 1.04 * math.sin(a), loc[2]), (size * .12,) * 3, material, 16)
    if centre is not None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=size * .42, depth=size * .05, location=(loc[0], loc[1], loc[2] + size * .1))
        add(bpy.context.object, centre); bpy.ops.object.shade_smooth()
    return star

PAINTED_GOLD = lambda: mat('PaintedGold', (.95, .62, .1), rough=.4, coat=.3, emission=(1, .5, .05), strength=.12)
def prize_star(): star_badge((0, 0, 0), 1.0, SATIN_GOLD(), centre=PAINTED_GOLD())
def jackpot_star(metal, gem):
    """A jackpot's star: {metal} with a {gem} at its heart (both made per render: a reset clears materials)."""
    def build():
        star_badge((0, 0, 0), 1.0, metal())
        sphere((0, 0, .2), (.34, .34, .2), gem(), 32)
    return build
SILVER_STAR = lambda: mat('SilverStar', (.8, .82, .88), metallic=.75, rough=.32)
# Stars and the horseshoe in satin gold: a mirror finish on their flat faces reflects the dark of the studio.
SATIN_GOLD = lambda: mat('SatinGold', (1, .68, .18), metallic=.75, rough=.32)
GEM = lambda colour: mat('Gem', colour, rough=.05, coat=1, sss=.2)

SHERIFF = {'SEVEN': cowboy_hat, 'BAR': boot, 'BELL': horseshoe, 'STAR': cactus, 'ORANGE': poster, 'CHERRY': lasso, 'WILD': wild_sign,
           'BADGE': prize_star, 'MINI': jackpot_star(SILVER_STAR, lambda: GEM((.05, .45, .15))), 'MINOR': jackpot_star(SILVER_STAR, lambda: GEM((.05, .15, .6))),
           'MAJOR': jackpot_star(SATIN_GOLD, lambda: GEM((.6, .02, .05)))}

def sheriff_symbol(name, build):
    reset(); build(); render(f'SG_{name}')


# ---------------------------------------------------------------- the classic trio's pieces
def colour_seven(colour, edge=None):
    """A classic 7 in glossy enamel over a polished rim ({edge}: the rim's metal, gold by default)."""
    text('7', 2.6, .16, .05, mat('Enamel7', colour, rough=.08, coat=1, sss=.05), loc=(0, 0, .05))
    text('7', 2.6, .1, .04, (edge or GOLD)(), offset=.13, loc=(0, 0, -.1))

def classic_bars(count, colour):
    """One, two or three stacked BAR plaques in an enamel colour, gold-rimmed."""
    enamel = mat('BarEnamel', colour, rough=.1, coat=1)
    gap, h = .12, .5
    top = (count * h + (count - 1) * gap) / 2
    for i in range(count):
        y = top - h / 2 - i * (h + gap)
        rounded_box((2.3, h, .24), .08, GOLD(), loc=(0, y, -.04))
        rounded_box((2.12, h - .12, .24), .06, enamel, loc=(0, y, .02))
        text('BAR', .36, .05, .012, mat('BarInk', (1, 1, 1) if sum(colour) < 2 else (.08, .1, .3), rough=.3, coat=.5), loc=(0, y - .01, .15))

def diamond_wild(label, colour):
    """A faceted gem with its multiplier (2X, 3X, 5X) in front of it."""
    gem = mat('WildGem', colour, rough=.0)
    p = gem.node_tree.nodes['Principled BSDF']; p.inputs['Transmission Weight'].default_value = .85; p.inputs['IOR'].default_value = 2.2
    bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=1.0, radius2=.6, depth=.4, location=(0, .35, 0)); crown = bpy.context.object
    bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=1.0, radius2=0, depth=1.1, location=(0, -.4, 0)); pav = bpy.context.object
    crown.rotation_euler = (math.radians(-90), 0, math.radians(22.5)); pav.rotation_euler = (math.radians(90), 0, math.radians(22.5))
    add(crown, gem); add(pav, gem)
    # The multiplier stands in front of the gem: bright gold over a dark outline, so it reads on any colour.
    text(label, .95, .08, .02, mat('WildGold', (1, .8, .3), rough=.2, coat=.6, emission=(1, .62, .12), strength=.35), loc=(0, -.05, .95))
    text(label, .95, .04, .0, mat('WildEdge', (.03, .01, .05), rough=.4), offset=.07, loc=(0, -.05, .86))

def jackpot_flame():
    """JACKPOT on a gold plaque wrapped in fire."""
    for x, s, lean in ((-1.0, .7, -.3), (-.35, .95, -.08), (.35, 1.0, .1), (1.0, .72, .3)):
        prism([(px + x, py + .3 * s) for px, py in flame_shape(.4 * s, 1.5 * s, lean)], .08, -.3, FLAME(), .02)
        prism([(px + x, py + .25 * s) for px, py in flame_shape(.26 * s, 1.1 * s, lean)], .08, -.22, FLAME_MID(), .02)
        prism([(px + x, py + .2 * s) for px, py in flame_shape(.13 * s, .7 * s, lean)], .08, -.14, FLAME_CORE(), .015)
    rounded_box((2.6, .8, .26), .1, GOLD(), loc=(0, -.25, 0))
    rounded_box((2.42, .64, .26), .08, mat('JackpotRed', (.45, .0, .02), rough=.1, coat=1), loc=(0, -.25, .05))
    text('JACKPOT', .42, .06, .014, GOLD(), loc=(0, -.27, .2))

RED_ENAMEL, WHITE_ENAMEL, BLUE_ENAMEL = (.6, .0, .02), (.92, .93, .96), (.02, .1, .55)
STARS_STRIPES = {'RED7': lambda: colour_seven(RED_ENAMEL), 'WHITE7': lambda: colour_seven(WHITE_ENAMEL, SILVER_METAL),
                 'BLUE7': lambda: colour_seven(BLUE_ENAMEL), 'BAR1': lambda: classic_bars(1, RED_ENAMEL),
                 'BAR2': lambda: classic_bars(2, WHITE_ENAMEL), 'BAR3': lambda: classic_bars(3, BLUE_ENAMEL)}
DIAMOND = {'SEVEN': seven, 'BAR1': lambda: classic_bars(1, (.05, .05, .07)), 'BAR2': lambda: classic_bars(2, (.05, .05, .07)),
           'BAR3': lambda: classic_bars(3, (.05, .05, .07)), 'CHERRY': cherry,
           'WILD2': lambda: diamond_wild('2X', (.4, .85, 1)), 'WILD3': lambda: diamond_wild('3X', (.85, .3, 1)), 'WILD5': lambda: diamond_wild('5X', (1, .25, .4))}
INFERNO = {'JACKPOT': jackpot_flame, 'FIRE7': devil_seven, 'SEVEN': lambda: colour_seven((.95, .55, .02)),
           'BAR1': lambda: classic_bars(1, (.7, .06, .01)), 'BAR2': lambda: classic_bars(2, (.85, .35, .02)), 'BAR3': lambda: classic_bars(3, (.55, .0, .05))}
# Each classic game's FREE SPINS scatter: the star coin with its ribbon (Seven Stars' scatter).
for builds in (STARS_STRIPES, DIAMOND, INFERNO): builds['SCATTER'] = video_scatter
CLASSIC_SETS = {'SS': STARS_STRIPES, 'DW': DIAMOND, 'IJ': INFERNO}


# ---------------------------------------------------------------- the fish tables: bosses and seabeds
def kraken():
    """The Kraken rising: a tall dark-crimson mantle, glowing slit eyes, and eight heavy arms reaching out and down that
    taper to curled tips, ringed with pale suckers."""
    skin = mat('KrakenSkin', (.12, .005, .04), rough=.32, coat=.8, sss=.15, bump=.12, bump_scale=14)
    spots = mat('KrakenSpots', (.08, .0, .03), rough=.4, coat=.6)
    sucker = mat('Sucker', (.85, .42, .38), rough=.4, sss=.3)
    sphere((0, .8, -.1), (.8, 1.35, .7), skin, 64)
    sphere((0, -.2, 0), (.95, .6, .7), skin, 48)
    for x, y, r in ((-.3, 1.3, .12), (.25, 1.0, .1), (-.15, .6, .08), (.35, 1.6, .09)): sphere((x, y, .55), (r, r, .05), spots, 16)
    for side in (-1, 1):
        sphere((side * .42, -.12, .58), (.24, .2, .12), mat('EyeGlow', (1, .75, .1), rough=.1, emission=(1, .55, .05), strength=4), 32)
        sphere((side * .42, -.12, .69), (.05, .16, .04), mat('Pupil', (.0, .0, .0), rough=.2), 16)
    for i in range(8):
        a = math.radians(-168 + i * 22.3)
        side = 1 if math.cos(a) >= 0 else -1
        pts = []
        for k in range(7):
            rr = .55 + k * .5
            bend = math.radians((k / 6) ** 2 * 70 * side)          # the tip curls upward, away from the body
            pts.append((math.cos(a + bend) * rr * 1.15, -.45 + math.sin(a + bend) * rr * .8, .2 - k * .04))
        arm = tube(pts, .3, skin); arm.data.bevel_resolution = 8
        for j, bp in enumerate(arm.data.splines[0].bezier_points): bp.radius = max(.15, 1 - j * .14)
        for j in range(1, 6):
            px, py, pz = pts[j]; r = .07 * max(.4, 1 - j * .13)
            sphere((px, py - .14 * max(.4, 1 - j * .14), pz + .1), (r, r, r * .5), sucker, 12)

def megalodon():
    """The Megalodon lunging, side on: a long spindle body (slate above, pale below), a pointed snout over open jaws of
    white teeth, a black eye, and tall swept fins."""
    hide = mat('SharkHide', (.08, .1, .14), rough=.3, coat=.6, bump=.04, bump_scale=30)
    belly = mat('SharkBelly', (.78, .8, .82), rough=.4)
    body = lathe([(0, -2.3), (.22, -1.9), (.5, -1.0), (.62, -.1), (.58, .7), (.44, 1.4), (.24, 1.85), (.08, 2.1), (0, 2.18)], hide, thickness=.02)
    body.rotation_euler = (0, math.radians(90), 0); body.scale = (.8, 1, 1)
    sphere((.1, -.24, .1), (1.75, .3, .42), belly, 48)
    prism([(-.3, .5), (.2, 1.45), (.75, .45)], .12, .06, hide, .03)
    prism([(-1.95, .1), (-2.75, 1.0), (-2.5, .05), (-2.85, -.8), (-2.0, -.05)], .12, .06, hide, .03)
    prism([(.25, -.3), (-.45, -1.05), (.8, -.35)], .1, .25, hide, .03)
    # Jaws: a dark wedge under the snout, rows of teeth along both edges.
    prism([(1.15, -.12), (2.0, .05), (1.95, -.18), (1.25, -.42)], .1, .5, mat('Maw', (.2, .0, .02), rough=.5), .02)
    tooth = mat('Tooth', (.98, .97, .92), rough=.2, coat=.5)
    for k in range(8):
        x = 1.3 + k * .09
        prism([(x - .035, -.11 + k * .019), (x + .035, -.11 + k * .019), (x, -.24 + k * .015)], .03, .56, tooth)
        prism([(x - .035, -.4 + k * .025), (x + .035, -.4 + k * .025), (x, -.27 + k * .02)], .03, .56, tooth)
    sphere((1.55, .2, .4), (.08, .08, .04), mat('SharkEye', (.0, .0, .0), rough=.05, coat=1), 16)
    for k in range(5): rounded_box((.025, .3, .03), .01, mat('Gill', (.03, .04, .06), rough=.5), loc=(.95 - k * .09, -.02, .46))

def seabed_scene(name, sand, deep, glow, decor):
    """A seabed seen from above for a fish table (16:9): sand fading into deep water at the edges, rocks, coral and
    shells, softly lit; the table draws its creatures, light shafts and bubbles over it."""
    stage(16.0, 9.0, 1600)
    scene = bpy.context.scene; scene.cycles.samples = 64
    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, -1.2))
    add(bpy.context.object, mat('Sand', sand, rough=.9, bump=.35, bump_scale=6))
    rng = random.Random(len(name))
    rock = mat('Rock', (deep[0] * 1.6 + .05, deep[1] * 1.6 + .05, deep[2] * 1.6 + .06), rough=.8, bump=.4, bump_scale=10)
    for _ in range(14):
        x, y = rng.choice([-1, 1]) * rng.uniform(4, 8.5), rng.uniform(-4.5, 4.5)
        s = rng.uniform(.4, 1.1); sphere((x, y, -1.0), (s * 1.4, s, s * .6), rock, 24)
    for _ in range(18):
        x, y = rng.uniform(-8, 8), rng.choice([-1, 1]) * rng.uniform(3.4, 4.6)
        c = (glow, (1, .5, .3), (.95, .9, .5))[rng.randrange(3)]
        for k in range(3):
            a = rng.uniform(0, math.tau)
            tube([(x, y, -1), (x + math.cos(a) * .3, y + math.sin(a) * .3, -.6), (x + math.cos(a) * .5, y + math.sin(a) * .5, -.3)], .07, mat('Coral', c, rough=.5, sss=.3, emission=c, strength=.15))
    for build, n in decor:
        for _ in range(n):
            group(build, (rng.uniform(-7.5, 7.5), rng.choice([-1, 1]) * rng.uniform(2.8, 4.2), -.9), rng.uniform(.5, .9), (0, 0, rng.uniform(0, 360)))
    # Lit from above like shallow water; the table darkens its own edges and adds light shafts and bubbles.
    light('Sun', (0, 0, 14), 9000, (.85, .95, 1), 14)
    scene.render.filepath = os.path.join(OUT, f'{name}.png')
    bpy.ops.render.render(write_still=True)
    print('rendered', name)

def shell():
    lathe([(0, .0), (.5, .1), (.7, .3), (.6, .55), (.2, .7), (0, .72)], mat('Shell', (.95, .8, .7), rough=.3, coat=.6, sss=.2), steps=12, thickness=.03)
def starfish():
    pts = []
    for i in range(10):
        r = 1 if i % 2 == 0 else .42; a = math.pi / 2 + i * math.pi / 5; pts.append((r * math.cos(a), r * math.sin(a)))
    prism(pts, .18, .09, mat('Star', (1, .45, .2), rough=.5, bump=.3, bump_scale=40), .06)
def skull():
    sphere((0, 0, 0), (.6, .7, .5), mat('Bone', (.85, .82, .72), rough=.6, bump=.2, bump_scale=30), 32)
    for x in (-.22, .22): sphere((x, .05, .38), (.16, .18, .1), mat('Hollow', (.02, .02, .02), rough=.9), 16)

FISH_TABLES = {
    'KRAKENS_DEEP': dict(boss=kraken, bossName='FT_KRAKEN', seabed=dict(name='FS_KRAKENS_DEEP', sand=(.18, .14, .2), deep=(.03, .0, .08), glow=(.6, .2, 1),
        decor=[(skull, 3), (lambda: lux_bars(GOLD()), 2), (shell, 4)])),
    'SHARK_FRENZY': dict(boss=megalodon, bossName='FT_MEGALODON', seabed=dict(name='FS_SHARK_FRENZY', sand=(.85, .72, .5), deep=(.0, .12, .3), glow=(1, .4, .5),
        decor=[(starfish, 5), (shell, 6), (LUXURY['COIN'], 3)])),
}

# ---------------------------------------------------------------- the tiles
# Each tile: its backdrop (hot centre, middle, edge), its pieces (model, centre, size, turn) and its name.
EMBER = ((1, .62, .16), (.62, .05, .02), (.07, .0, .02))
NEON_PURPLE = ((1, .5, .95), (.42, .06, .6), (.04, .0, .09))
OCEAN = ((.5, .95, 1), (.02, .3, .6), (.0, .03, .1))
JADE = ((.75, 1, .6), (.02, .4, .2), (.0, .06, .04))
CITRUS = ((1, .95, .45), (.95, .45, .02), (.18, .03, .0))
NIGHT = ((.55, .65, 1), (.12, .1, .45), (.01, .0, .06))
ROYAL = ((1, .85, .45), (.45, .12, .45), (.05, .0, .06))
MONEY = ((.85, 1, .55), (.1, .45, .12), (.01, .07, .02))
SPACE = ((.8, .55, 1), (.2, .05, .55), (.0, .0, .05))
FIESTA = ((1, .75, .3), (.75, .04, .2), (.08, .0, .05))
CANDY = ((1, .7, .95), (.7, .1, .55), (.07, .0, .08))
SUNSET = ((1, .78, .35), (.75, .2, .05), (.12, .02, .05))
BLACK_GOLD = ((1, .72, .28), (.16, .07, .01), (.0, .0, .0))

fire = lambda name: (lambda: fireball(*FIREBALLS[name]))
devil = lambda name: DEVIL[name]
lux = lambda name: LUXURY[name]

TILES = {
    'HOT_7S': dict(bg=EMBER, name='HOT 7s', font='titan', pieces=[
        (devil('SEVEN'), (-1.75, .95, 0), 1.9, (0, 0, 14)), (devil('SEVEN'), (1.75, .95, 0), 1.9, (0, 0, -14)), (seven, (0, .95, .4), 2.3, (0, 0, 0))]),
    'FRUIT_RUSH': dict(bg=((1, .95, .5), (.15, .65, .2), (.0, .1, .04)), name='FRUIT\nRUSH', font='lucky', pieces=[
        (watermelon, (-1.9, .9, 0), 1.8, (0, 0, 18)), (grape, (1.95, 1.0, 0), 1.7, (0, 0, -12)), (cherry, (0, 1.15, .4), 2.0, (0, 0, 0)),
        (lemon, (-.95, 1.85, -.2), 1.2, (0, 0, -20)), (orange, (1.0, 1.9, -.2), 1.0, (0, 0, 0))]),
    'ORANGE_RUSH': dict(bg=CITRUS, name='ORANGE\nRUSH', font='lucky', pieces=[
        (orange, (-1.6, 1.0, 0), 1.7, (0, 0, 0)), (orange, (1.6, 1.0, 0), 1.7, (0, 0, 20)), (orange, (0, 1.25, .5), 2.2, (0, 0, -10))]),
    'ROULETTE': dict(bg=((.6, 1, .6), (.02, .35, .14), (.0, .05, .02)), name='ROULETTE', kicker='EUROPEAN', font='abril', pieces=[
        (roulette, (0, 1.1, 0), 3.4, (0, 0, 0)), (chips, (-2.15, .55, .4), 1.5, (0, 0, 0)), (chips, (2.2, .5, .4), 1.4, (0, 0, 30))]),
    'VEGAS_JACKPOT_DEVIL_HEART': dict(bg=((1, .35, .35), (.45, .0, .06), (.04, .0, .02)), name='DEVIL\nHEART', kicker='VEGAS JACKPOT', font='abril',
        outline=(.08, .0, .01), pieces=[
        (devil('SEVEN'), (-1.85, .95, 0), 1.7, (0, 0, 12)), (devil('JACKPOT'), (0, 1.25, .3), 2.4, (0, 0, 0)), (devil('WILD'), (1.85, .95, 0), 1.6, (0, 0, -12))]),
    'TEN_X_TRIPLE': dict(bg=NEON_PURPLE, name='10x TRIPLE', font='titan', pieces=[
        (bar, (-1.8, .95, 0), 1.6, (0, 0, 10)), (lambda: devil_bar(3), (0, 1.15, .3), 2.1, (0, 0, 0)), (bar, (1.8, .95, 0), 1.6, (0, 0, -10)),
        (chips, (0, .15, .6), 1.2, (0, 0, 0))]),
    'WILD_BUFFALO': dict(bg=SUNSET, name='WILD\nBUFFALO', font='titan', pieces=[
        (video_wild, (0, 1.2, .3), 2.4, (0, 0, 0)), (star, (-1.95, 1.0, 0), 1.4, (0, 0, 12)), (star, (1.95, 1.0, 0), 1.4, (0, 0, -12)),
        (lux('COIN'), (0, .25, .6), 1.3, (0, 0, 0))]),
    'SIMPLE_DOLLAR': dict(bg=MONEY, name='SIMPLE\nDOLLAR', font='titan', outline=(.0, .08, .02), pieces=[
        (lux('COIN'), (0, 1.2, .3), 2.2, (0, 0, 0)), (lambda: lux_bars(GOLD()), (-1.9, .85, 0), 1.7, (0, 0, 10)), (lux('GOLD'), (1.95, .9, 0), 1.7, (0, 0, -8))]),
    'BLAZING_HIT': dict(bg=EMBER, name='BLAZING\nHIT', font='titan', pieces=[
        (fire('FIRE'), (-1.85, 1.0, -.2), 1.6, (0, 0, 0)), (devil('SEVEN'), (0, 1.15, .4), 2.4, (0, 0, 0)), (fire('FIRE'), (1.85, 1.0, -.2), 1.6, (0, 0, 0))]),
    'QUICK_HIT': dict(bg=((.6, .9, 1), (.1, .2, .75), (.0, .02, .12)), name='QUICK HIT', font='titan', pieces=[
        (slot_machine, (0, 1.15, .2), 2.6, (0, 0, 0)), (bell, (-2.05, .85, 0), 1.35, (0, 0, 14)), (bell, (2.05, .85, 0), 1.35, (0, 0, -14))]),
    'LUCKY_FIRE_BLITZ': dict(bg=((1, .85, .4), (.7, .1, .02), (.08, .0, .02)), name='LUCKY FIRE\nBLITZ', font='titan', pieces=[
        (fire('MAJOR'), (0, 1.2, .3), 2.3, (0, 0, 0)), (fire('MINOR'), (-1.95, .95, 0), 1.45, (0, 0, 0)), (fire('MINI'), (1.95, .95, 0), 1.45, (0, 0, 0))]),
    'ASCENT_CRASH': dict(bg=SPACE, name='ASCENT\nCRASH', font='titan', sparkle=(.8, .9, 1), pieces=[
        (rocket, (.3, .9, .2), 2.9, (0, 0, 0)), (lux('COIN'), (-2.1, .9, .2), 1.4, (0, 0, 14)), (star, (2.2, 1.6, 0), .9, (0, 0, -12))]),
    'SOLAR_SEVENS': dict(bg=((1, 1, .7), (1, .55, .05), (.25, .05, .0)), name='SOLAR\nSEVENS', font='titan', rays=26, ray_strength=.35, pieces=[
        (seven, (-1.6, 1.0, 0), 1.9, (0, 0, 10)), (seven, (1.6, 1.0, 0), 1.9, (0, 0, -10)), (star, (0, 1.4, .4), 1.9, (0, 0, 0))]),
    'CITRUS_COAST': dict(bg=((1, .95, .6), (.05, .6, .7), (.0, .08, .15)), name='CITRUS\nCOAST', font='lucky', pieces=[
        (lemon, (-1.6, 1.05, 0), 1.9, (0, 0, 15)), (orange, (1.6, 1.0, 0), 1.6, (0, 0, 0)), (watermelon, (0, 1.35, .4), 1.8, (0, 0, 0))]),
    'JADE_FORTUNE': dict(bg=JADE, name='JADE\nFORTUNE', font='abril', outline=(.0, .07, .03), pieces=[
        (fire('MINI'), (0, 1.2, .3), 2.2, (0, 0, 0)), (lux('COIN'), (-1.9, .9, 0), 1.5, (0, 0, 14)), (crown, (1.9, .95, 0), 1.6, (0, 0, -10))]),
    'MIDNIGHT_BARS': dict(bg=NIGHT, name='MIDNIGHT\nBARS', font='titan', sparkle=(.8, .85, 1), pieces=[
        (lambda: devil_bar(1), (-1.75, .95, 0), 1.7, (0, 0, 10)), (lambda: devil_bar(3), (0, 1.2, .3), 2.2, (0, 0, 0)), (lambda: devil_bar(2), (1.75, .95, 0), 1.7, (0, 0, -10))]),
    'SEVEN_STARS_DELUXE': dict(bg=ROYAL, name='SEVEN STARS', kicker='DELUXE', kicker_below=True, font='abril', pieces=[
        (star, (-1.9, 1.0, 0), 1.5, (0, 0, 15)), (seven, (0, 1.15, .3), 2.3, (0, 0, 0)), (star, (1.9, 1.0, 0), 1.5, (0, 0, -15)), (video_scatter, (0, 2.05, -.3), 1.0, (0, 0, 0))]),
    'DRAGON_TIDE': dict(bg=OCEAN, name='DRAGON\nTIDE', font='titan', outline=(.0, .04, .1), sparkle=(.7, 1, 1), pieces=[
        (fish, (-.2, 1.1, .2), 3.9, (0, 0, 8)), (lux('COIN'), (2.25, .6, .4), 1.3, (0, 0, -10)), (fire('MINOR'), (-2.3, 1.7, -.2), 1.0, (0, 0, 0))]),
    'GALAXY_KENO': dict(bg=SPACE, name='GALAXY\nKENO', font='titan', sparkle=(.85, .9, 1), pieces=[
        (keno, (0, 1.15, .2), 3.4, (0, 0, 0))]),
    'TRIPLE_MATCH_SCRATCH': dict(bg=CANDY, name='TRIPLE\nMATCH', font='titan', pieces=[
        (scratch, (0, 1.15, .2), 2.8, (0, 0, -6)), (lux('COIN'), (-2.1, .8, .4), 1.3, (0, 0, 12)), (star, (2.05, 1.0, .3), 1.2, (0, 0, -12))]),
    'LOTERIA_SCRATCH': dict(bg=FIESTA, name='LOTERÍA', font='abril', pieces=[
        (cards, (0, 1.15, .2), 2.9, (0, 0, 0)), (scratch, (-2.0, .85, .3), 1.4, (0, 0, 12)), (lux('COIN'), (2.1, .8, .4), 1.3, (0, 0, -12))]),
    'BREAK_THE_BANK': dict(bg=EMBER, name='BREAK\nTHE BANK', font='titan', pieces=[
        (lambda: lux_bars(GOLD()), (0, .85, .5), 2.1, (0, 0, 0)), (fire('MAJOR'), (-1.95, 1.15, 0), 1.6, (0, 0, 0)), (fire('FIRE'), (1.95, 1.15, 0), 1.6, (0, 0, 0)),
        (lux('COIN'), (0, 1.9, -.4), 1.2, (0, 0, 0))]),
    'STARS_STRIPES_7S': dict(bg=((1, .9, .95), (.6, .05, .12), (.02, .03, .2)), name='STARS &\nSTRIPES 7s', font='titan', outline=(.02, .03, .2), sparkle=(1, 1, 1), rays=26, pieces=[
        (STARS_STRIPES['RED7'], (-1.85, 1.0, 0), 1.8, (0, 0, 10)), (STARS_STRIPES['WHITE7'], (0, 1.15, .3), 2.0, (0, 0, 0)), (STARS_STRIPES['BLUE7'], (1.85, 1.0, 0), 1.8, (0, 0, -10)),
        (star, (-2.6, 2.1, -.3), .9, (0, 0, 12)), (star, (2.6, 2.1, -.3), .9, (0, 0, -12))]),
    'DIAMOND_WILDS': dict(bg=((.75, .95, 1), (.15, .2, .6), (.0, .02, .1)), name='DIAMOND\nWILDS', font='abril', outline=(.0, .03, .12), sparkle=(.85, .95, 1), pieces=[
        (DIAMOND['WILD5'], (0, 1.15, .3), 2.1, (0, 0, 0)), (DIAMOND['WILD2'], (-2.0, .95, 0), 1.6, (0, 0, 12)), (DIAMOND['WILD3'], (2.0, .95, 0), 1.6, (0, 0, -12))]),
    'INFERNO_JACKPOT': dict(bg=EMBER, name='INFERNO\nJACKPOT', font='titan', pieces=[
        (jackpot_flame, (0, 1.2, .3), 2.4, (0, 0, 0)), (devil_seven, (-2.0, .95, 0), 1.6, (0, 0, 12)), (devil_seven, (2.0, .95, 0), 1.6, (0, 0, -12))]),
    'SHERIFFS_GOLD': dict(bg=SUNSET, name="SHERIFF'S\nGOLD", font='titan', outline=(.14, .04, .0), pieces=[
        (prize_star, (0, 1.1, .35), 2.3, (0, 0, 8)), (cowboy_hat, (-2.0, 1.0, 0), 2.0, (0, 0, 10)), (horseshoe, (2.05, 1.05, 0), 1.5, (0, 0, -14)),
        (cactus, (-2.6, 2.1, -.4), 1.4, (0, 0, 0)), (cactus, (2.7, 2.15, -.4), 1.2, (0, 0, 0))]),
    'STARBALL_KENO': dict(bg=((1, .9, .55), (.35, .1, .6), (.02, .0, .08)), name='STARBALL\nKENO', font='titan', outline=(.05, .0, .12), sparkle=(1, .95, .7), rays=26, ray_strength=.35, pieces=[
        (star, (0, 1.25, .4), 2.1, (0, 0, 0)), (keno, (-1.95, .9, 0), 1.9, (0, 0, 10)), (keno, (1.95, .9, 0), 1.9, (0, 0, -10))]),
    'KRAKENS_DEEP': dict(bg=((.85, .5, 1), (.25, .02, .4), (.01, .0, .05)), name="KRAKEN'S\nDEEP", font='titan', outline=(.06, .0, .1), sparkle=(.8, .6, 1), pieces=[
        (kraken, (0, 1.05, .2), 3.0, (0, 0, 0)), (lux('COIN'), (-2.35, .7, .4), 1.0, (0, 0, 15)), (lambda: lux_bars(GOLD()), (2.3, .65, .4), 1.2, (0, 0, -10))]),
    'SHARK_FRENZY': dict(bg=OCEAN, name='SHARK\nFRENZY', font='titan', outline=(.0, .04, .1), sparkle=(.7, 1, 1), pieces=[
        (megalodon, (0, 1.1, .2), 4.2, (0, 0, 6)), (starfish, (-2.4, .5, .4), .9, (0, 0, 20)), (lux('COIN'), (2.4, .55, .4), 1.0, (0, 0, -15))]),
    'MONEY_MONSOON': dict(bg=((.7, 1, .75), (.05, .38, .3), (.0, .05, .05)), name='MONEY\nMONSOON', font='titan', outline=(.0, .07, .04), sparkle=(1, .9, .5), pieces=[
        (vault, (0, 1.05, .3), 2.4, (0, 0, 0)), (rain_cloud, (-2.0, 1.4, 0), 1.9, (0, 0, 6)), (rain_cloud, (2.05, 1.45, 0), 1.8, (0, 0, -6)),
        (lambda: lux_bars(GOLD()), (0, .1, .6), 1.3, (0, 0, 0))]),
    'LUXURY_LIFE': dict(bg=BLACK_GOLD, name='LUXURY\nLIFE', font='abril', pieces=[
        (lux('YACHT'), (-1.75, 1.2, 0), 2.3, (0, 0, 0)), (lux('JET'), (1.8, 1.55, 0), 2.1, (0, 0, 0)), (lux('GOLD'), (.1, .75, .5), 1.9, (0, 0, 0)),
        (lux('RING'), (0, 1.75, .2), 1.1, (0, 0, 0))]),
}


def tile(code, spec):
    stage()
    backdrop(*spec['bg'], rays=spec.get('rays', 18), ray_strength=spec.get('ray_strength', .22))
    sparkles(color=spec.get('sparkle', (1, .85, .55)), seed=len(code))
    for build, loc, size, rot in spec['pieces']: group(build, loc, size, rot)
    two_lines = '\n' in spec['name']
    # The name fills the lower part of the tile, as big as it fits; a kicker sits just above it (or below it).
    room_top, room_bottom = (-.15 if two_lines else -.55), -2.35
    below = spec.get('kicker_below')
    if 'kicker' in spec and not below:
        _, bottom = kicker(spec['kicker'], room_top); room_top = bottom - .05
    if 'kicker' in spec and below: room_bottom += .5
    top, bottom = title(spec['name'], spec['font'], (room_top + room_bottom) / 2, W * .84, room_top - room_bottom, outline=spec.get('outline', (.12, .02, .0)))
    if below: kicker(spec['kicker'], bottom - .02)
    scene = bpy.context.scene
    scene.render.filepath = os.path.join(OUT, f'TILE_{code}.png')
    bpy.ops.render.render(write_still=True)
    print('rendered tile', code)


def intro(name, w, h, pieces):
    """The app's opening screen: the casino bursting out of a glowing centre, round a clear middle where the app draws
    its animated coin, LOOT777X and loading bar. One wide (16:9) and one tall (9:16) picture."""
    stage(w, h, 1600 if w > h else 900)
    backdrop((1, .72, .3), (.5, .08, .35), (.03, .0, .06), rays=22, ray_strength=.3, centre=(0, 0), reach=max(w, h) * .6)
    rng = random.Random(77)
    glow = GLOW((1, .85, .55), 7)
    for _ in range(140):
        r = rng.uniform(.015, .05)
        sphere((rng.uniform(-w * .6, w * .6), rng.uniform(-h * .6, h * .6), rng.uniform(-2.4, -.6)), (r, r, r), glow, 10)
    for build, loc, size, rot in pieces: group(build, loc, size, rot)
    bpy.context.scene.render.filepath = os.path.join(OUT, f'{name}.png')
    bpy.ops.render.render(write_still=True)
    print('rendered', name)


coin = lux('COIN')
gold_bars = lambda: lux_bars(GOLD())
INTROS = {
    'INTRO_WIDE': (16.0, 9.0, [
        (roulette, (-5.3, 2.0, 0), 4.2, (0, 0, 0)), (slot_machine, (5.6, 1.4, 0), 3.6, (0, 0, -10)), (cards, (-5.6, -2.6, 0), 3.4, (0, 0, 12)),
        (chips, (5.4, -2.8, .4), 2.6, (0, 0, 30)), (dice, (-2.2, -3.4, 0), 1.5, (0, 0, 20)), (gold_bars, (2.3, -3.4, 0), 1.8, (0, 0, -10)),
        (coin, (-1.8, 3.4, 0), 1.2, (0, 0, 15)), (coin, (2.2, 3.5, 0), 1.0, (0, 0, -20)), (coin, (-7.4, -.2, 0), 1.0, (0, 0, 0)), (coin, (7.5, -.6, 0), 1.1, (0, 0, 0))]),
    'INTRO_TALL': (9.0, 16.0, [
        (roulette, (-2.0, 5.6, 0), 4.0, (0, 0, 0)), (slot_machine, (2.6, 5.2, 0), 3.2, (0, 0, -10)), (cards, (-2.4, -5.0, 0), 3.4, (0, 0, 12)),
        (chips, (2.6, -5.4, .4), 2.6, (0, 0, 30)), (dice, (-3.2, 2.6, 0), 1.4, (0, 0, 20)), (gold_bars, (3.0, -2.6, 0), 1.8, (0, 0, -10)),
        (coin, (3.2, 2.7, 0), 1.1, (0, 0, -20)), (coin, (-3.3, -2.6, 0), 1.1, (0, 0, 15)), (coin, (0, 7.2, 0), 1.0, (0, 0, 0)), (coin, (0, -7.3, 0), 1.0, (0, 0, 0))]),
}



# ---------------------------------------------------------------- inside the games
# Every game is played over its own scene (BG_<CODE>, 16:9): the tile's colours and pieces, moved out to the edges
# and corners where the reels don't cover them, softly out of focus. Its name is a separate 3D logo with a clear
# background (LOGO_<CODE>), drawn above the reels in place of the typed one.
EDGES = [(-6.3, 1.9, 2.6, 8), (6.3, 1.9, 2.6, -8), (-6.5, -2.4, 2.3, -6), (6.5, -2.4, 2.3, 6), (-4.9, 3.6, 1.6, 12), (4.9, 3.6, 1.6, -12)]

def soft_glow(colour, strength):
    """A disc of light that is brightest in the middle and fades to nothing at its rim, like an out-of-focus bulb."""
    m = bpy.data.materials.new('SoftGlow'); m.use_nodes = True; m.blend_method = 'BLEND'
    nt = m.node_tree; n, l = nt.nodes, nt.links
    for node in list(n):
        if node.type != 'OUTPUT_MATERIAL': n.remove(node)
    coords = n.new('ShaderNodeTexCoord'); mapping = n.new('ShaderNodeMapping')
    mapping.inputs['Location'].default_value = (-1, -1, 0); mapping.inputs['Scale'].default_value = (2, 2, 1)
    grad = n.new('ShaderNodeTexGradient'); grad.gradient_type = 'SPHERICAL'
    l.new(coords.outputs['Generated'], mapping.inputs['Vector']); l.new(mapping.outputs['Vector'], grad.inputs['Vector'])
    soft = n.new('ShaderNodeMath'); soft.operation = 'POWER'; soft.inputs[1].default_value = 2.2; l.new(grad.outputs['Fac'], soft.inputs[0])
    emit = n.new('ShaderNodeEmission'); emit.inputs['Color'].default_value = (*colour, 1); emit.inputs['Strength'].default_value = strength
    clear = n.new('ShaderNodeBsdfTransparent'); mix = n.new('ShaderNodeMixShader')
    l.new(soft.outputs[0], mix.inputs['Fac']); l.new(clear.outputs[0], mix.inputs[1]); l.new(emit.outputs[0], mix.inputs[2])
    l.new(mix.outputs[0], n['Material Output'].inputs['Surface'])
    return m


def scene_bg(code, spec):
    w, h = 16.0, 9.0
    stage(w, h, 1600)
    scene = bpy.context.scene; scene.cycles.samples = 64
    hot, mid, edge = spec['bg']
    # Dimmer than the tile: it sits behind the reels and the buttons.
    dim = lambda c, k: tuple(v * k for v in c)
    backdrop(dim(hot, .5), dim(mid, .55), dim(edge, .7), rays=spec.get('rays', 22), ray_strength=spec.get('ray_strength', .22) * .5, centre=(0, .2), reach=9)
    rng = random.Random(len(code) * 7)
    glow = GLOW(spec.get('sparkle', (1, .85, .55)), 6)
    for _ in range(50):
        r = rng.uniform(.015, .04)
        sphere((rng.uniform(-w * .6, w * .6), rng.uniform(-h * .6, h * .6), rng.uniform(-2.4, -.6)), (r, r, r), glow, 10)
    # Casino lights far behind, out of focus: soft glows of the game's colours that fade out at their edges.
    for _ in range(16):
        r = rng.uniform(.5, 1.1); colour = (hot, mid, (1, .8, .45))[rng.randrange(3)]
        bpy.ops.mesh.primitive_circle_add(vertices=48, radius=r, fill_type='NGON', location=(rng.uniform(-w * .75, w * .75), rng.uniform(-h * .7, h * .7), -2.8))
        add(bpy.context.object, soft_glow(colour, rng.uniform(.35, .8)))
    pieces = spec['pieces']
    for i, (x, y, size, turn) in enumerate(EDGES):
        build = pieces[i % len(pieces)][0]
        group(build, (x, y, -.4), size, (0, 0, turn))
    cam = scene.camera.data
    cam.dof.use_dof = True; cam.dof.focus_distance = scene.camera.location.z - 1.5; cam.dof.aperture_fstop = 1.1
    scene.render.filepath = os.path.join(OUT, f'BG_{code}.png')
    bpy.ops.render.render(write_still=True)
    print('rendered background', code)


def scene_logo(code, spec):
    w, h = 12.0, 4.2
    stage(w, h, 1200)
    scene = bpy.context.scene; scene.render.film_transparent = True
    scene.node_tree.nodes['Glare'].mix = -.75
    name = spec['name'].replace('\n', ' ') if len(spec['name']) <= 18 else spec['name']
    top = 1.9
    if 'kicker' in spec and not spec.get('kicker_below'):
        _, bottom = kicker(spec['kicker'], top, max_w=w * .5); top = bottom - .08
    room_bottom = -1.95 + (.55 if spec.get('kicker_below') else 0)
    t_top, t_bottom = title(name, spec['font'], (top + room_bottom) / 2, w * .94, top - room_bottom, outline=spec.get('outline', (.12, .02, .0)))
    if spec.get('kicker_below'): kicker(spec['kicker'], t_bottom - .04, max_w=w * .4)
    scene.render.filepath = os.path.join(OUT, f'LOGO_{code}.png')
    bpy.ops.render.render(write_still=True)
    print('rendered logo', code)


# Money Monsoon's reel symbols (MM_<NAME>, 512px, clear background); MM picks them all.
for name, build in MONSOON.items():
    if (ONLY and f'MM_{name}' in ONLY) or 'MM' in ONLY: monsoon_symbol(name, build)

# Sheriff's Gold's reel symbols (SG_<NAME>, named by the engine's symbols: SEVEN is the hat, BADGE the prize star); SG picks them all.
for name, build in SHERIFF.items():
    if (ONLY and f'SG_{name}' in ONLY) or 'SG' in ONLY: sheriff_symbol(name, build)

# The classic trio's symbols (SS_ / DW_ / IJ_<NAME>); SS, DW or IJ picks a set.
for prefix, builds in CLASSIC_SETS.items():
    for name, build in builds.items():
        if (ONLY and f'{prefix}_{name}' in ONLY) or prefix in ONLY: reset(); build(); render(f'{prefix}_{name}')

# The fish tables' bosses (FT_<NAME>, clear background) and seabeds (FS_<CODE>, 16:9); FT / FS pick a kind.
for code, spec in FISH_TABLES.items():
    if (ONLY and spec['bossName'] in ONLY) or 'FT' in ONLY: reset(); spec['boss'](); render(spec['bossName'])
    if (ONLY and spec['seabed']['name'] in ONLY) or 'FS' in ONLY: seabed_scene(**spec['seabed'])

# Names on the command line pick what to render: a game code (its tile), BG_<CODE> / LOGO_<CODE>, or BG / LOGO /
# TILES for all of a kind. Nothing renders everything.
for code, spec in TILES.items():
    if not ONLY or code in ONLY or 'TILES' in ONLY: tile(code, spec)
    if not ONLY or f'BG_{code}' in ONLY or 'BG' in ONLY: scene_bg(code, spec)
    if not ONLY or f'LOGO_{code}' in ONLY or 'LOGO' in ONLY: scene_logo(code, spec)
for name, (w, h, pieces) in INTROS.items():
    if not ONLY or name in ONLY: intro(name, w, h, pieces)
