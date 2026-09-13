"""Original Aurion oak, metre scale, shared PBR atlas, 1,600 triangle ceiling.

Run with Blender 4.5's Python (bpy). No external art or gameplay metadata.
"""

from pathlib import Path

import argparse, json, math, random, struct, hashlib

import bpy

import numpy as np

from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]

OUT = ROOT / 'assets/fantasy-v1'

OUT.mkdir(parents=True, exist_ok=True)

P = math.pi

parts = []

mat = None

manifest = []

def atlas():
    colors = [(182,166,130),(36,86,91),(62,39,28),(174,125,57),
              (102,124,135),(173,119,83),(86,58,35),(125,131,119),
              (43,62,77),(46,83,53),(95,114,51),(45,189,182),
              (113,40,49),(215,201,162),(236,183,86),(28,31,34)]
    rng = np.random.default_rng(1600)
    size=512; tile=size//4
    rgba=np.ones((size,size,4),dtype=np.float32)
    packed=rgba.copy(); normal=rgba.copy()
    y,x=np.mgrid[0:tile,0:tile]
    for i,c in enumerate(colors):
        grain=rng.normal(0,.018,(tile,tile))
        field=.91+.08*np.sin(x*.1)*np.sin(y*.075)+grain
        if i in (2,6): field += .055*np.sin(x*.7+np.sin(y*.05)*2)
        if i in (0,1,12): field += .025*((x%3==0)+(y%3==0))
        if i in (7,8):
            mortar=(y%32<2)|((x+(y//32%2)*32)%64<2)
            field[mortar]*=.63
        if i in (9,10):
            # Broad leaf veins and a soft rim, readable without noisy normals.
            veins=np.exp(-abs(x-tile*.5)/2)*.08
            veins+=np.exp(-abs((y+abs(x-tile*.5)*.55)%24-12)/1.7)*.04
            field += veins+.09*(y/tile)
        if i in (3,4): field += .015*np.sin(y*2)
        row,col=i//4,i%4; s=np.s_[row*tile:(row+1)*tile,col*tile:(col+1)*tile]
        rgba[s][:,:,:3]=np.clip(np.array(c)/255*field[:,:,None],0,1)
        rough=.36 if i in (3,4,11,14) else .86
        packed[s][:,:,0]=1
        packed[s][:,:,1]=np.clip(rough+grain,0,1)
        packed[s][:,:,2]=.82 if i in (3,4) else 0
        gy,gx=np.gradient(field)
        normal[s][:,:,0]=.5-gx*.65; normal[s][:,:,1]=.5-gy*.65;normal[s][:,:,2]=1
    images=[]
    for name,data in [('aurion_color',rgba),('aurion_orm',packed),('aurion_normal',normal)]:
        im=bpy.data.images.new(name,size,size,alpha=False)
        if name!='aurion_color': im.colorspace_settings.name='Non-Color'
        im.pixels.foreach_set(data.ravel()); im.filepath_raw=str(OUT/(name+'.png'));im.file_format='PNG'; im.save(); im.pack();images.append(im)
    m=bpy.data.materials.new('Aurion shared weathered PBR');m.use_nodes=True
    n=m.node_tree.nodes;l=m.node_tree.links; bs=n.get('Principled BSDF')
    tex=n.new('ShaderNodeTexImage');tex.image=images[0];l.new(tex.outputs['Color'],bs.inputs['Base Color'])
    orm=n.new('ShaderNodeTexImage');orm.image=images[1]; sep=n.new('ShaderNodeSeparateColor');l.new(orm.outputs['Color'],sep.inputs['Color']);l.new(sep.outputs['Green'],bs.inputs['Roughness']);l.new(sep.outputs['Blue'],bs.inputs['Metallic'])
    tx=n.new('ShaderNodeTexImage');tx.image=images[2];nm=n.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.4;l.new(tx.outputs['Color'],nm.inputs['Color']);l.new(nm.outputs['Normal'],bs.inputs['Normal'])
    return m

def reset():
    global parts,mat
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    for a in list(bpy.data.actions): bpy.data.actions.remove(a)
    parts=[]; random.seed(1600)
    if mat is None: mat=atlas()

def finish(o,tile,bone=None):
    o.data.materials.clear();o.data.materials.append(mat)
    if not o.data.uv_layers: o.data.uv_layers.new(name='UVMap')
    uv=o.data.uv_layers.active.data
    # A gutter keeps bilinear/mip samples inside the selected material tile.
    for p in o.data.polygons:
        normal=p.normal; axis=max(range(3),key=lambda a:abs(normal[a])); axes=[a for a in range(3) if a!=axis]
        vs=[o.data.vertices[o.data.loops[k].vertex_index].co for k in p.loop_indices]
        lo=[min(v[a] for v in vs) for a in axes]; hi=[max(v[a] for v in vs) for a in axes]
        for k,v in zip(p.loop_indices,vs):
            a=(v[axes[0]]-lo[0])/max(hi[0]-lo[0],.0001); b=(v[axes[1]]-lo[1])/max(hi[1]-lo[1],.0001)
            uv[k].uv=((tile%4+.04+.92*a)/4,(tile//4+.04+.92*b)/4)
    if bone:
        g=o.vertex_groups.new(name=bone);g.add(list(range(len(o.data.vertices))),1,'REPLACE')
    parts.append(o);return o

def ell(name,pos,scale,tile,bone=None,segments=8,rings=5):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,radius=1,location=pos)
    o=bpy.context.object;o.name=name;o.scale=scale
    for f in o.data.polygons:f.use_smooth=True
    return finish(o,tile,bone)

def rod(name,a,b,r1,r2,tile,bone=None,n=8):
    a,b=Vector(a),Vector(b); d=b-a
    bpy.ops.mesh.primitive_cone_add(vertices=n,radius1=r1,radius2=r2,depth=d.length,location=(a+b)/2)
    o=bpy.context.object;o.name=name;o.rotation_mode='QUATERNION';o.rotation_quaternion=d.to_track_quat('Z','Y')
    return finish(o,tile,bone)

def mesh(name,verts,faces,tile,bone=None):
    m=bpy.data.meshes.new(name);m.from_pydata(verts,[],faces);m.update();o=bpy.data.objects.new(name,m);bpy.context.collection.objects.link(o);return finish(o,tile,bone)

def tree(kind):
    centers=[(0,0,0,.34),(.08,.02,.7,.29),(.10,.04,1.6,.24),(-.10,.07,2.7,.16),(.10,.04,3.9,.065)]
    vs=[(x+math.cos(i*2*P/9)*r,y+math.sin(i*2*P/9)*r,z) for x,y,z,r in centers for i in range(9)]
    fs=[tuple(reversed(range(9))),tuple(range(36,45))]+[(j*9+i,j*9+(i+1)%9,(j+1)*9+(i+1)%9,(j+1)*9+i) for j in range(4) for i in range(9)]
    mesh('Continuous oak trunk',vs,fs,6)
    for i in range(6):
        a=i*2.4;rod('Root',(0,0,.3),(math.cos(a)*.64,math.sin(a)*.64,.015),.15,.025,6,n=6)
    if kind=='pine':
        for j in range(5):
            z=1.35+j*.7
            for i in range(4):
                a=i*P/2+j*.63
                o=ell('Needle bough',(math.cos(a)*(.64-j*.08),math.sin(a)*(.64-j*.08),z),(.86-j*.09,.63-j*.07,.43),9 if j%2 else 10,segments=7,rings=4)
            rod('Pine crown',(0,0,3.8),(0,0,5),.60,0,9,n=7)
    else:
        for i in range(9):
            a=i*2.4; r=.6+(i%3)*.25;z=2.9+(i%3)*.5
            rod('Branch',(0,0,1.7),(math.cos(a)*r,math.sin(a)*r,z),.12,.03,6,n=6)
            center=Vector((math.cos(a)*r,math.sin(a)*r,z))
            for j in range(20):
                az=j*2.39996+i*.63; radius=.32+.43*((j%5)/4)
                pos=center+Vector((math.cos(az)*radius,math.sin(az)*radius,((j%7)/6-.5)*.95))
                tilt=math.sin(j*1.71+i)*.85
                along=Vector((math.cos(az)*math.cos(tilt),math.sin(az)*math.cos(tilt),math.sin(tilt)))
                across=Vector((-math.sin(az),math.cos(az),math.sin(j*2.1)*.45)).normalized()
                length=.43+(j%3)*.055; width=.24+(j%2)*.03
                outline=[(-1,0),(-.55,-.70),(.0,-1),(.57,-.65),(1,0),(.57,.65),(.0,1),(-.55,.70)]
                v=[pos+along*(u*length)+across*(v*width)+Vector((0,0,.07*(1-u*u))) for u,v in outline]
                mesh('Oak leaves',[tuple(p) for p in v],[(0,k,k+1) for k in range(1,7)],9 if j%5 else 10)

def export(name,purpose,arm=None):
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts:o.select_set(True)
    bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();o=bpy.context.object;o.name=name
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    if arm:
        mod=o.modifiers.new('Skeleton','ARMATURE');mod.object=arm;o.parent=arm
        for tr in arm.animation_data.nla_tracks:tr.mute=False
    path=OUT/(name+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',export_yup=True,export_animations=bool(arm),export_animation_mode='NLA_TRACKS',export_force_sampling=True,export_frame_range=False,export_skins=True,export_morph=False,export_extras=True,export_cameras=False,export_lights=False)
    data=path.read_bytes();n=struct.unpack_from('<I',data,12)[0];g=json.loads(data[20:20+n])
    triangles=sum(g['accessors'][p['indices']]['count']//3 for m in g['meshes'] for p in m['primitives'])
    if triangles>1600:raise RuntimeError(f'{name}: {triangles} triangles exceeds 1600')
    record={'file':path.name,'purpose':purpose,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'triangles':triangles,'materials':len(g.get('materials',[])),'textures':len(g.get('textures',[])),'bones':sum(len(s['joints']) for s in g.get('skins',[])),'animations':[a['name'] for a in g.get('animations',[])]}
    manifest.append(record);print('ASSET',json.dumps(record),flush=True)

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--only',choices=['oak_tree'],required=True);ap.parse_args()
    reset();tree('oak');export('aurion_oak_tree','world-nature')
    (OUT/'manifest.json').write_text(json.dumps({'version':'aurion.fantasy-assets.v1','generator':bpy.app.version_string,'sourceRevision':'6803dabc1d23c48a99352a025f035202b89f6083','triangleCeiling':1600,'units':'metres','assets':manifest},indent=2)+'\n')

if __name__=='__main__':main()
