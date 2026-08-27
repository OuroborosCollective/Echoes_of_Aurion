# WASD → Aurion — Globaler Open-World-Migrationsledger

> **WASD-Quellrevision:** `a4d99432e47b82ce98105eadb30360cd8040ad13`. **Aurion-Ausgangsrevision:** `3ede8d28d07e34bbb232cca36b975986e6b61867`. Dieser Schnitt ersetzt keine private Turmhausinstanz; er schafft den globalen, serverautoritativen Weltvertrag, aus dem ein dauerhaft wachsender Außenraum entstehen kann.

| WASD-Quellsemantik | Aurion-Ziel | Umsetzung in diesem Kandidatenschnitt | Status |
|---|---|---|---|
| `modules/world/WorldSystem.ts`, `WorldState.ts`, `WorldSeed.ts` | Globale Weltidentität und regelgebundener Sektorplan | `globalWorldProtocol.ts` erzeugt einen stabilen Plan mit Weltseed, Epoche, Koordinaten und Hash. | integriert und getestet |
| `modules/questline/worldSpawner.ts` | Deterministische Regionen, Siedlungen, Berufe, Läden und Quests | Jeder Sektor erhält Biome, Siedlungstyp, Bevölkerungskapazität, Berufsanteile und zustandsbezogene Questangebote. | integriert und getestet |
| `modules/world/ResourceSystem.ts`, `ResourcePopulator.ts`, `ResourceScatter.ts` | Ressourcen- und Regenerationskreislauf | Holz/Waldgesundheit, Nahrung, Wasser, Erz und Dürre beeinflussen Questangebote und Migrationsimpulse. | integrierter Regelkern; Tick-Fortschreibung ausstehend |
| `modules/resource/forestResourceRules.ts` | Waldressourcen, Kahlschlag und Wiederbewuchs | Dürre- und Waldgesundheitsdruck erzeugen Forster-/Farmer-Migration sowie Renaturierungs- und Bewässerungsquests. | integrierter Regelkern; Bestandsmutationen ausstehend |
| `modules/npc/*`, `WorldBrain*` | Bedürfnisse, Berufe, Migration und NPC-getragene Aufträge | Berufe und Migrationsgründe sind global abgeleitet; individuelle persistente NPC-Wege werden im nächsten Schnitt an die Welt-Epochentabelle gebunden. | teilweise integriert |
| `modules/politics/*`, `warfront/*` | Stabilität, Nachfolgekrisen, Krieg und Gegenmaßnahmen | Regionale Konfliktdruckwerte erzeugen Unruhe, Nachfolgekrise oder Kriegsfront und leiten Diplomatie-/Verteidigungsquests ab. | integrierter Regelkern; mehrregionale Diplomatie ausstehend |
| `modules/questline/questlineGenerator.ts` | Weltzustand → Questkette | Ressourcen- und Politikzustände erzeugen priorisierte, NPC-zugeordnete Questangebote. | integriert und getestet |

## Wachstumsvertrag

Der globale Plan beginnt mit sechs Sektoren und schaltet anhand des dauerhaft gespeicherten Spielerhochstands **pro weitere vier Spieler einen Sektor** frei, bis zur Obergrenze von 740 Sektoren. Der Vertragskern ist rein und wiederholbar: gleiche Eingaben ergeben denselben Weltplan und denselben Hash. Der getestete Grenzwert erreicht 740 Sektoren ab 2.937 Spielern.

> Der aktuelle Skalierungswert ist absichtlich der persistierbare Bestand registrierter Spieler. Eine echte Online-Präsenz wird erst nach dem geplanten Echtzeit-Registry-Adapter verwendet; sie darf nicht aus flüchtigem Browserzustand abgeleitet werden.

## Persistenz und verbleibende Arbeit

`aurionGlobalWorldStates` speichert den letzten globalen Snapshot; `aurionGlobalWorldEpochReceipts` protokolliert jede Epochenauflösung unveränderlich. Die Datenbankmigration `0021_aurion_global_world_state.sql` legt beide Tabellen an. Noch **nicht** aktiviert ist ein kontinuierlicher serverseitiger Weltzyklus: Dürre, Wiederbewuchs, Handel, NPC-Wanderung und Konflikte werden derzeit bei bestätigter Weltauflösung abgeleitet, aber nicht zeitgesteuert fortgeschrieben. Die Aktivierung verlangt eine bewusste Wahl der permanenten Hostingform, einen idempotenten Epochenjob und ein Player-Presence-Register.

