"""Measure actual independently imported, skinned vertices for every required clip."""
import bpy,json,sys,hashlib
from pathlib import Path
from mathutils import Vector
path=Path(sys.argv[-1]).resolve()
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(path))
arm=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH' and any(not c.hide_render for c in o.users_collection)]
assert len(meshes)==1
assert len(arm.data.bones)<=64
assert all(v.groups for o in meshes for v in o.data.vertices)
for track in arm.animation_data.nla_tracks:track.mute=True
clips={a.name.split('_Aurion')[0]:a for a in bpy.data.actions}
expected=['Idle','Walk','Run','Attack','Death','CastSpell','Jump','Fall','Block']
report=[]
for name in expected:
 action=next(a for a in bpy.data.actions if a.name==name or a.name.startswith(name+'_'))
 arm.animation_data.action=action
 if action.slots:arm.animation_data.action_slot=action.slots[0]
 samples=[];bounds=[]
 start,end=action.frame_range
 for i in range(9):
  frame=float(start)+(float(end)-float(start))*i/8
  bpy.context.scene.frame_set(int(frame),subframe=frame%1)
  bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get()
  obj=meshes[0].evaluated_get(deps);m=obj.to_mesh()
  pts=[obj.matrix_world@v.co for v in m.vertices];obj.to_mesh_clear()
  samples.append(pts)
  bounds.append({'min':[min(p[k] for p in pts) for k in range(3)],'max':[max(p[k] for p in pts) for k in range(3)]})
 displacement=max((p-q).length for points in samples[1:] for p,q in zip(points,samples[0]))
 assert displacement>.0001,(name,'No actual skinned motion')
 assert all(abs(v)<8 for bound in bounds for xyz in bound.values() for v in xyz),(name,'Exploding skin')
 if name=='Death':assert -.15<bounds[-1]['min'][2]<.15,('Death feet/side grounding',bounds[-1])
 report.append({'clip':name,'sampledPoses':9,'maxVertexDisplacementMeters':displacement,'lastPoseBounds':bounds[-1]})
result={'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'verification':'Blender independent GLB reimport; evaluated skinned vertices, not clip-name-only checks','bones':len(arm.data.bones),'clips':report}
path.with_suffix('.animation-evidence.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
