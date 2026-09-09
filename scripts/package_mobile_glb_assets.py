#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, zipfile
from pathlib import Path

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--root',type=Path,required=True);ap.add_argument('--zip',type=Path,required=True);a=ap.parse_args()
    m=json.loads((a.root/'manifest.json').read_text()); files=[]
    for asset in m['assets']:
        files += [a.root/l['file'] for l in asset['lods']]
        files += [a.root/l['fallback']['file'] for l in asset['lods'] if l.get('fallback')]
        if asset.get('collider'): files.append(a.root/asset['collider']['file'])
    files.append(a.root/'manifest.json')
    if (a.root/'audit.json').exists(): files.append(a.root/'audit.json')
    a.zip.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(a.zip,'w',zipfile.ZIP_DEFLATED) as z:
        for p in sorted(set(files)):
            if not p.is_file(): raise SystemExit(f'missing package file: {p}')
            info=zipfile.ZipInfo(p.relative_to(a.root).as_posix(),date_time=(1980,1,1,0,0,0))
            info.create_system=3;info.external_attr=0o100644<<16;info.compress_type=zipfile.ZIP_DEFLATED
            z.writestr(info,p.read_bytes(),compresslevel=9)
    print(json.dumps({'files':len(files),'zip':str(a.zip),'bytes':a.zip.stat().st_size},indent=2))
if __name__=='__main__':main()
