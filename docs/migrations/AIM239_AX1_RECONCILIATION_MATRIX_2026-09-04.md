# AIM-239 / AIM-241 — Alt-ZIP → `-ax1` → Echoes_of_Aurion Reconciliation Matrix

Status: **source/main reconciliation contract**. This document is not production-deploy evidence.

## Revision binding

| Rolle | Quelle | Exakte Revision / Hash |
|---|---|---|
| normative Gameplay-Regeln | `OuroborosCollective/Wasd` `main` | `7bd039bb79681d2df342abe160579f89ca3ff8ed` |
| kanonische Gameplay-/3D-Engine-Quelle | `OuroborosCollective/-ax1` `main` | `b9a0c19cb3d2d34212075983e64891274489e32a` |
| Aurion Authority-/Produkt-Baseline | `OuroborosCollective/Echoes_of_Aurion` `main` | `8115ac594f2f3df91d04499fc4f4515b00427d2e` |
| historische Owner-ZIP | `xaurion (1)(1).zip` | SHA-256 `739650d16dee85bb073e2c5af3c737f32573f328673c56edfe91d250719a030f` |

Die ZIP bleibt Provenienz, ist aber nicht mehr die kanonische Gameplay-Quelle. Arelorian/WASD definiert normative deterministische Regeln; Aurion bleibt alleinige Production-Authority für Auth, Session, MariaDB, Zone-Movement, Audio, Tower/Housing und serverseitige Mutation; `-ax1` wird dahinter als Gameplay-/3D-Engine adaptiert.

## 1. Byte-identische Alt-ZIP- und `-ax1`-Module

Diese Module wurden beim Source-Rebind als byte-identisch zwischen historischer ZIP und `-ax1@b9a0c19...` verifiziert. Sie werden nicht allein wegen des Source-Rebinds erneut transportiert; bestehende Aurion-Adapter bleiben maßgeblich.

| Modul | Alt-ZIP ↔ `-ax1` | Aurion-Behandlung |
|---|---|---|
| `src/world/OpenWorldLandscape.ts` | identisch | vorhandene hashgebundene Aurion-Fassung bewahren |
| `src/world/WorldChunkManager.ts` | identische Upstream-Quelle | **nicht** roh überschreiben; Aurion-adaptierte Persistenz-/Authority-Grenze bewahren |
| `src/world/WorldCollisionSystem.ts` | identisch | vorhandene Collision-Projektion bewahren |
| `src/core/ParticleSystem.ts` | identisch | nur bei späterer Engine-Parität gezielt übernehmen |
| `src/core/PartyManager.ts` | identisch | Aurion-Authority prüfen, dann gezielt übernehmen |
| `src/core/GLBModelManager.ts` | identisch | an Aurion GLB-Katalog/-Upload anbinden, keine zweite Asset-Authority |
| `src/core/ItemGlbRegistry.ts` | identisch | vorhandene Aurion-Integration bewahren |
| `src/core/ProceduralEquipmentVisuals.ts` | identisch | vorhandene Aurion-Integration bewahren |
| `src/entities/LootDropManager.ts` | identisch | nur als Darstellung/Engine-Hilfe; Loot-Truth bleibt serverseitig Aurion/WASD |
| `src/entities/SimulatedRealmPlayers.ts` | identisch | keine Production-Spieler-Authority; nur Simulation/Dev falls explizit genutzt |
| `src/data/mmorpgData.ts` | identisch | Content-Daten nur hinter WASD/Aurion-Regeln verwenden |
| `src/audio/SoundSynthesizer.ts` | identisch upstream | **nicht roh übernehmen**; Aurion-Adapter `aurion:audio-cue` bleibt verbindlich |

## 2. Geänderte Kernmodule in `-ax1`

