# AIM-239 / AIM-266 — Final `-ax1` Source Reconciliation Matrix

Status: **source and ownership contract**. This document proves the static source decision for the final `-ax1` delta; it is not live-runtime or deployment evidence.

## Revision binding

| Role | Source | Exact revision |
|---|---|---|
| normative gameplay rules | `OuroborosCollective/Wasd` | `7bd039bb79681d2df342abe160579f89ca3ff8ed` |
| previous gameplay/3D source | `OuroborosCollective/-ax1` | `b9a0c19cb3d2d34212075983e64891274489e32a` |
| final gameplay/content/3D source | `OuroborosCollective/-ax1` | `d356881538dae23c3aa97364a5596d48b6ac3079` |
| Aurion authority baseline | `OuroborosCollective/Echoes_of_Aurion` | `d6549a2319ffc5de0e364bd54eeca8a1e4a3ed4a` |

The final source commit is unsigned and had no source CI at capture time. Aurion therefore accepts no implicit stability claim; every adapted lane must obtain its own target-repository regression evidence.

## Ownership hierarchy

1. **Arelorian/WASD** owns deterministic rules, tick, exact progression and valid state transitions.
2. **Echoes_of_Aurion** owns auth, session, MariaDB, zone state, inventory/item custody, guild authority, audio and all production mutations.
3. **`-ax1`** supplies content, controls, rendering, UI, engine mechanisms and implementation candidates.

## Complete final delta (38 files)

