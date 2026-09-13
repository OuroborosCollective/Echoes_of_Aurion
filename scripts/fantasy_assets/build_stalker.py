"""Original rigged Clockwork Stalker; metre scale, nine moving clips, <=1600 triangles."""
import math,json
import bpy
import numpy as np
from mathutils import Vector,Quaternion
import build as b
P=math.pi

def metal_atlas():
    # Refinish this model's dark plates as scratched iron, without changing the
    # oak generator's atlas or adding materials / texture fetches.
    rng=np.random.default_rng(221300)
    y,x=np.mgrid[0:128,0:128]
    field=.88+rng.normal(0,.025,(128,128))+.055*np.sin(x*.19+y*.02)
    scratches=((x*13+y*3)%127<2)*.07
    field+=scratches
    for name in ['aurion_color','aurion_orm','aurion_normal']:
        im=bpy.data.images[name];data=np.array(im.pixels[:],dtype=np.float32).reshape(512,512,4)
        tile=data[256:384,0:128,:]
        if name=='aurion_color':tile[:,:,:3]=np.clip(np.array([52,67,73])[None,None,:]/255*field[:,:,None],0,1)
        elif name=='aurion_orm':tile[:,:,0]=1;tile[:,:,1]=.53+scratches;tile[:,:,2]=.72
        else:
            gy,gx=np.gradient(field);tile[:,:,0]=.5-gx*.30;tile[:,:,1]=.5-gy*.30;tile[:,:,2]=1
        im.pixels.foreach_set(data.ravel());im.save()
        payload=b.Path(im.filepath_raw).read_bytes()
        im.pack(data=payload,data_len=len(payload))


def box(name,pos,scale,tile,bone):
    bpy.ops.mesh.primitive_cube_add(size=1,location=pos)
    o=bpy.context.object;o.name=name;o.scale=scale
    return b.finish(o,tile,bone)


def shell(name,rings,tile,bone,n=8):
    # Cross sections along the creature's longitudinal (-Y forward) axis.
    vs=[(rx*math.cos(2*P*i/n),y,z+rz*math.sin(2*P*i/n)) for y,z,rx,rz in rings for i in range(n)]
    fs=[tuple(range(n)),tuple(reversed(range((len(rings)-1)*n,len(rings)*n)))]
    fs += [(j*n+i,(j+1)*n+i,(j+1)*n+(i+1)%n,j*n+(i+1)%n) for j in range(len(rings)-1) for i in range(n)]
    o=b.mesh(name,vs,fs,tile,bone)
    # Orient outward independently of cross-section winding.
    bpy.context.view_layer.objects.active=o;o.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT');o.select_set(False)
    return o


def make_rig():
    defs={
      'Root':((0,0,0),(0,0,.2),None),
      'Hips':((0,.48,.86),(0,.18,.95),'Root'),
      'Spine':((0,.18,.95),(0,-.22,1.0),'Hips'),
      'Chest':((0,-.22,1.0),(0,-.49,1.15),'Spine'),
      'Neck':((0,-.49,1.15),(0,-.68,1.32),'Chest'),
      'Head':((0,-.68,1.32),(0,-.93,1.34),'Neck'),
      'Jaw':((0,-.79,1.2),(0,-1.10,1.14),'Head'),
      'Tail01':((0,.67,.92),(0,.94,.84),'Hips'),
      'Tail02':((0,.94,.84),(0,1.20,.62),'Tail01'),
      'Tail03':((0,1.20,.62),(0,1.36,.43),'Tail02'),
    }
    for side,s in [('L',1),('R',-1)]:
      for end,y,z in [('Front',-.42,1.0),('Rear',.48,.9)]:
        parent='Chest' if end=='Front' else 'Hips'
        knee_y=y+.11 if end=='Front' else y-.10
        ankle_y=y+.02 if end=='Front' else y+.18
        defs[end+'Upper_'+side]=((s*.25,y,z),(s*.27,knee_y,.49),parent)
        defs[end+'Lower_'+side]=((s*.27,knee_y,.49),(s*.27,ankle_y,.13),end+'Upper_'+side)
        defs[end+'Paw_'+side]=((s*.27,ankle_y,.13),(s*.27,ankle_y-.18,.07),end+'Lower_'+side)
    bpy.ops.object.armature_add(enter_editmode=True)
    arm=bpy.context.object;arm.name='Aurion clockwork_stalker monster rig'
    arm.data.edit_bones.remove(arm.data.edit_bones[0])
    for name,(head,tail,parent) in defs.items():
        bone=arm.data.edit_bones.new(name);bone.head=head;bone.tail=tail
        if parent:bone.parent=arm.data.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    for bone in arm.pose.bones:bone.rotation_mode='QUATERNION'
    return arm,defs