| Modul | Veränderung | Entscheidung für Aurion |
|---|---|---|
| `src/core/MMOEngine.ts` | deutlich erweitert; Fixed-Timestep, Economy, Weather, Ballistics, Remote Player, Prediction, LOD/Pathfinding/Buffs integriert | **ADAPTIEREN**. Engine-Funktionen schrittweise übernehmen; niemals Source-Server-Authority übernehmen |
| `src/core/SyncManager.ts` | erweitert um Determinism-/Snapshot-/Resync-Funktionen, behält aber Standalone-Save/LocalStorage-Pfade | **TEILWEISE ADAPTIEREN**. Snapshot/Resync nutzen; `/api/player/save` und Production-LocalStorage verwerfen |
| `src/entities/MobManager.ts` | FSM, Threat, NavGrid, Collision stärker modularisiert | **ÜBERNEHMEN/ADAPTIEREN** hinter WASD Combat-/Mob-Regeln |
| `src/entities/OpenWorldPlayer.ts` | Ascension-/Gameplay-Erweiterungen | **ADAPTIEREN**; Progression bleibt serverautoritative WASD/Aurion-Truth |
| `src/components/GameHUD.tsx` | Net-/Buff-/Engine-Metriken ergänzt | **ÜBERNEHMEN**, soweit nur Read-Projection |
| `src/components/PartyModal.tsx` | erweitert | **ADAPTIEREN** an Aurion Party-/Session-Authority |
| `src/App.tsx` | Source-Standalone-App erweitert | **NICHT ÜBERNEHMEN**. Aurion `App.tsx` bleibt Host; nur `AurionOpenWorldRuntime` wird additiv gemountet |
| `src/types.ts` | Ascension/FSM/Net/Buff/Perf-Typen ergänzt | **ADAPTIEREN** als geteilte Engine-Typen ohne Authority-Verschiebung |
| `MariaDbAndGlbConsole.tsx` | Standalone DB-/GLB-Konsole erweitert | **NICHT ALS AUTHORITY ÜBERNEHMEN**; Aurion Admin-/GLB-Flächen bleiben maßgeblich |

## 3. Neue `-ax1`-Engine-Systeme

### Direkt bzw. mit kleiner Aurion-Anpassung übernehmen

| Bereich | Module | Regel |
|---|---|---|
| deterministische Simulation | `engine/simulation/FixedTimestepLoop.ts`, `engine/math/DeterministicPRNG.ts` | WASD-Tick-/Determinismus-Vertrag ist normativ |
| NPC-Ökonomie | `engine/economy/AutonomousNPCEconomy.ts`, `TradeSystem.ts`, `DynamicEconomyQuestEngine.ts`, `CaravanSecuritySystem.ts`, `NPCEconomyVisualizer.ts`, `core/EconomicsMath.ts` | serverseitige Wirtschafts-Truth; Parameter später über Wolfram prüfen |
| NPC-Memory/FSM | `engine/ai/NPCLongTermMemory.ts`, `NPCShortTermMemory.ts`, `fsm/EntityStateMachine.ts`, `MobFSM.ts`, `NPCFSM.ts` | Aktionen müssen WASD/Aurion-Intents und Receipts respektieren |
| Navigation | `engine/pathfinding/NavGrid.ts`, `HierarchicalPathfinding.ts`, `ecs/SpatialHashGrid.ts` | deterministische server-/ruleset-kompatible Wege |
| Performance | `engine/lod/LODManager.ts`, `OcclusionCullingSystem.ts`, `world/InstancedVegetationSystem.ts` | reine Simulation-/Renderoptimierung, keine Gameplay-Truth |
| Environment | `world/TerrainBarycentric.ts`, `world/GlobalWeatherEngine.ts` | Weather-Zeitquelle an Aurion/WASD Tick/Epoch binden; kein Client-`Date.now()` als Truth |
| Progression | `engine/ascension/AscensionSystem.ts` | nur als Projektion/Mechanik hinter cap-freier WASD-Progression |
| Buffs | `engine/combat/BuffDebuffSystem.ts` | serverautoritativ berechnen; Client rendert |
| UI | `components/NPCEconomyModal.tsx` | read-only Projektion des autoritativen Zustands |

### Stark adaptieren

