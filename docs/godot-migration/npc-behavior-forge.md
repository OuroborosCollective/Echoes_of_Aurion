# NPC Behavior Forge — experimentelle Stufe

Status: **PARTIAL / SHADOW ONLY**. Dieser Branch enthält keine produktive Controller-Freigabe. Aurion bleibt Eigentümer aller Entscheidungen, Bewegungen, Zustandsübergänge und Persistenz. Godot zeigt Entwürfe und serverseitige Ergebnisse; externe Modelle erhalten keine Ausführungsrechte.

## Was bereits implementiert ist

Im vorhandenen WorldStudio können Admins tatsächlich receipt-belegte NPCs laden, eine Rollen-/Modusvorlage wählen, deren erlaubte Aktionen und Regeln ansehen und serverseitig außerhalb des Spielticks gegen den vorhandenen Utility-Planner vergleichen. Die Beschreibung ist Entwurfsmetadatum; diese Stufe ruft dafür **kein Sprachmodell** auf. Ein Template ist keine KI-generierte oder aktivierte Weltfigur.

Der Editor unterscheidet `DRAFT` und `TESTED`. Änderungen an Entwurf, Actor, Beobachtung oder Sitzung entwerten die Testanzeige. Ein gültiger Vergleich muss das tatsächlich getestete Artefakt zurückgeben. `PROPOSED`, `VALIDATED`, `APPLIED` und `LIVE_VERIFIED` sind noch nicht implementiert. Es gibt keine versteckte Apply-Schaltfläche und kein positives Live-Versprechen.

| Variante | Implementierung | Ausführung |
| --- | --- | --- |
| Tree | Begrenzter Selector mit geordneten Aktions-/Risikoblättern; keine Schleifen oder Skripte | Offline-Vergleich oder gebundener Shadow-Kandidat |
| Utility | Vier ganzzahlige Features, Gewichte −16 bis 16, Bias −10000 bis 10000; stabile Deklarationsreihenfolge bei Gleichstand | Offline-Vergleich oder gebundener Shadow-Kandidat |
| Micro-Controller | Synthetisches 4→4 Identity/ReLU→1-Netz mit Aktivierungs-/Term-Trace | Nur Offline-Forschung; Registry lehnt diesen Modus ab |

Die existierende Eligibility-Prüfung läuft vor der Kandidatenbewertung. Zulässige Angebote stammen aus dem bestehenden Vertrag: `consume`, `rest`, `produce`, `trade`, `caravan`, `patrol`, `socialize`. Es werden keine neuen Kampf-, Quest-, Inventar- oder Bewegungsbefugnisse erzeugt. Die vier Vorlagen Schmied, Questgeber, Wächter und Tier beschreiben nur Kandidaten innerhalb dieser Angebote; sie behaupten keine vollständig implementierten Berufe oder Monsterfähigkeiten.

## Archetyp-Registry und Grenzen

`NpcArchetypeControllerRegistry.v1` erweitert die bestehende MariaDB-NPC-Policy-Persistenz additiv. Migration `0077` ergänzt Artefakte, unveränderliche Freigaben, einen revisionsgebundenen Freigabezeiger, unveränderliche Spawn-Bindungen und Shadow-Receipts. Vier Tabellen besitzen jeweils einen UPDATE- und DELETE-Schutz; nur der Freigabezeiger ist veränderlich. Artefakte werden nach Hash geteilt, Zustände bleiben pro kanonischer NPC-ID getrennt. Es gibt noch keinen prozessweiten Artefaktcache.

Die Freigabeprüfung verwendet vorhandene Policy-Versionen und Mutation-Receipts einschließlich ihres unveränderten historischen Hashformats. Sie prüft Artefakthash, Schema, Angebotsrechte, Policy-Provenienz, Regression-Metadaten und Receipt-Kette. **Eine Regression-Metadatenangabe ist kein unabhängig verifizierter GitHub-Actions-Nachweis.** Deshalb lässt diese API ausschließlich Shadow-Freigaben zu und ersetzt keinen Produktions-Releasevertrag.

