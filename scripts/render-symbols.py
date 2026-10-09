"""
Renders Loot777x's slot symbols in 3D with Blender (Cycles), so the art is our own: modelled here, lit here.

    blender --background --python scripts/render-symbols.py -- <out-dir> [symbol ...]

Each symbol is built from primitives and text in code, given physically based materials (polished gold, candy
gloss, fruit skin), lit by a studio environment with a warm key and magenta/amber casino rim lights, and rendered
with a transparent background. scripts/pack-symbols.py lays the renders out into the atlases the games draw from.
"""
import bpy, bmesh, math, os, sys
from mathutils import Vector

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = os.path.abspath(ARGS[0] if ARGS else 'renders')
ONLY = set(ARGS[1:])
os.makedirs(OUT, exist_ok=True)
FONT = '/System/Library/Fonts/Supplemental/Arial Black.ttf'
WORLD = os.path.join(bpy.utils.resource_path('LOCAL'), 'datafiles', 'studiolights', 'world', 'studio.exr')
SIZE = 512


# ---------------------------------------------------------------- scene
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    try:
        prefs.compute_device_type = 'METAL'; prefs.get_devices()
        for d in prefs.devices: d.use = True
        scene.cycles.device = 'GPU'
    except Exception:
        pass
    scene.cycles.samples = 160
    scene.cycles.use_denoising = True
    scene.render.film_transparent = True
    scene.render.resolution_x = scene.render.resolution_y = SIZE
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'Medium High Contrast'
    world = bpy.data.worlds.new('World'); scene.world = world; world.use_nodes = True
    nodes, links = world.node_tree.nodes, world.node_tree.links
    env = nodes.new('ShaderNodeTexEnvironment'); env.image = bpy.data.images.load(WORLD)
    # Seen directly or lighting diffuse surfaces the studio is dim; seen in a reflection it is bright, so metals gleam.
    bg = nodes['Background']; links.new(env.outputs['Color'], bg.inputs['Color']); bg.inputs['Strength'].default_value = .55
    # What the metal sees: the studio, warmed like a casino ceiling of lights, so gold reads as gold.
    warm = nodes.new('ShaderNodeMix'); warm.data_type = 'RGBA'; warm.blend_type = 'MULTIPLY'; warm.inputs['Factor'].default_value = 1
    links.new(env.outputs['Color'], warm.inputs[6]); warm.inputs[7].default_value = (1.35, 1.05, .7, 1)
    shiny = nodes.new('ShaderNodeBackground'); links.new(warm.outputs[2], shiny.inputs['Color']); shiny.inputs['Strength'].default_value = 4.5
    path = nodes.new('ShaderNodeLightPath'); mix = nodes.new('ShaderNodeMixShader')
    links.new(path.outputs['Is Glossy Ray'], mix.inputs['Fac']); links.new(bg.outputs['Background'], mix.inputs[1]); links.new(shiny.outputs['Background'], mix.inputs[2])
    links.new(mix.outputs['Shader'], nodes['World Output'].inputs['Surface'])
    # Camera above, tilted a little so the bevels and thickness read as 3D.
    cam = bpy.data.objects.new('Camera', bpy.data.cameras.new('Camera')); scene.collection.objects.link(cam); scene.camera = cam
    cam.location = (0, -1.45, 8); cam.rotation_euler = (math.radians(10), 0, 0); cam.data.lens = 112
    light('Key', (3, -4, 7), 520, (1, .95, .88), 2.2)
    light('Fill', (-4, -2, 5), 160, (.9, .95, 1), 3)
    light('RimPink', (-3.5, 3, 2), 700, (1, .25, .7), 1.6)
    light('RimAmber', (3.5, 3, 2), 650, (1, .62, .25), 1.6)


def light(name, loc, power, color, size):
    data = bpy.data.lights.new(name, 'AREA'); data.energy = power; data.color = color; data.size = size; data.shape = 'DISK'
    obj = bpy.data.objects.new(name, data); bpy.context.scene.collection.objects.link(obj); obj.location = loc
    direction = Vector((0, 0, 0)) - Vector(loc); obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()


# ---------------------------------------------------------------- materials
def mat(name, color, metallic=0., rough=.3, coat=0., sss=0., emission=None, strength=0., bump=0., bump_scale=60.):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; p = nt.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*color, 1); p.inputs['Metallic'].default_value = metallic
    p.inputs['Roughness'].default_value = rough; p.inputs['Coat Weight'].default_value = coat
    if sss:
        p.inputs['Subsurface Weight'].default_value = sss; p.inputs['Subsurface Radius'].default_value = (1, .3, .2)
    if emission:
        p.inputs['Emission Color'].default_value = (*emission, 1); p.inputs['Emission Strength'].default_value = strength
    if bump:
        tex = nt.nodes.new('ShaderNodeTexNoise'); tex.inputs['Scale'].default_value = bump_scale; tex.inputs['Detail'].default_value = 4
        b = nt.nodes.new('ShaderNodeBump'); b.inputs['Strength'].default_value = bump
        nt.links.new(tex.outputs['Fac'], b.inputs['Height']); nt.links.new(b.outputs['Normal'], p.inputs['Normal'])
    return m

