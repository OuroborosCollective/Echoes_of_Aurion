---
description: Historischer AX1-Source-Snapshot; aktuelle Ownership steht in ARCHITECTURE_OWNERSHIP.md.
---

# AIM-239 / AIM-266 — Historischer `-ax1` Source-Reconciliation-Snapshot (2026-09-05)

> **Historical source evidence only.** Dieses Dokument bewahrt die 38-Dateien-Quellinventur vom 5. September 2026. Seine damaligen Authority-Formulierungen sind vollständig durch [ARCHITECTURE_OWNERSHIP.md](../../ARCHITECTURE_OWNERSHIP.md), [CURRENT_SOURCE_PROVENANCE.md](CURRENT_SOURCE_PROVENANCE.md) und [AIM-252](AIM252_WASD_NORMATIVE_RULESET.md) ersetzt.

## Gebundene Sourcepunkte des damaligen Audits

| Rolle | Source | Exakte Revision |
|---|---|---|
| normative Gameplayregeln des Audits | `OuroborosCollective/Wasd` | `7bd039bb79681d2df342abe160579f89ca3ff8ed` |
| vorherige AX1-Quelle | `OuroborosCollective/-ax1` | `b9a0c19cb3d2d34212075983e64891274489e32a` |
| finale AX1-Quelle dieses Snapshots | `OuroborosCollective/-ax1` | `d356881538dae23c3aa97364a5596d48b6ac3079` |
| damalige Aurion-Integrationsbasis | `OuroborosCollective/Echoes_of_Aurion` | `d6549a2319ffc5de0e364bd54eeca8a1e4a3ed4a` |

Die Sourcepunkte sind Provenienz, keine aktuellen Pins. Vor neuer Migration werden die aktuellen WASD-/AX1-Revisionen erneut gelesen und bewusst gebunden.

## Aktuelle Ownership für diese Inventur

1. **WASD** besitzt alle fachlichen Gameplayregeln, deterministische State Transitions, Tick-/Seed-Semantik, Progression, Economy, World, Combat, Quest, Group, NPC, Housing und Guild/Kingdom.
2. **AX1** besitzt `/play`, Engine/Renderer/HUD/Input/Animation sowie Visual-/Content-Projektion.
3. **Aurion** besitzt Website/Auth/Account/Community/Forum/Events, Asset-/Ops-Governance, Transport, MariaDB-Persistenz und read-only Readmodels.

Ein Eintrag in `server/` oder MariaDB wird dadurch nicht zu Aurion-Gameplay-Authority.

## Historischer finaler AX1-Delta (38 Dateien), aktuell eingeordnet