| Technischer Archetyp | Angebotsfähigkeiten | Kanonische Zuordnung |
| --- | --- | --- |
| `aurion.merchant.economy.v1` | Bedürfnisse, Produktion, Handel, Karawane, Patrouille, Soziales | Ausschließlich die vier bereits vorhandenen Händler-IDs der kanonischen Hubs |
| `aurion.resident.social.v1` | Bedürfnisse und Soziales | Noch kein produktiver Spawnadapter |
| Unbekannter Archetyp / andere Actor-Verträge | Keine zusätzlich erteilten Fähigkeiten | Bestehende kanonische Fallback-Regeln |

NPC-Beruf, Monster-Spezies und technischer Controller-Archetyp sind getrennte Begriffe. Ein Berufsfeld `merchant` verleiht keine Händlerrechte. Lyra, Orun und Zone-Monster werden nicht automatisch einem anderen Ausführungsvertrag unterstellt. Der Spezieskatalog benötigt einen gesondert geprüften Adapter.

Die Bindung geschieht ausschließlich innerhalb der kanonischen Erstentscheidung. Neue Spawns verwenden den dort serialisierten Freigabezeiger. Bestehende Bindungen bleiben unverändert; Lesen und Replay führen keine Migration aus. Eine kompatible individuell freigegebene NPC-Policy bleibt erhalten. Rollback erzeugt eine neue Registry-Revision mit einem früheren geprüften Artefakt; es schreibt keine Historie um. Explizite NPC-Migrationen sind noch nicht implementiert und werden abgelehnt.

Freigabe und Spawn verwenden aktuelle Datenbank-Reads auch bei einem älteren Repeatable-Read-Snapshot. Fehlende Bindungen dürfen keine Gap-Locks auf andere NPCs erzeugen. Der Archetypzeiger wird vor der Freigabe-/Artefaktprüfung serialisiert. Gemeinsame Artefakte werden zuerst mit `INSERT IGNORE` eingelagert und anschließend aktuell und hashgebunden geprüft.

## Was ein Shadow-Receipt beweist

Die bestehende kanonische Aktion wird mit ihren echten Regeln ausgeführt. Erst danach entsteht im selben Transaktionskontext ein getrennter Controllervergleich. Sein Receipt verweist auf NPC-ID, Bindung, Artefakt, bestätigte Entscheidung, tatsächliches Action-Receipt und Effect-Readback. Ein Retry erzeugt keinen zweiten Shadow-Beleg. Ein unabhängiger Readback prüft diese Verknüpfungen erneut.

`MATCHES_CANONICAL_ACTION` und `DIFFERS_FROM_CANONICAL_ACTION` vergleichen zwei Ergebnisse. Sie bedeuten **nicht**, dass Aurion den Controller-Vorschlag zur Ausführung angenommen oder abgelehnt hat. Der Vorschlag wird derzeit nicht in das Gateway eingespeist. Die geforderte vollständige Proposal→Validierung→Wirkung-Kette ist daher noch offen.

Der vorhandene Händlervertrag bindet eine Resolution und Epoche; eine vollständige revisionsgebundene Tick-/Chunk-Beobachtung für Controller-Zulassung fehlt. Das Receipt kennzeichnet diese Grenze mit `UNAVAILABLE_AUTHORITATIVE_ADMISSION_BLOCKED`. Fehlende oder ungültige Controller liefern keine Empfehlung und belassen die vorhandenen Aurion-Regeln. SQL-/Transportfehler werden nicht als Controllererfolg maskiert.

## Weight-Space-Experiment