GOLD = lambda: mat('Gold', (1, .76, .3), metallic=1, rough=.14)
DARK_GOLD = lambda: mat('DarkGold', (.9, .55, .15), metallic=1, rough=.2)
CANDY_RED = lambda: mat('CandyRed', (.5, .0, .012), rough=.06, coat=1, sss=.1)
LEAF = lambda: mat('Leaf', (.02, .2, .02), rough=.3, coat=.6, bump=.1, bump_scale=20)
STEM = lambda: mat('Stem', (.12, .09, .02), rough=.5)


# ---------------------------------------------------------------- helpers
def add(obj, material=None):
    if material:
        obj.data.materials.clear(); obj.data.materials.append(material)
    return obj

def smooth(obj, levels=2):
    obj.modifiers.new('Sub', 'SUBSURF').levels = levels; obj.modifiers['Sub'].render_levels = levels
    for poly in obj.data.polygons: poly.use_smooth = True
    return obj

def sphere(loc, scale, material, segments=48):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=segments // 2, location=loc)
    o = bpy.context.object; o.scale = scale; bpy.ops.object.shade_smooth(); return add(o, material)

def text(body, size, extrude, bevel, material, offset=0., loc=(0, 0, 0)):
    data = bpy.data.curves.new('Text', 'FONT'); data.body = body; data.font = bpy.data.fonts.load(FONT)
    data.size = size; data.extrude = extrude; data.bevel_depth = bevel; data.bevel_resolution = 5; data.offset = offset
    data.align_x = 'CENTER'; data.align_y = 'CENTER'
    o = bpy.data.objects.new('Text', data); bpy.context.scene.collection.objects.link(o); o.location = loc
    return add(o, material)

def tube(points, radius, material):
    data = bpy.data.curves.new('Tube', 'CURVE'); data.dimensions = '3D'; data.bevel_depth = radius; data.bevel_resolution = 6
    spline = data.splines.new('BEZIER'); spline.bezier_points.add(len(points) - 1)
    for bp, p in zip(spline.bezier_points, points): bp.co = p; bp.handle_left_type = bp.handle_right_type = 'AUTO'
    o = bpy.data.objects.new('Tube', data); bpy.context.scene.collection.objects.link(o); return add(o, material)

def leaf(loc, angle, length=.6):
    o = sphere(loc, (length, length * .38, .05), LEAF(), 32); o.rotation_euler = (math.radians(20), 0, math.radians(angle)); return o

def lathe(profile, material, steps=96, thickness=.04):
    mesh = bpy.data.meshes.new('Lathe'); mesh.from_pydata([(r, 0, z) for r, z in profile], [(i, i + 1) for i in range(len(profile) - 1)], [])
    o = bpy.data.objects.new('Lathe', mesh); bpy.context.scene.collection.objects.link(o)
    screw = o.modifiers.new('Screw', 'SCREW'); screw.steps = screw.render_steps = steps; screw.use_smooth_shade = True
    o.modifiers.new('Solid', 'SOLIDIFY').thickness = thickness
    smooth(o, 2); return add(o, material)

def prism(points2d, depth, z, material, bevel=.0):
    """A flat shape (in XY) extruded to {depth}, front face at z."""
    bm = bmesh.new()
    verts = [bm.verts.new((x, y, z)) for x, y in points2d]
    face = bm.faces.new(verts)
    ext = bmesh.ops.extrude_face_region(bm, geom=[face])
    for v in [e for e in ext['geom'] if isinstance(e, bmesh.types.BMVert)]: v.co.z -= depth
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new('Prism'); bm.to_mesh(mesh); bm.free()
    o = bpy.data.objects.new('Prism', mesh); bpy.context.scene.collection.objects.link(o)
    if bevel:
        b = o.modifiers.new('Bevel', 'BEVEL'); b.width = bevel; b.segments = 5; b.limit_method = 'ANGLE'
    return add(o, material)

def rounded_box(size, radius, material, loc=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=loc); o = bpy.context.object; o.scale = (size[0] / 2, size[1] / 2, size[2] / 2)
    bpy.ops.object.transform_apply(scale=True)
    b = o.modifiers.new('Bevel', 'BEVEL'); b.width = radius; b.segments = 8
    bpy.ops.object.shade_smooth(); return add(o, material)

def frame_all(target=2.2):
    """Scale and centre everything so the symbol fills the frame the same way every time."""
    bpy.context.view_layer.update()
    objs = [o for o in bpy.context.scene.objects if o.type in ('MESH', 'CURVE', 'FONT')]
    lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
    deps = bpy.context.evaluated_depsgraph_get()
    for o in objs:
        ev = o.evaluated_get(deps)
        try: mesh = ev.to_mesh()
        except RuntimeError: continue
        for v in mesh.vertices:
            w = o.matrix_world @ v.co; lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
        ev.to_mesh_clear()
    span = max(hi.x - lo.x, hi.y - lo.y); centre = (lo + hi) / 2
    pivot = bpy.data.objects.new('Pivot', None); bpy.context.scene.collection.objects.link(pivot)
    for o in objs + [e for e in bpy.context.scene.objects if e.type == 'EMPTY' and e is not pivot]:
        if o.parent is None: o.parent = pivot
    pivot.location = (-centre.x * target / span, -centre.y * target / span, 0); pivot.scale = (target / span,) * 3


