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

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'animals.glb')

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
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=1, location=loc, rotation=rot, scale=scale)
    return bpy.context.active_object


def cone(loc, r, depth, rot=(0, 0, 0), r2=0.0, verts=10):
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


def finish(o, material, pivot=None):
    for p in o.data.polygons:
        p.use_smooth = True
    o.data.materials.clear()
    o.data.materials.append(material)
    if pivot is not None:
        scene.cursor.location = Vector(pivot)
        active(o)
        bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    return o


def fuse(objs, name, material, voxel=0.05, faces=420, smooth=3, pivot=None):
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
    n = len(o.data.polygons)
    if n > faces:
        d = o.modifiers.new('decimate', 'DECIMATE')
        d.ratio = faces / n
        bake(o)
    return finish(o, material, pivot)


def part(objs, name, material, pivot=None):
    """Simple pieces (eyes, beaks, wings): joined as they are."""
    return finish(join(objs, name), material, pivot)


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

# ---------------------------------------------------------------- minnow (centred on the origin)
body = fuse([
    ell((0, 0, 0), (0.15, 0.46, 0.2)),
    ell((0, -0.3, 0.0), (0.11, 0.2, 0.15)),
    cone((0, 0.02, 0.2), 0.14, 0.2, rot=(R(-25), 0, 0)),          # dorsal fin
    ell((0.12, -0.1, -0.08), (0.02, 0.1, 0.05), rot=(0, R(35), R(20))),
    ell((-0.12, -0.1, -0.08), (0.02, 0.1, 0.05), rot=(0, R(-35), R(-20))),
], 'body', TINT(), voxel=0.035, faces=380)
tail = fuse([
    ell((0, 0.52, 0.09), (0.025, 0.16, 0.1), rot=(R(-28), 0, 0)),
    ell((0, 0.52, -0.09), (0.025, 0.16, 0.1), rot=(R(28), 0, 0)),
    ell((0, 0.42, 0), (0.05, 0.08, 0.07)),
], 'tail', mat('fin', srgb(0xfff3dc)), voxel=0.03, faces=120, pivot=(0, 0.4, 0))
animals.append(animal('minnow', [body, tail, eyes(0.1, -0.33, 0.05, 0.035)]))

# ---------------------------------------------------------------- duck
body = fuse([
    ell((0, 0.02, 0.2), (0.24, 0.36, 0.19)),
    ell((0, 0.3, 0.3), (0.12, 0.16, 0.1), rot=(R(35), 0, 0)),        # tail
    ell((0, -0.2, 0.38), (0.1, 0.1, 0.16)),                          # neck
    ell((0, -0.26, 0.56), (0.15, 0.16, 0.14)),                       # head
    ell((0.2, 0.06, 0.24), (0.07, 0.24, 0.12)),                      # wings
    ell((-0.2, 0.06, 0.24), (0.07, 0.24, 0.12)),
], 'body', TINT(), voxel=0.04, faces=460)
beak = part([ell((0, -0.44, 0.52), (0.075, 0.1, 0.03))], 'beak', ORANGE())
animals.append(animal('duck', [body, beak, eyes(0.1, -0.36, 0.61, 0.03)]))

# ---------------------------------------------------------------- frog
body = fuse([
    ell((0, 0, 0.16), (0.25, 0.29, 0.16)),
    ell((0, -0.2, 0.2), (0.2, 0.16, 0.13)),
    ell((0.13, -0.2, 0.32), (0.085, 0.085, 0.085)), ell((-0.13, -0.2, 0.32), (0.085, 0.085, 0.085)),   # eye bumps
    ell((0.24, 0.14, 0.08), (0.11, 0.2, 0.08), rot=(0, 0, R(-25))), ell((-0.24, 0.14, 0.08), (0.11, 0.2, 0.08), rot=(0, 0, R(25))),
    ell((0.2, -0.2, 0.05), (0.06, 0.1, 0.05)), ell((-0.2, -0.2, 0.05), (0.06, 0.1, 0.05)),
], 'body', TINT(), voxel=0.035, faces=460)
belly = part([ell((0, -0.06, 0.1), (0.2, 0.22, 0.1))], 'belly', mat('belly', srgb(0xe9efc0)))
animals.append(animal('frog', [body, belly, eyes(0.15, -0.26, 0.35, 0.04)]))

