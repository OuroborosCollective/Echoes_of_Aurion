# feat: Aurion–Wasd-Vertikalschnitt für Welt, NPCs und Fortschritt

## Ziel

Dieser Kandidatenbranch überträgt ausgewählte, revisionsgebundene Wasd/Areloria-Regelkerne in die bestehende Aurion-Browserruntime. Die Implementierung erweitert Aurion additiv und erstellt keine MSW-/Lua-Portierung. Der Spielablauf bleibt bewusst an Aurions bestehende, serverbestätigte Quest-, Begegnungs-, Fortschritts- und Receiptpfade gebunden.

## Enthalten

| Bereich | Umsetzung |
| --- | --- |
| Deterministische Welt | Versionierter `worldSeed`, `resolutionIndex`, Signalauflösung, Wetter-/Dialogton und Readmodell |
| Quests, Loot und Fortschritt | Bestätigter Questabschluss → idempotenter Ergebnisreceipt → deterministischer Loot → optionaler Waffenfortschritt |
| NPCs | Begrenzte Needs, reproduzierbare Zielentscheidung, Speicherreadmodell, Dialekt-ID und Schwellenwert für Verständnis |
| Politik und Weltreaktion | Asterion-Polity als deterministisches Readmodell; Kriegs-/Politiksignale bleiben regelgebunden und nicht klientenautoritär |
| Persistenz | Additiv: Weltauflösungen, NPC-Zustände, Entscheidungsevidenz, Polityreadmodelle und Dialogreceipts |
| Client | Sichtbare Weltreaktion, Polity, NPC-Ziel, Sicherheitswert, Dialektprofil und geschützter Dialogdeutungspfad |
| Assets | 149 Wasd-GLB-Container vollständig strukturell validiert; keine Übernahme und keine Runtimeaktivierung ohne Rechte-/Budgetfreigabe |

## Migrationen

Die Migrationen `0016_wasd_aurion_world.sql` und `0017_wasd_aurion_content_seed.sql` sind additiv und im Drizzle-Journal registriert. Sie wurden **nicht** gegen eine Produktionsdatenbank ausgeführt. Vor Release ist ein gesonderter Migrations-Readback mit Backup und die Prüfung des Zielschemastands erforderlich.

## Nachweise

| Prüfung | Ergebnis |
| --- | --- |
| TypeScript | bestanden |
| Vollständige Testausführung | 82 bestanden, 7 übersprungen |
| Produktionsbuild | bestanden |
| GLB-2.0-Einzelprüfung | 149/149 gültig, 0 Fehler |
| Anonyme Browseransicht | geladen; keine sichtbare Laufzeitausnahme |

Die sieben übersprungenen Tests benötigen lokale OAuth-/Datenbank-/Zoneninfrastruktur. Dies ist ein umgebungsbedingter Teststatus, kein Erfolgsnachweis für diese Integrationen.

## Nicht enthalten / Freigabegates

Die folgenden Punkte bleiben absichtlich außerhalb dieses Branches oder benötigen vor Aktivierung separate Freigaben: einzelne GLB-Rechteketten und Laufzeitbudgets, Produktionsmigration, Deployment, globales Balancing, serverautoritäre 10-Hz-Ticks, MSW/Lua-Portierung und ein Merge nach `main`.

> Reviewende sollten zuerst `WASD_AURION_SEMANTICS.md`, `WASD_GLB_AUDIT.md`, `guardian/wasd_aurion_browser_qa.md` und die beiden Additivmigrationen lesen.