def render(name):
    frame_all()
    bpy.context.scene.render.filepath = os.path.join(OUT, f'{name}.png')
    bpy.ops.render.render(write_still=True)
    print('rendered', name)


# ---------------------------------------------------------------- symbols
def seven():
    text('7', 2.6, .16, .05, CANDY_RED(), loc=(0, 0, .05))
    text('7', 2.6, .1, .04, GOLD(), offset=.13, loc=(0, 0, -.1))

def bar():
    rounded_box((2.5, 1.45, .3), .14, GOLD(), loc=(0, 0, -.06))
    rounded_box((2.28, 1.23, .3), .12, mat('Enamel', (.005, .005, .01), rough=.1, coat=1), loc=(0, 0, .02))
    text('BAR', 1.0, .09, .025, mat('BarGold', (1, .76, .3), metallic=1, rough=.14, emission=(1, .62, .18), strength=.35), loc=(0, -.03, .18))

def cherry():
    red = mat('Cherry', (.4, .0, .015), rough=.07, coat=1, sss=.15)
    for loc in ((-.55, -.45, 0), (.5, -.62, .05)): sphere(loc, (.62, .6, .55), red)
    tube([(-.55, .05, .3), (-.3, .7, .35), (.1, 1.15, .3)], .045, STEM())
    tube([(.5, -.1, .35), (.4, .6, .4), (.1, 1.15, .3)], .045, STEM())
    leaf((.55, 1.05, .35), 25, .55)

def lemon():
    peel = mat('Lemon', (.95, .62, .0), rough=.4, coat=.3, bump=.25, bump_scale=90)
    sphere((0, 0, 0), (1.05, .72, .7), peel)
    for x in (-1.0, 1.0): sphere((x, 0, 0), (.22, .13, .13), peel, 24)
    leaf((.25, .78, .3), 30, .5)

def bell():
    lathe([(.12, 1.05), (.32, .95), (.5, .6), (.58, .1), (.72, -.35), (.98, -.62), (1.02, -.72)], GOLD(), thickness=.06)
    sphere((0, -.82, 0), (.2, .2, .2), DARK_GOLD())
    bpy.ops.mesh.primitive_torus_add(location=(0, 1.15, 0), major_radius=.18, minor_radius=.05, rotation=(math.radians(90), 0, 0))
    add(bpy.context.object, GOLD()); bpy.ops.object.shade_smooth()
    # The bell stands upright facing the camera: its axis along Y.
    for o in bpy.context.scene.objects:
        if o.name.startswith('Lathe'): o.rotation_euler = (math.radians(-90), 0, 0)

def grape():
    skin = mat('Grape', (.12, .0, .22), rough=.14, coat=.8, sss=.2)
    rows = [4, 3, 4, 3, 2, 1]
    for r, n in enumerate(rows):
        for i in range(n):
            x = (i - (n - 1) / 2) * .5; y = .75 - r * .4
            sphere((x, y, .08 * (r % 2)), (.29, .29, .27), skin, 32)
    tube([(0, .9, .1), (.05, 1.25, .2), (-.1, 1.4, .1)], .05, STEM())
    leaf((.45, 1.15, .3), 35, .55)

def orange():
    peel = mat('Orange', (.9, .18, .0), rough=.45, coat=.2, bump=.35, bump_scale=110)
    sphere((0, 0, 0), (.95, .95, .9), peel, 64)
    sphere((0, .9, .2), (.09, .09, .06), STEM(), 16)
    leaf((.35, 1.0, .35), 30, .5)

def watermelon():
    pts = lambda r: [(r * math.cos(math.pi + t * math.pi / 32), r * math.sin(math.pi + t * math.pi / 32)) for t in range(33)]
    shift = lambda ps: [(x, y + .45) for x, y in ps]
    prism(shift(pts(1.25)), .3, .0, mat('Rind', (.01, .16, .02), rough=.3, coat=.6), .03)
    prism(shift(pts(1.13)), .3, .06, mat('Pith', (.85, .95, .75), rough=.4, sss=.2), .02)
    prism(shift(pts(1.03)), .3, .12, mat('Flesh', (.75, .01, .04), rough=.35, coat=.3, sss=.35, bump=.15, bump_scale=40), .03)
    seed = mat('Seed', (.01, .01, .01), rough=.1, coat=1)
    for x, y in ((-.55, .1), (-.2, -.15), (.2, -.15), (.55, .1), (0, -.45), (-.35, -.4), (.35, -.4)):
        o = sphere((x, y, .14), (.07, .11, .04), seed, 16); o.rotation_euler = (0, 0, math.atan2(y - .45, x))

def star():
    """A faceted gold star: ten points round a raised centre, front and back."""
    bm = bmesh.new()
    ring = [bm.verts.new(((1.15 if i % 2 == 0 else .5) * math.sin(i * math.pi / 5), (1.15 if i % 2 == 0 else .5) * math.cos(i * math.pi / 5), 0)) for i in range(10)]
    front, back = bm.verts.new((0, 0, .38)), bm.verts.new((0, 0, -.38))
    for i in range(10):
        a, b = ring[i], ring[(i + 1) % 10]; bm.faces.new((front, a, b)); bm.faces.new((back, b, a))
    mesh = bpy.data.meshes.new('Star'); bm.to_mesh(mesh); bm.free()
    o = bpy.data.objects.new('Star', mesh); bpy.context.scene.collection.objects.link(o)
    bev = o.modifiers.new('Bevel', 'BEVEL'); bev.width = .025; bev.segments = 3
    add(o, mat('StarGold', (1, .78, .25), metallic=1, rough=.1))
    o.rotation_euler = (0, 0, math.radians(0))

