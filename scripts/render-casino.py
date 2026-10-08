"""
Renders Loot777x's casino art in 3D with Blender (Cycles): the lobby's game-tile centrepieces, the category icons and
the casino-floor backdrop. Modelled here and lit like the slot symbols (it reuses render-symbols.py's scene, materials
and helpers), so the whole app shares one look and all of it is our own.

    blender --background --python scripts/render-casino.py -- <out-dir> [name ...]

Then scripts/pack-casino.py trims the renders into assets/casino/.
"""
import bpy, math, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
_source = open(os.path.join(HERE, 'render-symbols.py')).read()
exec(_source[:_source.index('\nfor name, build in list(SYMBOLS')], globals())

RED = lambda: mat('ChipRed', (.55, .02, .03), rough=.25, coat=1)
BLACK = lambda: mat('Black', (.015, .015, .02), rough=.2, coat=1)
GREEN = lambda: mat('Felt', (.0, .32, .12), rough=.3, coat=.6)
WHITE = lambda: mat('White', (.92, .92, .9), rough=.25, coat=.6)
WOOD = lambda: mat('Wood', (.22, .07, .02), rough=.3, coat=1, bump=.05, bump_scale=40)
CHROME = lambda: mat('Chrome', (.95, .95, .97), metallic=1, rough=.06)
GLOW = lambda color, strength=6: mat('Glow', color, emission=color, strength=strength)


def tilted(build, rot):
    """Builds a model, then turns all of it together; unlike the symbols' version it also carries grouped parts."""
    before = set(bpy.context.scene.objects)
    build()
    pivot = bpy.data.objects.new('Pivot', None); bpy.context.scene.collection.objects.link(pivot)
    for o in set(bpy.context.scene.objects) - before - {pivot}:
        if o.type in ('MESH', 'FONT', 'EMPTY') and o.parent is None: o.parent = pivot
    pivot.rotation_euler = tuple(math.radians(a) for a in rot)


def place(o, loc=None, rot=None):
    if loc: o.location = loc
    if rot: o.rotation_euler = tuple(math.radians(a) for a in rot)
    return o


# ---------------------------------------------------------------- roulette
def roulette_parts():
    lathe([(0, .55), (.3, .52), (1.25, .2), (1.45, .32), (1.52, .1), (1.5, -.15)], WOOD(), 128, .05)
    lathe([(1.18, .26), (1.3, .3), (1.42, .34)], GOLD(), 128, .02)
    # The pocket ring: 37 wedges, green zero then red and black.
    for i in range(37):
        a0, a1 = i / 37 * 2 * math.pi, (i + .92) / 37 * 2 * math.pi
        pts = [(r * math.cos(a), r * math.sin(a)) for r, a in ((.78, a0), (1.16, a0), (1.16, a1), (.78, a1))]
        prism(pts, .06, .3, GREEN() if i == 0 else RED() if i % 2 else BLACK(), .005)
        sep = [(r * math.cos(a1), r * math.sin(a1)) for r, a in ((.78, 0), (1.16, 0))]
        sep += [(1.16 * math.cos(a1 + .02), 1.16 * math.sin(a1 + .02)), (.78 * math.cos(a1 + .02), .78 * math.sin(a1 + .02))]
        prism(sep, .1, .34, GOLD())
    lathe([(0, .62), (.25, .58), (.75, .34), (.8, .3)], GOLD(), 96, .03)
    # The turret: a spindle and four arms.
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=.07, depth=.6, location=(0, 0, .8)); add(bpy.context.object, GOLD())
    sphere((0, 0, 1.12), (.11, .11, .11), GOLD())
    for k in range(4):
        a = k * math.pi / 2
        o = place(sphere((.26 * math.cos(a), .26 * math.sin(a), .78), (.26, .035, .035), GOLD()), rot=(0, 0, math.degrees(a)))
        sphere((.5 * math.cos(a), .5 * math.sin(a), .78), (.06, .06, .06), GOLD())
    sphere((.98 * math.cos(1.1), .98 * math.sin(1.1), .42), (.085, .085, .085), WHITE())

def roulette(): tilted(roulette_parts, (-48, 0, 12))


