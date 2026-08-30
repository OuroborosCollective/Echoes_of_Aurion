# Wasd→Aurion: 12-Domänen-Abnahmematrix

Stand: **2026-08-30**. Quellrevision: `a80df4d150cfeb12365fc26886420763eeb18313`. Zielrevision vor Kandidatenänderungen: `7cdf3f91e9c3036957d7c73befebf6dbd568b2a5`. Die Matrix trennt belegte Aurion-Adaptionen von Quellen, die bewusst nicht als Runtime-Code übernommen werden.

| Nr. | Domäne | Aurion-Nachweis | Status | Restnachweis / Grenze |
| ---: | --- | --- | --- | --- |
| 1 | Deterministische Weltregeln | `server/wasdAurionProtocol.ts`, `server/wasdAurionWorldIntegrityProtocol.ts`, Tests | ADAPT_TO_AURION | Reproduzierbarkeit und Sortierung geprüft; Browser-Readback noch offen. |
| 2 | Regionen, Chunks, Siedlungen und Länder | `server/worldChunk*`, `server/globalWorldProtocol.ts`, `drizzle/0016`, `0021–0024` | ADAPT_TO_AURION | Produktions-Readback der späten Tabellen fehlt; keine Schema-Anwendung ausgeführt. |
| 3 | Umwelt- und Ereignisreaktionen | `server/worldEpochReactionProtocol.ts`, Weltintegritätstests | ADAPT_TO_AURION | Reaktionskette lokal deterministisch geprüft; Live-Evidenz offen. |
| 4 | Charakter-, Waffen-, Skill- und Levelprogression | `server/wasdAurionSkillProgressionProtocol.ts`, `drizzle/0018`, Runtime-Tests | ADAPT_TO_AURION | Readmodelltest lokal vorhanden; Produktionszustand nicht mutiert. |
| 5 | Quests und Weltaufgaben | `server/aurionQuestlineProtocol.ts`, `server/aurionFactionQuestlineProtocol.ts`, `drizzle/0020`, `0026–0027` | ADAPT_TO_AURION | E2E-Browserpfad noch nicht nachgewiesen. |
| 6 | Loot, Affixe, Sets und Iteminstanzen | `server/aurionLootProtocol.ts`, `server/aurionMasteryEthosProtocol.ts`, `drizzle/0025` | ADAPT_TO_AURION | Rechte-/GLB-Freigabe einzelner Wasd-Kandidaten nicht pauschal angenommen. |
| 7 | NPC-Gedächtnis, Bedürfnisse und autonomes Brain | `server/wasdAurionProtocol.ts`, NPC-/Runtime-Tests | ADAPT_TO_AURION | LLM bleibt nichtkanonischer Vorschlagskanal; vollständiger sichtbarer NPC-Readback offen. |
| 8 | Fraktionen, Regierungen, Königreiche, Diplomatie und Kriege | `server/wasdAurionSocietyProtocol.ts`, Faction-Questline-Protokolle | ADAPT_TO_AURION | Fiktive Konfliktlogik ist begrenzt; keine reale Gewalt- oder Produktionssimulation übernommen. |
| 9 | Lore, Content, Expeditionen, Gilden und Ereignisfolgen | `server/wasdAurionExpeditionProtocol.ts`, Content-/Quest-Dokumente | ADAPT_TO_AURION | Rechteprüfung kanonischer Texte bleibt erforderlich. |
| 10 | Sprachkern, Dialekte und NPC-Verständnis | `server/wasdAurionDialogueQuestIntentProtocol.ts`, Dialogtests | ADAPT_TO_AURION | Unklare Eingaben werden quarantänisiert; vollständige Sprachcontent-Abnahme offen. |
| 11 | GLB-Modelle, Charakterteile, Waffen und Featureassets | `client/src/game/glbUsagePlan.ts`, `server/wasdAurion*SceneAssets*`, `WASD_GLB_AUDIT.md` | BLOCKED | 149 Wasd-GLBs inventarisiert, aber Provenienz-, Budget-, Validator- und Szenenfreigabe je Kandidat muss vor Aktivierung erfolgen. |
| 12 | Persistenz, Integrität und Evidenz | `audit-manifest.json`, `dist/aurion-wasd-migration-ledger/*`, Source-Ledger-Kopie, Migrationsketten-Tests | ADAPT_TO_AURION | Ledger ist read-only erzeugt; `0021–0027` benötigen Produktions-Readback, bevor Journal-Reconciliation oder Apply möglich ist. |

## Abnahmeentscheidung

Die Quellenabdeckung ist **vollständig inventarisiert (1.142/1.142)**, aber nicht als pauschale Codekopie abgeschlossen. **712** Quellen sind an bestehende Aurion-native Adapter/Kanonpfade gebunden, **335** bleiben `REFERENCE_ONLY` und **95** sind wegen ungeklärter Zielsemantik, Rechtekette oder Infrastrukturgrenzen `BLOCKED`. Damit ist eine Behauptung „alle Wasd-Dateien produktiv migriert“ nicht zulässig. Die sichere, additive Kandidatenarbeit endet vor GLB-Aktivierung, Produktionsmigration, Journal-Reconciliation, Merge und Deployment.

## Reproduzierbare Artefakte

| Artefakt | Zweck |
| --- | --- |
| `docs/migrations/source-ledger-a80df4d150cfeb12365fc26886420763eeb18313.json` | Vom Nutzer gelieferte, hashgebundene Quellinventur |
| `audit-manifest.json` | Passive Zwei-Repository-Inventur; keine Freigabe |
| `dist/aurion-wasd-migration-ledger/migration-ledger.json` | Read-only Plan- und Receipt-Artefakt |
| `docs/migrations/WASD_AURION_FULL_SOURCE_COVERAGE_2026-08-30.md` | Alle 1.142 Einzeldateien mit Hash, Domäne und Status |
| `server/wasdAurionSourceCatalog.ts` | Bestehender Runtime-Readmodel-Katalog, auf aktuelle Revision aktualisiert |

> Produktionsmigration, Ledger-`--apply`, Merge, Deployment und öffentliche Veröffentlichung bleiben ausdrücklich freigabepflichtig.
