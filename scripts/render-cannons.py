"""
Renders each fish table's cannon in 3D with Blender (Cycles), seen from straight above like the creatures: a turret in
three tiers (the game shows a grander one as the bet rises) and the seat it turns on. All modelled here.

    blender --background --python scripts/render-cannons.py -- <out-dir> [TABLE ...]

Writes <out-dir>/CANNON_<TABLE>_<tier>.png (512x512, the pivot in the middle, the barrel pointing right) and
SEAT_<TABLE>.png (900x340, the pivot at the top middle); scripts/pack-fish.py packs them.
"""
import bpy, math, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
_symbols = open(os.path.join(HERE, 'render-symbols.py')).read()
exec(_symbols[:_symbols.index('\n# ---------------------------------------------------------------- symbols')], globals())
ARGS_KEEP = ARGS
_fish = open(os.path.join(HERE, 'render-fish.py')).read()
exec(_fish[_fish.index('FRAMES = 8'):_fish.index('# ---------------------------------------------------------------- the casts')], globals())
exec(_fish[_fish.index('def C(*rgb):'):_fish.index('def spikes(')], globals())

TURRET = 5.2   # the turret frame's width in render units: the pivot at its middle, the barrel reaching x = 2.4


def barrel(y, length, radius, metal, band, muzzle, flare=1.5):
    """One barrel along +x from the hub: a tapering tube with bands, flaring at the mouth."""
    loft([(0, y), (length * .5, y), (length * .9, y), (length, y)], [radius, radius * .9, radius * .85, radius * flare], [radius, radius * .9, radius * .85, radius * flare], metal(), ring=28, caps=(True, True))
    for x in (length * .3, length * .62):
        loft([(x - .05, y), (x + .05, y)], [radius * 1.18] * 2, [radius * 1.18] * 2, band(), ring=28)
    sphere((length + .02, y, radius * .4), (radius * .9, radius * .9 * flare / 1.5, .05), muzzle(), 24)

def hub(radius, metal, ring_mat, gem):
    sphere((0, 0, .0), (radius, radius, radius * .45), metal(), 64)
    bpy.ops.mesh.primitive_torus_add(major_radius=radius * .92, minor_radius=radius * .1, major_segments=64, location=(0, 0, radius * .25)); add(bpy.context.object, ring_mat())
    sphere((0, 0, radius * .42), (radius * .38, radius * .38, radius * .22), gem(), 48)

def dragon_cannon(tier):
    gold = lambda: mat('Gold', (1, .74, .28), metallic=1, rough=.18)
    red = lambda: mat('Lacquer', C(170, 20, 20), rough=.25, coat=1)
    jade = lambda: glossy(C(40, 200, 120), .05, (C(60, 255, 150), .6 + tier * .6))
    glow = lambda: mat('Muzzle', (1, .5, .1), emission=(1, .45, .1), strength=4 + tier * 3)
    ys = {0: [0], 1: [-.3, .3], 2: [-.44, 0, .44]}[tier]; rad = {0: .34, 1: .27, 2: .23}[tier]
    for y in ys: barrel(y, 2.4 if y == 0 else 2.15, rad, red, gold, glow)
    # A dragon's head over the barrels: horns sweeping back, a gold crest.
    for k in (-1, 1):
        horn = loft([(.45, k * .45), (.0, k * .8), (-.55, k * 1.05), (-1.0, k * .95)], [.13, .1, .07, .02], [.11, .09, .06, .02], gold(), ring=14); horn.location.z = .45
        if tier: flat([(.2, k * .6), (-.6, k * (1.15 + tier * .1)), (-.3, k * .7)], mat('Fin', C(255, 160, 40), rough=.3, emission=(1, .5, .1), strength=.6), z=.1)
    hub(.85, red, gold, jade)

def kraken_cannon(tier):
    dark = lambda: mat('DarkMetal', C(45, 30, 70), metallic=.8, rough=.3)
    band = lambda: mat('Rune', C(180, 90, 255), emission=C(170, 80, 255), strength=3 + tier * 2)
    glow = lambda: mat('Muzzle', C(80, 240, 255), emission=C(80, 240, 255), strength=5 + tier * 3)
    flesh = lambda: skin('Tentacle', [(0, C(160, 60, 120)), (1, C(90, 20, 70))], top=True, rough=.3, coat=.6)
    ys = {0: [0], 1: [-.3, .3], 2: [-.44, 0, .44]}[tier]; rad = {0: .34, 1: .27, 2: .23}[tier]
    for y in ys: barrel(y, 2.4 if y == 0 else 2.15, rad, dark, band, glow)
    # Tentacles coil round the hub and along the barrels.
    for i in range(3 + tier * 2):
        a0 = i / (3 + tier * 2) * math.tau
        pts = [(math.cos(a0 + t * 2.4) * (.95 + t * .5), math.sin(a0 + t * 2.4) * (.95 + t * .5)) for t in [j / 11 for j in range(12)]]
        loft(pts, [.12 * (1 - j / 13) for j in range(12)], [.1 * (1 - j / 13) for j in range(12)], flesh(), ring=14)
    hub(.85, dark, band, lambda: glossy(C(255, 120, 40), .05, (C(255, 100, 20), 2 + tier)))

