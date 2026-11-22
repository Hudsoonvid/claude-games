"""Models Brimful's creatures in Blender and exports them as one GLB.

Run headless with Blender's Python module:

    pip install bpy
    python tools/make_animals.py            # writes src/animals.glb

Each animal is a root empty named after its kind. Bodies are built from overlapping
ellipsoids fused with a voxel remesh, smoothed and decimated, so they read as one soft
low-poly form. Parts the game animates (tail, wings, ears, legs, arms) stay separate
objects with their origin at the joint. Materials are plain colours; ones named
"tint*" are recoloured per individual by the game.

Blender axes: +Z up, -Y is the animal's front (it becomes +Z in glTF / three.js).
One unit is one voxel.
"""
import math
import os
import sys

import bpy
from mathutils import Vector

# BRIMFUL_LOW=1 builds the faceted low-poly set instead (src/animals_low.glb): fewer faces and flat shading
LOW = os.environ.get('BRIMFUL_LOW') == '1'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'animals_low.glb' if LOW else 'animals.glb')

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
MATS = {}


def mat(name, rgb=(1, 1, 1), alpha=1.0):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*rgb, 1)
    bsdf.inputs['Roughness'].default_value = 0.9
    if alpha < 1:
        bsdf.inputs['Alpha'].default_value = alpha
        m.blend_method = 'BLEND' if hasattr(m, 'blend_method') else m.blend_method
    MATS[name] = m
    return m


def hexc(h):
    return tuple(((h >> s) & 255) / 255 for s in (16, 8, 0))


def srgb(h):  # hex sRGB -> linear, which is what Base Color expects
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in hexc(h))


WHITE = lambda: mat('white', srgb(0xfbf7ee))
DARK = lambda: mat('dark', srgb(0x1c1c22))
ORANGE = lambda: mat('orange', srgb(0xf29a2e))
TINT = lambda: mat('tint')
TINT2 = lambda: mat('tint2')
TINT3 = lambda: mat('tint3')


def active(o):
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o


def ell(loc, scale, rot=(0, 0, 0), seg=16, rings=10):
    if LOW:
        seg, rings = min(seg, 8), min(rings, 5)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=1, location=loc, rotation=rot, scale=scale)
    return bpy.context.active_object


def cone(loc, r, depth, rot=(0, 0, 0), r2=0.0, verts=10):
    if LOW:
        verts = min(verts, 5)
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2, depth=depth, location=loc, rotation=rot)
    return bpy.context.active_object


def cube(loc, scale, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot, scale=scale)
    return bpy.context.active_object


def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return o


def bake(o):
    """Replace the object's mesh with its modifier-evaluated result."""
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
    old = o.data
    o.modifiers.clear()
    o.data = me
    bpy.data.meshes.remove(old)


def paint_mesh(o, fn):
    """Per-vertex colour that multiplies the material colour (shading, markings)."""
    me = o.data
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    for v in me.vertices:
        c = fn(v.co, v.normal) if fn else (1, 1, 1)
        ca.data[v.index].color = (c[0], c[1], c[2], 1)
    me.color_attributes.active_color = ca


def finish(o, material, pivot=None, paint=None):
    paint_mesh(o, paint)
    for p in o.data.polygons:
        p.use_smooth = True   # low-poly facets come from flat shading in the game, which keeps the file small
    o.data.materials.clear()
    o.data.materials.append(material)
    if pivot is not None:
        scene.cursor.location = Vector(pivot)
        active(o)
        bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    return o


def fuse(objs, name, material, voxel=0.05, faces=420, smooth=3, pivot=None, paint=None):
    """Melt overlapping shapes into one soft low-poly skin."""
    o = join(objs, name)
    r = o.modifiers.new('remesh', 'REMESH')
    r.mode = 'VOXEL'
    r.voxel_size = voxel
    bake(o)
    s = o.modifiers.new('smooth', 'SMOOTH')
    s.factor = 0.6
    s.iterations = smooth
    bake(o)
    faces = int(faces * (0.14 if LOW else 0.6))          # keep creatures light: hundreds of them share the screen
    n = len(o.data.polygons)
    if n > faces:
        d = o.modifiers.new('decimate', 'DECIMATE')
        d.ratio = faces / n
        bake(o)
    return finish(o, material, pivot, paint)


def part(objs, name, material, pivot=None, paint=None):
    """Simple pieces (eyes, beaks, wings): joined as they are."""
    return finish(join(objs, name), material, pivot, paint)


def eyes(x, y, z, r=0.04):
    return part([ell((x, y, z), (r, r, r), seg=8, rings=6), ell((-x, y, z), (r, r, r), seg=8, rings=6)], 'eyes', DARK())


def animal(kind, parts):
    root = bpy.data.objects.new(kind, None)
    scene.collection.objects.link(root)
    for p in parts:
        p.parent = root
    # park finished animals out of the way so later boolean-ish steps never touch them
    return root


R = math.radians
animals = []
from mathutils import noise as mnoise