# ---------------------------------------------------------------- mossback
shell = fuse([
    ell((0, 0.03, 0.2), (0.4, 0.46, 0.3)),
    ell((0.16, 0.1, 0.4), (0.12, 0.12, 0.1)), ell((-0.14, -0.08, 0.42), (0.11, 0.11, 0.09)), ell((0.02, 0.22, 0.4), (0.1, 0.1, 0.08)),
    cube((0, 0, -0.2), (1.2, 1.2, 0.5)),
], 'shell', TINT(), voxel=0.045, faces=420)
# slice the underside flat
active(shell)
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.bisect(plane_co=(0, 0, 0.09), plane_no=(0, 0, 1), clear_inner=True, use_fill=True)
bpy.ops.object.mode_set(mode='OBJECT')
skin = fuse([
    ell((0, -0.44, 0.17), (0.16, 0.17, 0.14)),
    ell((0, -0.02, 0.07), (0.33, 0.42, 0.07)),
], 'skin', mat('skin', srgb(0xf2d9a8)), voxel=0.04, faces=260)
animals.append(animal('mossback', [shell, skin, eyes(0.09, -0.56, 0.23, 0.035)]))

# ---------------------------------------------------------------- rabbit
body = fuse([
    ell((0, 0.06, 0.25), (0.22, 0.32, 0.22)),
    ell((0, 0.2, 0.24), (0.2, 0.2, 0.2)),
    ell((0, -0.26, 0.46), (0.16, 0.18, 0.16)),
    ell((0, -0.4, 0.42), (0.09, 0.09, 0.08)),
    ell((0.14, -0.14, 0.07), (0.06, 0.1, 0.07)), ell((-0.14, -0.14, 0.07), (0.06, 0.1, 0.07)),
    ell((0.17, 0.2, 0.08), (0.08, 0.17, 0.08)), ell((-0.17, 0.2, 0.08), (0.08, 0.17, 0.08)),
], 'body', TINT(), voxel=0.04, faces=480)
earL = fuse([ell((0.08, -0.22, 0.78), (0.05, 0.035, 0.2))], 'earL', TINT(), voxel=0.03, faces=70, pivot=(0.08, -0.22, 0.6))
earR = fuse([ell((-0.08, -0.22, 0.78), (0.05, 0.035, 0.2))], 'earR', TINT(), voxel=0.03, faces=70, pivot=(-0.08, -0.22, 0.6))
puff = part([ell((0, 0.4, 0.28), (0.09, 0.09, 0.09), seg=10, rings=7)], 'puff', WHITE())
animals.append(animal('rabbit', [body, earL, earR, puff, eyes(0.13, -0.33, 0.5, 0.032)]))

# ---------------------------------------------------------------- deer
body = fuse([
    ell((0, 0.05, 0.74), (0.2, 0.44, 0.22)),
    ell((0, -0.3, 0.92), (0.1, 0.14, 0.26), rot=(R(-28), 0, 0)),       # neck
    ell((0, -0.44, 1.2), (0.12, 0.17, 0.12)),                          # head
    ell((0, -0.6, 1.16), (0.07, 0.1, 0.07)),                           # muzzle
    ell((0.12, -0.36, 1.32), (0.03, 0.06, 0.1), rot=(0, R(35), 0)), ell((-0.12, -0.36, 1.32), (0.03, 0.06, 0.1), rot=(0, R(-35), 0)),
], 'body', TINT(), voxel=0.04, faces=520)
legs = []
for k, (x, y) in enumerate([(0.11, -0.26), (-0.11, -0.26), (0.11, 0.34), (-0.11, 0.34)]):
    legs.append(fuse([ell((x, y, 0.3), (0.05, 0.055, 0.32)), ell((x, y, 0.04), (0.05, 0.06, 0.04))], f'leg{k}', TINT(), voxel=0.03, faces=70, pivot=(x, y, 0.6)))
antlers = part([
    cone((0.09, -0.4, 1.44), 0.022, 0.26, rot=(0, R(18), 0), verts=6), cone((-0.09, -0.4, 1.44), 0.022, 0.26, rot=(0, R(-18), 0), verts=6),
    cone((0.15, -0.4, 1.5), 0.016, 0.14, rot=(0, R(60), 0), verts=6), cone((-0.15, -0.4, 1.5), 0.016, 0.14, rot=(0, R(-60), 0), verts=6),
], 'antlers', mat('horn', srgb(0xe9dcc0)))
puff = part([ell((0, 0.5, 0.82), (0.07, 0.06, 0.08), seg=10, rings=7)], 'puff', WHITE())
nose = part([ell((0, -0.69, 1.17), (0.03, 0.025, 0.025), seg=8, rings=6)], 'nose', DARK())
animals.append(animal('deer', [body, *legs, antlers, puff, nose, eyes(0.1, -0.5, 1.25, 0.03)]))

