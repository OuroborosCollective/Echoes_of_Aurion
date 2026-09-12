---
description: Kanonische Zuständigkeits- und Truth-Boundary für Echoes of Aurion.
---

# Architektur-Ownership: Aurion · AX1 · WASD

> **Kanonischer Vertrag seit 6. September 2026.** Dieses Dokument ersetzt jede ältere Repository-, GitBook-, Linear- oder Issue-Formulierung, die Echoes of Aurion selbst Gameplay-Regeln oder Gameplay-Mutationsauthority zuschreibt.

Die Architektur wurde im Live-Gameplay-Kohärenzschnitt aus PR #234 auf `main` getrennt. Der dabei gemergte Basispunkt ist `5d0ba3808968c39e15e2b34cd3b32a8e5d28a598`. Spätere Revisionen dürfen diese Grenze nur enger machen, nicht wieder aufweichen.

## Die drei Eigentümer

| Fläche | Kanonischer Eigentümer | Verantwortung |
| --- | --- | --- |
| Website, Landing Page, Auth, Konto, Community, Forum, Community-Events, Asset-/Ops-Verwaltung | **Aurion** | Produktportal und soziale/operative Daten |
| MariaDB, Transport, Receipts, Readmodels | **Aurion** | bestätigte Evidence speichern und lesen; keine Gameplayentscheidung |
| Hauptspiel, Gameplay-Identität/-Verträge, `/play`, Welt-/Contentstruktur, 3D-Runtime, Renderer, HUD, Eingaben, Animation/VFX | **AX1** | kanonisches Spielprodukt und fachlicher Rahmen |
| Deterministische Ausführung von Bewegung, Combat, Quests, Progression, Mastery, Loot, Crafting, Economy, Gruppen/Dungeons, NPC/Mobs, Welt/Chunks, Housing, Guild/Kingdom und Balancing | **WASD** | Logik- und Simulationsschicht unter dem AX1-Spielvertrag |

Kurzform:

```text
Aurion = Host + Website + Account + Community + DB + Evidence
AX1    = kanonisches Hauptspiel + Gameplayvertrag + Content + Runtime/UI
WASD   = ausführende Gameplaylogik + deterministische Simulation
```

## Kanonische Kausalkette

```text
Mensch / Input
    ↓
AX1 Input + Presentation
    ↓ intent only
WASD-Ausführung des AX1-Vertrags / deterministische Regel / logischer Tick
    ↓
confirmed gameplay result + receipt
    ↓
Aurion transport + persistence
    ↓
read-only projection
    ├── AX1 im Spiel
    └── Aurion auf Konto/Community-Seiten
```

Es gibt keinen erlaubten Rückweg, bei dem eine Aurion-Website-, Admin-, MCP- oder DB-Regel selbst eine fachliche WASD-Entscheidung erzeugt.

## Was Aurion schreiben darf

Aurion darf ausschließlich Zustände verändern, die Aurion selbst gehören:

- Registrierung, Anmeldung, Session- und Accountdaten;
- Community-Chat und Partner-/Community-Metadaten;
- Forumbeiträge, Antworten, Moderation und redaktionelle Inhalte;
- Community-Event-Metadaten und Community-Ranglisten-Snapshots;
- GLB-/Asset-Upload, Quarantäne, Review, Sichtbarkeit und **rein visuelle** Asset-Zuweisung;
- Betriebs-, Security-, Audit- und Deploymentmetadaten;
- Schema-/Migrationen über revisionsgebundene Ops-Gates;
- bestätigte WASD-/AX1-Receipts und daraus abgeleitete read-only Projektionen.

Ein Persistenz-Write ist nur Speicherung. Er macht Aurion nicht zum Eigentümer der fachlichen Regel, die den gespeicherten Wert erzeugt hat.

## Was Aurion niemals schreiben oder entscheiden darf

Aurion Website, Admin UI, Admin MCP, Datenbankhelper, Worker oder Service Cells dürfen nicht:

