# AIM-291 implementation checkpoint — 2026-09-09

This commit preserves work in progress; it does not certify AIM-291 as complete or ready to merge.

## Completed predecessor

AIM-290 was merged through [PR 284](https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/284), exact tested head `6e1c19a7368efa1c88e726954ae3f8ce4c288692`. Main was read back at `36376f56db2d523a654d7e3e3c858e44c34e718e`, with zero open pull requests before beginning this lane. All eight relevant source workflows succeeded. Actual authenticated CI browser recovery used software rendering; native hardware and authenticated production play are not certified by those tests.

[Production run 34308421574](https://github.com/OuroborosCollective/Echoes_of_Aurion/actions/runs/34308421574) completed successfully, including promotion, canonical OIDC schema apply dispatch and independent production schema readback. The installed runtime receipt binds revision `36376f56db2d523a654d7e3e3c858e44c34e718e`, image `sha256:e8c4a1a13fcc9c6b2d3ba5ad2d92791a0e10601ded5caa3cb1f04ab69b030ce3`, container `f8f712e4531033cf969ee14e82a8246d648938f98d3fe3cf3cb80bb2d58593ff`, authenticated database connectivity and `arelogic.space`. Separate production readback reports all 21 managed migrations as `PRESENT_SCHEMA_MATCH`.

## Preserved implementation

- Pinned glTF Transform 4.5.0 dependency lock and KTX Software 4.4.2 verification; explicit PNG normalization prevents silent skipping of source WebP textures before KTX2 compression.
- Source, toolchain, per-LOD, fallback and collider hash contracts; deterministic packaging and independent validator without a foreign workspace dependency.
- Reviewed existing LOD families for `city-foundation-wood-03` and `nature-root-1`, compressed as Meshopt/KTX2 with separately hash-verified WebP fallbacks. Collider bytes and confirmed topology are preserved.
- Two independent local executions produced byte-identical manifests and all 13 GLB outputs. glTF Transform validated all 13 files. This does not certify a Blender regeneration run.
- Shipping manifest SHA-256 `681142dbb6c00af536c926bb5bc2b99e575fae60b28edd8c28dbd1ca1b667636`; bundle SHA-256 `e03559d4bfd0c1dbeedcde43bc6633bd43cf3e1e2296b7e1f26ffa241eb7adc7`.
- Offline preparation validates the bundle and pinned Three.js Basis decoder files. The AX1 world projection requests verified KTX2 variants when supported and separately verified fallbacks otherwise.
- Initial shared presentation resource pool bounds decoding, model allocations and downloads, with abort/recovery cleanup in the world projection.

KTX2 is larger on the wire for these source assets. The expected texture-memory benefit still needs actual browser transcoding measurements; reserved allocation ceilings are not measured process or GPU memory.

## Required next work

1. Bind character, NPC and equipment model cache ownership, clone release and animation limits to the shared presentation budget; remove touched legacy visual-catalog item-grant authority rather than endorsing it.
2. Complete focused resource, cancellation and shared-resource regression tests, reproducibility CI and actual authenticated Phone/Tablet/Desktop browser evidence for KTX2, decoder failure fallback, decode time, transferred bytes and measured memory with precise evidence limits.
3. Finish documentation and Linear evidence, open a draft PR, review exact-head checks, merge and read back deployment through the canonical workflows. Do not merge this checkpoint as completed work.
4. Continue AIM-292, AIM-293 and AIM-294 in order. Gameplay and NPC decisions must originate in WASD; Aurion transports/persists and AX1 projects confirmed state. Consent controls cannot grant Aurion gameplay authority.

The original handoff remains the task contract. No direct production SQL, SSH, secret retrieval or substitute deployment path is authorized by this checkpoint.