# ---------------------------------------------------------------- fox
body = fuse([
    ell((0, 0.04, 0.36), (0.17, 0.38, 0.17)),
    ell((0, -0.38, 0.48), (0.15, 0.16, 0.14)),
    ell((0, -0.55, 0.43), (0.07, 0.11, 0.06)),                         # snout
    cone((0.09, -0.36, 0.66), 0.06, 0.16, verts=8), cone((-0.09, -0.36, 0.66), 0.06, 0.16, verts=8),
    ell((0, 0.52, 0.44), (0.11, 0.26, 0.11)),                          # tail
], 'body', TINT(), voxel=0.035, faces=520)
tip = fuse([ell((0, 0.74, 0.44), (0.085, 0.11, 0.085))], 'tip', WHITE(), voxel=0.03, faces=80)
chin = part([ell((0, -0.5, 0.38), (0.08, 0.14, 0.05))], 'chin', WHITE())
legs = []
for k, (x, y) in enumerate([(0.1, -0.24), (-0.1, -0.24), (0.1, 0.26), (-0.1, 0.26)]):
    legs.append(fuse([ell((x, y, 0.15), (0.045, 0.05, 0.16))], f'leg{k}', DARK(), voxel=0.03, faces=50, pivot=(x, y, 0.3)))
nose = part([ell((0, -0.66, 0.44), (0.028, 0.025, 0.025), seg=8, rings=6)], 'nose', DARK())
animals.append(animal('fox', [body, tip, chin, *legs, nose, eyes(0.1, -0.5, 0.53, 0.03)]))

# ---------------------------------------------------------------- crab (its front is the long side; the game turns it to walk sideways)
shapes = [ell((0, 0, 0.16), (0.3, 0.22, 0.12)),
          ell((0.34, -0.2, 0.2), (0.12, 0.09, 0.08)), ell((-0.34, -0.2, 0.2), (0.12, 0.09, 0.08)),
          ell((0.22, -0.14, 0.16), (0.1, 0.05, 0.05), rot=(0, 0, R(-40))), ell((-0.22, -0.14, 0.16), (0.1, 0.05, 0.05), rot=(0, 0, R(40))),
          ell((0.08, -0.14, 0.3), (0.02, 0.02, 0.08)), ell((-0.08, -0.14, 0.3), (0.02, 0.02, 0.08))]
for s in (1, -1):
    for y in (-0.04, 0.08, 0.18):
        shapes.append(ell((s * 0.36, y, 0.08), (0.13, 0.025, 0.025), rot=(0, R(-35 * s), R(18 * s * (y * 6)))))
body = fuse(shapes, 'body', TINT(), voxel=0.03, faces=520, smooth=2)
animals.append(animal('crab', [body, eyes(0.08, -0.15, 0.39, 0.035)]))

# ---------------------------------------------------------------- villager
torso = fuse([ell((0, 0, 0.62), (0.2, 0.15, 0.24)), ell((0, 0, 0.44), (0.21, 0.16, 0.12))], 'torso', TINT(), voxel=0.035, faces=260)
headm = fuse([ell((0, 0, 1.03), (0.18, 0.18, 0.18)), ell((0, -0.17, 1.0), (0.03, 0.03, 0.03))], 'head', TINT2(), voxel=0.03, faces=240)
hair = fuse([ell((0, 0.03, 1.1), (0.195, 0.2, 0.14)), ell((0, 0.14, 1.0), (0.17, 0.09, 0.14))], 'hair', TINT3(), voxel=0.03, faces=200)
limbs = []
for k, x in enumerate((0.09, -0.09)):
    limbs.append(fuse([ell((x, 0, 0.2), (0.07, 0.075, 0.2)), ell((x, -0.03, 0.03), (0.07, 0.1, 0.035))], f'leg{k}', mat('trouser', srgb(0x4a4038)), voxel=0.03, faces=70, pivot=(x, 0, 0.38)))
for k, x in enumerate((0.25, -0.25)):
    limbs.append(fuse([ell((x, 0, 0.6), (0.055, 0.06, 0.18)), ell((x, 0, 0.44), (0.055, 0.055, 0.05))], f'arm{k}', TINT2(), voxel=0.03, faces=60, pivot=(x, 0, 0.76)))