- Angriffe freigeben, Schaden, Treffer, Crit, HP oder Stamina berechnen;
- Questannahme, Questziel, Questfortschritt, Abschluss oder Belohnung bestimmen;
- XP, Level, Mastery, Skillfortschritt oder Klassen-/Archetypregeln berechnen;
- Loot, Drop, Pity, Itemstats, Equipmentwirkung oder Auto-Loot bestimmen;
- Crafting-Ergebnis, Yield, Qualität, Ressourcenverbrauch oder Berufswirkung entscheiden;
- Gameplay-Economy, Preise, Gold-/Materialwirkung, Markt- oder Buyback-Regeln bestimmen;
- Party-/Dungeon-Matching, Rollenwirkung, Boss-/Instanzzustand oder Rewards simulieren;
- NPC-Memory, Standing, Zielwahl, Mob-FSM, Threat oder Pathfinding entscheiden;
- Welt-, Chunk-, Spawn-, Collision-, Straßen-, Stadt-, Ressourcen- oder Eventregeln bestimmen;
- Housing-, Blueprint-, Bau-, Plot- oder Platzierungsregeln bestimmen;
- Guild-/Alliance-/Territory-/Kingdom-/Treasury-Gameplay bestimmen;
- aus GLB-/Assetmetadaten oder Telemetrie Gameplaysemantik ableiten;
- generische SQL-/Shell-/Admin-Kommandos als Gameplay-Abkürzung anbieten.

Wenn eine solche Funktion im Aurion-Code existiert, ist sie **Legacy-Migrationsschuld** oder ein Adapter, der noch auf WASD zurückgeführt werden muss. Datei- oder Testexistenz macht sie nicht kanonisch.

## AX1-Grenze

AX1 ist das kanonische Hauptspiel. Es besitzt Gameplay-Identität und -Verträge, sichtbare Welt-/Contentstruktur, Spieloberfläche und Runtime. Die deterministische Ausführung dieser Verträge delegiert AX1 an WASD; bestätigte persistente Ergebnisse werden über Aurion transportiert und gespeichert.

AX1 darf:

- Eingaben erfassen;
- Renderer, Kamera, HUD, Animationen und visuelle Effekte betreiben;
- bestätigte WASD-Snapshots/Events darstellen;
- Content-/Asset-Kataloge für Darstellung verwenden;
- lokale Prediction ausschließlich zur Latenzmaskierung verwenden.

AX1 darf nicht:

- lokale `damageMob`, Quest-, Loot-, XP- oder Inventarmutationen als Wahrheit behandeln;
- `Math.random()`/Wall-Clock für kanonische Gameplayentscheidungen verwenden;
- fehlende Server-/WASD-Daten mit einem scheinbar erfolgreichen Gameplay-Fallback ersetzen.

## WASD-Grenze

WASD ist die ausführende Logik- und Simulationsschicht des AX1-Hauptspiels. Es implementiert deterministische Regeln und erzeugt bestätigte Ergebnisse, ohne ein zweites konkurrierendes Spielprodukt oder eine sichtbare Ersatzoberfläche zu bilden.

Neue Gameplaymechaniken werden zuerst im AX1-Spielvertrag und der Contentstruktur definiert, dann als WASD-Regel implementiert und anschließend an AX1-Darstellung sowie Aurion-Persistenz angebunden. Ein fehlender ausführbarer WASD-Vertrag führt **fail-closed** zu „nicht verfügbar/unbewiesen“, nicht zu einer Aurion-Ersatzregel.

Wolfram/CAG darf WASD-Formeln analysieren, falsifizieren und parametrisieren. Wolfram ist niemals Runtime- oder Gameplay-Authority.

## Aurion-Website: maximale Berechtigung für Gameplaydaten

Die Website darf bestätigte Gameplaydaten ausschließlich lesen und anzeigen, zum Beispiel:

- Charakterlevel und Gesamtfortschritt;
- Skill-/Mastery-Level;
- Achievements, sofern eine bestätigte persistierte WASD-Projektion existiert;
- Gildenzugehörigkeit und Rolle;
- Inventarinhalt;
- ausgerüstete Gegenstände;
- Companion-Training, Sample-/Receipt-Metadaten und Lernhistorie.

