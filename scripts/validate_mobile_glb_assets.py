#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, struct, subprocess
from pathlib import Path

def glb_json(path: Path):
    b=path.read_bytes()
    if b[:4]!=b'glTF': raise ValueError('invalid GLB magic')
    version,total=struct.unpack_from('<II',b,4); chunk_len,chunk_type=struct.unpack_from('<II',b,12)
    if version!=2 or total!=len(b) or chunk_type!=0x4E4F534A: raise ValueError('invalid GLB header')
    return json.loads(b[20:20+chunk_len].decode().rstrip(' \t\r\n\x00'))

def triangles(doc):
    acc=doc.get('accessors',[]); total=0
    for mesh in doc.get('meshes',[]):
        for p in mesh.get('primitives',[]):
            if p.get('mode',4)!=4: continue
            i=p.get('indices'); count=acc[i]['count'] if i is not None else acc[p['attributes']['POSITION']]['count']
            total+=count//3
    return total

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--root',type=Path,required=True);ap.add_argument('--manifest',type=Path,required=True);a=ap.parse_args()
    m=json.loads(a.manifest.read_text()); errors=[]; files=[]
    for asset in m['assets']:
        for lod in asset['lods']:
            p=a.root/lod['file']; files.append(p)
            try:
                d=glb_json(p); n=triangles(d)
                if not d.get('meshes'): errors.append(f'{p}: no meshes')
                if n>lod['triangle_ceiling']: errors.append(f'{p}: {n}>{lod["triangle_ceiling"]}')
                ex=set(d.get('extensionsUsed',[]))
                if 'EXT_meshopt_compression' not in ex: errors.append(f'{p}: meshopt missing')
                lod['audited_triangles']=n;lod['delivery_bytes']=p.stat().st_size;lod['valid_glb']=True
            except Exception as e: errors.append(f'{p}: {e}')
        c=asset.get('collider')
        if c:
            p=a.root/c['file']; files.append(p)
            try:
                d=glb_json(p); n=triangles(d)
                if n==0 or n>c['triangle_ceiling']: errors.append(f'{p}: collider triangles {n}')
                if 'EXT_meshopt_compression' not in set(d.get('extensionsUsed',[])): errors.append(f'{p}: meshopt missing')
                c['audited_triangles']=n;c['delivery_bytes']=p.stat().st_size;c['valid_glb']=True
            except Exception as e: errors.append(f'{p}: {e}')
    m['audit_errors']=errors;a.manifest.write_text(json.dumps(m,indent=2)+'\n')
    print(json.dumps({'files':len(files),'errors':errors,'max_triangles':max((x.get('audited_triangles',0) for asset in m['assets'] for x in asset['lods']),default=0)},indent=2))
    if errors: raise SystemExit(1)
    for p in files:
        subprocess.run(['python3','/home/ubuntu/skills/mmorpg-glb-generator/scripts/validate_glb.py',str(p)],check=True,stdout=subprocess.DEVNULL)
if __name__=='__main__':main()