animals.append(animal('villager', [torso, headm, hair, *limbs, eyes(0.07, -0.165, 1.05, 0.024)]))

# ---------------------------------------------------------------- fliers: wings are separate, hinged where they meet the body
def wing(name, side, lobes, material, pivot):
    return part([ell((side * x, y, z), (sx, sy, 0.008), rot=(0, 0, R(side * rz)), seg=12, rings=6) for (x, y, z, sx, sy, rz) in lobes], name, material, pivot)


WING = lambda: mat('wing', srgb(0xffffff), alpha=0.5)

body = part([ell((0, 0, 0), (0.035, 0.17, 0.035), seg=8, rings=6), ell((0, -0.17, 0.0), (0.045, 0.045, 0.045), seg=8, rings=6)], 'body', DARK())
lobes = [(0.2, -0.1, 0, 0.2, 0.17, 25), (0.16, 0.12, 0, 0.14, 0.13, -30)]
animals.append(animal('butterfly', [body, wing('wingL', 1, lobes, TINT(), (0.02, 0, 0)), wing('wingR', -1, lobes, TINT(), (-0.02, 0, 0))]))

body = fuse([ell((0, 0.03, 0), (0.1, 0.15, 0.1)), ell((0, -0.14, 0.0), (0.075, 0.075, 0.075))], 'body', mat('bee', srgb(0xf2c230)), voxel=0.025, faces=220)
stripes = part([ell((0, 0.0, 0), (0.104, 0.028, 0.104), seg=12, rings=6), ell((0, 0.09, 0), (0.092, 0.026, 0.092), seg=12, rings=6), ell((0, -0.16, 0.0), (0.078, 0.06, 0.078), seg=10, rings=6)], 'stripes', DARK())
lobes = [(0.14, 0.0, 0.08, 0.13, 0.07, 15)]
animals.append(animal('bee', [body, stripes, wing('wingL', 1, lobes, WING(), (0.03, 0, 0.08)), wing('wingR', -1, lobes, WING(), (-0.03, 0, 0.08))]))

body = fuse([ell((0, 0, 0), (0.08, 0.13, 0.08)), ell((0, -0.13, 0.01), (0.06, 0.06, 0.06))], 'body', DARK(), voxel=0.025, faces=200)
lamp = part([ell((0, 0.14, -0.01), (0.085, 0.1, 0.085), seg=10, rings=7)], 'lamp', mat('glow', (1, 1, 0.5)))
lobes = [(0.16, 0.0, 0.06, 0.16, 0.08, 20)]
animals.append(animal('glimmer', [body, lamp, wing('wingL', 1, lobes, WING(), (0.03, 0, 0.06)), wing('wingR', -1, lobes, WING(), (-0.03, 0, 0.06))]))

body = fuse([
    ell((0, 0.02, 0.16), (0.14, 0.2, 0.14)),
    ell((0, -0.16, 0.3), (0.11, 0.115, 0.11)),
    ell((0, 0.3, 0.17), (0.07, 0.17, 0.025), rot=(R(8), 0, 0)),        # tail
], 'body', TINT(), voxel=0.03, faces=360)
belly = part([ell((0, -0.04, 0.11), (0.115, 0.16, 0.1))], 'belly', mat('belly', srgb(0xe9efc0)))
beak = part([cone((0, -0.3, 0.29), 0.035, 0.1, rot=(R(90), 0, 0), verts=6)], 'beak', ORANGE())
lobes = [(0.2, 0.04, 0.2, 0.2, 0.12, 12)]
animals.append(animal('songbird', [body, belly, beak, eyes(0.085, -0.23, 0.34, 0.024),
                                    wing('wingL', 1, lobes, TINT(), (0.1, 0, 0.2)), wing('wingR', -1, lobes, TINT(), (-0.1, 0, 0.2))]))

# ---------------------------------------------------------------- export
tris = 0
for o in scene.objects:
    if o.type == 'MESH':
        o.data.calc_loop_triangles()
        tris += len(o.data.loop_triangles)
bpy.ops.export_scene.gltf(
    filepath=OUT, export_format='GLB', export_yup=True, export_apply=False, export_normals=True,
    export_texcoords=False, export_materials='EXPORT', export_animations=False, export_cameras=False, export_lights=False,
)
print(f'animals: {len(animals)}  triangles: {tris}  ->  {os.path.getsize(OUT) / 1024:.0f} KB  {os.path.normpath(OUT)}')
