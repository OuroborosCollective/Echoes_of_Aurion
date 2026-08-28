# Wasd–Aurion Unification: Aufgaben- und Nachweisliste

> **SUPERSEDED / HISTORISCHER PLANSTAND.** Diese Liste bleibt für Rückverfolgbarkeit erhalten, ist aber **kein aktueller Completion- oder Release-Ledger**. Sie ist an Aurion `80eb075eea9cec719dc559086968e90417c5bee1` gebunden. Der aktuelle revisionsgebundene Wahrheitspunkt steht in [`AURION_MIGRATION_TRUTH_SNAPSHOT_2026-08-28.md`](./AURION_MIGRATION_TRUTH_SNAPSHOT_2026-08-28.md), aktuell basierend auf `main@c0ad8967046c52141cf1b5f69874a0c53117fbe2`. Offene Checkboxen unten dürfen daher nicht als Beweis für „nicht implementiert“ und vorhandener Code nicht als Beweis für „live“ gelesen werden.

> **Aurion-Basisrevision:** `80eb075eea9cec719dc559086968e90417c5bee1`  
> **Wasd-Quellrevision:** `a4d99432e47b82ce98105eadb30360cd8040ad13`  
> **Kandidatenbranch:** `aurion/wasd-unification-vertical-slice`  
> **Grenze:** Aurion-Browserruntime; keine MSW-/Lua-Portierung, keine pauschale Wasd-Übernahme, keine Produktionsmutation ohne separaten Nachweis.

## Audit und Architektur

- [ ] Aktuellen Aurion- und Wasd-Manifest nachverfolgen und Semantikmatrix im Branch ablegen.
- [ ] Bestehende Aurion-Read-/Command- und Persistenzpfade als einzige Integrationsgrenzen dokumentieren.
- [ ] Vertikalen Zielumfang für eine spielbare Region, NPC, Quest, Begegnung, Lootinstanz und Fortschrittsanzeige festlegen.

## Verträge und Daten

- [ ] Versionierte Welt-/Content-/Regelverträge mit `worldSeed`, `resolutionIndex`, Regionen, Weltreaktionen und Lore-Tags implementieren.
- [ ] Additive Schemaänderung für Weltzustand, Quittungen, Questzustand, Iteminstanzen, Fortschritt und NPC-Zustand vorbereiten.
- [ ] Reine Determinismus- und Idempotenztests vor Dienstintegration schreiben.

## Gameplay-Schleife

- [ ] Questzustand und NPC-Interaktion über geschützte Aurion-Dienste implementieren.
- [ ] Deterministischen Lootgraphen mit Iteminstanz, Affixen/Set-Kandidaten und Receipt implementieren.
- [ ] Charakter-, Waffen- und Skillfortschritt als bestätigten Ledger und Readmodell integrieren.
- [ ] NPC-Bedürfnisse, Gedächtnis, Ziele, Weltbeobachtung und begrenzte Entscheidungen integrieren.
- [ ] Weltreaktionen, Diplomatie-/Fraktions- und Sprach-/Dialogdaten als versionierte, nichtautoritäre Content- und Readmodellschicht integrieren.

## Client und Assets

- [ ] Babylon-/React-Adapter auf bestätigte Aurion-Readmodelle erweitern.
- [ ] Deterministischen Demoablauf für Region → NPC → Quest → Begegnung → Loot → Fortschritt sichtbar machen.
- [ ] Wasd-GLB-Kandidaten vollständig inventarisieren, hashen, Rechte/Budget prüfen und ausschließlich inaktiv katalogisieren.

## Verifikation und Freigabe

- [ ] TypeScript, Unit-, Regression- und Determinismustests ausführen.
- [ ] Browser-Readback des vertikalen Spielslices und Asset-/Sicherheitsprüfung erfassen.
- [ ] Kandidatenbranch pushen, Draft-PR erstellen und lokale/Remote-/PR-Revision vergleichen.
- [ ] Vor möglichem Merge konkrete PR-Referenz, Checks und Releasezustand separat bestätigen und nach Merge erneut lesen.