Das Experiment in `weightSpaceExperiment()` ist ein selbst erzeugtes mathematisches Beispiel, kein trainiertes Modell und keine Messung an produktiven NPCs. Inspiriert durch [Weight-Space Programming](https://rikiyat.github.io/blog/weight-space-programming/) wird ein falsch positives Risikogewicht korrigiert.

| Größe | Vorher | Nachher |
| --- | --- | --- |
| Gewichte | `[2,1,1,-1]` | `[2,1,-1,-1]` |
| Delta | — | `[0,0,-2,0]`, ein Gewicht, Rang 1 |
| Scores der zwei synthetischen Beobachtungen | `[25000,11000]` | `[7000,9000]` |
| Deterministische Utility-Alternative | — | Dieselben Scores und dieselbe Rangfolge |

Der beschränkte Skalarproduktraum liegt bei höchstens `4×16×10000+10000 = 650000`, also innerhalb exakt repräsentierbarer JavaScript-Ganzzahlen. Es gibt hier weder Rundung noch Überlauf. Das ist eine Aussage über diesen begrenzten Rechenpfad, kein plattformübergreifender Determinismusbeweis für beliebige neuronale Inferenz. Ein neuronaler Vorteil ist nicht nachgewiesen; für diese Korrektur genügt Utility.

## Prüfungen und Leistung

Die bestehenden CI-Lanes führen TypeScript, native Godot-Tests und echte isolierte MariaDB-Tests aus. Registry-Regressionen prüfen gemeinsame Artefakte bei separaten Identitäten, konkurrierende Freigaben und Spawns, individuelle Versionen, Restart, unabhängige Prozess-Replays, Rollback, Rechtebegrenzung, beschädigte Artefakte und persistierte Shadow-Readbacks. Synthetische Testdaten sind keine produktive Freigabe.

TDD-Belege: `f8ca64ac2cf4f1573b8299bbc1b2bdf7571a90d8`, Run `42057862494`, reproduzierte den veralteten Readview; `329528c4526c4341738c642e48caed6602024bc7`, Run `42059298498`, reproduzierte den Deadlock gleichzeitiger erster Spawns. Quellkorrekturen müssen durch die jeweils neueste exakte Revision erneut geprüft werden. Ältere grüne Läufe gelten nicht automatisch für späteren Code.

Ein historischer **synthetischer** Benchmark auf `ace98abf589a245d882cafbf803b0eadd271164b`, Node 22.23.4/x64, benötigte für 1/100/1000 Auswertungen insgesamt etwa 7,04/54,54/335,62 ms. Das ist keine Messung tausender aktiver NPCs, keine integrierte Tickmessung und keine Kapazitätszusage. Heap-Deltas waren durch Garbage Collection verrauscht. CPU-/Speicherlast der integrierten Registry, feste Aktivierungsbudgets und plattformübergreifende Vergleichsläufe fehlen noch. Der kanonische Tick bleibt 100 ms / 10 Hz.

## Release und Live-Abnahme

Die historische Migrationswelle bis `0076` bleibt unverändert. Die neue geschlossene Welle bis `0077` umfasst 56 Einträge; bestehende Backup-, Recovery-, Approval-, Artifact- und Readback-Gates bleiben wirksam. Der begrenzte Reparaturplan darf nur die acht exakt festgelegten Registry-Append-only-Trigger ergänzen. Beschädigte bestehende Trigger werden nicht ersetzt oder als korrekt bestätigt.

Produktionsstatus beim Readback am 2026-11-05: Container und `/healthz` meldeten übereinstimmend Revision `e97a0027d69c6a3a3bf32c3590fdcac38b2d114b`, 10 Hz. Der Händlerzyklus 353 meldete einen bestätigten und drei blockierte Händler (`TARGET_RANGE` beziehungsweise `INVENTORY_UNAVAILABLE`). Dies ist die bestehende Runtime, kein Forge-Erfolg. Die authentifizierte Authoring-Prüfung lieferte `401 NATIVE_AUTH_SESSION_EXPIRED`; der MCP-Adminadapter meldete `AURION_ADMIN_ACCESS_TOKEN_MISSING`. Ein verfügbarer SSH-Zugang ersetzt weder diese Sitzung noch die Releasefreigabe.

Offen sind die kanonische Controller-Zulassung mit echter Regression-Evidence, vollständige Tick-/Seed-/Chunk-Bindung, explizite Migration, weitere Actor-/Monsteradapter, tatsächliche Modellgenerierung und der native Apply-/Readback-Vertrag. Ein GLB-Symbol, ein Offline-Test oder ein gesunder Container beweist keine sichtbare 3D-Figur. Der reale Canary und die bestätigte Godot-Projektion bleiben **BLOCKED / UNVERIFIED**. Kein Merge oder Deployment wird durch diesen Bericht freigegeben.

## Ergänzte Händlerregeln auf Eigentümerauftrag

Unbegrenzter Lagerplatz bedeutet keine unbegrenzten Waren. `aurion.merchant-storage.unbounded.v1` hebt für neue serverseitige Händleraktionen das Kapazitätslimit auf. Tatsächliche Mengen, Bestandshashes und Transaktionsprüfungen bleiben erhalten. Die numerische Darstellungsgrenze wird ausdrücklich geprüft; Überlauf wird niemals gerundet oder als Lagerbestand übernommen. Die vorhandene Preisfunktion sättigt ihren Knappheitsfaktor bereits oberhalb von 600 Einheiten; größere Bestände verwenden denselben gesättigten Preisbereich. Historische Kontexte ohne die neue Policy behalten ihre alte Kapazitätsprüfung. Neue Intents und Receipts binden die Policy-Version; bereits persistierte Aktionen werden unverändert zurückgelesen.

`aurion.merchant-travel.v1` verwendet den bestehenden Vier-Hub-Routengraphen und aktuelle serverseitige Marktdaten. Für unmittelbar benachbarte Märkte vergleicht sie die Standortchance mit Reisekosten und einer Risikoabschätzung anhand des lokalen Handelswerts sowie eines Vermögensanteils. Route-Sicherheit, bestätigte Gefahrenerinnerungen und politische Stabilität beeinflussen die Bewertung. Bei positiver Standortbewertung wird genau eine gültige Routenkante vorgeschlagen; bei fehlender Erreichbarkeit oder schlechterem Nutzen bleibt der Händler beim lokalen Handel. Leere Handelsbestände führen zur lokalen Produktion statt zur wiederholten identischen Fehlanfrage. Dasselbe gilt für einen hungrigen Händler ohne Bestand; vorhandene Teilmengen dürfen begrenzt verbraucht werden. Aurions bestehende Ziel-, Reichweiten-, Lease- und Inventarprüfungen bleiben die Ausführungsschranke.

Die Standortchance ist ausdrücklich kein bereits verdienter Reisegewinn (`NEXT_HOP_MARKET_OPPORTUNITY_NOT_SETTLED_PROFIT`). Der vorhandene Karawaneneffekt rechnet am Ursprung ab; er besitzt weder transportierte Fracht noch einen persistierten Mehrhop-Auftrag. Deshalb darf ein lukrativer ferner Markt keine unrentable erste Etappe rechtfertigen. Mehrtägige Reisen und tatsächliche Ankunftsverkäufe benötigen einen gesonderten kanonischen Transportvertrag.

Diese Planung ist ein begrenzter Hub-Planer, kein physischer Navmesh-Wegfindungsnachweis. Sie erfindet keine Monster- oder Kriegsbeobachtungen: `live_monster_positions` und `warfront` stehen im Beleg noch als unbeobachtet. Die neuronale Forge bleibt weiterhin Shadow-only; die beiden Händlerregeln sind ausdrückliche kanonische Regeländerungen, keine heimliche Freigabe eines Controllers. Deployment, genauer neuer Head und produktive Wirkung bleiben nach den laufenden Regressionen gesondert nachzuweisen.

Tatsächlich durch Aurion aufgelöste Karawanenfahrten ergänzen das bestehende NPC-Gedächtnis um begrenzte `journey:v1`-Einträge mit Ausgang, Ziel, logischem Beobachtungsindex und `passed`/`ambushed`. Sie gelangen erst mit dem bestätigten Action-/Memory-Commit in die persistierte Wahrheit. Die nächste Reiseplanung berücksichtigt passende Routenerfahrung; zukünftige, fremde und nach 3500 NPC-Resolutionen veraltete Einträge sind nicht verwertbar. Eine erfolgreiche Durchfahrt erklärt die Route nicht für monsterfrei. Es handelt sich um tatsächlich aufgelöste abstrakte Reiseereignisse, noch nicht um einzelne Monster-Sichtungen mit Entity-ID, Weltrevision, Chunk und Position. Für solche Sichtungen fehlt weiterhin der bestätigte Perception-Adapter; es wird kein separates KI-Dataset als Gameplay-Quelle angelegt.

Historische Aktions-Readbacks rekonstruieren den damaligen Polity-Nachfolger aus dem bereits hashgeprüften Effektauftrag und vergleichen den gespeicherten Nachfolgerhash. Eine spätere kanonische Polityänderung darf den früheren Reisebeleg nicht zerstören; der aktuelle Zustand wird dabei niemals zurückgeschrieben. Die Regression führt einen echten Commit, einen weiteren kanonischen Polity-Commit und danach Retry/Packet-Readback aus.

Der Registry-Restarttest startet zwei unabhängige Node-Prozesse mit je 30 Sekunden Obergrenze. Sein Gesamtbudget beträgt explizit 75 Sekunden; sämtliche Inhalts-, Versions- und Hashprüfungen bleiben erhalten. Der vorherige Vitest-Standard von fünf Sekunden reichte in einem CI-Lauf nicht für beide Prozessstarts.

## Belegte Reiseerinnerungen im Editor

Der adminpflichtige `behaviorJourneyMemory`-Abruf liest ausschließlich für die vier kanonischen Händler ein begrenztes historisches Fenster: höchstens 25 Aktionszeilen, davon 24 ausgewertet; `hasOlderActions` kennzeichnet abgeschnittene Historie. Er prüft Aktionshash, damaligen Effekt-Readback und Memory-Verknüpfung. Eine beliebige Zeichenfolge im NPC-Gedächtnis reicht nicht als Reisebeleg. Ausgang/Ziel, `passed`/`ambushed`, logisches Alter, heutige Gedächtnisbindung und zugehörige Hashes werden ohne zusätzliche Tabellen oder Schreiboperationen zurückgegeben. Der Abruf bindet den bestätigten NPC-Beobachtungshash vor und nach dem Lesen; Godot prüft außerdem NPC-ID, Entscheidungsindex und Entscheidungshash.

Die native Schaltfläche „Belegte Reiseerinnerungen lesen“ zeigt diese Daten und den begrenzten Reisegraphen. `READBACK` bezeichnet ausschließlich diesen Lesevorgang. `spatialPerception: UNAVAILABLE` und die fehlenden Beobachterpositionen, Sichtlinien, Monster-Entity-Belege, Weltrevisionen und Chunk-Identitäten bleiben ausdrücklich sichtbar. Weder dieser Abruf noch die Anzeige erzeugt eine Controller-Freigabe oder neue Monsterkenntnis.

TDD für diesen Abruf: Tests-only `0eac0a3ad5ddd7e2cc61a38342079dc7bfddc57a`, AIM-293 `42075151088`, reproduzierte den fehlenden Readback; World Authoring `42075150804` reproduzierte die fehlende geschützte Route. Die Ergänzung prüft echten Commit/Rollback, Wiederholung, historischen Index, unveränderte Datenbankzählstände, falsche Beobachtung und fehlende Memory-Verknüpfung. Godot-Fixtures prüfen fremde/veraltete Antworten und die Entscheidungsbindung; sie sind kein Live-Serverbeweis.

Vorheriger Head `cb7c2ba63202ef93bb09847cdebb299ede78d492`: AIM-293 `42068522593` (59 Tests), World Authoring `42068522980` (76 Tests plus TypeScript) und Godot 4.7.2 `42068523224` erfolgreich. AIM-259 `42068522888` scheiterte dagegen an einer gestorbenen Testfigur beim gehaltenen Baumkontakt. Die Lebensprüfung bleibt bestehen; der Befund ist kein belegter Kollisionsnachweis und verhindert einen grünen Gesamtabschluss. Neue Änderungen benötigen ihre eigenen Exact-Head-Gates.

## Klassifikation der geänderten Flächen

| Datei | Klasse |
| --- | --- |
| `.github/workflows/aurion-journal-watermark-regression.yml` | Produktion · Persistenz |
| `.github/workflows/aurion-production-schema-readback.yml` | Produktion · Persistenz |
| `.github/workflows/aurion-root-reconciliation-artifact-proof.yml` | Produktion |
| `.github/workflows/aurion-root-schema-apply-artifact-proof.yml` | Produktion · Persistenz |
| `.github/workflows/aurion-schema-reconciliation-proof.yml` | Produktion · Persistenz |
| `.github/workflows/deploy-aurion-zone-runtime.yml` | Produktion |
| `SUMMARY.md` | Produktion (Dokumentation) |
| `Memory.md` | Produktion (Dokumentation) |
| `config/aurion-migration-wave-0021-0077-manifest.json` | Persistenz · Produktion |
| `deploy/aurion-production-schema-apply-core` | Produktion · Persistenz |
| `deploy/promote-aurion-zone-runtime.sh` | Produktion |
| `deploy/verify-aurion-production-schema-apply-artifact.mjs` | Produktion · Persistenz |
| `deploy/verify-aurion-production-schema-reconcile-artifact.mjs` | Produktion · Persistenz |
| `docs/godot-migration/npc-behavior-forge.md` | Produktion (Dokumentation) |
| `drizzle/0077_aurion_npc_archetype_registry.sql` | Persistenz · Produktion |
| `drizzle/meta/_journal.json` | Persistenz · Produktion |
| `drizzle/schema.ts` | Persistenz · Produktion |
| `godot-client/net/api/world_authoring_api.gd` | Runtime-Projektion |
| `godot-client/tests/test_behavior_forge.gd` | Test · Runtime-Projektion |
| `godot-client/tests/test_behavior_forge.gd.uid` | Test · Runtime-Projektion |
| `godot-client/ui/screens/behavior_forge_panel.gd` | Runtime-Projektion |
| `godot-client/ui/screens/behavior_forge_panel.gd.uid` | Test · Runtime-Projektion |
| `godot-client/ui/screens/world_authoring_studio.gd` | Runtime-Projektion |
| `scripts/aurionProductionSchemaReconciliation.ts` | Produktion · Persistenz |
| `scripts/aurionSchemaRepairPlan.ts` | Produktion · Persistenz |
| `scripts/build-aurion-production-apply-artifact.mjs` | Produktion |
| `scripts/build-aurion-production-reconcile-artifact.mjs` | Produktion |
| `scripts/build-aurion-wasd-migration-ledger.mjs` | Produktion · Persistenz |
| `scripts/build-aurion-wasd-migration-ledger.test.mjs` | Test |
| `scripts/godot/check.mjs` | Test |
| `scripts/prepare-native-auth-test-schema.mjs` | Test |
| `scripts/schema-repair-proof-fixture.mjs` | Test |
| `server/aiFabric/behaviorAuthoring.test.ts` | Test |
| `server/aiFabric/behaviorAuthoring.ts` | Core · Produktion |
| `server/aiFabric/behaviorAuthoringMariaDb.test.ts` | Test |
| `server/aiFabric/behaviorForge.test.ts` | Test |
| `server/aiFabric/behaviorForge.ts` | Core · Produktion |
| `server/aiFabric/npcArchetypeRegistry.test.ts` | Test |
| `server/aiFabric/npcArchetypeRegistry.ts` | Core · Produktion |
| `server/aiFabric/npcArchetypeRegistryMariaDb.test.ts` | Test |
| `server/aim293NpcActionGatewayContract.test.ts` | Test |
| `server/aim293NpcActionGatewayMariaDb.test.ts` | Test |
| `server/aurion/livingHistoryLoop.ts` | Core · Effekt |
| `server/aurion/npc/actionGateway.ts` | Core · Effekt |
| `server/aurion/npc/ax1LivingWorldProtocol.ts` | Core · Effekt |
| `server/aurionProductionReadbackChain.test.ts` | Test |
| `server/aurionProductionSchemaApplyDockerRunner.test.ts` | Test |
| `server/aurionProductionSchemaReconcileDockerRunner.test.ts` | Test |
| `server/aurionProductionSchemaReconciliation.test.ts` | Test |
| `server/aurionSchemaRepairPlan.test.ts` | Test |
| `server/autonomousNpcLifeMariaDb.test.ts` | Test |
| `server/blocker3Compliance.test.ts` | Test |
| `server/nativeAuthSchemaIsolation.test.ts` | Test |
| `server/npcActionGatewayPersistence.ts` | Core · Persistenz · Effekt |
| `server/npcArchetypePersistence.ts` | Core · Persistenz · Effekt |
| `server/npcControllerShadowPersistence.ts` | Core · Persistenz · Effekt |
| `server/npcGenesisAndSourceAuthorityMariaDb.test.ts` | Test |
| `server/npcSemanticGraphBoundedRetentionMariaDb.test.ts` | Test |
| `server/routes/aurionAuthoringRouter.ts` | Core · Produktion |
| `server/wasdAurionRuntime.ts` | Core · Persistenz · Effekt |