| Bereich | Module | Warum |
|---|---|---|
| Multiplayer | `engine/net/MultiplayerClient.ts`, `entities/RemotePlayerManager.ts` | Source bindet Identität nicht an Aurion-Session/Zone-Ticket; muss auf Aurion-Auth umgestellt werden |
| Prediction | `engine/net/ClientPredictionReconciliation.ts` | Konzept gut, Schwellen-/Correction-Logik unvollständig; server snapshot bleibt Wahrheit |
| Lag Compensation | `engine/combat/LagCompensation.ts` | aktuelle Source validiert im Kern Range statt vollständiger Ray-vs-rewound-capsule-Prüfung |
| Ballistics | `engine/combat/BallisticPhysics.ts`, `CapsuleCollider.ts`, `LineOfSightSystem.ts`, `ThreatMatrix.ts` | Combat muss an WASD/Aurion Tick, Hit Validation und serverseitige Damage-Authority gebunden werden |
| Snapshot Transport | `engine/net/BinaryNPCSnapshotSerializer.ts`, `DeltaCompressionQuantizer.ts`, `persistence/DeltaSnapshotManager.ts` | Transportmechanik nutzen, aber Snapshot-Origin und Commit müssen Aurion-serverautoritativ sein |
| Determinism UI | `components/DeterminismDebugOverlay.tsx` | Source nutzt synthetischen „Server Mirror“; in Aurion nur mit echtem Server-Hash/Receipt zulässig |

## 4. Nicht als Production-Authority übernehmen

Folgende Source-Flächen sind explizit **keine** Aurion-Production-Truth:

- `server/multiplayerServer.ts` in seiner Source-Form: Query-Parameter `playerId/name/classId` sind kein Aurion-Auth-Nachweis.
- `server/writeBehindBuffer.ts` darf nur hinter validiertem Aurion-Serverzustand eingesetzt werden; niemals ungeprüfte Clientwerte persistieren.
- Source-`server.ts` wird nicht als Aurion-Server ersetzt oder parallel betrieben.
- `/api/player/save`, `/api/database/configure`, `/api/world/chunks` werden nicht eingeführt.
- Client darf HP, Level, Damage, Equipment, Position oder Loot nicht als autoritative Mutation festlegen.
- kein raw `DATABASE_URL` im Xaurion-Client.
- kein Production-World-State über `localStorage`.
- kein neuer `AudioContext`; Sound bleibt über Aurion `aurion:audio-cue`.

## 5. Bereits reconciliierter Aurion-Stand in PR #176

Der AIM-241-Reconcile bewahrt den aktuellen Aurion-`main@8115ac...`-Stand und graftet die vorhandene AIM-239-Integration additiv darauf:

- aktuelle `/ops/glb-upload`-Route, `GlbUpload` und `LocalAuthPanel` bleiben erhalten;
- `AurionOpenWorldRuntime` wird zusätzlich im Aurion-App-Host gemountet;
- der bestehende hashgebundene `WorldChunkManager` wird für den Atlas-Fix **nicht** verändert;
- `WorldMapModal` liest read-only über `Array.from(chunkManager.chunks.values())`;
- bestehende AIM-239 Authority-Regressionen bleiben aktiv;
- Source-Rebind-Manifest: `docs/migrations/aim239-source-baseline.json`;
- Source-Rebind-Regression: `server/aim239SourceRebind.test.ts`;
- AIM-239 CI ist read-only und installiert mit `pnpm install --frozen-lockfile`, damit ein grüner Run denselben exact head prüft.

## 6. Weiterführende Lanes nach AIM-241

AIM-241 schließt ausschließlich Source-/Main-Reconcile und Provenienz. Gameplay-Verhalten wird in nachfolgenden AIM-239-Lanes integriert. Jede gameplay-verändernde Lane bleibt durch den Arelorian/WASD-Vertrag vorgelagert und darf Aurion-Production-Authority nicht erweitern oder duplizieren.

**Kein Merge und kein VPS-Deploy sind Bestandteil von AIM-241.**