# ---------------------------------------------------------------- chips
def chip(loc, rot, base, edge=WHITE):
    parts = []
    bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=.62, depth=.14, location=(0, 0, 0)); body = bpy.context.object
    b = body.modifiers.new('Bevel', 'BEVEL'); b.width = .02; b.segments = 3; bpy.ops.object.shade_smooth(); add(body, base()); parts.append(body)
    for k in range(8):   # the edge spots
        a = k * math.pi / 4
        bpy.ops.mesh.primitive_cube_add(size=1, location=(.6 * math.cos(a), .6 * math.sin(a), 0)); s = bpy.context.object
        s.scale = (.05, .2, .152); s.rotation_euler = (0, 0, a); add(s, edge()); parts.append(s)
    bpy.ops.mesh.primitive_torus_add(major_radius=.42, minor_radius=.018, location=(0, 0, .072)); add(bpy.context.object, GOLD()); parts.append(bpy.context.object)
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=.36, depth=.146, location=(0, 0, 0)); add(bpy.context.object, edge()); parts.append(bpy.context.object)
    t = text('7', .42, .01, .004, base(), loc=(0, -.02, .074)); parts.append(t)
    pivot = bpy.data.objects.new('Chip', None); bpy.context.scene.collection.objects.link(pivot)
    for p in parts: p.parent = pivot
    place(pivot, loc, rot)

def chips_parts():
    for x, y, n, base in ((-.75, -.1, 6, RED), (.6, -.25, 4, BLACK), (-.05, .35, 8, lambda: mat('Blue', (.02, .1, .55), rough=.25, coat=1))):
        for k in range(n): chip((x + (k % 2) * .015, y, k * .15), (0, 0, k * 17), base)
    chip((.3, -.95, .45), (68, 0, 20), lambda: mat('Purple', (.32, .02, .5), rough=.25, coat=1))

def chips(): tilted(chips_parts, (-58, 0, 8))


# ---------------------------------------------------------------- dice
def die(loc, rot, color):
    body = rounded_box((1, 1, 1), .16, mat('Die', color, rough=.08, coat=1, sss=.3))
    pips = {1: [(0, 0)], 2: [(-.25, -.25), (.25, .25)], 3: [(-.25, -.25), (0, 0), (.25, .25)], 4: [(-.25, -.25), (.25, -.25), (-.25, .25), (.25, .25)],
            5: [(-.25, -.25), (.25, -.25), (0, 0), (-.25, .25), (.25, .25)], 6: [(-.25, -.27), (-.25, 0), (-.25, .27), (.25, -.27), (.25, 0), (.25, .27)]}
    faces = [((0, 0, .5), (0, 0, 0), 1), ((0, 0, -.5), (180, 0, 0), 6), ((.5, 0, 0), (0, 90, 0), 3), ((-.5, 0, 0), (0, -90, 0), 4), ((0, .5, 0), (-90, 0, 0), 5), ((0, -.5, 0), (90, 0, 0), 2)]
    parts = [body]
    for centre, frot, n in faces:
        for px, py in pips[n]:
            o = sphere((0, 0, 0), (.085, .085, .03), WHITE(), 24)
            r = tuple(math.radians(a) for a in frot)
            import mathutils
            m = mathutils.Euler(r).to_matrix()
            o.location = mathutils.Vector(centre) * 1.0 + m @ mathutils.Vector((px, py, 0)) - m @ mathutils.Vector((0, 0, .012))
            o.rotation_euler = r; parts.append(o)
    pivot = bpy.data.objects.new('Die', None); bpy.context.scene.collection.objects.link(pivot)
    for p in parts: p.parent = pivot
    place(pivot, loc, rot)

def dice():
    die((-.62, 0, 0), (28, -18, 22), (.75, .02, .04))
    die((.68, -.15, .1), (-20, 35, -15), (.02, .12, .55))


# ---------------------------------------------------------------- cards
def card(loc, rot, label, suit_red):
    parts = [rounded_box((1.1, 1.6, .02), .012, WHITE())]
    ink = RED() if suit_red else BLACK()
    t = text(label, .34, .006, .002, ink, loc=(-.36, .56, .012)); parts.append(t)
    if suit_red: h = prism(heart_shape(.4), .01, .016, ink); h.location = (0, -.02, 0); parts.append(h)
    else:
        sp = prism([(x, -y) for x, y in heart_shape(.36)], .01, .016, ink); sp.location = (0, .08, 0); parts.append(sp)
        stem = prism([(-.06, -.28), (.06, -.28), (.14, -.42), (-.14, -.42)], .01, .016, ink); parts.append(stem)
    rounded_box((1.0, 1.5, .002), .01, mat('Edge', (.85, .7, .3), metallic=.6, rough=.3), (0, 0, -.012))
    pivot = bpy.data.objects.new('Card', None); bpy.context.scene.collection.objects.link(pivot)
    for p in parts: p.parent = pivot
    place(pivot, loc, rot)

