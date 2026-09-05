#!/usr/bin/env python3
"""Blender worker: import one model, ground it, export LODs or a convex collider."""
import sys
from pathlib import Path
import bpy
from mathutils import Matrix, Vector

if '--' not in sys.argv: raise SystemExit('expected -- SOURCE OUTPUT_DIR lods|collider')
a=sys.argv[sys.argv.index('--')+1:]
if len(a)!=3: raise SystemExit('expected SOURCE OUTPUT_DIR MODE')
src=Path(a[0]); out=Path(a[1]); mode=a[2]; out.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
if src.suffix.lower()=='.fbx': bpy.ops.import_scene.fbx(filepath=str(src),use_image_search=True,automatic_bone_orientation=False)
elif src.suffix.lower() in ('.glb','.gltf'): bpy.ops.import_scene.gltf(filepath=str(src))
elif src.suffix.lower()=='.obj': bpy.ops.wm.obj_import(filepath=str(src))
else: raise SystemExit(f'unsupported source: {src}')
obs=[o for o in bpy.context.scene.objects if o.type=='MESH']
if not obs: raise SystemExit('source produced no mesh objects')
verts=[o.matrix_world@Vector(c) for o in obs for c in o.bound_box]
minx,maxx=min(v.x for v in verts),max(v.x for v in verts); miny,maxy=min(v.y for v in verts),max(v.y for v in verts); minz=min(v.z for v in verts)
off=Matrix.Translation((-(minx+maxx)/2,-(miny+maxy)/2,-minz))
for o in obs:
    o.data=o.data.copy(); o.data.transform(o.matrix_world); o.matrix_world=off

def triangles(o): o.data.calc_loop_triangles(); return len(o.data.loop_triangles)
def selected():
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs:o.select_set(True)
    bpy.context.view_layer.objects.active=obs[0]

def export(path, materials=True):
    selected(); bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_materials='EXPORT' if materials else 'NONE',export_normals=materials,export_tangents=False,export_texcoords=materials,export_cameras=False,export_lights=False,export_animations=False,export_skins=False,export_yup=True,export_extras=True,export_apply=True,export_image_format='AUTO')
if mode=='collider':
    selected()
    bpy.context.view_layer.objects.active=obs[0]
    bpy.ops.object.join()
    root=bpy.context.active_object
    if root is None or root.type!='MESH': raise SystemExit(f'{src.stem}: collider join produced no mesh')
    root.name=f'{src.stem}_Collider'
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.convex_hull(); bpy.ops.object.mode_set(mode='OBJECT')
    n=triangles(root)
    if n>64:
        mod=root.modifiers.new('ColliderBudget','DECIMATE'); mod.decimate_type='COLLAPSE'; mod.ratio=max(.01,64/n*.95); bpy.context.view_layer.objects.active=root; bpy.ops.object.modifier_apply(modifier=mod.name)
    root['collider']=True; root['collision_shape']='convex_hull'; root['grounded']=True; root['pivot']='bottom_center'; export(out/f'{src.stem}_Collider.glb',False)
else:
    selected(); bpy.ops.object.join(); base=bpy.context.active_object; base.name=src.stem
    for lod,target in (('LOD0',1600),('LOD1',800),('LOD2',300)):
        # Work from a fresh copy so each LOD simplifies the same grounded source.
        root=base.copy(); root.data=base.data.copy(); bpy.context.collection.objects.link(root); root['grounded']=True; root['pivot']='bottom_center'; root['lod']=lod
        n=triangles(root)
        if n>target:
            mod=root.modifiers.new('TriangleBudget','DECIMATE'); mod.decimate_type='COLLAPSE'; mod.ratio=max(.01,target/n*.96); bpy.context.view_layer.objects.active=root; bpy.ops.object.modifier_apply(modifier=mod.name)
        if triangles(root)==0: raise SystemExit(f'{src.stem} {lod}: empty output')
        bpy.ops.object.select_all(action='DESELECT'); root.select_set(True); bpy.context.view_layer.objects.active=root
        bpy.ops.export_scene.gltf(filepath=str(out/f'{src.stem}_{lod}.glb'),export_format='GLB',use_selection=True,export_materials='EXPORT',export_normals=True,export_texcoords=True,export_cameras=False,export_lights=False,export_animations=False,export_skins=False,export_yup=True,export_extras=True,export_apply=True,export_image_format='AUTO')
        bpy.data.objects.remove(root,do_unlink=True)
    bpy.data.objects.remove(base,do_unlink=True)
