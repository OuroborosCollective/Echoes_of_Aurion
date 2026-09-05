#!/usr/bin/env python3
"""Manual CI entrypoint for mobile GLB LOD/collider builds.

This orchestration layer intentionally uses local tools only. It never connects to a
production server and never reads credentials.
"""
from __future__ import annotations
import argparse, json, shutil, subprocess, sys
from pathlib import Path

EXTENSIONS={'.fbx','.obj','.glb','.gltf'}

def run(cmd, **kwargs):
    print('+', ' '.join(map(str,cmd)), flush=True)
    subprocess.run(cmd, check=True, **kwargs)

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--source', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--work', type=Path, required=True)
    p.add_argument('--blender', default='blender')
    p.add_argument('--gltf-transform', default='gltf-transform')
    p.add_argument('--colliders', action='store_true')
    p.add_argument('--texture-size', type=int, default=1024)
    args=p.parse_args()
    source=args.source.resolve(); out=args.output.resolve(); work=args.work.resolve()
    if not source.exists(): raise SystemExit(f'source not found: {source}')
    if out.exists(): shutil.rmtree(out)
    out.mkdir(parents=True); work.mkdir(parents=True, exist_ok=True)
    sources=sorted(x for x in source.rglob('*') if x.is_file() and x.suffix.lower() in EXTENSIONS)
    if not sources: raise SystemExit('no supported GLB/GLTF/FBX/OBJ sources found')
    manifest={'schema_version':1,'triangle_limit':1600,'lods':{'LOD0':1600,'LOD1':800,'LOD2':300},'assets':[]}
    worker=Path(__file__).with_name('mobile_glb_blender_worker.py')
    for src in sources:
        name=src.stem
        # Avoid treating a LOD or collider output as a new source when rerunning locally.
        if any(token in name.lower() for token in ('_lod0','_lod1','_lod2','_collider')): continue
        asset_out=out/name
        run([args.blender,'-b','--python',str(worker),'--',str(src),str(asset_out),'lods'])
        entry={'asset':name,'source_file':str(src.relative_to(source)),'lods':[]}
        for lod, ceiling in manifest['lods'].items():
            raw=asset_out/f'{name}_{lod}.glb'
            compressed=asset_out/f'{name}_{lod}.compressed.glb'
            run([args.gltf_transform,'optimize',str(raw),str(compressed),'--compress','meshopt','--simplify','false','--texture-compress','webp','--texture-size',str(args.texture_size)],stdout=subprocess.DEVNULL)
            raw.unlink(); compressed.rename(raw)
            entry['lods'].append({'name':lod,'file':str(raw.relative_to(out)),'triangle_ceiling':ceiling,'grounded':True,'pivot':'bottom_center'})
        if args.colliders:
            run([args.blender,'-b','--python',str(worker),'--',str(src),str(asset_out),'collider'])
            collider=asset_out/f'{name}_Collider.glb'; compressed=asset_out/f'{name}_Collider.compressed.glb'
            run([args.gltf_transform,'optimize',str(collider),str(compressed),'--compress','meshopt','--simplify','false'],stdout=subprocess.DEVNULL)
            collider.unlink(); compressed.rename(collider)
            entry['collider']={'file':str(collider.relative_to(out)),'shape':'convex_hull','triangle_ceiling':64,'grounded':True,'pivot':'bottom_center'}
        manifest['assets'].append(entry)
    (out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps({'assets':len(manifest['assets']),'output':str(out)},indent=2))

if __name__=='__main__': main()
