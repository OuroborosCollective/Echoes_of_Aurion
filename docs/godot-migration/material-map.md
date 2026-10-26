# G17 — Aurion-Atlas → Godot Material Layer (Teilintegration)

Source: `client/src/xaurion/world/assets/aurion-surface-atlas.webp` and adjacent `aurion-surface-atlas.json` on source main `86563cbb66cb9cf11c54966a834a3193e0af63b0`.

The binary atlas (439,340 bytes) and JSON provenance were **reused by exact Git blob identity** in `godot-client/assets/world/`, not regenerated or replaced by a neutral placeholder. Original Git WebP blob: `ceaffc27322579d0120c8047c89a2350c9217b79`.

Original declared binary SHA-256: `f329e8e1224416e38967f888d40d4459bf8b359001370a432cb270c13f1f3f35`. This is compared with **actual file bytes** by `scripts/godot/check-surface-atlas.mjs` during CI. Manifest text alone is insufficient.

| Tile | Quadrant (source pixel) | Godot roughness | Metalness |
| --- | --- | --- | --- |
| paving | x=0..511, y=0..511 | 0.88 | 0 |
| forest | x=512..1023, y=0..511 | 0.96 | 0 |
| wood | x=0..511, y=512..1023 | 0.96 | 0 |
| rock | x=512..1023, y=512..1023 | 0.96 | 0 |

`world/material_catalog.gd` uses the existing Godot Texture2D import and creates **independent mipmaps per 512×512 tile**, preventing cross-quadrant bleed. Materials use albedo with sRGB conversion and linear/mipmap anisotropic filter. No invented normal/height/specular maps. Web `TerrainSplatting.ts` is a Three.js shader override, **not a portable Godot shader or canonical terrain truth**; this step does not implement that blend.

`tests/test_material_projection.gd` reads actual imported WebP pixels and verifies three samples per quadrant, dimensions, mipmap presence, roughness/metalness and a malformed image negative control. The wider Godot check runs this as a real pinned engine subprocess. Test fixtures never constitute live-world evidence.

## Remaining G17 gates

- Bind these four material IDs **only** to confirmed Aurion terrain/placement descriptors, not the neutral preview floor.
- Visual software-render comparison at fixed cameras, image hashes and missing-resource diagnostics.
- Verify Android APK contains imported texture and metadata, plus independent Android-device texture/VRAM observation.
- Keep G18 chunk placement, scene geometry and collision separate and server-authoritative. G17 remains **PARTIAL** until real scene material parity and device evidence.
