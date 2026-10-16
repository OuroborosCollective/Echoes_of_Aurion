---
description: "Quellgebundene Bestandsaufnahme und Datei-für-Datei-Plan für den Aurion-Client auf Samsung Galaxy Tab A9."
---

# Godot-Client: Architektur, Funktionsumfang und Ausführungsplan

## Auftrag, Revision und Aussagegrenze

Diese Bestandsaufnahme bearbeitet [G01 / #907](https://github.com/OuroborosCollective/Echoes_of_Aurion/issues/907) aus [Master #906](https://github.com/OuroborosCollective/Echoes_of_Aurion/issues/906). Der Owner hat die Ausarbeitung mit **„Weiter“ am 15.10.2026** freigegeben. Dieser Änderungsschritt liefert Dokumentation; er installiert keine Engine und verändert keine Spielsimulation.

**Geprüfte Quellrevision:** `f4836188de9f632cdfbe84c942aaafbf4c56e1f9`, Hauptbranch beim Sitzungsbeginn. Die Issue-Planungsrevision `9cacae47325588f7c9fe07841a4ecc06f631dde6` ist älter. Insbesondere sind die Operations-Korrektur #896 und die Attributverteilung #900 inzwischen im Quellstand enthalten. Dieser Stand ist keine Behauptung über die produktiv installierte Revision.

- [Funktionsmatrix: capability-matrix.csv](capability-matrix.csv) — 50 Funktionsfamilien und 134 konkrete tRPC-Aufrufstellen; jede Zeile nennt Quelle, Servergrenze, geplantes Ziel, Status, Blocker, Abnahme und Issue.
- [Dateiplan: file-plan.csv](file-plan.csv) — 186 einzelne Arbeitsschritte für 184 eindeutige Zielpfade über alle 45 Aufgaben. Wiederholte Pfade werden ausdrücklich als Erweiterung eines Vorgängers behandelt.
- Diese Seite beschreibt die Grenzen und die Reihenfolge. Die CSV-Dateien enthalten die ausführbaren Einzelschritte. **Alle Godot-Zielpfade sind geplant; ein Pfad in einer Tabelle bedeutet keine vorhandene Implementierung.**

Vor einer Umsetzung wird die aktuelle Revision erneut gelesen. Drift verändert den Plan gezielt; bestehende Änderungen anderer Akteure werden nicht überschrieben. Der Entscheid **Godot oder Unity** bleibt bei [G00 / #909](https://github.com/OuroborosCollective/Echoes_of_Aurion/issues/909). Die Godot-Dateinamen sind die vorgeschlagene Variante, noch kein abgeschlossener Enginevergleich.

## Verbindliche Regeln und bestehende Dokumentation

Zuerst [AGENTS.md](../../AGENTS.md), [ARCHITECTURE_OWNERSHIP.md](../../ARCHITECTURE_OWNERSHIP.md), [Memory.md](../../Memory.md) und [Issue #468](https://github.com/OuroborosCollective/Echoes_of_Aurion/issues/468) lesen. `Memory.md` ist die kanonische Repository-Erinnerung; `MEMORY.md` ist eine andere Datei und ersetzt sie nicht.

Aurion besitzt sämtliche Gameplay-, Welt-, NPC-, Quest-, Kampf-, Progressions-, Wirtschafts-, Persistenz- und Transportverträge. Historische AX1-/WASD-Namen in Dateien bezeichnen Herkunft. Sie erzeugen keine zweite Runtimepflicht. Die neue Engine empfängt bestätigte Aurion-Zustände und sammelt Intents. Sie erzeugt weder Schaden noch Loot, Questfortschritt, NPC-Entscheidungen, Preise oder persistente Positionen.

Die derzeitigen Regeln in `AGENTS.md` und `ARCHITECTURE_OWNERSHIP.md` sehen den **automatischen einzelnen Post-Merge-Eintrag** über `.github/workflows/post-merge-memory.yml` vor. Die ältere Formulierung in #468 verlangt den Memory-Abschluss vor Merge. Für diesen Dokumentations-PR werden Änderung, Erkenntnis und Prüfnachweise im PR hinterlegt; es wird hier nicht gemergt und kein zusätzlicher Memory-Eintrag erzeugt. Vor einem später autorisierten Merge die dann geltende Regel prüfen und keine Doppeleinträge erstellen.

`gitbook-docs.yaml` bindet die Root-Dokumentation an GitBook. `SUMMARY.md` wird um genau diese Seite ergänzt. Bestehende Navigation, Frontmatter, Metadaten und Links bleiben erhalten. Die CSV-Dateien sind verlinkte Arbeitsartefakte, keine eigenständigen GitBook-Seiten.

## Methode und tatsächlicher Toolzugang

Die Inventarisierung liest einen isolierten Git-Checkout der oben genannten Revision: **2.106 getrackte Dateien**. Der GitHub-Git-Tree enthält zusätzlich Verzeichniseinträge; diese werden nicht als Dateien gezählt. Es wurde kein Applikationsserver gestartet und kein Produktions-/Datenbankeffekt ausgelöst.

Die Quellsuche kombiniert Routenregistrierung, Importverweise, konkrete Hook-/Fetch-Aufrufe, UI-Mountbedingungen und manuelles Lesen der relevanten Handler. Der konservative Importgraph ab `client/src/App.tsx` enthält 182 Clientdateien. Typimporte können die Kandidatenmenge vergrößern; importiert bedeutet weder gemountet noch berechtigt noch live ausgeführt. Die Matrix hält deshalb Funktionsfamilien und einzelne Aufrufstellen getrennt fest. Zusätzlich wurden imperative Query-Utils-Aufrufe für Regionen und Chunkprojektion erfasst. REST-, WSS- und rein lokale Oberflächen stehen in den F-Zeilen.

Die in #907 genannten Sensoren `repository_architecture_snapshot`, `repository_architecture_drift_report`, `backend_architecture_assess` und `deterministic_architecture_inventory` sind als MCP-Namen auffindbar. Der tatsächliche `workspace_prepare`-Readback identifiziert jedoch **`OuroborosCollective/Sovereign-Studio-ato` statt `OuroborosCollective/Echoes_of_Aurion`**. Das Tool bietet in diesem Aufruf keine Repositoryauswahl. Seine Architekturberichte wurden daher nicht als Aurion-Evidence verwendet; in diesem fremden Workspace wurden keine Dateien geändert oder gepusht. Diese konkrete Zugangslücke wird durch die quellgebundene Inventur ersetzt, nicht durch einen erfundenen Sensorlauf.

Ein unmittelbar nutzbarer Godot-Worker für das Zielrepository ist noch nicht nachgewiesen. CLI-/MCP-Fähigkeiten, tatsächliche Repositoryidentität, Dateibearbeitung, Build und Vorschau werden in G05 sowie G36–G40 separat geprüft. Die bloße Installation eines Plugins beweist diese Fähigkeiten nicht.

## Bestandskarte und Ownership

Die folgenden Zahlen sind eine **exklusive Pfad-/Namensklassifikation aller 2.106 Dateien**, keine semantische Garantie für reine Funktionen oder Produktivreichweite. Test-/Fixture-Kennzeichen werden zuerst ausgewertet; dadurch zählen beispielsweise Servertests zur Testklasse.

| Klasse | Dateien | Einordnung und nächste Prüfung |
|---|---:|---|
| Dokumentation / Provenienz | 246 | Markdown, Dokumentation und Architekturledgers; Herkunft ist kein Livebeweis |
| Konfiguration / Sonstiges | 115 | Rootkonfiguration, weitere Assets, Vendorflächen; keine implizite Runtimeautorität |
| Effekte / Workflows | 287 | `.github/`, `scripts/`, `tools/`, Deployflächen; konkrete aufrufende Lane prüfen |
| Tests / Fixtures | 552 | `*.test.*`, `*.spec.*`, `e2e/`, Fixtures; kein Ersatz für Geräte-/Produktionsnachweis |
| Runtimeprojektion / Clientassets | 322 | Client, öffentliche Dateien und Appletreste; lokale Darstellung und Eingabe |
| Persistenz | 107 | `drizzle/` und DB-Owner; Schema und vorhandene Receiptgrenzen bleiben serverseitig |
| Authority-/Effektkandidaten | 337 | übrige `server/`-Dateien; Handler, Domain und Effekte sind einzeln abzugrenzen |
| Vertrags-/Corekandidaten | 140 | übrige `shared/`-Dateien; nur verifizierte Wire-/Darstellungsanteile im Client verwenden |

| Vorhandene Fläche | Rolle | Umgang bei der Clientmigration |
|---|---|---|
| `server/_core/index.ts` | Expressstart, Route-/Gatewayregistrierung | lesen; keine zweite Serverruntime bauen |
| `server/routers.ts` und `server/routes/` | tRPC-Handler und Auth-/Rollenbegrenzung | bestehende Verfahren sprachneutral abbilden |
| `server/zoneGateway.ts`, `server/zoneRuntime.ts`, `server/zoneProtocol.ts` | WSS-Eingang, bestätigte Simulation und Wirevertrag | unveränderte Authority; nur Intents senden |
| `server/db.ts`, `server/aurionStatPointPersistence.ts`, `drizzle/` | persistenter kanonischer Zustand und Migrationen | kein direkter Client-/Tool-DB-Zugriff; keine Migration in G01 |
| `shared/zone*Contract.ts`, `shared/playerUiProtocol.ts`, `shared/groupInstanceProtocol.ts` | bestätigte Wire-/Readmodelverträge | Schema/Enums/Exact-Felder gezielt portieren; keine TypeScript-Datei in Godot ausführbar annehmen |
| `client/src/App.tsx`, `client/src/main.tsx` | Webrouten, Mounting, tRPC/SuperJSON und Sessiontransport | Webclient während der Migration erhalten |
| `client/src/xaurion/integration/` | Projektion bestätigter Welt-, Spieler- und Ereignisdaten | Verhalten und Fehlerzustände in Godot nachbilden |
| `client/src/xaurion/core/`, `world/`, `audio/` | Three.js-Renderer, Animation, Audio und visuelle Ressourcen | kein mechanischer TypeScript-zu-GDScript-Port; semantische Grenzen übernehmen |
| `assets/`, `public/`, `client/src/xaurion/world/assets/` | Originale, öffentliche Ressourcen, Atlasbytes | Hash/Herkunft/Lizenz/Abhängigkeiten inventarisieren |
| `scripts/mobile_glb_asset_pipeline.py` | vorhandene mobile Aufbereitung | konkrete Ausgaben und Decoderfähigkeit prüfen, nicht blind für Godot wiederverwenden |
| `server/adminMcp.ts`, `server/gateway.ts` | bestehende Aurion-Admin-/Gatewayflächen | keine Adminberechtigung in normalen Spielclient einbauen |
| `server/routes/aurionAuthoringRouter.ts`, `shared/aurionAuthoringContract.ts` | Welt-/Dungeon-Entwurf, Plan/Apply und Readback | für Co-Creation wiederverwenden; kein zweites Authoringsystem mit DB-Wahrheit |
| `.github/workflows/` | 80 vorhandene Workflowdateien | Pfadfilter am später betroffenen Stand lesen; G07 ergänzt eigene Godotprüfung |

### Spiegel und historische Restflächen

Im aktuellen Tree gibt es unter `app/applet/` nur drei Testdateien:

- `app/applet/client/src/xaurion/integration/AurionAuthorityHudResponsive.test.tsx`
- `app/applet/client/src/xaurion/integration/MaterialFallback.test.ts`
- `app/applet/client/src/xaurion/integration/atlasRegression.test.ts`

`atlasRegression.test.ts` hat zusätzlich einen gleichnamigen Pfad unter `client/src/xaurion/integration/`. Die beiden anderen Namen haben dort keinen identischen Partner. Daraus wird **kein allgemeiner synchroner Applet-Produktionsspiegel** abgeleitet. Vor Änderungen prüfen, ob ein Test oder Workflow diese Reste tatsächlich ausführt; G01 synchronisiert oder entfernt nichts.

`architecture/donor-ledger.json`, `architecture/replay-inventory.json` und `architecture/rng-inventory.json` bleiben Herkunfts-/Grenzregister. Im aktuellen Stand gibt es kein `project.godot`, keinen getrackten `android/`-Baum, keine `capacitor.config.ts` und keine aktive Babylon-Abhängigkeit in `package.json`. Historische Android-Issues ersetzen diesen aktuellen Readback nicht.

## Tatsächliche Eintrittswege und fehlende Anbindungen

`client/src/App.tsx` registriert `/`, `/account`, `/community`, `/play`, `/ops`, `/ops/quests`, `/ops/context` und `/ops/glb-upload`. Unbekannte Routen fallen auf Home zurück. `/play` benötigt den bestätigten einmaligen Startvertrag aus `AurionPlayRoute.tsx`; die Seite erzeugt keinen Ersatzsnapshot.

| Fläche | Quellbefund | Konsequenz für die Migration |
|---|---|---|
| Kampf, HP/Tod/Respawn, Skills | konkrete WSS-Projektion und HUD-Handler | G22/G23 einschließlich Ablehnung, fehlender Antwort und Pause portieren |
| Inventar/Ausrüstung/Crafting | konkrete tRPC-Verfahren mit Versionen, Vorbedingungen und Readback | G25/G26; keine optimistisch erfundenen Erfolge |
| Attributverteilung aus #900 | `player.statWallet` und `player.allocateStatPoint` werden im Charakterfenster aufgerufen | zusätzliche G22-Dateien im Dateiplan; Exact-Strings, Idempotenz und ACEG-Wirkung beibehalten |
| Gruppen/Queue/Dungeon | `AurionGroupFinder` und `groups.read/command` | G27, inklusive Revision, Rolle, Bereitschaft und Abbruch |
| Authored Quests | eigener Journalpfad mit Angebot/Annahme/Zweig/Abschluss | G24; Spieler- und Adminverfahren getrennt halten |
| Legacy-Questfenster | `/play` deaktiviert die lokalen Legacy-Annahme-/Abgabeknöpfe | keine fertige Mutation nur aus einem Buttonnamen ableiten |
| NPC-Kontakte | Readmodels für Beziehungen, Entscheidungen, Aktionen und Erinnerungen | G24; keine NPC-KI in Godot verschieben |
| Communitychat | Websitehost existiert, wird bei `location === "/play"` aber nicht gemountet | HUD-Event allein beweist keinen Chat im Spiel; G27 benötigt einen tatsächlich montierten nativen Dialog |
| Markt/NPC-Ökonomie | Marktverfahren existieren; Ökonomiemodal ist `ContractPendingModal`; Community akzeptiert `market` nicht | als Anbindungslücke führen; kein bestehendes vollständiges Markt-UI behaupten |
| Gildenbank/Governance | REST-Plan/Apply/Read-Verträge und Komponenten vorhanden; Komponenten nicht im aktuellen App-Importgraphen | vorhandene Serverfähigkeit ist noch keine erreichbare Spielerfunktion; G27 klärt den Scope |
| Housing, Politik und Territorium | aktuelle Spielermodals ausdrücklich deaktiviert | G29 bleibt durch tatsächlichen kanonischen Vertrag/Readback blockiert; Clientmigration erweitert keine Serverlogik |
| Turm-Lager/Einladung/Einrichtung | `TowerHomePanel` gibt in diesen Aktionen nur Text an `onSignal` weiter; nicht im Appgraphen | Meldungen sind kein Persistenznachweis; keine Lager-/Hausfunktion als fertig markieren |
| Reittier, allgemeines Sammeln und Interaktion | Mountsendung ist ein lokales Intent-Event; aktueller WSS-Client bietet hello/move/attack/skill | G28 muss die echte Commandgrenze klären; keine gather-/mount-Nachricht erfinden |
| Website/Operations/Upload/Forum | eigenständige Web- und Adminflächen | erhalten und bei Bedarf regulär verlinken; kein vollständiger nativer Adminport als Voraussetzung |

Die Matrix kennzeichnet diese Fälle als `WIRED_SOURCE`, `CONDITIONAL_WEB_SOURCE`, `PARTIAL_SOURCE`, `PENDING_UI`, `UNCONNECTED_ACTION`, `ENDPOINT_ONLY`, `UNMOUNTED_COMPONENT_CANDIDATE` oder `PLANNED_ONLY`. **Keiner dieser Status bedeutet „auf dem Tablet verifiziert“.** `candidate_gap`-Zeilen müssen entschieden oder durch vorhandene kanonische Verträge belegt werden. Sie dürfen nicht still aus der Gesamtabnahme verschwinden oder durch neue lokale Spielregeln ersetzt werden.

## Kommunikationsbrücke

### Zonen-WSS: präzise kompatibler Adapter

Bestehende Grenze: `WSS /v1/ws` → `server/zoneGateway.ts` → `server/zoneProtocol.ts` → kanonische Aurion-Runtime. Es handelt sich um JSON-Textnachrichten, weder Godot-High-Level-Multiplayer-RPC noch Socket.IO.

1. HTTPS-Session herstellen und geschützt `gameplay.issueZoneTicket` aufrufen.
2. WebSocket mit zugelassenem Origin öffnen; `hello` mit Ticket, `zoneId` und `protocolVersion: 5` senden.
3. Erst `welcome` mit eigener Identität und bestätigtem Zustand aktiviert Spielintents.
4. `move`, `attack`, `skill` mit monotoner `clientSeq` senden. `snapshot`, `combat`, `telegraph` und `reject` strikt dekodieren.
5. Zustände nach `snapshotSeq`/Tick ordnen, alte Generationen verwerfen, Darstellung interpolieren. Animation oder Godot-Kollision erzeugt keinen bestätigten Treffer oder Standort.
6. Bei Netz-/Appwechsel alte Eingaben stoppen, verlorene Mutation nicht blind wiederholen, frisches Ticket beziehen und bestätigte Readmodels erneut lesen.

Der bestehende Zonenvertrag gilt aktuell für `observatory_threshold`, mit **100 ms / 10 Hz** und **1.000 festen Einheiten pro Meter**. Der Joystick kann analoge Eingaben sammeln; Wirebewegung enthält nur `-1`, `0`, `1` je x/z-Achse. Andere Weltzonenbezeichnungen im Readmodel schaffen nicht automatisch weitere zulässige WSS-Zonen.

`zoneGateway.ts` begrenzt eingehende Clientnachrichten auf 2.048 Bytes. Der Webclient begrenzt Snapshottexte auf 65.536 Zeichen. G03/G10 müssen Zeichen und UTF-8-Bytes unterscheiden und die tatsächlichen Godot-Puffergrenzen an der gepinnten Version prüfen. JSON-Zahlen dürfen weder Exact-Strings noch sichere Integer unbemerkt runden. Zusätzliche Envelopefelder werden nicht ohne bestehenden Vertrag eingeführt.

### HTTPS bleibt für bestehende Fachverfahren zuständig

`client/src/main.tsx` verwendet `httpBatchLink` an `/api/trpc` mit **SuperJSON**. Die HTTP-Seite ist deshalb nicht automatisch identisch mit schlichtem JSON-RPC. G03 legt für die tatsächlich benötigten Operationen Batch-/Queryformat, Fehler, Date-/Exactwerte, Auth und Größenlimits fest; G09 implementiert den kleinsten kompatiblen HTTP-Adapter. Ein zusätzlicher Serveradapter ist nur nach belegter Notwendigkeit und eigenem begrenztem Auftrag zulässig. G01 verändert keine Endpunkte.

Vorhandene REST-Grenzen für GLB-Katalog, öffentliche Charakterwahl, öffentliche Darstellungen und bestätigte Equipmentvisuals werden ebenfalls übernommen. Die eigenständigen Gildenbank-/Governanceverträge nutzen Plan → Hashbestätigung → Apply → Receipt → Readback. Ihre Autorisierungs- und Revisionsgrenzen bleiben erhalten.

### Native Anmeldung bleibt ein früher Blocker

Lokale Anmeldung/Registrierung setzen derzeit ein Sessioncookie; OIDC verwendet `/api/oauth/start` und `/api/oauth/callback`. Der Browser kann für bestimmte bestehende Preview-/Iframefälle eine gespiegelte Session als Bearer weiterreichen. **Damit ist noch kein sicherer nativer Sessionausgabe-, Erneuerungs- oder Widerrufsablauf bewiesen.** Manuelles Cookiekopieren oder Übernahme einer Preview-Session ist kein Ownerworkflow.

G04 entscheidet auf Basis der tatsächlichen Authverträge über den nativen Ablauf, beispielsweise regulärer Systembrowser mit geprüftem Rückkanal, sofern der Server ihn unterstützt. G09 beweist Session, geschützte Abfrage, Ticket, Logout und Fehlerfälle. Origin-/Ticket-/Authprüfungen werden dafür nicht deaktiviert.

## Vorgeschlagene Godot-Modulgrenzen

| Geplanter Pfad | Verantwortung |
|---|---|
| `godot-client/project.godot` | vorbereitete, versionierte Projekteinstellungen; kein Owner-Inspector-Setup |
| `godot-client/app/` | Start, Lifecycle, Eingabeadapter, lokale Präferenzen und Diagnose |
| `godot-client/net/` | HTTPS/WSS, Auth, striktes Dekodieren, Wiederaufnahme und Fachadapter |
| `godot-client/projection/` | validierte bestätigte Readmodels, Entityregister und Interpolation |
| `godot-client/world/` | Chunkansicht, Kamera, Materialien und sichtbare Interaktionen |
| `godot-client/actors/` | Figuren, Ausrüstung, Animation, Combat-/Audiopräsentation |
| `godot-client/ui/mobile/` | Mehrfingerzuordnung, Bewegung, Aktionsleiste und Tablet-Bedienung |
| `godot-client/ui/screens/` | HUD, Charakter/Statwallet, Quests/Dialoge, Inventar, Soziales, Einstellungen |
| `godot-client/ui/theme/` | konsistentes Theme, Skalierung und Zustandsdarstellung |
| `godot-client/assets/` | Quellenmanifest, Importprofile, generierte Importquellen und Importhook |
| `godot-client/addons/` | nur gepinnte geprüfte Komponenten; spätere begrenzte Authoringadapter |
| `godot-client/tests/` | Vertrags-, Projektions-, Eingabe- und tatsächliche Integrationsprüfungen |
| `scripts/godot/`, `config/` | wiederholbarer Doctor, Bootstrap, Prüfungen, Builds, Evidence und Budgets |
| `tools/godot-bridge/` | isolierter Entwicklungsworker und Chat-/MCP-Adapter ohne Spielauthority |
| `docs/godot-migration/` | Plan, Entscheidungen, Owneranleitung und echte Abnahmen |

GDScript ist die vorgeschlagene Skriptsprache. Engineversion, Renderer, Exporttemplates, Android-SDK/JDK und Komponenten werden in G00/G05 ausdrücklich gepinnt. Im aktuellen Repository bestimmt `package.json` Node/pnpm-Skripte und einen pnpm-Pin; eine vorhandene Bun-Lockdatei rechtfertigt keinen eigenmächtigen Wechsel. Die Migration aktualisiert keine vorhandene zentrale Toolchain nebenbei.

## GLB- und Texturpipeline ohne Gameplaykopplung

Vorhandene Originalbeispiele sind `assets/characters/aurion-player-standard-animated.glb`, `assets/environment/street-lamp/Aurion_Street_Lamp_LOD0.glb`, `assets/environment/asterion-courtyard/Asterion_Courtyard_LOD0.glb` sowie `assets/fantasy-v1/`. Diese Aufzählung beweist weder Androidimport noch vollständige Animationen. Die tatsächlichen Bytes einschließlich externer Texturen und Erweiterungen sind in G14 zu lesen.

Die Quelle bleibt an ihrem bestehenden Ort. Ein Assetmanifest verbindet Sourcepfad, SHA-256, Lizenz/Herkunft, Katalog-ID, Rig/Bones, Clipmapping, Material-/Texturreferenzen und abgeleitete Buildprodukte. G15 erzeugt reproduzierbar Godot-Importquellen unter `godot-client/assets/generated/`; dieser konkret geplante Verzeichnisvertrag wird in der Vorbereitung implementiert. Godots `.godot/`-Cache und Credentials werden nicht eingecheckt.

Meshopt-/KTX2-/WebP-Ausgaben der vorhandenen mobilen Pipeline werden auf tatsächliche Decoderfähigkeit geprüft. Ein Importfehler führt zu einem diagnostizierten Fehler oder einem ausdrücklich als Darstellung gekennzeichneten Fallback, nie zu erfundenen Assethashes oder Erfolgsmeldungen. Character-/Animationsbudgets dürfen nicht blind das vereinfachte Propbudget übernehmen. G31 friert endgültige Ressourcenbudgets erst nach echten Gerätemessungen ein.

Animationen und Meshkollision dienen der Darstellung. Assetwechsel verändert weder Hitboxwahrheit noch Inventarwerte, Schaden, Queststand oder NPC-KI. Statische Collision-/Navigationsdaten, soweit für Darstellung benötigt, bleiben von der autoritativen Aurion-Bewegung getrennt.

## Samsung Tab A9 und minimaler Owneraufwand

Ziel ist **Galaxy Tab A9, ausdrücklich nicht A9+**. Die konkrete RAM-/Speicher-/OS-/GPUvariante des Owners ist noch nicht bestätigt. Ein 4-GB-Profil und ein stabiler 30-FPS-Modus sind konservative Planungsannahmen. Sie sind keine Messwerte und kein Leistungsversprechen.

Der Standardablauf lautet: Chat auf dem Tablet → entfernte vorbereitete Entwicklungsumgebung → automatisierter Import/Test/Build → fertige APK → kurze echte Bedienprobe. Der Owner schreibt keine Skripte, installiert keine SDKs und befüllt keine Inspectorfelder. Falls nötig bleiben eine reguläre Anmeldung/Connectorverbindung, Androids Installationsdialog sowie kreative und spielerische Rückmeldungen. Geräteinformationen möglichst diagnostisch lesen; andernfalls reicht eine kurze Variantenangabe ohne Seriennummer/IMEI.

Touch-Steuerung wird in G20/G21 als austauschbare Präsentationskomponente eingebunden: Godot-Controls/Touch-Ereignisse oder ein nach Version/Lizenz/Multitouch geprüfter virtueller Joystick. Eine zusätzliche Komponente wird erst nach tatsächlichem Bedarf gepinnt. UI-Fokus, geöffnete Panels, Softkeyboard, Finger-ID, gleichzeitige Bewegung/Kamera/Skill und Neutralzustand nach Unterbrechung sind Pflichtprüfungen.

Android-Editor auf dem Tablet ist optional. Geteilte Ansicht von Chat und Spiel wird real getestet; schneller Appwechsel ist eine zulässige Alternative. Remote-/GPU-/Headless-Ergebnisse ersetzen keinen physischen Tab-A9-Lauf.

## Historische Issues und aktuelle Risiken

Alle nachstehenden Issues wurden in dieser Sitzung neu gelesen; sie sind weiterhin offen. Das ist kein Beweis, dass jedes ursprüngliche Symptom am aktuellen Runtime-Stand fortbesteht.

| Issue | Befund und Verwendung |
|---|---|
| #131–#137 | historische Capacitor-/Babylon-Ressourcen- und Thermalplanung mit heute fehlenden Pfaden; Anforderungen an sichere Projektionsdegradation übernehmen, keine alte Runtime zurückbauen |
| #876, #892 | gemeldete GLB-/NPC-/Atlasprobleme; G14–G19 verlangen tatsächliche Bytes, Rig/UV/LOD und sichtbare Figuren |
| #891 | Combat-/HP-/Meldungsproblem; aktueller Quellstand enthält inzwischen #903/#905; Originalsymptom bei späterer Runtimeprüfung frisch prüfen |
| #879 | dokumentierter OOM-/DB-Verbindungsincident; keine aktuelle Stabilitätsaussage ohne neue Messung; Serverreparatur nicht in Clientmigration einschmuggeln |
| #904 | Produktions-Probe-/Freigabekontrollpfad; getrennt von normalem Spielerlogin und Godot-Auth behandeln |

Frühe harte Blocker sind die sichere native Session, die tatsächliche Godot-Toolverbindung zum richtigen Repo, GLB-/Rig-/Materialkompatibilität und das physische Gerätemessergebnis. Unverbundene Spieloberflächen stehen als eigene Matrixlücken daneben. Fehlende Serverfähigkeiten werden als separate Entscheidungen/Serveraufträge ausgewiesen; die festgelegte unveränderte Simulation bleibt bindend.

## Datei-für-Datei arbeiten

`file-plan.csv` besitzt die verbindlichen Spalten `step_id`, `task_key`, `issue`, `source_path`, `target_path`, `action`, `depends_on`, `test_gate`, `runtime_gate`, `status`, `owner_action`, `baseline_sha`.

- Ein Schritt ist genau ein Zielpfad. Quellen sind semikolongetrennte tatsächliche Pfade; neue Ergebnisse aus G01 sind ausdrücklich erst in diesem PR vorbereitet.
- `CREATE` bedeutet neu geplant, `MODIFY_EXISTING` tatsächlicher bestehender Pfad und `EXTEND_PREDECESSOR` eine spätere Erweiterung desselben Pfads. `.gitignore`, `SUMMARY.md` und die Desktop-Erweiterung von `export_presets.cfg` werden so korrekt behandelt.
- `depends_on` verweist auf fachliche Vorgängerissues und nötigenfalls auf vorherige Dateischritte. Es ist eine Ausführungsreihenfolge, keine Erledigtmeldung.
- G01 ergänzt konkrete zuvor fehlende Darstellungsdateien für öffentliche Charakterwahl, Charakter/Statwallet, NPC/Dialog und Companion. Diese Ergänzungen gehören zu vorhandenen Aufgaben, nicht zu einer neuen serverseitigen Simulation.
- Die Einheit bleibt ein kleiner fachlicher Auftrag/PR. Vor dem ersten Code eines Tickets werden passende Vertrags-/Regressionstests festgelegt; die Dateizeilen sind kein Auftrag, erst am Ende zu testen.
- `NOT_IMPLEMENTED`, `PLANNED_NEW` oder ein vorbereiteter Dokumentationsstatus erfüllt keine Android-/Gameplayabnahme. Housing bleibt ausdrücklich durch den fehlenden nachgewiesenen kanonischen Vertrag blockiert.

Für neue Sitzungen: Memory/Regeln und aktuellen main lesen → exaktes Issue und Vorgängerbelege prüfen → kleinste ausführbare Dateizeile wählen → Änderung isolieren → passende Prüfung ausführen → tatsächliche Grenze unabhängig zurücklesen → Issue und nächsten Schritt aktualisieren. Routinearbeit nach erteiltem Umsetzungsauftrag benötigt keine neue Freigabe pro Datei. Merge oder Veröffentlichung erfolgen erst mit dem zugehörigen Auftrag.

## Nächster konkreter Schritt

Nach Prüfung dieses G01-Dokumentations-PR: **G02 / #908** klärt das tatsächliche Geräteprofil; **G00 / #909** entscheidet danach die Engine anhand dieser Inventur und der Automatisierbarkeit. G03 / #910 kann den vorhandenen Netzwerkvertrag bereits sprachneutral präzisieren. G05/G06 beginnen erst nach der Engineentscheidung mit dem eigentlichen Godot-Arbeitsplatz/Projekt.

Eine kleine, ausdrücklich begrenzte Engineprobe innerhalb G00 darf die offenen Import-/Buildrisiken prüfen. Sie ist kein zweites vollständiges Spiel und setzt keinen fertig eingerichteten G05-Produktionsworkspace voraus. Wenn Unity einen belegbaren wesentlichen Vorteil liefert, werden die vorhandenen Issues unter Erhalt ihrer Nummern umgeplant.

## Prüfstatus dieses Dokuments

G01 wird an seiner Dokumentationsgrenze geprüft: CSV parsebar, eindeutige IDs, vorhandene Sourcepfade, konkrete Callsitezeilen, Zielpfadabdeckung, vollständige Aufgabenreferenzen, azyklische Vorgänger und gültige lokale Links. Der GitHub-PR und seine Dateien werden nach dem Schreiben unabhängig zurückgelesen. Der Arbeitsstand enthält ausschließlich die drei G01-Dokumente und den Navigationseintrag in `SUMMARY.md`.

**Nicht ausgeführt:** Godotimport, APK-Export, GPU-/Androidtest, Gameplay-/Datenbankoperation, Produktionstest, Merge oder Deployment. Diese Aussagen bleiben offen und gehören zu den späteren Aufgaben. Ein ausbleibender CI-Lauf bei einem reinen Dokumentationsdiff ist kein bestandener Runtimecheck.
