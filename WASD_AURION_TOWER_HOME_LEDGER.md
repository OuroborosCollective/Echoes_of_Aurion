# WASD → Aurion — Turmhaus- und GLB-Migrationsledger

> **Quellrevision:** `a4d99432e47b82ce98105eadb30360cd8040ad13` im Repository `OuroborosCollective/Wasd`. **Aurion-Ausgangsrevision:** `65b9cd59fbbef00d49849a58ed6285ac47d5e2f3`. Dieser Ledger beschreibt ausschließlich den additiven Kandidatenschnitt für den persönlichen Turmstart, die Open-World-Rückkehr und die deterministische GLB-Nutzungsplanung. Er ist kein Merge-Nachweis und ersetzt keine produktive Asset-Freigabe.

| Bereich | Additiver Aurion-Beitrag | Deterministische Invariante | Status |
|---|---|---|---|
| Persönliches Haus | `server/homeBaseProtocol.ts` erzeugt `home:<playerId>` mit Sternwarte, persönlichem Zimmer, Ruhe, Lager, Besuch, Einrichtung und Expanse-Ausgang. | Sichere Spieleridentität, nichtnegative Resolution, sortierte/deduplizierte Besucher und SHA-256-Snapshot. | getestet |
| Geführter Einstieg | `TowerHomePanel` führt nach dem Login über Turmverständnis, optionalen Loadout und bestätigten Weltübergang. | Die Open World wird erst nach erfolgreicher Serverantwort aktiviert; Fehler verbleiben im sicheren Hauszustand. | getestet |
| Mobile First | Die Hausoberfläche ist für 412 × 915 und 800 × 1280 geprüft; alle Haus- und Übergangshandlungen bleiben sichtbar. | Kein Ausblenden von Konto- oder Klassenwahl durch die relevante Mobile-Regel. | getestet |
| Native GLB-Nutzung | Das Manifest bildet zehn Aurion-GLBs auf explizite Szenenziele ab; drei Turm-/Open-World-Modelle werden stabil sortiert und sequenziell geladen. | Kein Zufall, keine parallele Laderennbedingung; fehlende Topologie oder Ladenfehler bleiben in einem sicheren Fallback. | getestet, lokale Storage-Runtime ausstehend |
| WASD-GLB-Katalog | Alle 72 revisionsgebundenen WASD-GLB-Einträge erhalten genau eine Zielrolle und eine Disposition. | Stabile ID-Sortierung; 38 `runtime_load`, 28 `prepare_lod`, 6 `parser_review`. | getestet |

## Test- und Prüfspur

| Prüfung | Ergebnis |
|---|---|
| `pnpm test` | 41 Testdateien bestanden, 7 erwartungsgemäß übersprungen; 140 Tests bestanden, 12 übersprungen. |
| `pnpm verify:release-assets` | Bestanden; zwei bereits freigegebene GLBs innerhalb der Mobil- und Speicherbudgets. |
| `pnpm check` und `git diff --check` | Bestanden. |
| `e2e/towerHome.mobile.spec.ts` | Android Phone 412 × 915 und Android Tablet 800 × 1280 bestanden. |
| Wolfram-Budgetprüfung | 72 WASD-Assets: 38 direkte Runtime-Kandidaten (52,78 %), 28 LOD-Vorbereitung plus 6 Parserprüfung (47,22 %); Summeninvariante erfüllt. |

## Verbleibende Asset-Grenze

Die lokale Entwicklungsruntime lieferte für die sechs Aurion-Storage-URLs keinen konfigurierten Storage-Proxy. Deshalb gilt der Codepfad als **Ladeversuch mit sicherem Fallback**, aber nicht als lokaler Erfolgsnachweis für die drei zusätzlichen Binärdateien. Ein produktiver Assetnachweis erfordert eine Runtime mit konfiguriertem Storage sowie Readback von Content-Type, Binärheader, Integritätshash, Polygon-/Texturbudget und sichtbarer Szene.