def cards():
    for i, (label, red) in enumerate((('K', False), ('A', True), ('A', False), ('Q', True))):
        a = (i - 1.5) * 14
        card((math.sin(math.radians(a)) * .9, math.cos(math.radians(a)) * .9 - .9, i * .03), (0, 0, -a), label, red)
    chip((-.85, -1.0, .2), (60, 0, -10), RED); chip((.9, -1.05, .2), (62, 0, 15), BLACK)


# ---------------------------------------------------------------- slot machine
def slot_parts():
    red = mat('Cabinet', (.6, .02, .08), rough=.15, coat=1)
    rounded_box((1.8, 2.2, 1.0), .12, red, (0, -.2, 0))
    rounded_box((1.95, .3, 1.1), .1, CHROME(), (0, .98, 0))
    dome = lathe([(0, .5), (.4, .42), (.56, .2), (.6, 0)], mat('Dome', (.9, .15, .05), rough=.05, coat=1, emission=(1, .25, .05), strength=.9), 64, .02)
    dome.rotation_euler = (math.radians(-90), 0, 0); dome.location = (0, 1.12, 0)
    rounded_box((1.5, .8, .2), .06, mat('Glass', (.03, .03, .06), rough=.05, coat=1), (0, .15, .45))
    for k, x in enumerate((-.48, 0, .48)):
        rounded_box((.42, .68, .1), .04, WHITE(), (x, .15, .5))
        text('7', .5, .06, .01, RED(), loc=(x, .13, .57))
    rounded_box((1.5, .06, .1), .02, GLOW((1, .2, .4), 4), (0, .15, .61))
    text('JACKPOT', .26, .04, .008, GOLD(), loc=(0, .78, .52))
    rounded_box((1.6, .5, .3), .05, CHROME(), (0, -.75, .48))
    for x in (-.45, 0, .45): rounded_box((.3, .16, .1), .04, GLOW([(1, .3, .2), (1, .85, .2), (.2, 1, .5)][int((x + .45) / .45)], 3), (x, -.75, .66))
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=.05, depth=1.2, location=(1.08, .5, 0)); add(bpy.context.object, CHROME())
    sphere((1.08, 1.12, 0), (.16, .16, .16), RED())
    rounded_box((.16, .3, .3), .04, CHROME(), (1.0, -.05, 0))

def slot_machine(): tilted(slot_parts, (14, -22, 0))


# ---------------------------------------------------------------- rocket
def rocket_parts():
    """Built along Z (the lathe's axis), then stood up by rocket()'s turn."""
    body = mat('Hull', (.92, .92, .96), metallic=.25, rough=.18, coat=1)
    lathe([(0, 1.6), (.18, 1.4), (.36, 1.0), (.42, .4), (.4, -.4), (.3, -.75)], body, 96, .03)
    lathe([(.4, .58), (.44, .52), (.44, .32), (.4, .26)], RED(), 96, .02)
    lathe([(0, 1.62), (.12, 1.48), (.2, 1.36)], RED(), 64, .02)
    for k in range(3):
        f = prism([(.3, -.2), (.78, -.85), (.78, -1.0), (.3, -.7)], .05, .025, RED(), .01)
        f.rotation_euler = (math.radians(90), 0, k * 2 * math.pi / 3 + math.pi / 2)
    win = sphere((0, -.38, .78), (.15, .04, .15), mat('Window', (.2, .7, 1), rough=.05, coat=1, emission=(.2, .6, 1), strength=.8))
    bpy.ops.mesh.primitive_torus_add(major_radius=.15, minor_radius=.025, location=(0, -.4, .78)); o = bpy.context.object
    o.rotation_euler = (math.radians(90), 0, 0); add(o, GOLD())
    bpy.ops.mesh.primitive_cone_add(vertices=32, radius1=.27, radius2=0, depth=1.0, location=(0, 0, -1.25)); c = bpy.context.object
    c.rotation_euler = (math.radians(180), 0, 0); bpy.ops.object.shade_smooth(); add(c, mat('Flame', (1, .5, .1), emission=(1, .45, .08), strength=10))
    bpy.ops.mesh.primitive_cone_add(vertices=32, radius1=.15, radius2=0, depth=.6, location=(0, 0, -1.05)); c = bpy.context.object
    c.rotation_euler = (math.radians(180), 0, 0); add(c, GLOW((1, .95, .7), 16))
    for i in range(7): sphere((.1 * math.sin(i * 2.1), -.1, -1.9 - i * .22), (.08 + i * .02,) * 3, mat('Smoke', (.5, .45, .6), rough=.9), 16)

