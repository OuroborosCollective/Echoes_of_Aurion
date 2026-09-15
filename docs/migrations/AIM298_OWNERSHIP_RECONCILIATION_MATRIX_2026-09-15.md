# AIM-298 Architecture Ownership & AIM Reconciliation Matrix (2026-09-15)

## Verbindlicher Ownership-Vertrag

Gemäß AIM-298 gilt folgende verbindliche und widerspruchsfreie Aufteilung:

| System | Kanonische Rolle | Verantwortung |
| :--- | :--- | :--- |
| **Aurion** | Sole Gameplay & Persistence Truth | Alleinige kanonische Gameplay-, Quest-, NPC-, World-, Chunk-, Progression-, Loot-, Crafting- und MariaDB-Persistenz-Authority. Führt Gameplay über typisierte, validierte Kommandos und deterministische Receipts aus. |
| **AX1** | Kanonisches Hauptspiel & Runtime | Renderer, `/play`, HUD, Kamera, Benutzereingaben, Animationen, VFX und sichtbare Projektion von Aurion-Wahrheit. |
| **WASD** | Integrierte Berechnungsreferenz | Deterministische Algorithmen-, Mathematik- und Regelreferenz, nativ in Aurion eingebettet. Bildet kein separates Authority-Sidecar und besitzt keine eigene Server-Wahrheit. |

---

## Reconciliation-Tabelle für AIM-270, AIM-293 und AIM-294

| AIM | Thema | Status | Repository-Referenz | Evidence-Referenz |
| :--- | :--- | :--- | :--- | :--- |
| **AIM-270** | Legacy Encounter Retirement & Reachability Block | **DONE** | `server/aim270LegacyEncounterReachability.test.ts`<br>`server/_core/trpc.ts` (`RETIRED_AURION_GAMEPLAY_WRITE_PATHS`)<br>`client/src/xaurion/integration/confirmedActionRequest.ts` | `vitest run server/aim270LegacyEncounterReachability.test.ts` (PASS, 4/4 tests)<br>Precondition-Checks blockieren `gameplay.startEncounter` und `gameplay.act` vor DB-Resolvern |
| **AIM-293** | Action Causality & Provenance Verification | **DONE** | `server/wasdSemanticGraphPersistence.ts` (`validateDecisionProvenance`)<br>`server/wasdSemanticGraphPersistence.test.ts` | `vitest run server/wasdSemanticGraphPersistence.test.ts` (PASS, 5/5 tests)<br>Fails strictly bei fehlenden/unverifizierten Provenienz-Receipts |
| **AIM-294** | Semantic Memory Graph Persistence & Query | **DONE** | `server/wasdSemanticGraphPersistence.ts`<br>`server/wasdSemanticGraphPersistence.test.ts`<br>`drizzle/0044_aurion_semantic_memory_graph.sql`<br>`drizzle/0046_aurion_semantic_node_history_key.sql` | `drizzle/meta/_journal.json` (Einträge 44, 46 verifiziert)<br>`deploy/verify-aurion-production-schema-apply-artifact.mjs` (PASS, SHA 824c68d8c03949a758cc789faba8e8043cbf08c6)<br>`vitest run server/wasdSemanticGraphPersistence.test.ts` (PASS) |
