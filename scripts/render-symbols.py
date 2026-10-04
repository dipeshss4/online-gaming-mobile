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
    for o in objs:
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

DEVIL = {'SEVEN': devil_seven, 'BAR1': lambda: devil_bar(1), 'BAR2': lambda: devil_bar(2), 'BAR3': lambda: devil_bar(3),
         'WILD': devil_wild, 'X2': devil_x2, 'JACKPOT': devil_jackpot}

SYMBOLS = {'7': seven, 'BAR': bar, 'CHERRY': cherry, 'LEMON': lemon, 'BELL': bell, 'GRAPE': grape, 'ORANGE': orange, 'WATERMELON': watermelon, 'STAR': star}

for name, build in list(SYMBOLS.items()) + [(f'DH_{k}', v) for k, v in DEVIL.items()] + [(f'VS_{k}', v) for k, v in VIDEO.items()]:
    if ONLY and name not in ONLY: continue
    reset(); build(); render(name)