# ---------------------------------------------------------------- Devil Heart
RUBY = lambda: mat('Ruby', (.45, .0, .02), rough=.05, coat=1, sss=.2)
FLAME = lambda: mat('Flame', (1, .25, 0), rough=.4, emission=(1, .16, .0), strength=1.4)
FLAME_MID = lambda: mat('FlameMid', (1, .5, 0), rough=.4, emission=(1, .38, .0), strength=1.7)
FLAME_CORE = lambda: mat('FlameCore', (1, .8, .2), rough=.4, emission=(1, .7, .15), strength=2.0)

def flame_shape(w, h, lean=0., licks=1):
    """A tongue of fire: a round base narrowing to a curling point."""
    pts = []
    for i in range(48):
        t = i / 47
        y = -h * .25 + h * 1.25 * (1 - math.cos(math.pi * t)) / 2 if t <= 1 else 0
        pts.append(t)
    out = []
    for side in (1, -1):
        for i in range(32):
            u = i / 31 if side == 1 else 1 - i / 31
            y = -h * .3 + u * h * 1.3
            width = w * math.sin(math.pi * min(1, (u + .15) / 1.0)) * (1 - u) ** .6
            wave = .12 * w * math.sin(u * math.pi * 3 * licks)
            out.append((side * width + wave + lean * u * u * h, y))
    return out

def devil_seven():
    # Tongues of fire rising from behind the 7: outer red-orange, then orange, then a hot yellow core.
    for x, s, lean in ((-.75, .62, -.35), (-.2, .82, -.1), (.35, .92, .12), (.85, .66, .35)):
        prism([(px + x, py + .55 * s) for px, py in flame_shape(.36 * s, 1.35 * s, lean)], .08, -.3, FLAME(), .02)
        prism([(px + x, py + .5 * s) for px, py in flame_shape(.24 * s, 1.0 * s, lean)], .08, -.22, FLAME_MID(), .02)
        prism([(px + x, py + .45 * s) for px, py in flame_shape(.12 * s, .6 * s, lean)], .08, -.14, FLAME_CORE(), .015)
    text('7', 2.6, .17, .05, RUBY(), loc=(0, -.35, .1))
    text('7', 2.6, .1, .04, GOLD(), offset=.12, loc=(0, -.35, -.06))

def horns(y, span, material):
    """Two curved devil horns, thick at the root and tapering to a point, sweeping outward and up."""
    for side in (-1, 1):
        bpy.ops.mesh.primitive_cone_add(vertices=32, radius1=.22, radius2=.0, depth=.9, location=(0, 0, 0))
        horn = bpy.context.object
        bend = horn.modifiers.new('Bend', 'SIMPLE_DEFORM'); bend.deform_method = 'BEND'; bend.angle = math.radians(-95 * side); bend.deform_axis = 'Y'
        smooth(horn, 1); add(horn, material)
        horn.rotation_euler = (math.radians(-90), 0, math.radians(-28 * side))
        horn.location = (side * span, y + .4, .05)

def devil_bar(count):
    tones = {1: (.7, .06, .01), 2: (.85, .5, .02), 3: (.7, .02, .3)}
    enamel = mat('BarEnamel', tones[count], rough=.1, coat=1)
    gap, h = .12, .5
    top = (count * h + (count - 1) * gap) / 2
    for i in range(count):
        y = top - h / 2 - i * (h + gap)
        rounded_box((2.3, h, .24), .08, GOLD(), loc=(0, y, -.04))
        rounded_box((2.12, h - .12, .24), .06, enamel, loc=(0, y, .02))
        text('BAR', .36, .05, .012, GOLD(), loc=(0, y - .01, .15))
    horns(top - .05, .78, RUBY())

def heart_shape(scale):
    pts = []
    for i in range(64):
        t = i / 64 * math.pi * 2
        pts.append((scale * 16 * math.sin(t) ** 3 / 16, scale * (13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)) / 16))
    return pts

def devil_wild():
    prism(heart_shape(1.12), .3, -.08, GOLD(), .1)
    prism(heart_shape(1.0), .36, .1, RUBY(), .16)
    horns(.62, .55, GOLD())
    text('WILD', .58, .07, .018, GOLD(), loc=(0, .02, .3))

def devil_x2():
    bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=1.05, depth=.28, location=(0, 0, -.05)); coin = bpy.context.object
    b = coin.modifiers.new('Bevel', 'BEVEL'); b.width = .06; b.segments = 5; bpy.ops.object.shade_smooth(); add(coin, GOLD())
    bpy.ops.mesh.primitive_torus_add(major_radius=.86, minor_radius=.05, location=(0, 0, .1)); add(bpy.context.object, DARK_GOLD()); bpy.ops.object.shade_smooth()
    bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=.8, depth=.12, location=(0, 0, .06)); add(bpy.context.object, RUBY()); bpy.ops.object.shade_smooth()
    text('2X', .82, .08, .025, GOLD(), loc=(0, -.02, .14))