def geometry(defs):
    shell('Dark articulated ribcage',[(.64,.88,.18,.20),(.38,.91,.25,.29),(-.13,1.0,.26,.30),(-.43,1.05,.25,.29),(-.55,1.11,.19,.23)],8,'Spine')
    shell('Overlapping brass breastplate',[(-.50,1.14,.20,.25),(-.40,1.14,.31,.32),(-.23,1.12,.31,.31),(-.14,1.10,.22,.22)],3,'Chest')
    shell('Hindquarter plated shell',[(.64,.89,.18,.19),(.46,.92,.28,.27),(.28,.96,.20,.22)],3,'Hips')
    shell('Neck layered dark steel',[(-.52,1.2,.16,.20),(-.68,1.3,.13,.21),(-.78,1.33,.14,.18)],8,'Neck')
    shell('Chiselled wolf mask',[(-.69,1.37,.14,.15),(-.83,1.38,.20,.19),(-.96,1.30,.14,.12),(-1.20,1.25,.09,.07)],3,'Head')
    shell('Lower jaw',[(-.78,1.18,.10,.055),(-.97,1.13,.13,.065),(-1.17,1.15,.08,.03)],8,'Jaw',6)
    box('Dark nose',(0,-1.205,1.265),(.15,.045,.085),15,'Head')
    for side,s in [('L',1),('R',-1)]:
      eye=box('Aether eye '+side,(s*.168,-.91,1.365),(.045,.125,.045),11,'Head');eye.rotation_euler.z=s*.15
      brow=box('Protective brow '+side,(s*.17,-.89,1.408),(.065,.16,.045),8,'Head');brow.rotation_euler.y=-s*.28
      b.mesh('Wolf ear '+side,[(s*.10,-.73,1.49),(s*.23,-.72,1.47),(s*.205,-.60,1.78),(s*.15,-.65,1.50)],[(0,1,2),(0,2,3),(1,3,2),(0,3,1)],3,'Head')
      b.mesh('Dark inset ear '+side,[(s*.125,-.735,1.51),(s*.209,-.724,1.51),(s*.199,-.635,1.71)],[(0,1,2)],8,'Head')
      for y in [-.91,-1.04]:
        b.rod('Fang '+side,(s*.105,y,1.235),(s*.104,y-.017,1.105),.025,0,13,'Head',4)
      for end in ['Front','Rear']:
        up=end+'Upper_'+side;low=end+'Lower_'+side;paw=end+'Paw_'+side
        a,knee,_=defs[up];_,ankle,_=defs[low]
        b.rod('Upper leg piston '+up,a,knee,.135,.072,8,up,7)
        b.rod('Shin armour '+low,knee,ankle,.083,.045,3,low,7)
        b.ell('Round joint '+up,knee,(.10,.10,.105),4,low,6,4)
        b.ell('Shoulder guard '+up,a,(.155,.16,.165),3,up,8,4)
        y=ankle[1]
        o=shell('Clawed paw '+paw,[(y+.07,.075,.08,.065),(y-.10,.068,.105,.058),(y-.20,.045,.082,.035)],8,paw,6);o.location.x=s*.27
        for off in [-.060,0,.060]:
          b.rod('Dark claw',(s*.27+off,y-.155,.05),(s*.27+off,y-.255,.024),.026,0,13,paw,4)
    for i,(y,z) in enumerate([(.34,1.22),(.09,1.30),(-.14,1.34)]):
      b.mesh('Dorsal armour ridge', [(-.105,y-.10,z),(.105,y-.10,z),(.10,y+.13,z),(-.10,y+.13,z),(0,y+.05,z+.16)],[(0,1,4),(1,2,4),(2,3,4),(3,0,4),(0,3,2,1)],3,'Spine')
    for name in ['Tail01','Tail02','Tail03']:
      a,c,_=defs[name];b.rod('Segmented tail',a,c,.10 if name=='Tail01' else .075,.06 if name=='Tail01' else .025,3,name,7)
    # Flat rune inlays use the existing shared atlas, no additional material/draw call.
    for s in [-1,1]:
      box('Chest rune inlay',(s*.307,-.34,1.19),(.012,.11,.16),11,'Chest')
      for y in [-.04,.10]:box('Side rib inlay',(s*.253,y,1.045),(.012,.035,.22),4,'Spine')


