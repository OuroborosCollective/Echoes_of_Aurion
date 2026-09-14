# Quaternius shared-skeleton asset family v1

Status: **draft integration candidate**. No asset in this document has been uploaded to the live Aurion catalog.

## Provenance

Owner-supplied archives:

- `Modular Character Outfits - Fantasy[Standard].zip` — SHA-256 `c3468b18871cc8c8f05ab14df7712baf22cb9f389cbd870babf130e595187f70`
- `Universal Base Characters[Standard].zip` — SHA-256 `fdbf1804c90dfc1ea03e992bff7da2dfd1a79318e13270a660180f9308455f40`
- bundled license: **CC0 1.0 Universal**
- creator recorded by the supplied packages: **Quaternius**

`Ranger` and `Peasant` are presentation/style labels only. They do not create classes, skills, stats, progression, inventory ownership or gameplay authority.

## Exact presentation rig

Contract: `quaternius-universal-65-v1`

- ordered joints: 65
- ordered-joint SHA-256: `e993e496e339d79f4eb0c51c018d36b724f0e27afcec0095604c35737d06099e`
- the server accepts skinned equipment on this new lane only when the complete ordered joint list matches the contract exactly
- client rebind is fail-closed and only reuses an already-active compatible host Skeleton; it never authors equipment truth

The contract is intentionally stricter than a name such as `humanoid`, `ranger`, or `armor`.

## Prepared local outputs

Independent byte validation of the local preparation workspace reported:

- 42/42 self-contained GLBs valid under the local validator
- 12 NPC fallback files = four visual families × LOD0/1/2
- 20 modular rigged equipment files
- 2 head components
- 8 rigged hair/brow/beard components
- every file: exactly one 65-joint skin with ordered-joint digest `e993e496…`
- every file: no external `uri`
- largest generated GLB: 18,807,628 bytes (17.94 MiB), below Aurion's current 24 MiB admission ceiling
- full local evidence manifest SHA-256: `4cbe9855fbd7f26cec5848998fb2eb50b998cf54fd5968b580b041088a7f105a`

### NPC LOD families

| Family | LOD | Bytes | Visible tris | Max texture | Geometry policy | SHA-256 |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| Female Peasant | 0 | 14,517,432 | 22,170 | 2048 | source geometry | `3027cf8054c7b7ffc3127c1b6732b5072de1ff3c41b64f29e3bcec2e6ad22458` |
| Female Peasant | 1 | 8,799,064 | 22,170 | 1024 | texture-only | `44f657cdc5964c8168eff65cc53071bbf59a6d2e6aad1e12cc6fe94b419786ba` |
| Female Peasant | 2 | 4,094,680 | 22,170 | 512 | texture-only | `174bbccb6423363a09e0349285c4013c365f363529e44d7ca7a8d77be0f6b572` |
| Female Ranger | 0 | 18,807,628 | 32,284 | 2048 | source geometry | `d41deab47a29d9cb6bbe608354040cee9d85902c0ab55d6137cc04debebda606` |
| Female Ranger | 1 | 12,417,276 | 25,664 | 1024 | accessory-pruned | `eedb75753c5e40f569c2485abf5b0b671a7170c56f3366fcc4de8d23189fb57f` |
| Female Ranger | 2 | 5,943,384 | 25,664 | 512 | accessory-pruned | `a42a4b1e05f41f9f9d803bc73fef444542eb3dcc5d7dfa969c58f99284cd2c1d` |
| Male Peasant | 0 | 16,132,076 | 19,833 | 2048 | source geometry | `2be1f92857efb46601292abe14d308a66b7f77b0402c1ccde0d0aea85983d37a` |
| Male Peasant | 1 | 10,413,708 | 19,833 | 1024 | texture-only | `8837914feb95f25c3989be433fa63b2a36de756a79bbf42f3bd3ee0ca1e844f9` |
| Male Peasant | 2 | 4,321,860 | 19,833 | 512 | texture-only | `62c0cf912bbae1f87d07896d3164044a5facd0ea035702093598e0db1b7c9a08` |
| Male Ranger | 0 | 18,120,200 | 31,586 | 2048 | source geometry | `cc100b5955a30c479f6dbaf2ab3e0ed2429a6a0fea0bc1d8c2ce3cdbe0770364` |
| Male Ranger | 1 | 11,729,844 | 24,966 | 1024 | accessory-pruned | `98d447ca53509591ac0518a8aff698689d9b982c0ad007a46a9e0968403650db` |
| Male Ranger | 2 | 5,396,812 | 24,966 | 512 | accessory-pruned | `70ca4cc658d10e70a59e265e4353b6c125b995882ee3a9d0295e73a18bd5b1d4` |

Peasant LOD1/2 are deliberately described as texture-only LODs. No topology reduction is claimed for them. Ranger LOD1/2 remove only authored accessory meshes (pauldron/bracer/belt family); stored source geometry remains present in the GLB and the manifest records both stored and visible triangle counts.

## Runtime integration boundary

1. Complete NPC variants use the existing `npc-fallback` catalog lane and existing deterministic `npc.id` visual selector. No random/clock input is added.
2. Modular skinned outfit parts use the existing `equipment` lane only after the server classifier has established the exact shared-rig contract and equipment slot.
3. Static weapon/equipment behavior remains on the existing socket + sizing path.
4. Shared-rig clothing preserves authored model-space transforms and is rebound only to an exact compatible active host Skeleton. If no compatible host exists, the visual is not attached.
5. Catalog/readback failure never changes gameplay or confirmed equipment truth.

## Evidence boundary

Proven in the local preparation pass: source hashes, bundled CC0 license text, ordered rig parity, self-contained GLB structure, current 24 MiB admission bound, triangle counts and embedded texture dimensions.

Not yet proven: Blender import/export, KTX2/Basis texture compression, true topology decimation for every LOD, GPU rendering, native-device performance, live catalog upload/readback, or production runtime parity. Those remain post-draft gates before any merge/live admission.