| File | Source change | Decision | Surface | Risk | Aurion instruction |
|---|---:|---|---|---|---|
| `bun.lock` | modified +8/-0 | **direct** | tooling | low | Keep dependency lock update only when Aurion package graph requires it. |
| `package.json` | modified +4/-2 | **direct** | tooling | low | Aurion already carries React type packages; record as source delta, no duplicate dependency drift. |
| `server.ts` | modified +305/-0 | **reject-raw** | server-authority | critical | Rebuild guild, bank and kingdom routes behind Aurion session, capabilities and normalized transactions. |
| `server/mariadb.ts` | modified +256/-1 | **reject-raw** | persistence-authority | critical | Reject JSON-blob and in-memory-success authority; normalize in Aurion MariaDB. |
| `src/App.tsx` | modified +553/-218 | **adapt** | host-ui | high | Do not replace Aurion App host; mount approved projections through AurionOpenWorldRuntime. |
| `src/audio/SoundSynthesizer.ts` | modified +22/-0 | **adapt** | audio | medium | Map legendary drop cue to aurion:audio-cue; no second AudioContext authority. |
| `src/components/CraftingModal.tsx` | added +738/-0 | **adapt** | ui-crafting | high | Use as read/intent UI; all resource, yield, XP and item mutations come from Aurion receipts. |
| `src/components/DeterminismDebugOverlay.tsx` | modified +6/-8 | **dev-only** | debug-evidence | critical | Synthetic server mirror is not production evidence; adapt only to real server hashes/receipts. |
| `src/components/DungeonFinderModal.tsx` | added +422/-0 | **adapt** | ui-dungeon | high | Replace simulated party, teleport and rewards with server queue, tickets and completion receipts. |
| `src/components/ErrorBoundary.tsx` | added +162/-0 | **direct** | ui-resilience | low | Adopt with production stack/detail disclosure guard. |
| `src/components/GameHUD.tsx` | modified +93/-1 | **adapt** | ui-hud | high | Expose new actions from server-approved readmodels; no local outcome state. |
| `src/components/GuildManagementModal.tsx` | added +1432/-0 | **adapt** | ui-guild | critical | Use as intent/read projection; remove local mutation success and client ownership claims. |
| `src/components/HomesteadBuilderModal.tsx` | added +158/-0 | **adapt** | ui-housing | high | Fix hook order and bind blueprints to Aurion housing placement receipts. |
| `src/components/InventoryModal.tsx` | modified +363/-118 | **adapt** | ui-inventory | high | Paperdoll/filter/pity projection only; inventory and gear score remain server-owned. |
| `src/components/NPCEconomyModal.tsx` | modified +250/-2 | **adapt** | ui-economy | critical | Sell/buyback require atomic item custody and treasury transactions. |
| `src/components/QuestLogModal.tsx` | modified +323/-97 | **content-only** | ui-lore | medium | Adopt content/read projection; unlock and completion require quest/lore receipts. |
| `src/components/WorldMapModal.tsx` | modified +202/-41 | **adapt** | ui-worldmap | high | Boss and territory live state come from Aurion epoch/tick readmodels. |
| `src/core/AssetStyleRegistry.ts` | added +202/-0 | **direct** | render-style | medium | Adopt with reference counting and deterministic disposal lifecycle. |
| `src/core/GLBModelManager.ts` | modified +94/-16 | **adapt** | assets | high | Use articulated fallback behind Aurion GLB catalog and ops upload authority. |
| `src/core/MMOEngine.ts` | modified +239/-21 | **adapt** | engine-orchestration | critical | Selectively port orchestration; do not reintroduce standalone authority paths. |
| `src/core/ParticleSystem.ts` | modified +178/-1 | **direct** | render-vfx | medium | Adopt render-only VFX; exclude visual RNG from authoritative hashes. |
| `src/core/PartyManager.ts` | modified +58/-0 | **adapt** | party | high | Replace simulated/local party state with Aurion membership, role and reward receipts. |
| `src/core/ProceduralEquipmentVisuals.ts` | modified +102/-92 | **direct** | render-equipment | medium | Adopt geometry changes behind server-approved equipment readmodels. |
| `src/data/bossLedgerData.ts` | added +89/-0 | **content-only** | content-boss | medium | Definitions only; spawn, defeat, slayer and respawn state are server-owned. |
| `src/data/defaultGuildData.ts` | added +423/-0 | **content-only** | content-guild | high | Seed/catalog only; never represent persisted live guild state. |
| `src/data/mmorpgData.ts` | modified +58/-0 | **content-only** | content-housing | medium | Normalize homestead blueprints and content IDs. |
| `src/data/professionsData.ts` | added +987/-0 | **content-only** | content-profession | high | Normalize professions/recipes/dungeons/lore; remove caps and local Number XP authority. |
| `src/engine/ai/NPCLongTermMemory.ts` | modified +12/-0 | **direct** | engine-ai | low | Compatibility getters may be ported without changing memory authority. |
| `src/engine/economy/AutonomousNPCEconomy.ts` | modified +3/-0 | **direct** | engine-economy | low | tickCount getter may be ported as read-only instrumentation. |
| `src/engine/fsm/MobFSM.ts` | modified +22/-11 | **adapt** | engine-fsm | high | Remove local hero fallback as authority; use confirmed Aurion player/target state. |
| `src/engine/net/BinaryNPCSnapshotSerializer.ts` | modified +12/-0 | **direct** | network-serialization | medium | Port header guard and add full bounds/fuzz checks. |
| `src/entities/LootDropManager.ts` | modified +132/-1 | **adapt** | loot | critical | Rewrite pity and auto-loot through deterministic server loot and collect receipts. |
| `src/entities/MobManager.ts` | modified +375/-54 | **adapt** | render-mobs | high | Port meshes/animation; spawns, levels and drops derive from Aurion encounter plan. |
| `src/entities/OpenWorldPlayer.ts` | modified +70/-12 | **direct** | render-player | medium | Port refined geometry only; progression and equipment remain server projections. |
| `src/entities/SimulatedRealmPlayers.ts` | modified +72/-16 | **dev-only** | simulation | high | Keep explicit dev/test only; never display as live online players. |
| `src/types.ts` | modified +180/-2 | **adapt** | types | high | Split content DTOs, readmodels, intents and server receipts; avoid monolithic authority type. |
| `src/types/guild.ts` | added +151/-0 | **adapt** | types-guild | critical | Map to normalized Aurion guild/kingdom domain and capability contract. |
| `src/world/WorldChunkManager.ts` | modified +99/-2 | **adapt** | world-housing | critical | Render confirmed homestead deltas only; server owns placement, collision and IDs. |

## Explicit rejection of raw source authority

The following patterns remain forbidden in production: standalone source server/DB ownership; query-parameter player identity; client-provided guild owners, rulers, territories, balances or full item objects; local XP/loot/crafting success; `Date.now()` or `Math.random()` as gameplay identity; production world state in local storage; synthetic server mirrors presented as evidence; and in-memory fallback responses presented as persisted success.

## Migration order for the final update

1. AIM-266 source pin and 38-file decision matrix.
2. AIM-267 versioned content catalog.
3. AIM-268 guild and kingdom authority.
4. AIM-269 guild bank and state economy.
5. Remaining dungeon, boss, housing, loot, visual and multiplayer lanes, then AIM-251/AIM-253/AIM-254 convergence.

No release, continuity or VPS gate is introduced by this source-rebind lane.
