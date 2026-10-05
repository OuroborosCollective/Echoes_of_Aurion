# Aurion Village Street Lamp

Owner-supplied static street-lamp model family for the starter village, admitted only through Aurion's canonical `world-environment/street-prop` GLB pipeline.

Required physical files:

| File | SHA-256 | Bytes | Triangles | Embedded texture tier |
| --- | --- | ---: | ---: | --- |
| `Aurion_Street_Lamp_LOD0.glb` | `8246a3c42834d9280cbad0cd89b6e354650857223590e7177b696a26cb6cd2ec` | 2514256 | 4172 | 3 x 1024² |
| `Aurion_Street_Lamp_LOD1.glb` | `c6655649ba9ca1ef602371a08552ffd70cda8b35a0bc796f21bdcc98bbeaca42` | 2484916 | 3128 | 3 x 1024² |
| `Aurion_Street_Lamp_LOD2.glb` | `61da6c957f63f9c994f6b657d813a165f6ec73f2e9680cb1406ac33557f212c8` | 785232 | 2086 | 3 x 512² |
| `Aurion_Street_Lamp_LOD3.glb` | `9297ed693e9b6e693ceb90f0776872f24291ef0ee7505ffd007620c68d049e61` | 259136 | 1042 | 3 x 256² |

The owner source files carried the same three embedded 2048² textures in every LOD and were about 11 MB each. Geometry, material topology, pivot and bounds are preserved; only embedded texture resolution/compression was reduced per LOD so each physical GLB fits Aurion's phone presentation budgets.

This asset family is presentation-only. It grants no collision, interaction, quest, loot, persistence, lighting authority, or simulation authority.

Repository handoff verified on branch `feat/starter-village-street-lamp-lods`: all four physical GLBs are present and their Git blob identities match the uploaded bytes. The runtime integration binds the family only through the exact SHA-256 contract above and fails closed on any mismatch.