def shark_cannon(tier):
    steel = lambda: mat('Steel', C(200, 210, 220), metallic=1, rough=.15)
    blue = lambda: mat('Paint', C(20, 90, 200), rough=.25, coat=1)
    glow = lambda: mat('Muzzle', C(120, 230, 255), emission=C(120, 230, 255), strength=4 + tier * 3)
    ys = {0: [0], 1: [-.3, .3], 2: [-.44, 0, .44]}[tier]; rad = {0: .34, 1: .27, 2: .23}[tier]
    for y in ys: barrel(y, 2.4 if y == 0 else 2.15, rad, steel, blue, glow, flare=1.3)
    # A shark's dorsal fin on the turret, and a jaw of teeth round the muzzles.
    flat([(-.9, 0), (-.1, .08), (.5, 0), (-.1, -.08)], blue(), z=.55, depth=.06)
    for y in ys:
        x = (2.4 if y == 0 else 2.15) + .02
        for j in range(8):
            a = j / 8 * math.tau; cone((x, y + math.cos(a) * rad * 1.1, .2 + math.sin(a) * .1), (x + .16, y + math.cos(a) * rad * .6, .2 + math.sin(a) * .05), .05, mat('Tooth', (.95, .95, .92), rough=.2, coat=1))
    if tier == 2:
        for k in (-1, 1): flat([(.2, k * .9), (-.6, k * 1.25), (-.3, k * .85)], blue(), z=.1)
    hub(.85, blue, steel, lambda: glossy(C(255, 200, 40), .05, (C(255, 180, 20), 1 + tier)))

def seat(table):
    """The seat the cannon turns on: a half-round platform along the bottom edge, in the table's style."""
    if table == 'DRAGON_TIDE':
        top, rim, deco = mat('Lacquer', C(120, 15, 15), rough=.3, coat=1), mat('Gold', (1, .74, .28), metallic=1, rough=.2), glossy(C(40, 200, 120), .05, (C(60, 255, 150), .8))
    elif table == 'KRAKENS_DEEP':
        top, rim, deco = mat('Stone', C(40, 30, 60), rough=.7, bump=.5, bump_scale=20), mat('Rune', C(170, 80, 255), emission=C(170, 80, 255), strength=3), glossy(C(80, 240, 255), .05, (C(80, 240, 255), 3))
    else:
        top, rim, deco = mat('Deck', C(70, 85, 100), metallic=.7, rough=.35), mat('Steel', C(210, 215, 220), metallic=1, rough=.15), glossy(C(255, 200, 40), .1, (C(255, 180, 20), .6))
    n = 48; outer = [(math.cos(math.pi * i / (n - 1)) * 3.6, -math.sin(math.pi * i / (n - 1)) * 1.6) for i in range(n)]
    flat(outer, top, z=.1, depth=.25, smooth=False)
    tube([(x, y, .24) for x, y in outer], .09, rim)
    tube([(-3.6, 0, .24), (3.6, 0, .24)], .09, rim)
    inner = [(math.cos(math.pi * i / (n - 1)) * 1.4, -math.sin(math.pi * i / (n - 1)) * 1.15) for i in range(n)]
    tube([(x, y, .26) for x, y in inner], .06, rim)
    for i in range(7):
        a = math.pi * (i + .5) / 7; sphere((math.cos(a) * 2.55, -math.sin(a) * 1.25, .3), (.13, .13, .07), deco, 24)

BUILDERS = {'DRAGON_TIDE': dragon_cannon, 'KRAKENS_DEEP': kraken_cannon, 'SHARK_FRENZY': shark_cannon}
for table, build_cannon in BUILDERS.items():
    if ARGS_KEEP[1:] and table not in ARGS_KEEP[1:]: continue
    for tier in range(3):
        stage((TURRET, TURRET), 512, RIMS[table]); build_cannon(tier)
        bpy.context.scene.render.filepath = os.path.join(OUT, f'CANNON_{table}_{tier}.png'); bpy.ops.render.render(write_still=True)
        print('rendered cannon', table, tier)
    # The seat's frame: 7.6 wide, from its top edge (the pivot, y = 0) down to y = -1.9, so it is centred on y = -.95.
    stage((7.6, 2.0), 900, RIMS[table]); seat(table)
    for o in bpy.context.scene.objects:
        if o.type in ('MESH', 'CURVE'): o.location.y += .95
    bpy.context.scene.render.filepath = os.path.join(OUT, f'SEAT_{table}.png'); bpy.ops.render.render(write_still=True)
    print('rendered seat', table)