def devil_jackpot():
    """A brilliant-cut ruby: a faceted crown over a pointed pavilion, with a gold JACKPOT ribbon across it."""
    glass = mat('RubyGlass', (1, .04, .08), rough=.0)
    p = glass.node_tree.nodes['Principled BSDF']; p.inputs['Transmission Weight'].default_value = 1; p.inputs['IOR'].default_value = 1.76
    bpy.ops.mesh.primitive_cone_add(vertices=10, radius1=1.0, radius2=.58, depth=.42, location=(0, .25, 0)); crown = bpy.context.object
    bpy.ops.mesh.primitive_cone_add(vertices=10, radius1=1.0, radius2=0, depth=1.0, location=(0, .25, 0)); pavilion = bpy.context.object
    for o in (crown, pavilion):
        add(o, glass); o.rotation_euler = (math.radians(-90), 0, 0)
    crown.location = (0, .46, 0); pavilion.location = (0, -.25, 0); pavilion.rotation_euler = (math.radians(90), 0, 0)
    rounded_box((2.3, .46, .12), .06, mat('Ribbon', (.5, .0, .02), rough=.2, coat=1), loc=(0, -.55, .55))
    rounded_box((2.42, .56, .08), .07, GOLD(), loc=(0, -.55, .47))
    text('JACKPOT', .33, .05, .012, GOLD(), loc=(0, -.56, .64))

# ---------------------------------------------------------------- Seven Stars' wild and scatter
def video_wild():
    rounded_box((2.3, 1.5, .32), .2, GOLD(), loc=(0, 0, -.06))
    rounded_box((2.1, 1.3, .32), .18, mat('WildGem', (.35, .02, .55), rough=.06, coat=1, sss=.2), loc=(0, 0, .03))
    text('WILD', .82, .1, .03, mat('WildGold', (1, .8, .35), metallic=1, rough=.12, emission=(1, .7, .2), strength=.3), loc=(0, -.03, .2))

