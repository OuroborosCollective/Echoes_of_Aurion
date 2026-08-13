# Rollen- und Saisonverwaltung — Nachweis

**Zeitpunkt:** 13. August 2026  
**Umfang:** Begrenzte serverautoritative Rollenverwaltung, geschützte Live-Rangliste, saisonale Archive und idempotente Saisontransitionen.

## Datenbankmigrationen

| Migration | Inhalt | Datenbank-Readback |
| --- | --- | --- |
| `0003_petite_vampiro.sql` | `seasons` und `seasonLeaderboardSnapshots` mit Ranglistenindex | Tabellen und Indizes nach Ausführung vorhanden |
| `0004_worried_hellcat.sql` | `seasonTransitionReceipts` mit Unique-Key für Idempotenz | Tabelle und Unique-Index nach Ausführung vorhanden |

Beide Migrationen sind additiv; sie enthalten keine Lösch- oder umbauenden Schemaoperationen.

## Autoritäts- und Zustandsvertrag

Rollenänderungen laufen ausschließlich über eine Adminroute. Die eigene Rolle kann darüber nicht geändert werden; die Eigentümerrolle ist ebenfalls serverseitig unveränderbar. Saisonstarts setzen voraus, dass keine aktive Saison existiert. Eine Rotation verlangt den aktuell serverseitig aktiven Saison-Key als explizite Bestätigung, erzeugt für alle vorhandenen Profile Snapshot-Standings, schließt die alte Saison, startet die neue und setzt erst innerhalb derselben Transaktion die laufenden Saisonpunkte zurück. Ein eindeutiger Idempotenzschlüssel verhindert die doppelte Anwendung derselben Transition.

## Checks und Sichtprüfung

| Check | Ergebnis |
| --- | --- |
| `pnpm check` | bestanden |
| `pnpm test` | bestanden: 6 Testdateien, 22 Tests |
| Desktop Operations, 1280 × 720 | Adminregisterkarte und serverseitige Verwaltungsoberfläche erreichbar |
| Mobile Operations, 375 × 812 | Kopfbereich, Statistik und Administrationszugang ohne horizontales Abschneiden lesbar |

## Offene Nachweise

Ein produktiver Saisonwechsel wurde nicht ausgelöst, damit keine realen Saisonpunkte oder Spielerstände ohne ausdrückliche Freigabe zurückgesetzt werden. Der Ablauf ist deshalb durch Schema-Readback, Routenvertrag und Unit-Tests belegt, aber nicht durch einen mutierenden Produktivtest.