| Datei | Source-Änderung | Behandlung | Fläche | Risiko | Aktuelle Integrationsanweisung |
|---|---:|---|---|---|---|
| `bun.lock` | modified +8/-0 | direct | tooling | low | Nur übernehmen, wenn der aktuelle Paketgraph es erfordert. |
| `package.json` | modified +4/-2 | direct | tooling | low | Abhängigkeitsdelta prüfen; keine doppelte Runtime einführen. |
| `server.ts` | modified +305/-0 | reject-raw | source server | critical | Keine parallele AX1-Serverauthority. Gameplayregeln nach WASD; Aurion nur Host/Transport/Persistenz. |
| `server/mariadb.ts` | modified +256/-1 | reject-raw | persistence | critical | Keine AX1-Parallelpersistenz oder In-memory-success. Aurion persistiert nur bestätigte Evidence. |
| `src/App.tsx` | modified +553/-218 | adapt | host-ui | high | AX1 unter `/play` integrieren; Aurion-Portal bleibt getrennt. |
| `src/audio/SoundSynthesizer.ts` | modified +22/-0 | adapt | audio | medium | AX1-Presentation; gameplaybezogene Cues nur aus WASD-confirmed Events. |
| `src/components/CraftingModal.tsx` | added +738/-0 | adapt | ui-crafting | high | AX1 Intent/UI; Craftingregeln, Yield, XP und Outcomes ausschließlich WASD. |
| `src/components/DeterminismDebugOverlay.tsx` | modified +6/-8 | dev-only | debug-evidence | critical | Nur echte WASD-/Runtime-Hashes; synthetische Mirrors nie als Evidence. |
| `src/components/DungeonFinderModal.tsx` | added +422/-0 | adapt | ui-dungeon | high | AX1 UI; Queue/Matching/Instance/Rewards ausschließlich WASD. |
| `src/components/ErrorBoundary.tsx` | added +162/-0 | direct | ui-resilience | low | Presentation-Härtung ohne Gameplaywirkung. |
| `src/components/GameHUD.tsx` | modified +93/-1 | adapt | ui-hud | high | AX1 HUD aus bestätigten Readmodels; keine lokalen Outcomes. |
| `src/components/GuildManagementModal.tsx` | added +1432/-0 | adapt | ui-guild | critical | AX1 Intent/UI; Guild-/Kingdom-Gameplay ausschließlich WASD. |
| `src/components/HomesteadBuilderModal.tsx` | added +158/-0 | adapt | ui-housing | high | AX1 Builder UI; Blueprint-/Placement-/Cost-/Collision-Regeln ausschließlich WASD. |
| `src/components/InventoryModal.tsx` | modified +363/-118 | adapt | ui-inventory | high | AX1 Paperdoll/Filter; Item-/Equipment-Wirkung ausschließlich WASD; Aurion read-only/persistence. |
| `src/components/NPCEconomyModal.tsx` | modified +250/-2 | adapt | ui-economy | critical | AX1 UI; Buy/Sell/Buyback/Economy-Regeln ausschließlich WASD. |
| `src/components/QuestLogModal.tsx` | modified +323/-97 | content-only | ui-lore | medium | AX1 Journal; Quest-/Unlock-/Completion-Wahrheit ausschließlich WASD. |
| `src/components/WorldMapModal.tsx` | modified +202/-41 | adapt | ui-worldmap | high | AX1 Map; Boss-/Territory-/World-State ausschließlich aus bestätigten WASD-Projektionen. |
| `src/core/AssetStyleRegistry.ts` | added +202/-0 | direct | render-style | medium | AX1 Visual Lifecycle; kein Gameplayowner. |
| `src/core/GLBModelManager.ts` | modified +94/-16 | adapt | assets | high | AX1 Rendering hinter Aurion Asset-Governance; GLB-Metadaten besitzen keine Gameplaysemantik. |
| `src/core/MMOEngine.ts` | modified +239/-21 | adapt | engine-orchestration | critical | AX1 Runtime-Orchestrierung; fachliche State Transitions nach WASD. |
| `src/core/ParticleSystem.ts` | modified +178/-1 | direct | render-vfx | medium | AX1 Render-only; Visual RNG aus Gameplayhashes ausschließen. |
| `src/core/PartyManager.ts` | modified +58/-0 | adapt | party | high | AX1 Group UI/Projection; Matching/Rollen/Rewards ausschließlich WASD. |
| `src/core/ProceduralEquipmentVisuals.ts` | modified +102/-92 | direct | render-equipment | medium | AX1 Geometrie aus bestätigten Equipmentprojektionen. |
| `src/data/bossLedgerData.ts` | added +89/-0 | content-only | content-boss | medium | Definitionen/Presentation; Spawn/Defeat/Pity/Respawn ausschließlich WASD. |
| `src/data/defaultGuildData.ts` | added +423/-0 | content-only | content-guild | high | Seed/Content only; nie Live-Gildenstate. |
| `src/data/mmorpgData.ts` | modified +58/-0 | content-only | content-housing | medium | Blueprint-/Content-IDs; Wirkung/Unlock/Cost nach WASD. |
| `src/data/professionsData.ts` | added +987/-0 | content-only | content-profession | high | Contentdefinitionen; Caps/XP/Recipes/Unlocks/Outcomes ausschließlich WASD. |
| `src/engine/ai/NPCLongTermMemory.ts` | modified +12/-0 | adapt | engine-ai | high | AX1-/WASD-Integration; NPC Memory/Decision fachlich WASD-owned. |
| `src/engine/economy/AutonomousNPCEconomy.ts` | modified +3/-0 | adapt | engine-economy | high | Instrumentation darf AX1 übernehmen; NPC-Economy-Regel bleibt WASD. |
| `src/engine/fsm/MobFSM.ts` | modified +22/-11 | adapt | engine-fsm | high | FSM-/Targeting-Regeln ausschließlich WASD; AX1 rendert den Zustand. |
| `src/engine/net/BinaryNPCSnapshotSerializer.ts` | modified +12/-0 | direct | network-serialization | medium | Serializer als Transport; Snapshotinhalt bleibt WASD-Evidence. |
| `src/entities/LootDropManager.ts` | modified +132/-1 | adapt | loot | critical | AX1 Presentation/Intent; Loot/Pity/Auto-Loot-Regeln ausschließlich WASD. |
| `src/entities/MobManager.ts` | modified +375/-54 | adapt | render-mobs | high | Mesh/Animation AX1; Spawn/Stats/Drop/Death-State WASD. |
| `src/entities/OpenWorldPlayer.ts` | modified +70/-12 | direct | render-player | medium | AX1 Renderplayer; Progression/Equipment/Combatstate aus WASD-Readbacks. |
| `src/entities/SimulatedRealmPlayers.ts` | modified +72/-16 | dev-only | simulation | high | Nur explizit Dev/Test; niemals als echte Online-Spieler darstellen. |
| `src/types.ts` | modified +180/-2 | adapt | types | high | DTOs in Content, Intent, WASD-State/Receipt und Aurion-Persistenzprojektion trennen. |
| `src/types/guild.ts` | added +151/-0 | adapt | types-guild | critical | Guild-Content/UI-Typen AX1; fachliche Guild-/Kingdom-Regeln WASD. |
| `src/world/WorldChunkManager.ts` | modified +99/-2 | adapt | world-housing | critical | AX1 rendert bestätigte Deltas; World/Chunk/Housing-Regeln ausschließlich WASD. |

## Roh-Source-Muster, die weiterhin verboten sind

- parallele Source-Server-/DB-Authority;
- query-/clientbestimmte Playeridentität oder kanonische Ticks/Hashes;
- clientbestimmte Guildowner, Ruler, Territory, Balance, HP, Loot oder Itemwirkung;
- lokale XP-/Loot-/Crafting-/Quest-Erfolge als Wahrheit;
- `Date.now()`/`Math.random()` als Gameplayidentität;
- Production-World-State im Browserlocalstorage;
- synthetische Servermirrors als Evidence;
- In-memory-Fallback als persistierter Erfolg.

## Verwendung dieses Snapshots

Diese Datei beantwortet nur: **Welche AX1-Dateien änderten sich damals und wie wurden sie als Migrationsmaterial bewertet?**

Für heutige Integrationen gilt:

```text
CURRENT_SOURCE_PROVENANCE.md
+ AIM252_WASD_NORMATIVE_RULESET.md
+ ARCHITECTURE_OWNERSHIP.md
+ aktueller Source-/Runtime-Readback
> dieser historische Snapshot
```