## Fortschreibung: Chunkbasis, Delta-Ledger und erster Clientpfad

> **Aurion-Kandidatenrevision:** `172da45d92670f6da636e002977d2f77e9ea415b` auf `aurion/wasd-unification-continuation`. Dieser additive Schnitt ergänzt die globale Sektorebene, ohne Aurion-`main`, private Turmhausinstanzen oder bestehende Gameplay-Receipts zu überschreiben.

| Vertragsbereich | Realisierung und Nachweis | Status |
| --- | --- | --- |
| Gemeinsame mathematische Basis | `shared/worldChunkProtocol.ts` ist die einzige reine Quelle für Browser und Server. `worldId` + Seed + sichere Integer-Chunkkoordinaten erzeugen 64.000-mm-Chunks mit 16 × 16 Basistiles, Ressourcen und deterministischem Hash. `server/worldChunkProtocol.ts` ist ausschließlich ein Kompatibilitäts-Reexport. | integriert und getestet |
| Delta-only-Persistenz | `aurionWorldChunkDeltas` und additive Migration `0022_aurion_world_chunk_deltas.sql` speichern ausschließlich bestätigte Abweichungen: Ressourcenentnahme, Bauten und Straßen, jeweils mit Basisrevision, kausaler Sequenz, Akteur, Idempotenzschlüssel und Hash. Basisgeometrie und unberührte Ressourcen werden nicht persistiert. | integriert und getestet |
| Öffentlicher Readmodelpfad | Die geschützte Route `gameplay.worldChunk` nimmt Weltrevision, erwartete Basisrevision, Integerkoordinaten, Cursor und ein Limit von maximal 64 Deltas an. Sie liefert Basishash und einen öffentlichen Delta-Overlayausschnitt, aber weder Basistiles noch Seed, Akteur oder Idempotenzmaterial. | integriert und getestet |
| Clientdarstellung | Die Expanse erhält den kleinen `globalWorld`-Generatorvertrag statt einer vollständigen Sektorliste. Babylon generiert einen Chunk erst, wenn der serverseitige Basishash zur Shared-Generierung passt; höchstens 64 bestätigte Deltaoverlays werden budgetiert gerendert. React zeigt Sektoren, Weltepoche, Seedchunk und Deltaanzahl. | integriert, GPU-Readback offen |
| Responsive QA | Die Turmhaus-/Expanse-Bedienwege wurden auf 412 × 915, 800 × 1280 und 1440 × 1000 CSS-Pixel geprüft. Der isolierte Firefox-Runner stellte kein WebGL bereit; die Canvas-Abnahme ist deshalb bewusst nicht behauptet und als eigener QA-Punkt nachverfolgt. | UI bestätigt, Canvas offen |

Die vollständige lokale Regression zu dieser Revision ergab **44 bestandene** und **7 erwartungsgemäß übersprungene** Testdateien; **151 Tests bestanden**, **12 wurden übersprungen**. Die Typprüfung und `git diff --check` waren erfolgreich. Die zwei wichtigsten nachfolgenden Grenzen bleiben unverändert: Erstens existiert keine öffentliche Delta-Schreibroute — der Server muss Sequenz, Sichtbereich, Eigentum, Schutzgebiete und Aktionssemantik autoritativ prüfen. Zweitens ersetzt der einzelne sichtbare Chunk noch keinen Mehrchunkradius mit LRU-/Dispose-Cache oder eine serverseitige Präsenz-/Epochenauslösung.

## Fortschreibung: serverbeobachtete Präsenz, reine Epoch-Lesung und autoritative Chunkaktionen

> **Gebundene Ausgangslage:** WASD `a4d99432e47b82ce98105eadb30360cd8040ad13`; Aurion-Kandidatenstand vor diesem Schnitt `b0b7acdd9427a3f850379ecbd151c9688b873aa9` auf `aurion/wasd-unification-continuation`. `main` wurde weder gemergt noch verändert; die additive Migration `0023_aurion_world_presence_epochs.sql` wurde **nicht** ausgeführt.

