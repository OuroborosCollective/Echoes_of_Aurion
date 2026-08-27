# Wasd → Aurion: Gesicherte Dialogabsicht zu Questangebot

**Status:** Kandidat, nicht gemergt, nicht deployed, Datenbankmigration nicht angewendet.

**Aurion-Basis:** `c6f09e1f44d4e504a3fa6dfea7f8d7c20fc1eb34`

**Wasd-Quellrevision:** `a4d99432e47b82ce98105eadb30360cd8040ad13`

**Migration `0020` (nicht angewendet), SHA-256:** `918952d05fe420da9c3d8876d07cfaa73c78a7fbc2d3d16083d50afc4ee0064a`

**Code-/Schema-/SQL-/Testdiff gegen Aurion-Basis, ohne dieses selbstreferenzielle Evidenzdokument, SHA-256:** `c0ea3a64dadba77236b3f50a7e304e0e3d84cfdf8140fbc8e8754e2196c71d27`

## Ziel und harte Grenze

Diese Scheibe bindet eine **bereits gespeicherte, akzeptierte Dialoginterpretation** an eine explizite, geschützte Aurion-Questangebots- oder Übergabeprüfungsanfrage. Sie überträgt weder Wasds Tickruntime noch dessen In-Memory-Zustand. Die Dialogdeutung erzeugt nicht direkt Questfortschritt, XP, Punkte, Loot, Inventar, Skillfortschritt, Ruf, Weltzustand oder NPC-Bedürfnisse.

Die vorhandenen Endpunkte für Questannahme und Questübergabe bleiben separate, explizite Aurion-Spieleraktionen. Auch nach einem bestätigten Dialogangebot muss der Spieler die sichtbare Questannahme selbst auslösen. Eine Questübergabe bleibt weiterhin an die bestehende serverbestätigte Encounter-Sitzung gebunden.

## Gebundene Quellen und übernommene Semantik

| Quellpfad aus Wasd                                     | SHA-256                                                            | In Aurion übernommene Idee                                                                                         | Explizit nicht übernommen                                     |
| ------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| `server/src/core/language/DialogueDecisionKernel.ts`   | `c965fb3cdd46a790e522bb84b0870d257695cc9175ad621718b37d82df0473d7` | Intent und Sprachdarstellung sind getrennt; nur begrenzte, regelbasierte Bedeutungen dürfen Folgeaktionen anbieten | In-Memory-Status, Telemetrie, Tick-Cooldowns, Satzgenerierung |
| `server/src/core/language/DialogueSafetyQuarantine.ts` | `3527a1b7f1d9975e983b35eaa46695b941d147a4ed2917c022879c417ad5c980` | ungeeignete oder sensible Sprache löst keine Aktion aus                                                            | Wasd-Runtime-/Persistenzpfade                                 |
| `server/src/core/systems/QuestDerivationEngine.ts`     | `582629e8a5c58f6d231e41ce9bd1b82b387edd4a339f77f45a8b0dae8549a29f` | Questangebot, Ziel, Zustand und Belohnung bleiben getrennt                                                         | Weltregister, Tick-/Energie-/Matrixmodell                     |
| `server/src/core/are/QuestTickSystem.ts`               | `1d72c59fe1a913632cb0eff111ad7d0de32c7f38ad1caf0ffe40a7e3e3610097` | lediglich Referenz für Zustandsgrenzen                                                                             | gesamte 10-Hz-Pflicht und Tickausführung                      |

## Aurion-Änderungen

| Datei                                                                         | Änderung                                                                                                                             | Sicherheits- und Determinismusgrenze                                                        |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `server/wasdAurionDialogueQuestIntentProtocol.ts`                             | Reine Zuordnung von akzeptierter Dialogdeutung und bestehendem Quest-Readmodell zu `offer_quest`, `request_turn_in` oder `no_action` | Keine Datenbank, keine Uhrzeit, kein Freitext, keine Rewards                                |
| `server/wasdAurionDialogueQuestIntentProtocol.test.ts`                        | Determinismus- und Negativtests                                                                                                      | Quarantäne, fremder NPC, unpassender Intent und fehlender Questzustand ergeben keine Aktion |
| `server/wasdAurionRuntime.ts`                                                 | Dialogreadback enthält zusätzlich die serverseitige Receipt-ID                                                                       | Die Interpretation und deren Quarantäne bleiben unverändert                                 |
| `drizzle/0020_wasd_aurion_dialogue_quest_intents.sql` und `drizzle/schema.ts` | Additive Command-Receipt-Tabelle mit Nutzer-, Dialog-, Aktion-, Quest- und Idempotenzbindung                                         | Keine Änderung bestehender Tabellen oder Migrationen                                        |
| `server/db.ts`                                                                | Atomare, geschützte Receipt-Anfrage mit Besitz-, Intent-, NPC-, Questzustands- und Wiederholungsprüfung                              | Rückgabe ist nur ein Angebot/Readback, keine Questmutation oder Belohnung                   |
| `server/routers.ts`                                                           | Neuer `protectedProcedure`-Endpunkt                                                                                                  | Geschlossene Enums; weder öffentliche noch administrative Route                             |
| `client/src/pages/Home.tsx` und `client/src/index.css`                        | Touchfreundliche Anzeige einer bestätigten Dialogabsicht im bestehenden NPC-Panel                                                    | Die tatsächliche Questannahme und Questübergabe bleiben sichtbar getrennt                   |

## Receiptmodell und Wiederholung

Die neue Tabelle `aurionDialogueCommandReceipts` speichert eine servergenerierte ID, den Eigentümer, die Ursprungs-Dialogreceipt-ID, NPC, Aktionsart, bestehenden Questschlüssel, ein minimales Ergebnis-JSON und den Idempotenzschlüssel. Ein eindeutiger Schlüssel schützt sowohl den Idempotenzschlüssel als auch die fachliche Kombination aus Nutzer, Dialogreceipt, Aktionsart und Questschlüssel.