def animate(arm):
    bpy.context.scene.render.fps=24;arm.animation_data_create()
    durations={'Idle':48,'Walk':32,'Run':20,'Attack':24,'Death':40,'CastSpell':40,'Jump':32,'Fall':32,'Block':32}
    def rotate(name,angle,axis=(1,0,0)):
      pb=arm.pose.bones[name];basis=pb.bone.matrix_local.to_quaternion()
      pb.rotation_quaternion=basis.inverted()@Quaternion(Vector(axis),angle)@basis
    def shift(name,vector):
      pb=arm.pose.bones[name];pb.location=pb.bone.matrix_local.to_quaternion().inverted()@Vector(vector)
    for name,frames in durations.items():
      action=bpy.data.actions.new(name);arm.animation_data.action=action
      for f in range(0,frames+1,2):
        t=f/frames;wave=math.sin(t*2*P);arc=math.sin(t*P)
        for pb in arm.pose.bones:pb.rotation_quaternion=(1,0,0,0);pb.location=(0,0,0)
        rotate('Chest',.016*wave);rotate('Head',.025*wave)
        rotate('Tail01',.065*wave,(0,0,1));rotate('Tail02',.10*wave,(0,0,1))
        if name in ['Walk','Run']:
          amp=.42 if name=='Walk' else .70
          for side,s in [('L',1),('R',-1)]:
            for end,phase in [('Front',s),('Rear',-s)]:
              swing=wave*phase
              rotate(end+'Upper_'+side,amp*swing)
              rotate(end+'Lower_'+side,-.65*max(0,swing))
              rotate(end+'Paw_'+side,.22*max(0,swing))
          shift('Root',(0,0,.025*(1-math.cos(4*P*t))))
          rotate('Spine',.06*wave)
        elif name=='Attack':
          strike=math.sin(P*min(1,max(0,(t-.14)/.68)))
          rotate('Chest',-.18*strike);rotate('Neck',-.28*strike);rotate('Head',-.25*strike);rotate('Jaw',.55*arc)
          for side in ['L','R']:rotate('FrontUpper_'+side,-.38*strike);rotate('FrontLower_'+side,.18*strike)
          shift('Root',(0,-.10*strike,0))
        elif name=='Death':
          amount=min(1,t*1.55)
          angle=P*.48*amount
          rotate('Root',angle,(0,1,0))
          # Roll about the torso, then settle the side onto the floor.
          shift('Root',(-.9*math.sin(angle),0,.9*(1-math.cos(angle))-.44*amount))
          rotate('Neck',-.14*amount);rotate('Jaw',.18*amount)
          for end in ['Front','Rear']:
            for side in ['L','R']:rotate(end+'Lower_'+side,-.45*amount)
        elif name=='CastSpell':
          rotate('Neck',.48*arc);rotate('Head',.32*arc);rotate('Jaw',.48*arc)
          rotate('Tail01',-.24*arc);shift('Root',(0,0,.03*arc))
        elif name=='Jump':
          shift('Root',(0,0,.30*arc));rotate('Spine',.12*wave)
          for end in ['Front','Rear']:
            for side in ['L','R']:
              rotate(end+'Upper_'+side,-.55*arc if end=='Front' else .30*arc)
              rotate(end+'Lower_'+side,-.70*arc)
        elif name=='Fall':
          for end in ['Front','Rear']:
            for side in ['L','R']:
              rotate(end+'Upper_'+side,-.2 if end=='Front' else .2)
              rotate(end+'Lower_'+side,-.22-.025*wave)
          rotate('Head',-.12+.025*wave)
        elif name=='Block':
          shift('Root',(0,0,-.075));rotate('Neck',-.22+.025*wave)
          for side in ['L','R']:rotate('FrontUpper_'+side,.24);rotate('FrontLower_'+side,-.40)
        for pb in arm.pose.bones:
          pb.keyframe_insert('rotation_quaternion',frame=f);pb.keyframe_insert('location',frame=f)
      track=arm.animation_data.nla_tracks.new();track.name=name;track.strips.new(name,0,action);arm.animation_data.action=None;track.mute=True
    for pb in arm.pose.bones:pb.rotation_quaternion=(1,0,0,0);pb.location=(0,0,0)


if __name__=='__main__':
    b.reset();metal_atlas();arm,defs=make_rig();geometry(defs);animate(arm)
    b.export('aurion_clockwork_stalker_monster_lod0','auto',arm)
    (b.OUT/'aurion_clockwork_stalker_monster_lod0.source.json').write_text(json.dumps(b.manifest[-1],indent=2)+'\n')
