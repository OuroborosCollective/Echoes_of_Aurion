# Manual mobile GLB asset pipeline

The repository now contains a **manual-only** GitHub Actions workflow for building mobile game assets. It does not run on push or pull request events.

## Run from GitHub

Open **Actions → Manual Mobile GLB Asset Build → Run workflow**. Choose:

- `source_path`: repository-relative directory or ZIP archive containing GLB, GLTF, FBX, or OBJ sources;
- `include_colliders`: generate one separate convex-hull collider GLB per asset;
- `texture_size`: the documented mobile texture limit. The current implementation uses 1,024 px.

The workflow installs pinned Blender/glTF tooling, runs the deterministic Python/Blender pipeline, validates every output, tests the ZIP, and uploads the ZIP plus `manifest.json` as a workflow artifact.

## Local execution

Install Blender and glTF Transform first, then run:

```bash
ASSET_SOURCE=/path/to/source pnpm assets:mobile-glb
python3 scripts/validate_mobile_glb_assets.py \
  --root .asset-build/output \
  --manifest .asset-build/output/manifest.json
python3 scripts/package_mobile_glb_assets.py \
  --root .asset-build/output \
  --zip .asset-build/echoes-of-aurion-mobile-glb-assets.zip
```

The default budgets are 1,600 triangles for `LOD0`, 800 for `LOD1`, 300 for `LOD2`, and 64 for each collider. Every visible model is grounded with a bottom-center pivot and the lowest geometry at `Z=0`.

## Security and deployment boundary

The workflow is intentionally local to the GitHub runner. It does not connect to a production server, deploy files, or read passwords. Do not put server passwords in YAML, Python files, repository secrets committed to source, or command-line defaults. If a later deployment step is needed, add it as a separate reviewed job using a GitHub Actions secret or an approved SSH key, with least-privilege access and an explicit target directory.

## Runtime requirements

The generated GLBs use `EXT_meshopt_compression` and, for textured render assets, `EXT_texture_webp`. The game loader must support these extensions. Collider GLBs are separate from visible LODs so physics remains stable when visual LOD selection changes.

## Failure conditions

The validator fails the workflow if a GLB is invalid, contains no mesh, exceeds its triangle ceiling, lacks Meshopt compression, is missing from the manifest, or has a missing collider when collider generation is enabled. Empty LODs are rejected even when their nominal triangle count is zero.