Bei Wiederholung mit identischen Daten wird der vorhandene Receipt zurückgegeben. Bei Wiederverwendung eines Idempotenzschlüssels für eine andere Aktion schlägt der Command ohne Seiteneffekt fehl. Parallele, fachlich gleiche Bestätigungen kollabieren am zusammengesetzten Datenbankschlüssel auf einen Receipt. Da der Command keine Quest- oder Rewardmutation ausführt, kann ein Dialogangebot weder die bestehende Questkette noch Fortschritt oder Inventar verändern.

## Verifikation

| Prüfung                                                                                         | Ergebnis                       | Einordnung                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`                                                                                    | bestanden                      | Typen für Regel, Schema, Datenzugriff, Router, Runtime-Readback und Client sind konsistent                                                                                    |
| `pnpm vitest run server/wasdAurionDialogueQuestIntentProtocol.test.ts`                          | 3/3 bestanden                  | Reine Regel ist deterministisch und deckt die wichtigsten Negativfälle ab                                                                                                     |
| `pnpm test` ohne lokale Datenbank                                                               | 133 bestanden, 12 übersprungen | Reine und Client-Regression grün; DB-E2E-Tests werden ohne Datenbank erwartungsgemäß übersprungen                                                                             |
| `DATABASE_URL=<isolierte Testdatenbank> pnpm vitest run server/dialogueQuestIntent.e2e.test.ts` | 3/3 bestanden                  | Besitzbindung, Quarantäne, Falschzuordnung, Reward-Freiheit und Parallelitätskollaps sind gegen MariaDB getestet                                                              |
| `DATABASE_URL=<isolierte Testdatenbank> pnpm test`                                              | 143 bestanden, 2 übersprungen  | Gesamte Regression einschließlich Quest-, Markt-, Zonen- und Dialogreceipt-E2E grün; die verbleibenden zwei vorhandenen Fälle sind nicht für diese Testdatenbank konfiguriert |

| `pnpm build` | bestanden | Client- und Serverbundle entstehen erfolgreich |
| `git diff --check` | bestanden | keine Whitespacefehler im Kandidatendiff |
| DB-E2E `server/dialogueQuestIntent.e2e.test.ts` | 3/3 gegen isolierte MariaDB bestanden | Migrationsjournal 21, neue Tabelle und alle eindeutigen Indizes wurden vor der E2E-Suite read-only rückgelesen; Produktion wurde nicht verwendet |

| Datenbankmigration `0020` | **nicht angewendet** | benötigt unmittelbar vor `--apply` eine separate, konkrete Nutzerfreigabe |
| Browser-Readback | offen | erst nach kontrolliertem Kandidatenruntime-Setup und ohne echte Nutzerinventarverbräuche |

Der Build gibt bestehende Hinweise zu nicht gesetzten optionalen Analyseplatzhaltern und zur Größe eines Babylon-Chunks aus. Der Build selbst ist erfolgreich; diese Hinweise sind nicht durch diese Scheibe entstanden und werden nicht in diesem Gameplay-Slice verändert.

Die browserseitige Readback-Prüfung wurde in einer isolierten lokalen Kandidatenruntime mit synthetischem Testspieler erfolgreich durchgeführt. Die Ansicht zeigte Login-first, Solo-/MCP-Optionalität, Touch-/WASD-Steuerung, den serverseitigen Open-World-Snapshot sowie Lyra und Orun. Der geschützte Dialogpfad antwortete mit `accepted/ask_quest`; das Readmodel erlaubte ausschließlich `astral_call`; die separat bestätigte Folgeaktion antwortete mit `offer_available_quest`. Questannahme, Questabschluss, Fortschritt, Loot und Belohnungen wurden nicht ausgelöst. Die produktive Migration `0020` bleibt bis zu einer separaten, unmittelbaren Zustimmung vollständig unangetastet.

## Produktions-Preflight – nur lesend

Der Produktions-Preflight wurde ohne Änderung von Dateien, Datenbank, Containern, Konfiguration oder Routing durchgeführt. Der Aurion-Checkout steht auf `c6f09e1f44d4e504a3fa6dfea7f8d7c20fc1eb34`; Aurion und MariaDB melden jeweils einen gesunden Status. Der Drizzle-Migrationsjournalstand beträgt **20**, und die neue Tabelle `aurionDialogueCommandReceipts` ist mit einem Tabellenanzahlwert von **0** noch nicht vorhanden. Damit ist die Kandidatenmigration `0020` eindeutig noch nicht angewendet.

Die produktive Arbeitskopie enthält unversionierte Umgebungs-/Compose-Dateien. Diese wurden weder gelesen noch verändert und liegen außerhalb des Slices. MCP, Tunnel, Broker, FusionAuth, Routing, Domains und Workflows wurden ebenfalls nicht geprüft oder verändert.

## Rückkehrpunkt und nicht berührte Systeme

Der Rückkehrpunkt ist die unveränderte Aurion-Remote-Basis `c6f09e1f44d4e504a3fa6dfea7f8d7c20fc1eb34`. Die neue Tabelle wird ausschließlich von der neuen Route benutzt; ein Zurückziehen des Kandidaten erfordert keine Änderung bestehender Quest-, Loot-, Fortschritts- oder Assetdaten.

MCP, Tunnel, Broker, FusionAuth, Routing, Workflows, Produktionscontainer, Domains und Assetbytes wurden nicht verändert. Die 149 inventarisierten Wasd-GLB-Kandidaten bleiben vollständig inaktiv und liegen außerhalb dieses Slices.
