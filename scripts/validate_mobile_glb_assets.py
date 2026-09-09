#!/usr/bin/env python3
"""Read-only verification of the sealed shipping manifest and all alternatives."""
from __future__ import annotations
import argparse, json, subprocess
from pathlib import Path
from glb_shipping_contract import VERSION, audit_glb, canonical, confined, sha

def main():
    p = argparse.ArgumentParser(); p.add_argument('--root', type=Path, required=True); p.add_argument('--manifest', type=Path, required=True)
    p.add_argument('--gltf-transform', default='gltf-transform'); a = p.parse_args()
    root = a.root.resolve(); manifest = json.loads(a.manifest.read_text())
    identity = manifest.get('manifestSha256')
    if manifest.get('version') != VERSION or identity != sha(canonical({k:v for k,v in manifest.items() if k != 'manifestSha256'})): raise SystemExit('SHIPPING_MANIFEST_HASH')
    reports = {}
    for asset in manifest['assets']:
        expected_family = sha(canonical([{'name': l['name'], 'sourceSha256': l['sourceSha256']} for l in asset['lods']]))
        if asset['lodFamilySha256'] != expected_family: raise SystemExit('SHIPPING_LOD_FAMILY_HASH')
        for lod in [*asset['lods'], *([asset['collider']] if asset.get('collider') else [])]:
            for variant in [lod, *([lod['fallback']] if lod.get('fallback') else [])]:
                path = confined(root, variant['file']); report = audit_glb(path, lod['triangle_ceiling'])
                if any(variant.get(k) != v for k, v in report.items()): raise SystemExit(f'SHIPPING_OUTPUT_DRIFT:{variant["file"]}')
                if variant['file'] not in reports:
                    subprocess.run([a.gltf_transform, 'validate', str(path)], check=True, stdout=subprocess.DEVNULL)
                    reports[variant['file']] = report
    receipt = {'version': VERSION, 'manifestSha256': identity, 'files': reports, 'status': 'VERIFIED'}
    receipt['receiptSha256'] = sha(canonical(receipt))
    (root/'audit.json').write_text(json.dumps(receipt, indent=2)+'\n')
    print(json.dumps({'files': len(reports), 'receiptSha256': receipt['receiptSha256'], 'status': 'VERIFIED'}))

if __name__ == '__main__': main()
