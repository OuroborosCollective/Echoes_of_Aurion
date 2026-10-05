# Aurion Village Fountain

Owner-supplied static fountain model, admitted only through Aurion's canonical
`world-environment/fountain` GLB pipeline.

Required physical files:

| File | SHA-256 | Bytes | Triangles | Embedded texture tier |
| --- | --- | ---: | ---: | --- |
| `Aurion_Village_Fountain_LOD1.glb` | `68b4b573d41589ed82632b3915280c41858d237d3d18f0b37763f677f26c20db` | 720480 | 2132 | 3 × 1024² JPEG |
| `Aurion_Village_Fountain_LOD2.glb` | `1aa07c92677889a6173df083f6eb025d4a02c942ab8f7bd89f286882db23c90a` | 204956 | 1053 | 3 × 512² JPEG |

The source uploads were 2048²-texture GLBs. Geometry, material topology, pivot
and bounds were preserved while the embedded texture resolution was reduced per
LOD so the family remains within Aurion's phone presentation budgets.

This asset is presentation-only. It grants no collision, quest, interaction,
teleport, loot, persistence, or simulation authority.
