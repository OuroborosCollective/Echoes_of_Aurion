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
