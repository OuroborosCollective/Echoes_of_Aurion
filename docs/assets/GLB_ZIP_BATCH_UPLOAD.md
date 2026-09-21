# GLB ZIP batch upload

`/ops/glb-upload` accepts a bounded ZIP archive through `POST /api/admin/glb-zip-upload`.

## Archive layout

A flat archive uses the purpose selected by the caller:

```text
Female_Ranger_LOD0.glb
Female_Ranger_LOD1.glb
```

A mixed archive may use exactly one purpose directory:

```text
npc-fallback/Female_Ranger_LOD0.glb
npc-fallback/Female_Ranger_LOD1.glb
equipment/Steel_Sword.glb
world-nature/Ancient_Oak_LOD0.glb
```

Supported directories are `auto`, `npc-fallback`, `enemy-fallback`, `world-environment`, `world-nature`, `player-public`, and `equipment`.

The filename remains classification evidence. Physical GLBs with the same normalized display basename and explicit `LOD0`…`LOD3` are grouped by the existing runtime catalog only after their server classification tuple agrees.

## Security and authority boundary

The server preflights the complete archive before the first catalog mutation. It accepts only ZIP methods stored (0) and deflate (8), validates CRC-32 and central/local bounds, and rejects traversal, absolute paths, backslashes, symlinks, encryption, ZIP64, arbitrary non-GLB files, duplicate paths, duplicate LOD levels, oversized entries, unsupported purpose directories, and mixed-classification LOD families.

Limits:

- ZIP payload: 768 MiB
- total declared/uncompressed GLB bytes: 1 GiB
- physical GLBs per ZIP: 128
- one GLB: existing 24 MiB limit

Every extracted GLB still passes the existing `buildGlbImportPlan` and purpose-specific classifier before it can be stored. Apply is sequential and idempotent by the existing SHA-bound ingest contract. Every apply call is bound to the exact preflight `planSha256` and re-read from the catalog. A retry after transport failure therefore cannot silently reinterpret bytes.

The ZIP route accepts the same authenticated admin browser session, one-hour Aurion GLB agent session, or separately validated admin GLB bearer boundary as the existing GLB importer. It does not add gameplay, inventory, quest, combat, or item authority.