def rocket(): tilted(rocket_parts, (-90, 0, -35))


# ---------------------------------------------------------------- keno balls
def ball(loc, n, color):
    sphere(loc, (.5, .5, .5), mat('Ball', color, rough=.08, coat=1), 64)
    disc = sphere((loc[0], loc[1], loc[2] + .43), (.24, .24, .08), WHITE(), 32)
    text(str(n), .26 if n < 10 else .2, .01, .003, BLACK(), loc=(loc[0], loc[1] - .01, loc[2] + .5))

def keno():
    for (x, y, z), n, col in (((-.55, -.25, 0), 7, (.85, .05, .35)), ((.5, -.3, .05), 21, (.05, .45, .95)), ((0, .45, -.1), 77, (1, .7, .05)),
                              ((-.95, .5, -.3), 3, (.1, .8, .4)), ((.95, .45, -.3), 49, (.55, .1, .9))):
        ball((x, y, z), n, col)
    for i in range(10): sphere((-1.3 + i * .29, -.95 - (i % 3) * .05, -.4), (.035, .035, .035), GLOW((.4, .9, 1), 8), 12)


# ---------------------------------------------------------------- scratch ticket
def scratch():
    rounded_box((2.2, 1.4, .03), .03, mat('Ticket', (.05, .2, .65), rough=.3, coat=.5))
    rounded_box((2.1, 1.3, .01), .02, GOLD(), (0, 0, -.012))
    text('SCRATCH & WIN', .2, .01, .003, GOLD(), loc=(0, .5, .02))
    silver = mat('Latex', (.75, .75, .78), metallic=.8, rough=.45, bump=.15, bump_scale=120)
    for i in range(6):
        x, y = -.62 + (i % 3) * .62, .08 - (i // 3) * .48
        rounded_box((.52, .38, .02), .03, silver if i not in (1, 4) else WHITE(), (x, y, .025))
        if i in (1, 4): text('$', .3, .02, .004, GOLD(), loc=(x, y - .02, .04))
    lux_coin_at((.95, -.75, .35), (60, 0, -25))

def lux_coin_at(loc, rot):
    before = set(bpy.context.scene.objects)
    bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=.4, depth=.07, location=(0, 0, 0)); coin = bpy.context.object
    b = coin.modifiers.new('Bevel', 'BEVEL'); b.width = .015; b.segments = 3; bpy.ops.object.shade_smooth(); add(coin, GOLD())
    text('$', .45, .02, .006, GOLD(), loc=(0, -.01, .04))
    pivot = bpy.data.objects.new('Coin', None); bpy.context.scene.collection.objects.link(pivot)
    for o in set(bpy.context.scene.objects) - before - {pivot}: o.parent = pivot
    place(pivot, loc, rot)


# ---------------------------------------------------------------- coin pile
def coins():
    import random
    rng = random.Random(7)
    for i in range(34):
        r = rng.random() ** .6 * 1.25; a = rng.random() * 2 * math.pi
        z = (1.25 - r) * .55 + rng.random() * .1
        lux_coin_at((r * math.cos(a), r * math.sin(a) * .7, z), (rng.uniform(-50, 50), rng.uniform(-50, 50), rng.uniform(0, 360)))
    gem = mat('Ruby', (1, .05, .2), rough=0); gp = gem.node_tree.nodes['Principled BSDF']; gp.inputs['Transmission Weight'].default_value = 1; gp.inputs['IOR'].default_value = 1.8
    for (x, y, z), g in (((-.3, .1, .75), gem), ((.45, -.2, .6), mat('Emerald', (.05, .9, .4), rough=0))):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=.2, location=(x, y, z)); add(bpy.context.object, g)


# ---------------------------------------------------------------- fish (the fish table)
def fish_parts():
    skin = mat('Koi', (1, .35, .05), rough=.2, coat=1, sss=.2)
    sphere((0, 0, 0), (1.0, .55, .42), skin, 64)
    sphere((.25, .18, .32), (.35, .22, .12), WHITE(), 32)
    sphere((-.3, -.05, .36), (.25, .2, .1), WHITE(), 32)
    prism([(-.85, 0), (-1.6, .7), (-1.4, 0), (-1.6, -.7)], .06, .03, mat('Fin', (1, .55, .15), rough=.2, coat=.5, sss=.4), .02)
    prism([(-.1, .45), (.35, .45), (-.35, .95)], .05, .025, mat('Fin2', (1, .6, .2), rough=.2, sss=.4), .02)
    sphere((.68, .14, .2), (.1, .1, .08), BLACK(), 24); sphere((.7, .17, .27), (.03, .03, .02), WHITE(), 12)
    for i in range(5): sphere((1.15 + i * .18, .35 + i * .22, .1), (.05 + i * .015,) * 3, mat('Bubble', (.7, .9, 1), rough=0, coat=1), 16)

