# AIM-265 — Reproduzierbare Berechnung der Migrationsregeln

Normative Quelle: `Wasd@7bd039bb79681d2df342abe160579f89ca3ff8ed`.
Engine-/Contentquelle: `-ax1@d356881538dae23c3aa97364a5596d48b6ac3079`.
Host-Basis: `Echoes_of_Aurion@c3596b4fdb358b14e58526d8f19893b08b01fb22`.

Der [maschinenlesbare Kandidat](aim265-candidate.json) trägt
`aurion-balancing-candidate.v2`, `final: false` und SHA-256-Bindungen an die
tatsächlich ausgeführten Quelldateien. Er ist eine Berechnungsgrundlage. Er
behauptet keine aktiven Dungeon-Instanzen, zusätzliche Monsterpopulationen oder
bereits implementierte Rezepte.

## Ausführen und unabhängig prüfen

```sh
node --import tsx scripts/balancing/replay-aim265.mjs /tmp/aurion-balancing-v2.json
python scripts/balancing/verify-aim265.py /tmp/aurion-balancing-v2.json
diff -u docs/balancing/aim265-candidate.json /tmp/aurion-balancing-v2.json
python -m unittest discover -s scripts/balancing -p 'test_*.py'
```

TypeScript ruft die echten Protokolle auf. Python prüft die Ergebnisse unabhängig
mit Newton-Integerwurzel, rationalen Zahlen, vollständiger XP-Summe bis Level
10.000 und Graphsuche. Manipulierte XP, ausgelassene Rezepte, falsche negative
Chunk-Koordinaten, fallende Dungeon-Rewards und getrennte Straßen werden abgelehnt.
Der CI-Lauf prüft außerdem TypeScript und die betroffenen Regressionen.

## Berechnungsabdeckung

| Fläche | Rechnung | Fachlicher Nachweis, der noch fehlt |
| --- | --- | --- |
| 14 Professionen | Normative XP-Wurzel, getrennte Scopes, Level 1 bis 10.000 und 10^24, begrenzte Modifikatoren | Alle Tätigkeiten an bestätigte Spielaktionen anbinden; bislang ist der Speer-Craft verbunden |
| 9 Tätigkeiten, 11 Rezepte | Quellzeiten, Materialmengen, Intervall für Beschaffung, exakter Bonus-Carry | Laufwege, Konkurrenz um Ressourcen, Input-Budgets und Verkaufs-/Salvage-Sinks |
| 4 Dungeon-Katalogeinträge | Einstiegs-XP, Rollenbedarf 1/1/3, Quell-Rewards | Echte Queue, Rollenfähigkeit, Instanz und Completion-Receipt aus AIM-259 |
| Dungeon-Protokoll | 192 Varianten-/Gruppen-/Etagen-Szenarien; keine fallenden Budgets, Belohnungen oder HP | Tatsächliche Instanz-/Kampfprojektion; Kandidatenwerte werden dadurch nicht aktiviert |
| 4 Weltbosse | 60 TTK-Szenarien, 100-ms-Respawn-Ticks, Chunk-Koordinaten | Reale Loadouts, Heilung, Rüstung, Schadensbelege, Boss-/Pity-Ledger |
| 6 Gildengebäude | Alle Ausbaustufen, Kosten als Dreieckssumme, begrenzte Perks | Belege der jeweiligen Perk-Verbraucher |
| 4 Housing-Blueprints | Vollständige Kostenvektoren, Quell-Perks als unfertige Kandidaten | Tower-Bridge und tatsächliche Perk-/Slotwirkung aus AIM-261 |
| Population und Ökonomie | 1–10.000 Spieler, Siedlungskapazität, Monster-Anzeigelimits, 60 Sink-/Farmraten-Szenarien | Keine Prognose ohne gemessene Farmraten; unendlicher Bonus-Yield braucht wirksame Sinks |
| Chunks und Straßen | Negative Grenzen, Ressourcenbereich, 279 zusammenhängende Wegzellen über 3×3 Chunks | Topologische Verbindung beweist keine Begehbarkeit über Terrain-/Kollisionsgrenzen |

Die Monsterbudgets der laufenden `openWorldProtocol`-Projektion und die noch nicht
integrierten `aurionChunkPerformanceProtocol`-Kandidaten werden getrennt ausgewiesen.
Ein Handybudget darf den autoritativen 100-ms-Takt oder die gemeinsame
Monsterpopulation nicht verändern. Ebenso sind die 64-m-Aurionschunks, die
32-m-Einstiegskarte und die 80-m-AX1-Darstellungszellen unterschiedliche Flächen.

## Bestätigte Korrekturen

Der WASD-Stadtplaner verwendet eine zweidimensionale X/Y-Fläche. Aurion bildet
diese auf X/Z ab; Y ist Höhe. Die bisherige Übernahme verschob Gebäude nach oben
und ignorierte ihren Z-Abstand. `wasd:city-layout:xz:v2` erhält die Höhe, prüft
negative Z-Sektoren, akzeptiert auch path/street-Anker und lehnt doppelte Kennungen
oder ungültige Koordinaten ab. Nach jeder Verschiebung werden frühere Hindernisse
erneut geprüft. Ein überschrittener Sektor-/Arbeitsbereich wird abgelehnt.
Vorhandene Straßenanker bedeuten weiterhin nur, dass ein Anker existiert; es wird
keine erfundene Navigation oder automatisch gebaute Straße gemeldet.

`aurion-dungeon-progression.v1` wählte bei jeder Etage neue Affixe. Ein echter
Gegenlauf auf der Host-Basis zeigt im Normal-Modus von Etage 1 zu 2 einen Rückgang
von 14.002 auf 12.502 Gefahren-Basispunkte und von 20.188 auf 19.938 Reward-Punkte.
Im Endless-Modus fallen beide Werte ebenfalls. Die Version v2 bindet die
Affix-Reihenfolge an denselben unveränderlichen Laufbeleg; höhere Etagen erweitern
dessen Präfix. Der Etagenhash bleibt verschieden. Die neue Regel wird nicht in
historische Receipts zurückgeschrieben. AIM-259 muss einen stabilen Laufbeleg von
fortlaufenden Aktionsbelegen unterscheiden.

## Wolfram und Quellen

WolframContext und WolframLanguageEvaluator wurden am 5. September 2026 versucht.
Beide scheiterten vor einer Berechnung mit HTTP 404 am MCP-Endpunkt. Deshalb ist
`executionVerified: false`. [Der vorbereitete Wolfram-Replay](../../scripts/balancing/aim265-wolfram.wl)
kann nach Wiederherstellung des Connectors denselben JSON-Eingang prüfen. Ein
lokaler Python-Erfolg ersetzt keinen Wolfram-Ausführungsbeleg.

Parallel Search lieferte Primärdokumentation zu
[Quotient und Floor](https://reference.wolfram.com/language/ref/Quotient.html),
[QuotientRemainder](https://reference.wolfram.com/language/ref/QuotientRemainder.html)
und [Graph-Zusammenhang](https://reference.wolfram.com/language/ref/ConnectedGraphQ.html).
Diese Quellen begründen die Prüfmethoden; sie liefern keine Aurion-Balancingkonstanten.

Der bestehende Auftrag autorisiert diese Migrationsspur bis zum geprüften Release.
Agent Consent Patterns wird als Action-Receipt-/Authority-Boundary-Regel angewandt:
Berechnung ist keine Freigabe neuer Rewards, und ein Eintrag im Katalog ist kein
aktives Spielobjekt. CI-, Datenbank- und Produktionsbelege bleiben getrennt.