def sm(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def blotch(co, freq, seedv=0.0):
    """Smooth 0..1 noise for mottling and patches."""
    return 0.5 + 0.5 * mnoise.noise(Vector((co.x * freq + seedv, co.y * freq - seedv, co.z * freq + 3.1 * seedv)))


def coat(dark=0.68, light=1.0, mottle=0.0, freq=9.0, extra=None):
    """Countershading: darker along the back, paler underneath, optionally mottled.
    The result multiplies the part's colour, so pick the colour of the palest fur."""
    def f(co, n):
        v = light + (dark - light) * sm(-0.35, 0.6, n.z)
        if mottle:
            v *= 1 - mottle * blotch(co, freq)
        c = (v, v, v)
        if extra:
            c = extra(co, n, c)
        return c
    return f


def leg(name, x, y, top, material, thick=0.05, paint=None, foot=0.0):
    """A tapering limb hinged at its top: a full thigh, a slim shin, a small hoof or paw."""
    shapes = [ell((x, y, top * 0.72), (thick, thick * 1.25, top * 0.3)), ell((x, y - 0.005, top * 0.3), (thick * 0.55, thick * 0.62, top * 0.31)),
              ell((x, y - 0.012 - foot * 0.5, 0.03), (thick * 0.7, thick * 0.8 + foot, 0.032))]
    return fuse(shapes, name, material, voxel=0.022, faces=90, smooth=2, pivot=(x, y, top), paint=paint)


def hoofed(dark_below=0.07):
    return coat(0.74, 1.0, extra=lambda co, n, c: (0.16, 0.14, 0.13) if co.z < dark_below else c)


# ---------------------------------------------------------------- minnow (centred on the origin)
fishcoat = coat(0.5, 1.0, mottle=0.12, freq=14)
body = fuse([
    ell((0, 0.0, 0), (0.085, 0.36, 0.125)), ell((0, -0.27, 0.0), (0.07, 0.17, 0.1)), ell((0, 0.34, 0), (0.035, 0.15, 0.055)),
    ell((0, 0.03, 0.135), (0.012, 0.11, 0.07), rot=(R(-22), 0, 0)),                       # dorsal fin
    ell((0, 0.2, -0.1), (0.01, 0.075, 0.045), rot=(R(20), 0, 0)),                         # anal fin
    ell((0.085, -0.13, -0.05), (0.012, 0.075, 0.04), rot=(0, R(50), R(20))), ell((-0.085, -0.13, -0.05), (0.012, 0.075, 0.04), rot=(0, R(-50), R(-20))),
], 'body', TINT(), voxel=0.022, faces=420, paint=fishcoat)
tail = fuse([
    ell((0, 0.55, 0.075), (0.012, 0.13, 0.05), rot=(R(-32), 0, 0)), ell((0, 0.55, -0.075), (0.012, 0.13, 0.05), rot=(R(32), 0, 0)),
    ell((0, 0.45, 0), (0.025, 0.05, 0.05)),
], 'tail', TINT(), voxel=0.02, faces=120, pivot=(0, 0.42, 0), paint=coat(0.6, 0.85))
animals.append(animal('minnow', [body, tail, eyes(0.062, -0.34, 0.03, 0.022)]))

# ---------------------------------------------------------------- koi: white with orange and black patches
def koicoat(co, n):
    k = blotch(co, 4.2, 1.7)
    if k > 0.56:
        return (1.0, 0.36, 0.1)
    if blotch(co, 7.0, 5.3) > 0.72:
        return (0.12, 0.11, 0.12)
    v = 1.0 - 0.18 * sm(-0.2, 0.7, n.z)
    return (v, v, v)

body = fuse([
    ell((0, 0, 0), (0.14, 0.52, 0.18)), ell((0, -0.4, 0.0), (0.115, 0.24, 0.14)), ell((0, 0.5, 0), (0.05, 0.2, 0.075)),
    ell((0, 0.02, 0.2), (0.015, 0.2, 0.08), rot=(R(-12), 0, 0)),
    ell((0.15, -0.2, -0.08), (0.015, 0.13, 0.06), rot=(0, R(55), R(25))), ell((-0.15, -0.2, -0.08), (0.015, 0.13, 0.06), rot=(0, R(-55), R(-25))),
    ell((0.06, -0.62, -0.05), (0.012, 0.012, 0.05), rot=(R(40), 0, 0)), ell((-0.06, -0.62, -0.05), (0.012, 0.012, 0.05), rot=(R(40), 0, 0)),   # barbels
], 'body', TINT(), voxel=0.03, faces=480, paint=koicoat)
tail = fuse([
    ell((0, 0.8, 0.12), (0.015, 0.2, 0.08), rot=(R(-30), 0, 0)), ell((0, 0.8, -0.12), (0.015, 0.2, 0.08), rot=(R(30), 0, 0)),
    ell((0, 0.66, 0), (0.035, 0.07, 0.07)),
], 'tail', TINT(), voxel=0.025, faces=130, pivot=(0, 0.62, 0), paint=lambda co, n: (1.0, 0.5, 0.2) if blotch(co, 5, 2.0) > 0.5 else (0.95, 0.95, 0.95))
animals.append(animal('koi', [body, tail, eyes(0.1, -0.5, 0.05, 0.028)]))

# ---------------------------------------------------------------- duck
body = fuse([
    ell((0, 0.05, 0.19), (0.17, 0.32, 0.15)), ell((0, -0.2, 0.22), (0.14, 0.16, 0.15)),                  # body, breast
    ell((0, 0.36, 0.27), (0.07, 0.13, 0.045), rot=(R(24), 0, 0)),                                         # tail
    ell((0, -0.28, 0.39), (0.055, 0.06, 0.13), rot=(R(-10), 0, 0)), ell((0, -0.31, 0.53), (0.078, 0.1, 0.075)),   # neck, head
    ell((0.155, 0.09, 0.25), (0.045, 0.24, 0.095), rot=(R(6), 0, 0)), ell((-0.155, 0.09, 0.25), (0.045, 0.24, 0.095), rot=(R(6), 0, 0)),
], 'body', TINT(), voxel=0.03, faces=520, paint=coat(0.72, 1.0, mottle=0.14, freq=11))
bill = fuse([ell((0, -0.43, 0.505), (0.042, 0.075, 0.02)), ell((0, -0.38, 0.515), (0.04, 0.04, 0.03))], 'bill', mat('bill', srgb(0xd9a02a)), voxel=0.018, faces=70)
animals.append(animal('duck', [body, bill, eyes(0.066, -0.35, 0.56, 0.016)]))

# ---------------------------------------------------------------- frog
frogcoat = coat(0.62, 1.0, mottle=0.35, freq=13)
body = fuse([
    ell((0, 0.02, 0.12), (0.17, 0.23, 0.1)), ell((0, -0.2, 0.14), (0.145, 0.13, 0.08)), ell((0, -0.31, 0.12), (0.095, 0.075, 0.048)),
    ell((0.095, -0.2, 0.215), (0.045, 0.05, 0.04)), ell((-0.095, -0.2, 0.215), (0.045, 0.05, 0.04)),
    ell((0.19, 0.15, 0.085), (0.065, 0.15, 0.055), rot=(0, 0, R(-38))), ell((-0.19, 0.15, 0.085), (0.065, 0.15, 0.055), rot=(0, 0, R(38))),      # thighs
    ell((0.27, 0.07, 0.05), (0.04, 0.13, 0.035), rot=(0, 0, R(28))), ell((-0.27, 0.07, 0.05), (0.04, 0.13, 0.035), rot=(0, 0, R(-28))),          # shins
    ell((0.3, -0.06, 0.02), (0.045, 0.09, 0.012)), ell((-0.3, -0.06, 0.02), (0.045, 0.09, 0.012)),                                              # hind feet
    ell((0.16, -0.2, 0.06), (0.032, 0.035, 0.07), rot=(0, R(-15), 0)), ell((-0.16, -0.2, 0.06), (0.032, 0.035, 0.07), rot=(0, R(15), 0)),
    ell((0.18, -0.25, 0.015), (0.04, 0.05, 0.012)), ell((-0.18, -0.25, 0.015), (0.04, 0.05, 0.012)),
], 'body', TINT(), voxel=0.024, faces=560, paint=frogcoat)
belly = part([ell((0, -0.06, 0.065), (0.14, 0.2, 0.05)), ell((0, -0.26, 0.095), (0.1, 0.09, 0.04))], 'belly', mat('belly', srgb(0xe6e2c0)))
animals.append(animal('frog', [body, belly, eyes(0.118, -0.215, 0.225, 0.026)]))

# ---------------------------------------------------------------- mossback: a small moss-grown shell-back
shell = fuse([
    ell((0, 0.03, 0.2), (0.38, 0.44, 0.27)),
    ell((0.16, 0.1, 0.38), (0.12, 0.12, 0.09)), ell((-0.14, -0.08, 0.4), (0.11, 0.11, 0.08)), ell((0.02, 0.22, 0.38), (0.1, 0.1, 0.07)),
    cube((0, 0, -0.2), (1.2, 1.2, 0.5)),
], 'shell', TINT(), voxel=0.04, faces=440, paint=coat(0.6, 1.0, mottle=0.45, freq=7))
active(shell)
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.bisect(plane_co=(0, 0, 0.09), plane_no=(0, 0, 1), clear_inner=True, use_fill=True)
bpy.ops.object.mode_set(mode='OBJECT')
skin = fuse([
    ell((0, -0.44, 0.15), (0.11, 0.15, 0.09)), ell((0, -0.02, 0.07), (0.31, 0.4, 0.06)),
    ell((0.26, -0.2, 0.04), (0.07, 0.09, 0.04)), ell((-0.26, -0.2, 0.04), (0.07, 0.09, 0.04)), ell((0.26, 0.24, 0.04), (0.07, 0.09, 0.04)), ell((-0.26, 0.24, 0.04), (0.07, 0.09, 0.04)),
], 'skin', mat('skin', srgb(0xc9b48a)), voxel=0.035, faces=300, paint=coat(0.75, 1.0))
animals.append(animal('mossback', [shell, skin, eyes(0.07, -0.54, 0.19, 0.02)]))

# ---------------------------------------------------------------- rabbit
body = fuse([
    ell((0, 0.06, 0.2), (0.13, 0.25, 0.15)), ell((0, 0.22, 0.2), (0.155, 0.16, 0.165)), ell((0, -0.13, 0.2), (0.11, 0.13, 0.125)),
    ell((0, -0.27, 0.33), (0.085, 0.115, 0.09)), ell((0, -0.37, 0.3), (0.052, 0.065, 0.05)),
    ell((0.115, 0.14, 0.03), (0.04, 0.17, 0.03)), ell((-0.115, 0.14, 0.03), (0.04, 0.17, 0.03)),
    ell((0.075, -0.17, 0.08), (0.03, 0.035, 0.09)), ell((-0.075, -0.17, 0.08), (0.03, 0.035, 0.09)),
], 'body', TINT(), voxel=0.026, faces=520, paint=coat(0.66, 1.0, mottle=0.12, freq=16))
ears = []
for side, nm in ((1, 'earL'), (-1, 'earR')):
    ears.append(fuse([ell((side * 0.045, -0.2, 0.54), (0.032, 0.016, 0.14), rot=(R(-14), R(side * 8), 0))], nm, TINT(), voxel=0.016, faces=70,
                     pivot=(side * 0.045, -0.22, 0.41), paint=coat(0.7, 0.95)))
puff = part([ell((0, 0.37, 0.24), (0.06, 0.055, 0.06), seg=10, rings=7)], 'puff', WHITE())
animals.append(animal('rabbit', [body, *ears, puff, eyes(0.078, -0.3, 0.36, 0.018)]))

# ---------------------------------------------------------------- sheep
wool = fuse([
    ell((0, 0.04, 0.5), (0.24, 0.36, 0.23)),
    ell((0.13, -0.14, 0.6), (0.13, 0.14, 0.12)), ell((-0.13, -0.1, 0.6), (0.13, 0.14, 0.12)),
    ell((0.11, 0.2, 0.62), (0.14, 0.15, 0.12)), ell((-0.12, 0.22, 0.6), (0.14, 0.15, 0.12)),
    ell((0, 0.38, 0.5), (0.15, 0.12, 0.15)), ell((0, -0.28, 0.66), (0.12, 0.11, 0.1)),
], 'wool', mat('wool', srgb(0xf0ebdc)), voxel=0.04, faces=480, smooth=2, paint=coat(1.0, 0.72, mottle=0.1, freq=10))
face = fuse([ell((0, -0.42, 0.6), (0.075, 0.13, 0.085), rot=(R(20), 0, 0)), ell((0, -0.52, 0.55), (0.05, 0.06, 0.05)),
             ell((0.1, -0.36, 0.66), (0.06, 0.022, 0.03), rot=(0, R(-25), 0)), ell((-0.1, -0.36, 0.66), (0.06, 0.022, 0.03), rot=(0, R(25), 0))],
            'face', mat('sheepface', srgb(0x4a423a)), voxel=0.022, faces=180)
legs = [leg(f'leg{k}', x, y, 0.36, mat('sheepface', srgb(0x4a423a)), thick=0.04) for k, (x, y) in enumerate([(0.11, -0.18), (-0.11, -0.18), (0.11, 0.26), (-0.11, 0.26)])]
animals.append(animal('sheep', [wool, face, *legs, eyes(0.062, -0.47, 0.63, 0.014)]))

# ---------------------------------------------------------------- deer
body = fuse([
    ell((0, 0.04, 0.8), (0.135, 0.4, 0.17)), ell((0, -0.25, 0.8), (0.13, 0.17, 0.2)), ell((0, 0.33, 0.82), (0.14, 0.17, 0.18)),
    ell((0, -0.42, 1.03), (0.066, 0.09, 0.25), rot=(R(-30), 0, 0)),                              # neck
    ell((0, -0.57, 1.27), (0.07, 0.13, 0.08), rot=(R(14), 0, 0)), ell((0, -0.7, 1.225), (0.04, 0.085, 0.045)),   # head, muzzle
    ell((0.105, -0.49, 1.36), (0.022, 0.045, 0.085), rot=(0, R(42), 0)), ell((-0.105, -0.49, 1.36), (0.022, 0.045, 0.085), rot=(0, R(-42), 0)),
], 'body', TINT(), voxel=0.028, faces=640, paint=coat(0.66, 1.0, mottle=0.08, freq=12))
legs = [leg(f'leg{k}', x, y, 0.72, TINT(), thick=0.052, paint=hoofed()) for k, (x, y) in enumerate([(0.085, -0.27), (-0.085, -0.27), (0.09, 0.34), (-0.09, 0.34)])]
antlers = part([
    cone((0.07, -0.5, 1.47), 0.016, 0.24, rot=(R(-10), R(22), 0), verts=6), cone((-0.07, -0.5, 1.47), 0.016, 0.24, rot=(R(-10), R(-22), 0), verts=6),
    cone((0.13, -0.5, 1.53), 0.012, 0.13, rot=(0, R(62), 0), verts=5), cone((-0.13, -0.5, 1.53), 0.012, 0.13, rot=(0, R(-62), 0), verts=5),
    cone((0.1, -0.56, 1.5), 0.011, 0.1, rot=(R(60), R(20), 0), verts=5), cone((-0.1, -0.56, 1.5), 0.011, 0.1, rot=(R(60), R(-20), 0), verts=5),
], 'antlers', mat('horn', srgb(0xd9ccb0)))
rump = part([ell((0, 0.47, 0.83), (0.085, 0.05, 0.1), seg=10, rings=7), ell((0, 0.52, 0.86), (0.035, 0.03, 0.06), seg=8, rings=6)], 'rump', WHITE())
nose = part([ell((0, -0.775, 1.225), (0.022, 0.018, 0.018), seg=8, rings=6)], 'nose', DARK())
animals.append(animal('deer', [body, *legs, antlers, rump, nose, eyes(0.066, -0.6, 1.3, 0.018)]))

# ---------------------------------------------------------------- fox
def foxcoat(co, n):
    v = 1.0 - 0.3 * sm(-0.35, 0.6, n.z)
    if co.z > 0.675 and co.y < -0.3:      # dark ear tips
        return (0.18, 0.13, 0.1)
    return (v, v, v)

body = fuse([
    ell((0, 0.03, 0.36), (0.1, 0.33, 0.12)), ell((0, -0.22, 0.37), (0.1, 0.13, 0.135)), ell((0, 0.28, 0.37), (0.105, 0.13, 0.125)),
    ell((0, -0.34, 0.46), (0.062, 0.08, 0.1), rot=(R(-35), 0, 0)),
    ell((0, -0.44, 0.53), (0.08, 0.095, 0.075)), ell((0, -0.57, 0.5), (0.036, 0.09, 0.036)),
    cone((0.062, -0.415, 0.665), 0.042, 0.15, verts=8), cone((-0.062, -0.415, 0.665), 0.042, 0.15, verts=8),
    ell((0, 0.54, 0.35), (0.095, 0.25, 0.095), rot=(R(14), 0, 0)),
], 'body', TINT(), voxel=0.024, faces=640, paint=foxcoat)
tip = fuse([ell((0, 0.775, 0.295), (0.07, 0.1, 0.07), rot=(R(14), 0, 0))], 'tip', WHITE(), voxel=0.024, faces=70)
bib = part([ell((0, -0.3, 0.33), (0.07, 0.1, 0.095)), ell((0, -0.51, 0.475), (0.062, 0.09, 0.03))], 'bib', WHITE())
socks = mat('socks', srgb(0x2a2220))
legs = [leg(f'leg{k}', x, y, 0.33, socks, thick=0.034) for k, (x, y) in enumerate([(0.07, -0.24), (-0.07, -0.24), (0.075, 0.27), (-0.075, 0.27)])]
nose = part([ell((0, -0.655, 0.5), (0.02, 0.018, 0.018), seg=8, rings=6)], 'nose', DARK())
animals.append(animal('fox', [body, tip, bib, *legs, nose, eyes(0.062, -0.5, 0.555, 0.016)]))

# ---------------------------------------------------------------- crab (its front is the long side; the game turns it to walk sideways)
shapes = [ell((0, 0.02, 0.17), (0.34, 0.22, 0.1)), ell((0, 0.02, 0.2), (0.26, 0.17, 0.1)),
          ell((0.08, -0.16, 0.31), (0.022, 0.022, 0.08)), ell((-0.08, -0.16, 0.31), (0.022, 0.022, 0.08))]
for s in (1, -1):
    shapes.append(ell((s * 0.3, -0.2, 0.2), (0.05, 0.13, 0.05), rot=(0, 0, R(-30 * s))))
    shapes.append(ell((s * 0.36, -0.36, 0.26), (0.11, 0.13, 0.085)))
    shapes.append(ell((s * 0.33, -0.48, 0.3), (0.035, 0.07, 0.03)))
    for y, a in ((-0.02, 20), (0.1, 0), (0.2, -22)):
        shapes.append(ell((s * 0.4, y, 0.15), (0.11, 0.028, 0.028), rot=(0, R(-28 * s), R(a * s))))
        shapes.append(ell((s * 0.52, y + a * 0.002, 0.07), (0.028, 0.028, 0.09)))
body = fuse(shapes, 'body', TINT(), voxel=0.03, faces=560, smooth=2, paint=coat(0.7, 1.0, mottle=0.3, freq=10))
animals.append(animal('crab', [body, eyes(0.08, -0.17, 0.4, 0.02)]))

# ---------------------------------------------------------------- turtle
def scutes(co, n):
    a = math.atan2(co.y - 0.02, co.x)
    ring = abs(math.sin(a * 5)) * abs(math.sin((co.x ** 2 + co.y ** 2) ** 0.5 * 26))
    v = (0.55 + 0.45 * sm(0.05, 0.4, ring)) * (1.0 - 0.25 * sm(0.0, 0.5, n.z) * 0)
    return (v, v, v)

shell = fuse([ell((0, 0.02, 0.2), (0.29, 0.35, 0.18)), ell((0, 0.02, 0.29), (0.2, 0.25, 0.13)), ell((0, 0.02, 0.12), (0.31, 0.37, 0.05))],
             'shell', TINT(), voxel=0.03, faces=420, paint=scutes)
skin = fuse([
    ell((0, -0.38, 0.19), (0.075, 0.12, 0.07)), ell((0, -0.48, 0.2), (0.06, 0.07, 0.055)), ell((0, 0.0, 0.1), (0.25, 0.31, 0.06)),
    ell((0.3, -0.2, 0.07), (0.13, 0.065, 0.03), rot=(0, 0, R(-32))), ell((-0.3, -0.2, 0.07), (0.13, 0.065, 0.03), rot=(0, 0, R(32))),
    ell((0.26, 0.25, 0.07), (0.1, 0.055, 0.03), rot=(0, 0, R(38))), ell((-0.26, 0.25, 0.07), (0.1, 0.055, 0.03), rot=(0, 0, R(-38))),
    ell((0, 0.4, 0.1), (0.025, 0.07, 0.025)),
], 'skin', mat('turtleskin', srgb(0x8a9a5e)), voxel=0.028, faces=380, paint=coat(0.7, 1.0, mottle=0.3, freq=18))
animals.append(animal('turtle', [shell, skin, eyes(0.052, -0.5, 0.225, 0.016)]))

# ---------------------------------------------------------------- heron
def heroncoat(co, n):
    v = 1.0 - 0.22 * sm(-0.3, 0.6, n.z)
    if co.z < 1.05 and abs(co.x) > 0.09:      # slate wings
        v *= 0.72
    return (v, v, v)

body = fuse([
    ell((0, 0.06, 0.92), (0.13, 0.3, 0.15), rot=(R(-12), 0, 0)),
    ell((0, 0.36, 0.84), (0.06, 0.15, 0.045), rot=(R(-22), 0, 0)),
    ell((0, -0.2, 1.14), (0.04, 0.055, 0.2), rot=(R(-22), 0, 0)), ell((0, -0.24, 1.4), (0.035, 0.052, 0.16), rot=(R(18), 0, 0)),
    ell((0, -0.3, 1.56), (0.055, 0.085, 0.052)),
    ell((0.12, 0.09, 0.92), (0.035, 0.25, 0.115), rot=(R(-10), 0, 0)), ell((-0.12, 0.09, 0.92), (0.035, 0.25, 0.115), rot=(R(-10), 0, 0)),
], 'body', TINT(), voxel=0.026, faces=560, paint=heroncoat)
beak = part([cone((0, -0.5, 1.55), 0.024, 0.3, rot=(R(90), 0, 0), verts=6)], 'beak', mat('heronbill', srgb(0xd9a53a)))
crest = part([ell((0, -0.2, 1.6), (0.012, 0.13, 0.016), rot=(R(-20), 0, 0), seg=8, rings=5), ell((0.045, -0.32, 1.585), (0.012, 0.06, 0.012), seg=6, rings=4), ell((-0.045, -0.32, 1.585), (0.012, 0.06, 0.012), seg=6, rings=4)], 'crest', DARK())
hl = mat('heronleg', srgb(0x8a7a52))
legs = [part([cone((x, 0.04, 0.4), 0.014, 0.8, verts=5, r2=0.011), ell((x, 0.04, 0.42), (0.02, 0.02, 0.025), seg=6, rings=4), ell((x, -0.04, 0.015), (0.035, 0.085, 0.012), seg=8, rings=5)], f'leg{k}', hl, (x, 0.04, 0.8)) for k, x in enumerate((0.05, -0.05))]
animals.append(animal('heron', [body, beak, crest, *legs, eyes(0.045, -0.35, 1.575, 0.013)]))

# ---------------------------------------------------------------- villager: a small person, about six heads tall
torso = fuse([ell((0, 0, 0.86), (0.145, 0.1, 0.23)), ell((0, 0, 1.0), (0.185, 0.095, 0.075)), ell((0, 0.005, 0.68), (0.15, 0.105, 0.11)), ell((0, 0, 0.58), (0.16, 0.11, 0.07))],
             'torso', TINT(), voxel=0.026, faces=320, paint=coat(0.8, 1.0))
headm = fuse([ell((0, 0, 1.105), (0.045, 0.048, 0.07)), ell((0, -0.005, 1.225), (0.092, 0.108, 0.118)), ell((0, -0.1, 1.2), (0.02, 0.028, 0.03)),
              ell((0.092, 0, 1.22), (0.015, 0.03, 0.04)), ell((-0.092, 0, 1.22), (0.015, 0.03, 0.04))], 'head', TINT2(), voxel=0.02, faces=300, paint=coat(0.9, 1.0))
hair = fuse([ell((0, 0.02, 1.285), (0.1, 0.118, 0.085)), ell((0, 0.075, 1.2), (0.09, 0.06, 0.1)), ell((0, -0.07, 1.31), (0.085, 0.05, 0.04))], 'hair', TINT3(), voxel=0.02, faces=220)
limbs = []
trou = mat('trouser', srgb(0x5a4a3a))
for k, x in enumerate((0.075, -0.075)):
    limbs.append(fuse([ell((x, 0, 0.36), (0.062, 0.07, 0.2)), ell((x, 0, 0.16), (0.048, 0.055, 0.15)), ell((x, -0.035, 0.03), (0.052, 0.1, 0.034))], f'leg{k}', trou,
                      voxel=0.024, faces=100, pivot=(x, 0, 0.56), paint=lambda co, n: (0.35, 0.28, 0.22) if co.z < 0.065 else (1, 1, 1)))
for k, x in enumerate((0.215, -0.215)):
    limbs.append(fuse([ell((x, 0, 0.87), (0.045, 0.05, 0.15)), ell((x, -0.005, 0.67), (0.036, 0.04, 0.14)), ell((x, -0.01, 0.53), (0.03, 0.04, 0.045))], f'arm{k}', TINT2(),
                      voxel=0.022, faces=90, pivot=(x, 0, 0.99), paint=lambda co, n: (0.82, 0.8, 0.78) if co.z > 0.8 else (1, 1, 1)))
animals.append(animal('villager', [torso, headm, hair, *limbs, eyes(0.036, -0.1, 1.245, 0.011)]))

# ---------------------------------------------------------------- fliers: wings are separate, hinged where they meet the body
def wing(name, side, lobes, material, pivot, paint=None):
    return part([ell((side * x, y, z), (sx, sy, 0.008), rot=(0, 0, R(side * rz)), seg=12, rings=6) for (x, y, z, sx, sy, rz) in lobes], name, material, pivot, paint=paint)


WING = lambda: mat('wing', srgb(0xffffff), alpha=0.5)

# butterfly: dark borders and veins on a coloured wing
def bflywing(co, n):
    d = (co.x ** 2 + co.y ** 2) ** 0.5
    edge = sm(0.27, 0.36, d)
    vein = sm(0.75, 1.0, abs(math.sin(math.atan2(co.y, abs(co.x)) * 9)))
    v = (1 - 0.82 * edge) * (1 - 0.35 * vein)
    return (v, v, v)

body = part([ell((0, 0, 0), (0.028, 0.17, 0.028), seg=8, rings=6), ell((0, -0.17, 0.0), (0.036, 0.036, 0.036), seg=8, rings=6),
             ell((0.03, -0.26, 0.03), (0.004, 0.07, 0.004), rot=(0, 0, R(-18)), seg=5, rings=4), ell((-0.03, -0.26, 0.03), (0.004, 0.07, 0.004), rot=(0, 0, R(18)), seg=5, rings=4)], 'body', DARK())
lobes = [(0.2, -0.1, 0, 0.2, 0.17, 25), (0.16, 0.12, 0, 0.14, 0.13, -30)]
animals.append(animal('butterfly', [body, wing('wingL', 1, lobes, TINT(), (0.02, 0, 0), bflywing), wing('wingR', -1, lobes, TINT(), (-0.02, 0, 0), bflywing)]))

body = fuse([ell((0, 0.04, 0), (0.085, 0.14, 0.085)), ell((0, -0.1, 0.0), (0.07, 0.075, 0.07)), ell((0, -0.2, 0.0), (0.055, 0.05, 0.055))], 'body', mat('bee', srgb(0xe2b02a)), voxel=0.018, faces=260,
            paint=lambda co, n: (0.12, 0.1, 0.08) if (co.y < -0.14 or abs(math.sin(co.y * 34)) > 0.72 and co.y > -0.02) else (1, 1, 1))
lobes = [(0.14, 0.0, 0.07, 0.13, 0.06, 15), (0.1, 0.07, 0.07, 0.08, 0.045, -10)]
animals.append(animal('bee', [body, wing('wingL', 1, lobes, WING(), (0.03, 0, 0.07)), wing('wingR', -1, lobes, WING(), (-0.03, 0, 0.07))]))

body = fuse([ell((0, 0, 0), (0.07, 0.13, 0.07)), ell((0, -0.13, 0.01), (0.05, 0.05, 0.05))], 'body', DARK(), voxel=0.02, faces=200)
lamp = part([ell((0, 0.14, -0.01), (0.075, 0.1, 0.075), seg=10, rings=7)], 'lamp', mat('glow', (1, 1, 0.5)))
lobes = [(0.16, 0.0, 0.06, 0.16, 0.07, 20)]
animals.append(animal('glimmer', [body, lamp, wing('wingL', 1, lobes, WING(), (0.03, 0, 0.06)), wing('wingR', -1, lobes, WING(), (-0.03, 0, 0.06))]))

# songbird: a small perching bird
body = fuse([
    ell((0, 0.02, 0.15), (0.085, 0.14, 0.092)), ell((0, -0.115, 0.235), (0.063, 0.068, 0.062)),
    ell((0, 0.25, 0.155), (0.032, 0.13, 0.012), rot=(R(6), 0, 0)),
    ell((0.03, 0.02, 0.04), (0.008, 0.008, 0.05)), ell((-0.03, 0.02, 0.04), (0.008, 0.008, 0.05)),
], 'body', TINT(), voxel=0.018, faces=420, paint=coat(0.7, 1.0, mottle=0.12, freq=22))
breast = part([ell((0, -0.07, 0.125), (0.066, 0.1, 0.07)), ell((0, -0.15, 0.215), (0.045, 0.04, 0.045))], 'breast', mat('breast', srgb(0xe6dcc6)))
beak = part([cone((0, -0.2, 0.235), 0.016, 0.07, rot=(R(90), 0, 0), verts=5)], 'beak', mat('beakdark', srgb(0x3a3430)))
lobes = [(0.17, 0.05, 0.19, 0.17, 0.085, 14), (0.3, 0.07, 0.19, 0.09, 0.05, 22)]
wshade = lambda co, n: (0.62 + 0.38 * sm(0.34, 0.08, abs(co.x)),) * 3
animals.append(animal('songbird', [body, breast, beak, eyes(0.05, -0.15, 0.255, 0.012),
                                    wing('wingL', 1, lobes, TINT(), (0.06, 0, 0.19), wshade), wing('wingR', -1, lobes, TINT(), (-0.06, 0, 0.19), wshade)]))

# owl
body = fuse([
    ell((0, 0.03, 0.22), (0.15, 0.16, 0.23)), ell((0, -0.02, 0.44), (0.16, 0.15, 0.14)),
    cone((0.1, -0.02, 0.585), 0.04, 0.09, verts=6), cone((-0.1, -0.02, 0.585), 0.04, 0.09, verts=6),
    ell((0, 0.17, 0.07), (0.08, 0.11, 0.035)),
], 'body', TINT(), voxel=0.026, faces=460, paint=coat(0.6, 1.0, mottle=0.45, freq=20))
discs = part([ell((0.07, -0.15, 0.45), (0.068, 0.025, 0.07), seg=12, rings=6), ell((-0.07, -0.15, 0.45), (0.068, 0.025, 0.07), seg=12, rings=6)], 'discs', mat('owlface', srgb(0xb8a07a)))
iris = part([ell((0.07, -0.172, 0.455), (0.021, 0.01, 0.021), seg=10, rings=6), ell((-0.07, -0.172, 0.455), (0.021, 0.01, 0.021), seg=10, rings=6)], 'iris', mat('iris', srgb(0xe0a020)))
beak = part([cone((0, -0.18, 0.41), 0.022, 0.06, rot=(R(125), 0, 0), verts=5)], 'beak', mat('beakdark', srgb(0x3a3430)))
lobes = [(0.22, 0.03, 0.3, 0.2, 0.13, 10), (0.37, 0.05, 0.3, 0.1, 0.08, 18)]
animals.append(animal('owl', [body, discs, iris, beak, eyes(0.07, -0.18, 0.455, 0.011),
                               wing('wingL', 1, lobes, TINT(), (0.12, 0, 0.3), wshade), wing('wingR', -1, lobes, TINT(), (-0.12, 0, 0.3), wshade)]))

# ---------------------------------------------------------------- wolf: a long-legged grey hunter
def wolfcoat(co, n):
    v = 1.0 - 0.38 * sm(-0.3, 0.6, n.z)
    if co.y < -0.5 and co.z < 0.62:       # pale muzzle and throat
        v = 1.15
    return (v, v, v)

body = fuse([
    ell((0, 0.05, 0.52), (0.13, 0.42, 0.15)), ell((0, -0.26, 0.55), (0.14, 0.16, 0.18)), ell((0, 0.34, 0.53), (0.12, 0.15, 0.14)),
    ell((0, -0.42, 0.67), (0.08, 0.1, 0.13), rot=(R(-35), 0, 0)),
    ell((0, -0.55, 0.75), (0.1, 0.12, 0.095)), ell((0, -0.72, 0.71), (0.048, 0.12, 0.05)),
    cone((0.07, -0.52, 0.88), 0.045, 0.14, verts=8), cone((-0.07, -0.52, 0.88), 0.045, 0.14, verts=8),
    ell((0, 0.62, 0.48), (0.075, 0.24, 0.08), rot=(R(30), 0, 0)),
], 'body', TINT(), voxel=0.026, faces=680, paint=wolfcoat)
legs = [leg(f'leg{k}', x, y, 0.48, TINT(), thick=0.046, paint=coat(0.75, 1.0)) for k, (x, y) in enumerate([(0.08, -0.28), (-0.08, -0.28), (0.085, 0.36), (-0.085, 0.36)])]
nose = part([ell((0, -0.845, 0.72), (0.024, 0.02, 0.02), seg=8, rings=6)], 'nose', DARK())
animals.append(animal('wolf', [body, *legs, nose, eyes(0.06, -0.63, 0.79, 0.016)]))

# ---------------------------------------------------------------- bear: heavy, round, hump-shouldered
body = fuse([
    ell((0, 0.05, 0.62), (0.3, 0.5, 0.3)), ell((0, -0.28, 0.7), (0.29, 0.24, 0.3)),          # body, shoulder hump
    ell((0, -0.58, 0.68), (0.17, 0.18, 0.16)), ell((0, -0.75, 0.62), (0.085, 0.11, 0.075)),     # head, muzzle
    ell((0.12, -0.55, 0.84), (0.05, 0.035, 0.05)), ell((-0.12, -0.55, 0.84), (0.05, 0.035, 0.05)),
], 'body', TINT(), voxel=0.034, faces=680, paint=coat(0.62, 1.0, mottle=0.1, freq=10))
legs = [leg(f'leg{k}', x, y, 0.5, TINT(), thick=0.1, paint=coat(0.55, 0.85), foot=0.03) for k, (x, y) in enumerate([(0.17, -0.3), (-0.17, -0.3), (0.18, 0.36), (-0.18, 0.36)])]
nose = part([ell((0, -0.86, 0.64), (0.035, 0.025, 0.028), seg=8, rings=6)], 'nose', DARK())
animals.append(animal('bear', [body, *legs, nose, eyes(0.08, -0.7, 0.74, 0.018)]))

# ---------------------------------------------------------------- beaver: a stout rodent with a flat scaly tail
body = fuse([
    ell((0, 0.0, 0.17), (0.15, 0.25, 0.15)), ell((0, -0.22, 0.2), (0.11, 0.11, 0.1)), ell((0, -0.31, 0.18), (0.06, 0.06, 0.05)),
    ell((0.06, -0.19, 0.29), (0.026, 0.02, 0.026)), ell((-0.06, -0.19, 0.29), (0.026, 0.02, 0.026)),
    ell((0.1, 0.06, 0.05), (0.045, 0.09, 0.05)), ell((-0.1, 0.06, 0.05), (0.045, 0.09, 0.05)), ell((0.08, -0.13, 0.05), (0.035, 0.05, 0.05)), ell((-0.08, -0.13, 0.05), (0.035, 0.05, 0.05)),
], 'body', TINT(), voxel=0.022, faces=440, paint=coat(0.62, 1.0, mottle=0.1, freq=18))
tail = fuse([ell((0, 0.36, 0.07), (0.075, 0.13, 0.022))], 'tail', mat('beavertail', srgb(0x3a3430)), voxel=0.018, faces=80, pivot=(0, 0.24, 0.1),
            paint=lambda co, n: ((0.75 + 0.25 * sm(0.4, 0.6, abs(math.sin(co.x * 60) * math.sin(co.y * 60)))),) * 3)
teeth = part([cube((0, -0.355, 0.15), (0.03, 0.01, 0.03))], 'teeth', mat('teeth', srgb(0xe8c87a)))
animals.append(animal('beaver', [body, tail, teeth, eyes(0.05, -0.27, 0.23, 0.013)]))

# ---------------------------------------------------------------- camel: long-legged, one hump, a swan neck
body = fuse([
    ell((0, 0.05, 1.12), (0.19, 0.46, 0.2)), ell((0, -0.05, 1.32), (0.15, 0.2, 0.17)),                 # body, hump
    ell((0, 0.42, 1.08), (0.15, 0.14, 0.16)),
    ell((0, -0.5, 1.12), (0.075, 0.2, 0.09), rot=(R(30), 0, 0)), ell((0, -0.66, 1.34), (0.065, 0.06, 0.2), rot=(R(-15), 0, 0)),   # neck dips then rises
    ell((0, -0.74, 1.56), (0.075, 0.15, 0.075), rot=(R(10), 0, 0)), ell((0, -0.88, 1.53), (0.05, 0.06, 0.05)),                  # head, muzzle
    ell((0.06, -0.68, 1.64), (0.018, 0.02, 0.04)), ell((-0.06, -0.68, 1.64), (0.018, 0.02, 0.04)),
    ell((0, 0.58, 1.02), (0.03, 0.03, 0.16), rot=(R(25), 0, 0)),
], 'body', TINT(), voxel=0.03, faces=640, paint=coat(0.78, 1.0, mottle=0.06, freq=10))
legs = [leg(f'leg{k}', x, y, 0.98, TINT(), thick=0.06, paint=coat(0.8, 1.0, extra=lambda co, n, c: (0.55, 0.5, 0.45) if co.z < 0.06 else c), foot=0.02)
        for k, (x, y) in enumerate([(0.11, -0.28), (-0.11, -0.28), (0.11, 0.4), (-0.11, 0.4)])]
animals.append(animal('camel', [body, *legs, eyes(0.07, -0.79, 1.6, 0.016)]))

# ---------------------------------------------------------------- goat: nimble, bearded, horns swept back
body = fuse([
    ell((0, 0.04, 0.6), (0.14, 0.32, 0.15)), ell((0, -0.22, 0.63), (0.13, 0.14, 0.16)), ell((0, 0.28, 0.62), (0.13, 0.13, 0.14)),
    ell((0, -0.36, 0.8), (0.06, 0.08, 0.16), rot=(R(-30), 0, 0)),
    ell((0, -0.46, 0.96), (0.065, 0.12, 0.07), rot=(R(25), 0, 0)), ell((0, -0.57, 0.9), (0.042, 0.06, 0.045)),
    ell((0, -0.52, 0.8), (0.022, 0.03, 0.07)),                                                              # beard
    ell((0.09, -0.42, 1.0), (0.05, 0.02, 0.022), rot=(0, R(-20), 0)), ell((-0.09, -0.42, 1.0), (0.05, 0.02, 0.022), rot=(0, R(20), 0)),
    ell((0, 0.4, 0.72), (0.03, 0.06, 0.05), rot=(R(-40), 0, 0)),
], 'body', TINT(), voxel=0.024, faces=560, paint=coat(0.7, 1.0, mottle=0.12, freq=12))
legs = [leg(f'leg{k}', x, y, 0.5, TINT(), thick=0.04, paint=hoofed(0.05)) for k, (x, y) in enumerate([(0.07, -0.22), (-0.07, -0.22), (0.075, 0.28), (-0.075, 0.28)])]
horns = part([cone((0.04, -0.38, 1.1), 0.022, 0.24, rot=(R(-45), R(10), 0), verts=6), cone((-0.04, -0.38, 1.1), 0.022, 0.24, rot=(R(-45), R(-10), 0), verts=6)], 'horns', mat('goathorn', srgb(0x8a7a62)))
animals.append(animal('goat', [body, *legs, horns, eyes(0.055, -0.5, 1.0, 0.015)]))

# ---------------------------------------------------------------- penguin: upright, black back, white front, orange beak and feet
def pengcoat(co, n):
    front = sm(-0.1, -0.45, n.y) * (1 - sm(0.92, 1.05, co.z)) if co.z < 1.0 else 0.0
    v = 0.16 + 0.84 * front
    return (v, v, v)

body = fuse([
    ell((0, 0, 0.36), (0.17, 0.15, 0.3)), ell((0, -0.01, 0.66), (0.115, 0.11, 0.12)), ell((0, 0.13, 0.12), (0.06, 0.06, 0.05)),
], 'body', mat('penguin', srgb(0xf4f4f0)), voxel=0.024, faces=380, paint=pengcoat)
beak = part([cone((0, -0.15, 0.66), 0.028, 0.1, rot=(R(95), 0, 0), verts=6)], 'beak', mat('pengbill', srgb(0xe89a2a)))
fl = mat('pengwing', srgb(0x2a2a30))
flips = [part([ell((side * 0.17, 0.0, 0.32), (0.025, 0.07, 0.17), rot=(0, R(side * -12), 0), seg=8, rings=6)], f'arm{k}', fl, (side * 0.16, 0.0, 0.5)) for k, side in enumerate((1, -1))]
feet = [part([ell((x, -0.06, 0.02), (0.045, 0.07, 0.018), seg=8, rings=5)], f'leg{k}', mat('pengfeet', srgb(0xe8902a)), (x, 0, 0.1)) for k, x in enumerate((0.07, -0.07))]
cheek = part([ell((0.06, -0.08, 0.72), (0.03, 0.03, 0.02), seg=8, rings=5), ell((-0.06, -0.08, 0.72), (0.03, 0.03, 0.02), seg=8, rings=5)], 'cheek', mat('pengcheek', srgb(0xf2d050)))
animals.append(animal('penguin', [body, beak, *flips, *feet, cheek, eyes(0.05, -0.095, 0.7, 0.012)]))

# ---------------------------------------------------------------- flamingo: a pink wader with an S-neck and a bent bill
def flamcoat(co, n):
    v = 1.0 - 0.18 * sm(-0.3, 0.6, n.z)
    if co.y > 0.2 and co.z < 1.02:        # darker flight feathers at the back
        v *= 0.8
    return (v, v, v)

body = fuse([
    ell((0, 0.05, 0.94), (0.13, 0.26, 0.13), rot=(R(-8), 0, 0)), ell((0, 0.3, 0.92), (0.07, 0.12, 0.05), rot=(R(-20), 0, 0)),
    ell((0, -0.14, 1.12), (0.035, 0.05, 0.18), rot=(R(-35), 0, 0)), ell((0, -0.13, 1.36), (0.032, 0.05, 0.14), rot=(R(30), 0, 0)),
    ell((0, -0.2, 1.52), (0.034, 0.05, 0.1), rot=(R(-10), 0, 0)), ell((0, -0.23, 1.62), (0.05, 0.07, 0.045)),
], 'body', mat('flamingo', srgb(0xf49aa8)), voxel=0.022, faces=500, paint=flamcoat)
bill = part([cone((0, -0.33, 1.6), 0.026, 0.14, rot=(R(80), 0, 0), verts=6), cone((0, -0.4, 1.53), 0.017, 0.1, rot=(R(150), 0, 0), verts=6)], 'bill', mat('flambill', srgb(0x2a2626)))
fleg = mat('flamleg', srgb(0xe07a8a))
legs = [part([cone((x, 0.05, 0.42), 0.012, 0.84, verts=5, r2=0.01), ell((x, 0.05, 0.44), (0.018, 0.018, 0.022), seg=6, rings=4), ell((x, -0.02, 0.015), (0.03, 0.07, 0.01), seg=8, rings=5)], f'leg{k}', fleg, (x, 0.05, 0.84)) for k, x in enumerate((0.045, -0.045))]
animals.append(animal('flamingo', [body, bill, *legs, eyes(0.04, -0.27, 1.64, 0.011)]))

# ---------------------------------------------------------------- squirrel: small, upright, with a great plumed tail
body = fuse([
    ell((0, 0.02, 0.16), (0.09, 0.15, 0.11)), ell((0, -0.1, 0.24), (0.075, 0.08, 0.09)),
    ell((0, -0.17, 0.33), (0.065, 0.075, 0.06)), ell((0, -0.23, 0.31), (0.035, 0.04, 0.035)),
    ell((0.035, -0.15, 0.4), (0.014, 0.01, 0.035)), ell((-0.035, -0.15, 0.4), (0.014, 0.01, 0.035)),
    ell((0.07, 0.08, 0.04), (0.03, 0.08, 0.04)), ell((-0.07, 0.08, 0.04), (0.03, 0.08, 0.04)),
], 'body', TINT(), voxel=0.018, faces=380, paint=coat(0.7, 1.0, extra=lambda co, n, c: (1.25, 1.2, 1.1) if n.z < -0.2 and co.y < 0.05 else c))
tail = fuse([ell((0, 0.2, 0.2), (0.07, 0.09, 0.14), rot=(R(-20), 0, 0)), ell((0, 0.22, 0.38), (0.08, 0.08, 0.12), rot=(R(25), 0, 0)), ell((0, 0.17, 0.5), (0.06, 0.06, 0.06))],
            'tail', TINT(), voxel=0.02, faces=180, pivot=(0, 0.12, 0.15), paint=coat(0.8, 1.0, mottle=0.2, freq=20))
animals.append(animal('squirrel', [body, tail, eyes(0.045, -0.2, 0.35, 0.012)]))

# ---------------------------------------------------------------- hedgehog: a round prickly back over a pale face
spines = fuse([ell((0, 0.04, 0.13), (0.15, 0.2, 0.13))], 'spines', mat('spines', srgb(0x6a5440)), voxel=0.02, faces=360,
              paint=lambda co, n: ((0.6 + 0.4 * blotch(co, 40)),) * 3)
face = fuse([ell((0, -0.15, 0.08), (0.075, 0.09, 0.065)), ell((0, -0.24, 0.07), (0.03, 0.04, 0.03)), ell((0, 0.0, 0.04), (0.12, 0.17, 0.04))], 'face', mat('hogface', srgb(0xd8c0a0)), voxel=0.016, faces=160)
nose = part([ell((0, -0.275, 0.07), (0.014, 0.012, 0.012), seg=6, rings=4)], 'nose', DARK())
animals.append(animal('hedgehog', [spines, face, nose, eyes(0.035, -0.2, 0.1, 0.01)]))

# ---------------------------------------------------------------- seal: a sleek grey body, flippers and whiskered face
body = fuse([
    ell((0, 0.05, 0.16), (0.16, 0.42, 0.15)), ell((0, -0.32, 0.22), (0.12, 0.13, 0.12)), ell((0, -0.44, 0.22), (0.06, 0.07, 0.055)),
    ell((0, 0.48, 0.08), (0.12, 0.08, 0.025)),
    ell((0.15, -0.12, 0.05), (0.1, 0.05, 0.02), rot=(0, 0, R(-20))), ell((-0.15, -0.12, 0.05), (0.1, 0.05, 0.02), rot=(0, 0, R(20))),
], 'body', TINT(), voxel=0.024, faces=440, paint=coat(0.65, 1.0, mottle=0.35, freq=14))
animals.append(animal('seal', [body, eyes(0.06, -0.4, 0.27, 0.016), part([ell((0, -0.495, 0.23), (0.016, 0.012, 0.012), seg=6, rings=4)], 'nose', DARK())]))

# ---------------------------------------------------------------- boar: bristly, heavy-shouldered, with small tusks
body = fuse([
    ell((0, 0.06, 0.42), (0.18, 0.36, 0.2)), ell((0, -0.18, 0.47), (0.19, 0.18, 0.23)),
    ell((0, -0.38, 0.4), (0.11, 0.13, 0.12)), ell((0, -0.52, 0.36), (0.07, 0.08, 0.065)),
    ell((0.08, -0.36, 0.52), (0.035, 0.02, 0.05)), ell((-0.08, -0.36, 0.52), (0.035, 0.02, 0.05)),
    ell((0, -0.14, 0.66), (0.05, 0.26, 0.05)),
], 'body', TINT(), voxel=0.026, faces=560, paint=coat(0.62, 1.0, mottle=0.25, freq=22))
legs = [leg(f'leg{k}', x, y, 0.32, TINT(), thick=0.045, paint=hoofed(0.04)) for k, (x, y) in enumerate([(0.1, -0.22), (-0.1, -0.22), (0.1, 0.26), (-0.1, 0.26)])]
snout = part([ell((0, -0.59, 0.35), (0.05, 0.02, 0.045), seg=8, rings=6)], 'snout', mat('snout', srgb(0x4a3430)))
tusks = part([cone((0.06, -0.52, 0.32), 0.012, 0.08, rot=(R(-30), R(20), 0), verts=5), cone((-0.06, -0.52, 0.32), 0.012, 0.08, rot=(R(-30), R(-20), 0), verts=5)], 'tusks', mat('tusk', srgb(0xeee4cc)))
animals.append(animal('boar', [body, *legs, snout, tusks, eyes(0.07, -0.45, 0.45, 0.014)]))

# ---------------------------------------------------------------- props
# a rowing boat for villagers on the water: hull hollowed with a boolean, a thwart to sit on
hull = join([ell((0, 0, 0.12), (0.34, 0.74, 0.26))], 'hull')
inner = join([ell((0, 0, 0.2), (0.27, 0.64, 0.24))], 'inner')
bm = hull.modifiers.new('hollow', 'BOOLEAN')
bm.operation = 'DIFFERENCE'
bm.object = inner
bake(hull)
bpy.data.objects.remove(inner)
active(hull)
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.bisect(plane_co=(0, 0, 0.2), plane_no=(0, 0, 1), clear_outer=True)
bpy.ops.object.mode_set(mode='OBJECT')
finish(hull, mat('hull', srgb(0x9a6a3c)))
thwart = part([cube((0, 0.08, 0.15), (0.56, 0.12, 0.03))], 'thwart', mat('thwart', srgb(0xc79a62)))
# floorboards above the waterline, so the lake is not seen through the bottom
floor = part([ell((0, 0, 0.03), (0.275, 0.65, 0.025), seg=16, rings=6)], 'floor', mat('thwart', srgb(0xc79a62)))
animals.append(animal('boat', [hull, thwart, floor]))

# ---------------------------------------------------------------- export
tris = 0
for o in scene.objects:
    if o.type == 'MESH':
        o.data.calc_loop_triangles()
        tris += len(o.data.loop_triangles)
bpy.ops.export_scene.gltf(
    filepath=OUT, export_format='GLB', export_yup=True, export_apply=False, export_normals=True,
    export_texcoords=False, export_materials='EXPORT', export_vertex_color='ACTIVE', export_all_vertex_colors=False, export_animations=False, export_cameras=False, export_lights=False,
)
print(f'animals: {len(animals)}  triangles: {tris}  ->  {os.path.getsize(OUT) / 1024:.0f} KB  {os.path.normpath(OUT)}')