Diese Flächen dürfen keine Buttons oder Mutationen anbieten, die den angezeigten Gameplayzustand verändern. Eine Accountseite ist kein zweites Game HUD.

## Community, Forum und Events

Communityfunktionen sind echte Aurion-Ownership. Aurion darf soziale Inhalte schreiben und moderieren. Ein Community-Event darf aber nicht still eine WASD-Spielregel überschreiben. Gameplayrelevante Eventfolgen benötigen einen eigenen WASD-Vertrag; Aurion verwaltet dazu nur Metadaten/Evidence.

## Assets und GLB

Aurion besitzt Asset-Governance: Upload, Bytes, SHA-256, Review, Quarantäne, Sichtbarkeit und visuelle Assignment-Metadaten.

Gameplaystats, Mobverhalten, Attackrange, Collisionregeln, Itemwirkung oder Spawnlogik dürfen nicht aus einem freigegebenen GLB entstehen. AX1 rendert Assets; WASD definiert ihre Gameplaysemantik.

## Admin und MCP

Der Aurion Admin MCP bleibt read-only. Administrative Aurion-Effekte dürfen ausschließlich Account-, Community-, Asset-, Ops- und Persistenzwartung betreffen.

Gameplay-Änderungen gehören nicht in einen generischen Aurion Admin Control Plane. Ein LLM, Admin oder Owner kann WASD-Regeländerungen beauftragen, aber die Änderung erfolgt als revisionsgebundener WASD-Code-/Regelprozess, nicht als Live-Aurion-Datenbankkommando.

## Observability

Telemetry, Logs, Amplitude, OpenTelemetry und ähnliche Systeme sind Side-Channels. Sie dürfen Gameplay beobachten, aber niemals Gameplay-Input oder Gameplay-Truth werden.

```text
telemetry outage ≠ gameplay outage
telemetry green  ≠ gameplay proven
```

## Evidence-Regel

Ein Zustand ist nur auf seiner eigenen Grenze belegt:

| Beobachtung | Belegt |
| --- | --- |
| Aurion Website antwortet | Website/Host |
| MariaDB Readback stimmt | Persistenz |
| AX1 Animation läuft | Präsentation |
| WASD Reducer/Receipt stimmt | Gameplayregel/-zustand |
| Container ist healthy | Containerhealth |
| Browser zeigt bestätigten WASD-State | sichtbare End-to-End-Projektion |

Keines dieser Signale ersetzt automatisch ein anderes.

## Migrationsregel für Legacy-Code

Bekannte historische Aurion-Gameplayflächen wie Arena-/Encounter-/Quest-/Progressionspfade sind nicht der Zielzustand. Bei jeder Berührung gilt:

1. feststellen, ob die Fläche Gameplayregel enthält;
2. fachliche Identität und Vertrag an AX1 binden;
3. Ausführungslogik zu WASD verschieben oder an den vorhandenen WASD-Vertrag binden;
4. AX1 als Hauptspiel/UI/Runtime verwenden;
5. Aurion auf Community/Auth/Host/Transport/Persistenz/Readmodel reduzieren;
6. Regression ergänzen, die den Rückfall verhindert;
7. erst nach Exact-Head-Evidence mergen.

## Arbeits- und Merge-Gate

Für jede Migrationslane:

1. aktuellen `main` lesen;
2. Ownership vor der Implementierung prüfen;
3. Runtime/Tests/DB/Browser auf der relevanten Grenze prüfen;
4. keine falsche Green-Behauptung bei fehlender Evidence;
5. PR mergen, sobald die erforderlichen Checks belegt sind;
6. `main` readbacken;
7. **0 offene PRs** bestätigen;
8. erst dann in den nächsten Migrationsbereich wechseln.

## Historische Dokumente

Datiertes Guardian-/QA-Material darf als historische Evidence erhalten bleiben, sofern es eindeutig eine damalige Revision dokumentiert. Es ist **nicht normativ**. Bei Widerspruch gewinnt immer dieses Dokument zusammen mit dem aktuellen Code- und Runtime-Readback.