| Vertragsbereich | Realisierung und Nachweis | Status |
| --- | --- | --- |
| Serverseitige Präsenz | Der Zonen-Gateway leitet eine Lease ausschließlich aus `zone.positionForConnection()` nach erfolgreichem Ticket-Join und bei Refresh ab. Fehlende Runtime-Peers erzeugen keinen Lease; beim Close wird der Lease freigegeben. Mehrfachsitzungen werden pro Konto nach jüngstem serverseitigem `lastSeenAt`, bei Gleichstand nach Connection-ID, stabil zusammengeführt. | Unit-/Bridge-Test bestanden; physischer DB-Readback offen |
| Globale Epochengrenze | `resolveAndRecordGlobalWorldEpoch()` bleibt der explizite idempotente Resolver. `getGlobalWorldPlan()` und damit `getOpenWorldSnapshot()` lesen nur den letzten bestätigten Snapshot oder eine klar gekennzeichnete Epoche-0-Vorschau; sie zählen weder Accounts noch schreiben sie Epochen oder Receipts. Es gibt keinen Scheduler und keine Produktionsauslösung. | Typ-/Regeltests bestanden; DB-Konkurrenztest offen |
| Browser-Intentvertrag | `worldChunkActionProtocol.ts` akzeptiert nur Ressourcenentnahme, zwei manifestgebundene Fallback-Baurollen, Entfernung eigener Strukturreceipts und begrenzten Straßenbau. Hash, Basisrevision, Chunkkoordinaten, sichere Integerwerte, Reichweite, Straßenlänge und ID-Format werden vor Persistenz geprüft. Die Reichweite vergleicht nur ganze Distanzquadrate; unabhängig bestätigt wurden `3.500² = 12.250.000` mm². | Reine Determinismus- und Negativtests bestanden |
| Autoritative Receiptpersistenz | `gameplay.applyWorldChunkAction` ist geschützt. Sie liest eine aktive serverbeobachtete Präsenz im Zielchunk; Position, Sequenz, Delta-ID und Receipt-Hash kommen niemals vom Client. Die Datenbank leitet die nächste Sequenz ab, prüft Replay/Substitution, Ziel- und Eigentumskonflikte, Besetzung sowie maximale Struktur-/Straßenzahlen und wiederholt eindeutige Sequenzkonflikte begrenzt. Öffentliche Readmodelle erhalten nur Overlays. | Route-/Unit-Tests bestanden; optionale DB-E2E-Fälle angelegt |
| Physische Persistenzevidenz | `server/worldChunkAction.e2e.test.ts` prüft bei gesetztem `DATABASE_URL` und `AURION_WORLD_CHUNK_E2E=1` Replay, Schlüsselsubstitution, parallele Sequenzierung, Eigentum und einmalige Entfernung. In diesem Kandidatenlauf war die Umgebung nicht aktiviert: **drei Tests wurden bewusst übersprungen**; dies ist kein behaupteter Datenbank-Readback. | offen bis separate freigegebene Testdatenbank |

Der vollständige lokale Testlauf dieses Zwischenstands ergab **52 bestandene** und **8 erwartungsgemäß übersprungene Testdateien**, **173 bestandene** und **15 übersprungene Tests**. `pnpm check` und `git diff --check` liefen mit dem projektspezifischen 1.536-MB-Heapbudget erfolgreich. Die semantische Diagnose der veränderten Datenadapter- und Action-Module meldete keine Fehler oder Warnungen. Der neue Pfad erweitert weder den getrennten read-only Admin-MCP noch erteilt er LLMs, MCPs, Browsern oder Clients Schreibautorität über kanonischen Weltzustand.

**Keine Linear-Schließung:** AIM-216 bleibt bis zu echten DB-Idempotenz-/Konkurrenz-/Expiry-Nachweisen offen. AIM-215 bleibt bis zum aktiv ausgeführten DB-Readback und dem sichtbaren Browser-Readmodell offen. AIM-214, AIM-217 und AIM-218 sind ebenfalls unverändert offen.

> **Implementierungsrevision dieses Nachweises:** `0dec297bab82ce84cf738cafba80892aff14649e` (`feat(world): add observed presence and authoritative delta intents`). Diese Revision enthält den additiven Code-, Test- und Migrationskandidatenstand; der nachfolgende Ledgercommit dient nur seiner expliziten Verknüpfung.