def fish(): tilted(fish_parts, (-15, -20, 8))


# ---------------------------------------------------------------- heart, crown
def heart():
    h = prism(heart_shape(1.0), .45, .22, mat('HeartRed', (.9, .02, .2), rough=.1, coat=1, sss=.2), .18)

def crown_parts():
    lathe([(.9, -.4), (.95, -.3), (.95, .1), (.9, .15)], GOLD(), 96, .04)
    for k in range(5):
        a = k * 2 * math.pi / 5
        spike = prism([(-.22, 0), (.22, 0), (0, .75)], .05, .025, GOLD(), .01)
        spike.rotation_euler = (math.radians(90), 0, a + math.pi / 2); spike.location = (.92 * math.cos(a), .92 * math.sin(a), .12)
        sphere((.92 * math.cos(a), .92 * math.sin(a), .9), (.09, .09, .09), GOLD())
        g = sphere((.97 * math.cos(a), .97 * math.sin(a), -.12), (.1, .06, .1), mat('Gem', [(1, .05, .2), (.1, .4, 1), (.05, .9, .4)][k % 3], rough=0, coat=1), 24)

def crown(): tilted(crown_parts, (-70, 0, 0))


# ---------------------------------------------------------------- the casino floor (wide backdrop)
def floor_scene():
    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y = 1600, 720
    scene.render.film_transparent = False
    cam = scene.camera
    cam.location = (0, -9, 2.2); cam.rotation_euler = (math.radians(84), 0, 0); cam.data.lens = 26
    cam.data.dof.use_dof = True; cam.data.dof.focus_distance = 2.5; cam.data.dof.aperture_fstop = .55
    bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 10, 0)); add(bpy.context.object, mat('Carpet', (.3, .015, .07), rough=.45, coat=.3, bump=.2, bump_scale=8))
    bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 10, 6)); add(bpy.context.object, mat('Ceiling', (.02, .01, .03), rough=.8))
    import random
    rng = random.Random(3)
    colors = [(1, .2, .6), (.2, .7, 1), (1, .75, .2), (.6, .2, 1), (.2, 1, .6)]
    for row, y in enumerate((2, 5, 9, 14, 20)):
        for x in range(-14, 15, 2):
            if abs(x) < 2 and row < 2: continue
            col = colors[rng.randrange(len(colors))]
            rounded_box((1.4, 1.0, 2.2), .1, mat('Cab', (.03, .02, .05), rough=.3, coat=1), (x + rng.uniform(-.2, .2), y, 1.1))
            rounded_box((1.1, .05, .8), .03, GLOW(col, 1.4), (x, y - .52, 1.45))
            for k in range(6): sphere((x - .55 + k * .22, y - .55, 2.3), (.06, .06, .06), GLOW((1, .8, .45), 4), 12)
    for x in range(-16, 17, 4):
        for y in (3, 8, 14, 21):
            sphere((x + 2 * (y % 2), y, 5.5), (.5, .5, .25), GLOW((1, .62, .25), 1.6), 24)
            for k in range(8):
                a = k * math.pi / 4
                sphere((x + 2 * (y % 2) + .7 * math.cos(a), y + .7 * math.sin(a) * .5, 5.2), (.08, .08, .08), GLOW((1, .75, .4), 5), 12)
    bpy.context.scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .05
    scene.cycles.samples = 96
    scene.render.filepath = os.path.join(OUT, 'CA_FLOOR.png')
    bpy.ops.render.render(write_still=True)
    print('rendered CA_FLOOR')


CASINO = {'ROULETTE': roulette, 'CHIPS': chips, 'DICE': dice, 'CARDS': cards, 'SLOT': slot_machine, 'ROCKET': rocket,
          'KENO': keno, 'SCRATCH': scratch, 'COINS': coins, 'FISH': fish, 'HEART': heart, 'CROWN': crown}
for name, build in CASINO.items():
    if ONLY and f'CA_{name}' not in ONLY: continue
    reset(); build(); render(f'CA_{name}')
if not ONLY or 'CA_FLOOR' in ONLY:
    reset(); floor_scene()
