#!/usr/bin/env python3
"""Local LOD shipping. Prepared LODs preserve the separate confirmed collider."""
from __future__ import annotations
import argparse, json, os, platform, shutil, subprocess
from pathlib import Path
from glb_shipping_contract import VERSION, audit_glb, canonical, confined, sha
from ktx_shipping_encoder import KTX_THREADS

EXTENSIONS = {'.fbx', '.obj', '.glb', '.gltf'}
LOD_LIMITS = {'LOD0': 1600, 'LOD1': 800, 'LOD2': 300}
def run(cmd, **kwargs):
    print('+', ' '.join(map(str, cmd)), flush=True)
    return subprocess.run(list(map(str, cmd)), check=True, **kwargs)
def version(cmd):
    return subprocess.check_output(cmd, text=True, stderr=subprocess.STDOUT).strip().splitlines()[0]

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--source', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--work', type=Path, required=True)
    p.add_argument('--blender', default='blender')
    p.add_argument('--gltf-transform', default='gltf-transform')
    p.add_argument('--colliders', action='store_true')
    p.add_argument('--texture-size', type=int, choices=[256, 512, 1024], default=1024)
    p.add_argument('--texture-format', choices=['ktx2', 'webp'], default='ktx2')
    p.add_argument('--prepared-manifest', type=Path)
    a = p.parse_args()
    source, out, work = a.source.resolve(), a.output.resolve(), a.work.resolve()
    if not source.is_dir(): raise SystemExit('SOURCE_DIRECTORY_REQUIRED')
    if any(x == y or x.is_relative_to(y) or y.is_relative_to(x) for x, y in [(source, out), (source, work), (out, work)]): raise SystemExit('ISOLATED_OUTPUT_AND_WORK_REQUIRED')
    if out.exists() and any(out.iterdir()): raise SystemExit('OUTPUT_MUST_BE_EMPTY')
    out.mkdir(parents=True, exist_ok=True); work.mkdir(parents=True, exist_ok=True)
    cli_version = version([a.gltf_transform, '--version'])
    if cli_version != '4.5.0': raise SystemExit(f'PINNED_GLTF_TRANSFORM_REQUIRED:{cli_version}')
    ktx_version = version(['toktx', '--version']) if a.texture_format == 'ktx2' else None
    if ktx_version and ktx_version != 'toktx v4.4.2': raise SystemExit('PINNED_KTX_SOFTWARE_REQUIRED')
    scripts = Path(__file__).parent
    encoder_env = os.environ.copy()
    native_ktx = None
    if a.texture_format == 'ktx2':
        native_ktx = Path(shutil.which('ktx') or '').resolve()
        if not native_ktx.is_file() or version([str(native_ktx), '--version']) != 'ktx version: v4.4.2':
            raise SystemExit('PINNED_NATIVE_KTX_REQUIRED')
        # glTF-Transform optimize has no thread option. Keep its reviewed transform
        # sequence and pin the native command through a task-local executable adapter.
        encoder_bin = work / 'ktx-encoder-bin'
        encoder_bin.mkdir(exist_ok=False)
        adapter = encoder_bin / 'ktx'
        shutil.copyfile(scripts / 'ktx_shipping_encoder.py', adapter)
        adapter.chmod(0o755)
        encoder_env['AURION_KTX_EXECUTABLE'] = str(native_ktx)
        encoder_env['PATH'] = str(encoder_bin) + os.pathsep + encoder_env.get('PATH', '')
    lock = scripts / 'asset-shipping-toolchain/package-lock.json'
    toolchain = {'gltfTransform': cli_version, 'ktxSoftware': ktx_version,
                 'ktxExecutableSha256': sha(native_ktx.read_bytes()) if native_ktx else None,
                 'blender': None if a.prepared_manifest else version([a.blender, '--version']),
                 'node': version(['node', '--version']), 'python': platform.python_version(),
                 'platform': platform.system() + '-' + platform.machine(), 'dependencyLockSha256': sha(lock.read_bytes()),
                 'scriptHashes': {name: sha((scripts/name).read_bytes()) for name in ['mobile_glb_asset_pipeline.py', 'mobile_glb_blender_worker.py', 'glb_shipping_contract.py', 'ktx_shipping_encoder.py']}}
    manifest = {'schema_version': 2, 'version': VERSION, 'glTFVersion': '2.0', 'toolchain': toolchain,
                'transforms': {'prune': True, 'dedup': True, 'simplify': 'blender-lods' if not a.prepared_manifest else 'existing-reviewed-lods',
                               'meshopt': 'high', 'textureFormat': a.texture_format, 'textureSize': a.texture_size,
                               'ktxThreads': KTX_THREADS if native_ktx else None, 'ktxRdoMultithreading': False,
                               'flatten': False, 'join': False, 'instance': False, 'palette': False},
                'lods': LOD_LIMITS, 'assets': []}
    if a.prepared_manifest:
        prepared = json.loads(a.prepared_manifest.read_text())
        manifest['sourceBinding'] = prepared['sourceBinding']; inputs = prepared['assets']
    else:
        # Include external glTF/FBX texture dependencies in the source identity.
        closure = []
        for f in sorted(source.rglob('*')):
            if f.is_symlink(): raise SystemExit('SOURCE_SYMLINK_FORBIDDEN')
            if f.is_file(): closure.append({'path': f.relative_to(source).as_posix(), 'sha256': sha(f.read_bytes())})
        manifest['sourceBinding'] = {'closureSha256': sha(canonical(closure)), 'files': closure}
        inputs = []; used_names = set()
        for f in sorted(source.rglob('*')):
            if not f.is_file() or f.suffix.lower() not in EXTENSIONS: continue
            if any(token in f.stem.lower() for token in ('_lod0', '_lod1', '_lod2', '_collider')): continue
            if f.stem in used_names: raise SystemExit('DUPLICATE_SOURCE_BASENAME')
            used_names.add(f.stem); raw_dir = work / f.stem
            run([a.blender, '-b', '--python', scripts/'mobile_glb_blender_worker.py', '--', f, raw_dir, 'lods'])
            entry = {'asset': f.stem, 'source_file': f.relative_to(source).as_posix(), 'sourceSha256': sha(f.read_bytes()),
                     'lods': [{'name': lod, 'file': str(raw_dir/f'{f.stem}_{lod}.glb')} for lod in LOD_LIMITS]}
            if a.colliders:
                run([a.blender, '-b', '--python', scripts/'mobile_glb_blender_worker.py', '--', f, raw_dir, 'collider'])
                entry['collider'] = {'file': str(raw_dir/f'{f.stem}_Collider.glb')}
            inputs.append(entry)
    if not inputs: raise SystemExit('NO_SHIPPING_SOURCES')
    seen = set()
    for item in sorted(inputs, key=lambda item: item['asset']):
        name = item['asset']
        if not name or name in seen or any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-' for c in name): raise SystemExit('ASSET_ID_INVALID')
        seen.add(name); asset_out = out/name; asset_out.mkdir()
        entry = {key: item[key] for key in ['asset', 'source_file', 'sourceSha256', 'topology'] if key in item}; entry['lods'] = []
        if sorted(l['name'] for l in item['lods']) != sorted(LOD_LIMITS): raise SystemExit('LOD_FAMILY_REQUIRED')
        for lod in sorted(item['lods'], key=lambda lod: lod['name']):
            raw = confined(source, lod['file']) if a.prepared_manifest else Path(lod['file'])
            source_hash = sha(raw.read_bytes())
            if a.prepared_manifest and lod['sha256'] != source_hash: raise SystemExit('PREPARED_SOURCE_HASH_MISMATCH')
            ceiling = LOD_LIMITS[lod['name']]; fallback = asset_out / f'{lod["name"]}.fallback.glb'
            options = ['--compress', 'meshopt', '--meshopt-level', 'high', '--simplify', 'false', '--texture-size', str(a.texture_size),
                       '--flatten', 'false', '--join', 'false', '--instance', 'false', '--palette', 'false']
            run([a.gltf_transform, 'optimize', raw, fallback, *options, '--texture-compress', 'webp'], stdout=subprocess.DEVNULL)
            fallback_report = audit_glb(fallback, ceiling); shipped = fallback
            if a.texture_format == 'ktx2' and fallback_report['textures']:
                # KTX silently skips WebP. Decode all raster sources explicitly.
                png = work/f'{name}-{lod["name"]}.png.glb'
                run([a.gltf_transform, 'png', raw, png, '--formats', '*'], stdout=subprocess.DEVNULL)
                shipped = asset_out/f'{lod["name"]}.ktx2.glb'
                run([a.gltf_transform, 'optimize', png, shipped, *options, '--texture-compress', 'ktx2'], stdout=subprocess.DEVNULL, env=encoder_env)
                png.unlink()
            report = audit_glb(shipped, ceiling)
            if shipped != fallback and (report['format'] != 'ktx2' or any(t['mimeType'] != 'image/ktx2' for t in report['textures'])): raise SystemExit('ACTUAL_KTX2_OUTPUT_REQUIRED')
            for texture in report['textures']:
                if texture['mimeType'] != 'image/ktx2': continue
                parameters = texture['encoderParameters'].split()
                if parameters.count('--threads') != 1 or parameters[parameters.index('--threads')+1:parameters.index('--threads')+2] != [str(KTX_THREADS)]:
                    raise SystemExit('KTX_THREAD_READBACK_MISMATCH')
                if '--uastc-rdo' in parameters and '--uastc-rdo-m' not in parameters:
                    raise SystemExit('KTX_NONDETERMINISTIC_RDO')
            entry['lods'].append({'name': lod['name'], 'file': shipped.relative_to(out).as_posix(), 'sourceSha256': source_hash,
                                  'triangle_ceiling': ceiling, **report, 'fallback': {'file': fallback.relative_to(out).as_posix(), **fallback_report}})
        if item.get('collider'):
            original = confined(source, item['collider']['file']) if a.prepared_manifest else Path(item['collider']['file'])
            source_hash = sha(original.read_bytes())
            if a.prepared_manifest and item['collider']['sha256'] != source_hash: raise SystemExit('COLLIDER_SOURCE_HASH_MISMATCH')
            collider = asset_out/'collider.glb'
            if a.prepared_manifest: shutil.copyfile(original, collider)
            else: run([a.gltf_transform, 'optimize', original, collider, '--compress', 'meshopt', '--simplify', 'false'], stdout=subprocess.DEVNULL)
            report = audit_glb(collider, 64)
            if a.prepared_manifest and report['sha256'] != source_hash: raise SystemExit('CONFIRMED_COLLIDER_CHANGED')
            entry['collider'] = {'file': collider.relative_to(out).as_posix(), 'sourceSha256': source_hash, 'triangle_ceiling': 64, **report}
        entry['lodFamilySha256'] = sha(canonical([{'name': l['name'], 'sourceSha256': l['sourceSha256']} for l in entry['lods']]))
        manifest['assets'].append(entry)
    manifest['manifestSha256'] = sha(canonical(manifest))
    (out/'manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False)+'\n')
    print(json.dumps({'assets': len(manifest['assets']), 'manifestSha256': manifest['manifestSha256']}))

if __name__ == '__main__': main()