def video_scatter():
    """A gold star on a blue jewel coin, with FREE SPINS beneath."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=1.05, depth=.26, location=(0, .12, -.08)); coin = bpy.context.object
    b = coin.modifiers.new('Bevel', 'BEVEL'); b.width = .06; b.segments = 5; bpy.ops.object.shade_smooth(); add(coin, GOLD())
    bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=.88, depth=.14, location=(0, .12, .02)); add(bpy.context.object, mat('Sapphire', (.0, .12, .6), rough=.06, coat=1)); bpy.ops.object.shade_smooth()
    bm = bmesh.new()
    ring = [bm.verts.new(((.72 if i % 2 == 0 else .3) * math.sin(i * math.pi / 5), .12 + (.72 if i % 2 == 0 else .3) * math.cos(i * math.pi / 5), .12)) for i in range(10)]
    front, back = bm.verts.new((0, .12, .42)), bm.verts.new((0, .12, .05))
    for i in range(10):
        a, c = ring[i], ring[(i + 1) % 10]; bm.faces.new((front, a, c)); bm.faces.new((back, c, a))
    mesh = bpy.data.meshes.new('Star'); bm.to_mesh(mesh); bm.free()
    star = bpy.data.objects.new('Star', mesh); bpy.context.scene.collection.objects.link(star); add(star, mat('StarGold', (1, .78, .25), metallic=1, rough=.1))
    rounded_box((2.2, .42, .1), .06, mat('Ribbon', (.0, .1, .45), rough=.2, coat=1), loc=(0, -.92, .3))
    rounded_box((2.32, .52, .07), .07, GOLD(), loc=(0, -.92, .23))
    text('FREE SPINS', .3, .045, .01, GOLD(), loc=(0, -.93, .38))

VIDEO = {'WILD': video_wild, 'SCATTER': video_scatter}

# ---------------------------------------------------------------- Break the Bank's fireballs
def swirl(name, dark, mid, hot, strength):
    """Turbulent fire: distorted noise through a dark-to-hot ramp, glowing."""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
    p = nt.nodes['Principled BSDF']; p.inputs['Base Color'].default_value = (*dark, 1); p.inputs['Roughness'].default_value = .3
    noise = nt.nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 3.2; noise.inputs['Detail'].default_value = 9; noise.inputs['Distortion'].default_value = 2.4
    ramp = nt.nodes.new('ShaderNodeValToRGB'); els = ramp.color_ramp.elements
    els[0].position = .38; els[0].color = (*dark, 1); els[1].position = .72; els[1].color = (*hot, 1)
    mid_el = els.new(.55); mid_el.color = (*mid, 1)
    nt.links.new(noise.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], p.inputs['Emission Color']); p.inputs['Emission Strength'].default_value = strength
    nt.links.new(ramp.outputs['Color'], p.inputs['Base Color'])
    return m

def fireball(dark, mid, hot):
    """A molten orb: swirling fire inside a thin glass shell, ragged tongues of flame round it, a gold rim."""
    sphere((0, 0, 0), (.9, .9, .9), swirl('Fire', dark, mid, hot, 2.1), 64)
    glass = mat('Glass', (1, 1, 1), rough=.02)
    g = glass.node_tree.nodes['Principled BSDF']; g.inputs['Transmission Weight'].default_value = 1; g.inputs['IOR'].default_value = 1.45
    sphere((0, 0, .02), (.97, .97, .97), glass, 64)
    flame = swirl('Lick', dark, mid, hot, 1.7)
    for i in range(14):
        a = i / 14 * math.pi * 2 + (i % 3) * .08; size = .7 + ((i * 37) % 10) / 20; lean = .25 if i % 2 else -.2
        pts = [(px, py) for px, py in flame_shape(.2 * size, .62 * size, lean)]
        o = prism([(x, y + .95) for x, y in pts], .05, -.45, flame, .015)
        o.rotation_euler = (0, 0, a - math.pi / 2)
    bpy.ops.mesh.primitive_torus_add(major_radius=.98, minor_radius=.055, location=(0, 0, 0)); add(bpy.context.object, GOLD()); bpy.ops.object.shade_smooth()

# ---------------------------------------------------------------- Luxury Life
WHITE_PAINT = lambda: mat('WhitePaint', (.92, .93, .95), rough=.12, coat=1)
GLASS_DARK = lambda: mat('DarkGlass', (.02, .03, .06), rough=.05, coat=1)
SILVER_METAL = lambda: mat('Silver', (.92, .93, .96), metallic=1, rough=.12)

def bar_ingot(loc, material, scale=1.):
    """A trapezoid ingot: wider at its base, bevelled."""
    w, d, h = 1.1 * scale, .52 * scale, .34 * scale
    bm = bmesh.new()
    base = [bm.verts.new((x, y, 0)) for x, y in ((-w / 2, -d / 2), (w / 2, -d / 2), (w / 2, d / 2), (-w / 2, d / 2))]
    top = [bm.verts.new((x * .78, y * .7, h)) for x, y in ((-w / 2, -d / 2), (w / 2, -d / 2), (w / 2, d / 2), (-w / 2, d / 2))]
    bm.faces.new(base[::-1]); bm.faces.new(top)
    for i in range(4): bm.faces.new((base[i], base[(i + 1) % 4], top[(i + 1) % 4], top[i]))
    mesh = bpy.data.meshes.new('Ingot'); bm.to_mesh(mesh); bm.free()
    o = bpy.data.objects.new('Ingot', mesh); bpy.context.scene.collection.objects.link(o)
    b = o.modifiers.new('Bevel', 'BEVEL'); b.width = .03 * scale; b.segments = 3
    o.location = loc; o.rotation_euler = (math.radians(-55), 0, 0); return add(o, material)

def lux_bars(material):
    for loc in ((-.6, -.35, 0), (.6, -.35, 0), (0, .25, .1)): bar_ingot(loc, material)

def lux_coin():
    bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=1.0, depth=.18, location=(0, 0, 0)); coin = bpy.context.object
    b = coin.modifiers.new('Bevel', 'BEVEL'); b.width = .04; b.segments = 4; bpy.ops.object.shade_smooth(); add(coin, GOLD())
    bpy.ops.mesh.primitive_torus_add(major_radius=.86, minor_radius=.035, location=(0, 0, .1)); add(bpy.context.object, DARK_GOLD()); bpy.ops.object.shade_smooth()
    text('$', 1.2, .06, .02, GOLD(), loc=(0, -.02, .1))
    for x, z in ((-.5, -.2), (.45, -.35)):
        bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=.55, depth=.12, location=(x, -.85, z)); c = bpy.context.object
        c.rotation_euler = (math.radians(80), 0, 0); add(c, GOLD()); bpy.ops.object.shade_smooth()

def lux_ring():
    bpy.ops.mesh.primitive_torus_add(major_radius=.78, minor_radius=.13, major_segments=96, location=(0, -.25, 0)); band = bpy.context.object
    band.rotation_euler = (math.radians(70), 0, 0); add(band, GOLD()); bpy.ops.object.shade_smooth()
    gem = mat('Diamond', (1, 1, 1), rough=0); gp = gem.node_tree.nodes['Principled BSDF']; gp.inputs['Transmission Weight'].default_value = 1; gp.inputs['IOR'].default_value = 2.4
    bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=.42, radius2=.25, depth=.22, location=(0, .72, .1)); add(bpy.context.object, gem)
    bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=.42, radius2=0, depth=.5, location=(0, .47, .1)); c = bpy.context.object; c.rotation_euler = (math.radians(180), 0, 0); add(c, gem)
    for a in range(4):
        x = .3 * math.cos(a * math.pi / 2 + .78); bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=.04, depth=.35, location=(x, .6, .1)); add(bpy.context.object, GOLD())

def lux_watch():
    bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=.95, depth=.3, location=(0, -.1, 0)); case = bpy.context.object
    b = case.modifiers.new('Bevel', 'BEVEL'); b.width = .08; b.segments = 6; bpy.ops.object.shade_smooth(); add(case, GOLD())
    bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=.8, depth=.32, location=(0, -.1, .02)); add(bpy.context.object, mat('Dial', (.95, .93, .86), rough=.25)); bpy.ops.object.shade_smooth()
    for i in range(12):
        a = i * math.pi / 6; bpy.ops.mesh.primitive_cube_add(size=1, location=(.66 * math.sin(a), -.1 + .66 * math.cos(a), .19))
        o = bpy.context.object; o.scale = (.025, .09 if i % 3 == 0 else .05, .02); o.rotation_euler = (0, 0, -a); add(o, mat('Mark', (.05, .05, .08), rough=.3))
    for length, angle, width in ((.45, -40, .04), (.62, 70, .03)):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0)); h = bpy.context.object
        h.scale = (width, length, .02); h.location = (length / 2 * math.sin(math.radians(angle)), -.1 + length / 2 * math.cos(math.radians(angle)), .2)
        h.rotation_euler = (0, 0, -math.radians(angle)); add(h, mat('Hand', (.03, .03, .05), metallic=.5, rough=.2))
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=.12, depth=.25, location=(0, .95, 0)); c = bpy.context.object; c.rotation_euler = (math.radians(90), 0, 0); add(c, GOLD())
    bpy.ops.mesh.primitive_torus_add(major_radius=.2, minor_radius=.045, location=(0, 1.2, 0)); add(bpy.context.object, GOLD())

def yacht_parts():
    hull = prism([(-1.35, -.1), (1.2, -.1), (1.55, .28), (-1.25, .28), (-1.4, .1)], .6, .3, WHITE_PAINT(), .05)
    prism([(-1.38, -.02), (1.25, -.02), (1.35, .08), (-1.4, .08)], .62, .31, mat('Navy', (.02, .06, .25), rough=.2, coat=1), .02)
    deck = mat('Teak', (.45, .25, .1), rough=.4)
    prism([(-1.25, .28), (1.5, .28), (1.5, .31), (-1.25, .31)], .6, .3, deck)
    prism([(-.9, .28), (.75, .28), (.42, .6), (-.78, .6)], .42, .24, WHITE_PAINT(), .04)
    prism([(-.62, .6), (.28, .6), (.06, .84), (-.52, .84)], .3, .18, WHITE_PAINT(), .03)
    prism([(-.84, .34), (.6, .34), (.36, .54), (-.72, .54)], .02, .25, GLASS_DARK())
    prism([(-.54, .65), (.18, .65), (.02, .79), (-.46, .79)], .02, .19, GLASS_DARK())
    water = mat('Wake', (.25, .6, 1), rough=.05, emission=(.3, .7, 1), strength=.6)
    for x, s in ((-1.0, .5), (-.2, .35), (.7, .45)): sphere((x, -.2, .1), (s, .07, .35), water, 24)

def lux_yacht(): tilted(yacht_parts, (14, -24, 0))

def tilted(build, rot):
    """Builds a symbol, then turns the whole of it together (an empty parent), so rotations compose."""
    before = set(bpy.context.scene.objects)
    build()
    pivot = bpy.data.objects.new('Pivot', None); bpy.context.scene.collection.objects.link(pivot)
    for o in set(bpy.context.scene.objects) - before - {pivot}:
        if o.type in ('MESH', 'FONT') and o.parent is None: o.parent = pivot
    pivot.rotation_euler = tuple(math.radians(a) for a in rot)

def jet_parts():
    paint = WHITE_PAINT(); trim = mat('Tail', (.85, .6, .12), metallic=1, rough=.18)
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=.24, depth=2.2, location=(0, 0, 0)); body = bpy.context.object
    body.rotation_euler = (0, math.radians(90), 0); add(body, paint); bpy.ops.object.shade_smooth()
    sphere((1.1, 0, 0), (.42, .24, .24), paint); sphere((-1.1, .02, 0), (.3, .2, .2), paint)
    sphere((1.32, .07, 0), (.14, .08, .13), GLASS_DARK(), 24)
    for side in (1, -1):   # swept wings in the XZ plane, and the tailplanes
        w = prism([(.35, 0), (-.25, 0), (-.7, 1.25 * side), (-.5, 1.25 * side)], .05, .025, paint, .015); w.rotation_euler = (math.radians(90), 0, 0); w.location = (0, -.08, 0)
        tp = prism([(-1.0, 0), (-1.25, 0), (-1.45, .5 * side), (-1.3, .5 * side)], .04, .02, trim, .01); tp.rotation_euler = (math.radians(90), 0, 0); tp.location = (0, .55, 0)
        bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=.11, depth=.45, location=(-.75, .2, .3 * side)); n = bpy.context.object
        n.rotation_euler = (0, math.radians(90), 0); add(n, trim); bpy.ops.object.shade_smooth()
    prism([(-.85, .15), (-1.15, .15), (-1.42, .62), (-1.25, .62)], .04, .02, trim, .01)   # fin
    for x in (-.5, -.25, 0, .25, .5):
        sphere((x, .07, .22), (.06, .05, .03), GLASS_DARK(), 16)
    rounded_box((2.0, .04, .02), .01, trim, loc=(0, -.04, .235))

def lux_jet(): tilted(jet_parts, (22, -12, 18))

def lux_limo():
    body = rounded_box((2.7, .5, .7), .18, mat('LimoPaint', (.02, .02, .025), metallic=.6, rough=.15, coat=1), loc=(0, 0, 0))
    rounded_box((1.7, .38, .55), .16, mat('Roof', (.02, .02, .025), metallic=.6, rough=.15, coat=1), loc=(-.15, .38, 0))
    rounded_box((1.6, .28, .57), .12, GLASS_DARK(), loc=(-.15, .38, 0))
    for x in (-.85, .85):
        bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=.26, depth=.12, location=(x, -.25, .3)); w = bpy.context.object; add(w, mat('Tyre', (.02, .02, .02), rough=.6)); bpy.ops.object.shade_smooth()
        bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=.15, depth=.14, location=(x, -.25, .31)); add(bpy.context.object, SILVER_METAL()); bpy.ops.object.shade_smooth()
    rounded_box((.12, .12, .3), .03, mat('Lamp', (1, .95, .8), emission=(1, .95, .8), strength=4), loc=(1.33, .02, .2))
    rounded_box((2.6, .05, .02), .01, SILVER_METAL(), loc=(0, .02, .36))

def lux_double():
    """The DOUBLE wild: a pink brilliant diamond over a gold plate reading DOUBLE."""
    gem = mat('PinkDiamond', (1, .3, .7), rough=0); gp = gem.node_tree.nodes['Principled BSDF']; gp.inputs['Transmission Weight'].default_value = 1; gp.inputs['IOR'].default_value = 2.2
    bpy.ops.mesh.primitive_cone_add(vertices=10, radius1=.9, radius2=.55, depth=.35, location=(0, 0, 0)); crown = bpy.context.object
    bpy.ops.mesh.primitive_cone_add(vertices=10, radius1=.9, radius2=0, depth=.9, location=(0, 0, 0)); pav = bpy.context.object
    for o in (crown, pav): add(o, gem)
    crown.rotation_euler = (math.radians(-90), 0, 0); crown.location = (0, .55, 0)
    pav.rotation_euler = (math.radians(90), 0, 0); pav.location = (0, -.08, 0)
    rounded_box((2.3, .5, .12), .08, mat('Plate', (.5, .0, .3), rough=.15, coat=1), loc=(0, -.75, .45))
    rounded_box((2.42, .6, .08), .08, GOLD(), loc=(0, -.75, .37))
    text('DOUBLE', .42, .06, .015, GOLD(), loc=(0, -.77, .55))

def key_parts():
    """The KEY scatter: an ornate gold key on a velvet VIP tag."""
    gold = GOLD()
    bpy.ops.mesh.primitive_torus_add(major_radius=.42, minor_radius=.09, major_segments=64, location=(-.75, .25, 0)); add(bpy.context.object, gold)
    bpy.ops.object.shade_smooth()
    for k in range(6):
        a = k * math.pi / 3
        sphere((-.75 + .42 * math.cos(a), .25 + .42 * math.sin(a), .06), (.07, .07, .07), gold, 24)
    sphere((-.75, .25, 0), (.16, .16, .1), mat('Ruby', (1, .02, .2), rough=0, coat=1), 32)
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=.07, depth=1.35, location=(.0, .25, 0)); s = bpy.context.object
    s.rotation_euler = (0, math.radians(90), 0); add(s, gold); bpy.ops.object.shade_smooth()
    for x, h in ((.45, .32), (.62, .22)):
        rounded_box((.1, h, .1), .02, gold, (x, .25 - h / 2 - .02, 0))
    for x in (-.25, -.15): sphere((x, .25, 0), (.03, .1, .1), gold, 16)
    tag = rounded_box((1.3, .55, .06), .12, mat('Velvet', (.35, .0, .25), rough=.6, sss=.1), (.05, -.45, -.12))
    rounded_box((1.38, .63, .04), .12, gold, (.05, -.45, -.16))
    text('FREE SPINS', .2, .02, .006, gold, loc=(.05, -.46, -.07))

def lux_key(): tilted(key_parts, (8, -10, 12))

LUXURY = {'YACHT': lux_yacht, 'JET': lux_jet, 'LIMO': lux_limo, 'RING': lux_ring, 'WATCH': lux_watch,
          'GOLD': lambda: lux_bars(GOLD()), 'COIN': lux_coin, 'SILVER': lambda: lux_bars(SILVER_METAL()), 'DOUBLE': lux_double, 'KEY': lux_key}

FIREBALLS = {'FIRE': ((.25, .01, 0), (1, .22, 0), (1, .78, .25)), 'MINI': ((.0, .12, .03), (.05, .7, .15), (.75, 1, .5)),
             'MINOR': ((.0, .03, .2), (.05, .3, 1), (.6, .9, 1)), 'MAJOR': ((.12, .0, .2), (.6, .05, .9), (1, .6, 1))}

DEVIL = {'SEVEN': devil_seven, 'BAR1': lambda: devil_bar(1), 'BAR2': lambda: devil_bar(2), 'BAR3': lambda: devil_bar(3),
         'WILD': devil_wild, 'X2': devil_x2, 'JACKPOT': devil_jackpot}

SYMBOLS = {'7': seven, 'BAR': bar, 'CHERRY': cherry, 'LEMON': lemon, 'BELL': bell, 'GRAPE': grape, 'ORANGE': orange, 'WATERMELON': watermelon, 'STAR': star}

for name, build in list(SYMBOLS.items()) + [(f'DH_{k}', v) for k, v in DEVIL.items()] + [(f'VS_{k}', v) for k, v in VIDEO.items()] + [(f'FB_{k}', (lambda c=c: fireball(*c))) for k, c in FIREBALLS.items()] + [(f'LX_{k}', v) for k, v in LUXURY.items()]:
    if ONLY and name not in ONLY: continue
    reset(); build(); render(name)
