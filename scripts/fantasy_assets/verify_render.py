"""Independently reimport an exported GLB, measure it, and render its real mesh."""
import bpy, sys, json, hashlib
from pathlib import Path
from mathutils import Vector

path=Path(sys.argv[-1]).resolve()
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(path))
bpy.context.view_layer.update()
# The Blender importer creates hidden bone-display shapes in glTF_not_exported;
# those editor helpers are not meshes in the GLB and do not render in the game.
objects=[o for o in bpy.context.scene.objects if o.type=='MESH' and not o.hide_render and any(not c.hide_render for c in o.users_collection)]
points=[o.matrix_world@Vector(corner) for o in objects for corner in o.bound_box]
lo=Vector([min(p[i] for p in points) for i in range(3)])
hi=Vector([max(p[i] for p in points) for i in range(3)])
triangles=0
for o in objects:
    o.data.calc_loop_triangles();triangles+=len(o.data.loop_triangles)
assert 0<triangles<=1600,(path,triangles)
assert abs(lo.z)<.2,lo
for im in bpy.data.images:
    if im.type=='IMAGE' and im.size[0]:assert max(im.size)<=512
evidence={'file':path.name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'reimportTriangles':triangles,'meshObjects':len(objects),'boundsBlenderZUp':{'min':list(lo),'max':list(hi)},'verified':'Blender GLB independent reimport; not live browser evidence'}
path.with_suffix('.evidence.json').write_text(json.dumps(evidence,indent=2)+'\n')
center=(lo+hi)/2;extent=max(hi-lo)
bpy.ops.mesh.primitive_plane_add(size=extent*200,location=(0,0,lo.z-.035))
floor=bpy.context.object;m=bpy.data.materials.new('Studio floor');m.diffuse_color=(.048,.064,.056,1);floor.data.materials.append(m)
bpy.ops.object.camera_add(location=center+Vector((extent*1.15,-extent*1.7,extent*.76)))
camera=bpy.context.object;camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=extent*1.35;bpy.context.scene.camera=camera
for position,power,size in [((4,-5,9),1500,5),((-5,-1,5),950,5),((0,5,7),1800,4)]:
    bpy.ops.object.light_add(type='AREA',location=position);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(center-o.location).to_track_quat('-Z','Y').to_euler()
s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.samples=32;s.cycles.use_denoising=True;s.render.resolution_x=1000;s.render.resolution_y=1000;s.render.resolution_percentage=100
s.world.color=(.15,.15,.15);s.view_settings.view_transform='AgX';s.render.filepath=str(path.with_suffix('.preview.png'))
bpy.ops.render.render(write_still=True)
print(json.dumps(evidence))
