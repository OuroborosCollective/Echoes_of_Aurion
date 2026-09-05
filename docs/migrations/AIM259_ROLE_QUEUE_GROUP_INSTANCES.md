# AIM-259 — Rollenwarteschlange und gemeinsame Gruppeninstanzen

Diese Fortsetzung betrifft AIM-259, Abschnitt **AIM-239.18**, auf Basis von
`addbdea1152e7ea8f9bbcfb7d82f6b2a7049310d` in `Echoes_of_Aurion`.
Der übernommene Content stammt aus `-ax1@d356881538dae23c3aa97364a5596d48b6ac3079`.
Der bereits ausgelieferte native Dungeon-Abschluss aus PR #223 und bestehende
Quest- und Belohnungstransaktionen bleiben unverändert.

## Rollen und Eintritt

| Rolle | Serverseitig geprüfte Qualifikation |
| --- | --- |
| Tank | Ausgerüstete Wächterhaltung (`guardian_stance`) |
| Heiler | Ausgerüstetes Heilendes Licht (`mending_light`), unabhängig von Klasse und Waffenart, auch ohne Waffe |
| Schaden | Ausgerüstete gültige Aurion-Waffenfamilie |

Die beiden Gruppen-Skills sind ab einem echten Profil auf Stufe 1 ausrüstbar.
Sie werden pro angemeldetem Spieler persistiert. Eine Klasse oder eine
Fokuswaffe allein gewährt keine Heilfähigkeit. Ein ausgerüsteter Heil-Skill
ermöglicht die serverseitige Heilaktion auf verletzte, lebende Mitglieder
derselben betretenen Instanz. Der Server begrenzt Heilung auf deren maximale LP.

Pro Dungeon und Variante werden die ältesten qualifizierten Einträge für
**1 Tank, 1 Heiler und 3 Schaden** verbunden. Die maximale Warteschlange beträgt
500 Einträge je Kombination. Ein Eintrag verfällt nach 90 Sekunden ohne
explizite Erneuerung; das offene Fenster erneuert alle 30 Sekunden.
Reine Abfragen verlängern keine Frist. Ausrüstungsänderungen werden vor dem
Matching und erneut vor Gruppenaktionen geprüft.

Alle fünf Spieler bestätigen ihre Bereitschaft für denselben Roster-Hash.
Die letzte Bestätigung erstellt in derselben Transaktion genau ein
unveränderliches Instanzticket. Es bindet Roster, Quellrevision, Katalog,
persistierten kanonischen Weltzustand, Region, Dungeonvariante und Raumplan.
Zusätzlich zum vorhandenen FNV-Welthash wird der gesamte Weltsnapshot mit
SHA-256 gebunden. Fehlende oder widersprüchliche Belege verhindern den Eintritt.

## Gemeinsamer Zustand und Wiederaufnahme

Die fünf neuen InnoDB-Tabellen aus Migration `0032_aurion_group_instances`
speichern Koordination, Spielerzustand, Party, Ticket und Befehlsquittungen.
Ein gemeinsamer Datenbank-Zeilenlock serialisiert Mutationen auch über mehrere
Serverprozesse. Jeder Befehl ist an den angemeldeten Spieler und seine erwartete
Revision gebunden. Eine identische Wiederholung liefert dieselbe gespeicherte
Quittung; ein anderer Befehl auf derselben verbrauchten Revision wird abgelehnt.

`/groups` und der Gruppenknopf im Welt-HUD zeigen dasselbe validierte Readmodel.
Fünf echte Sitzungen teilen Boss-LP, Spieler-LP, Instanzrevision und Ticket.
Ein akzeptierter Angriff oder eine Heilung löst einen deterministischen
Austausch aus. Die operative Zulassung begrenzt die Gruppe auf einen Austausch
pro Sekunde; die Uhr fließt nicht in Schadens- oder Heilwerte ein.
Der Raumplan wird als Übersicht dargestellt, nicht als neue 3D-Kampfszene.

„Instanz verlassen, Platz behalten“ ermöglicht den Wiedereintritt mit demselben
Ticket. „Gruppe verlassen“ beendet die Fünfergruppe für alle Mitglieder und
erfordert eine gesonderte Bestätigung mit dieser ausdrücklichen Folge.
Nach einem Wechsel der Serverrevision ist nur Auflösen und erneutes Suchen
möglich; ein Ticket der vorherigen Revision wird nicht weiter ausgeführt.

## Umfang und verbleibende Arbeit

Alle vier Katalog-Dungeons und Varianten können eine Gruppe und den ersten
Instanzabschnitt erzeugen. Der erste Abschnitt verwendet bewusst das bestehende
normierte Stufe-1-Referenzbudget aus dem Regionen-/Dungeonresolver. Es handelt
sich nicht um behauptete, vom Spieler erworbene Meisterschaft. Weitere Etagen,
individuelle Gruppen-Mastery, Questanschluss, Beute und Gruppenbelohnungen sind
noch nicht integriert. Ticket und Oberfläche weisen diesen Zustand ausdrücklich
aus; der Gruppenpfad vergibt keine EP, Gegenstände oder Questfortschritte.
**AIM-259 bleibt deshalb insgesamt offen.**

Die -ax1-Timergruppe, simulierte Mitspielernamen, zufällige Partywerte und
clientseitige Belohnungscallbacks wurden nicht übernommen. Die vorhandene
native Zweiergruppe wird nicht umgeschrieben.

## Reproduzierbarer Nachweis

Der Workflow `AIM 259 real group instance regression` checkt exakt den
Pull-Request-Head aus. Er bindet Buildmanifest, `/healthz`, Ticket und
Browsernachweis an dieselbe 40-stellige Revision. Die isolierte MariaDB erhält
die vollständige Migrationskette und anschließend einen physischen
Schema-Abgleich. Die Welt wird für den HTTP-Lauf über den kanonischen
Welt-Epochenresolver persistiert.

- Regeltests prüfen alle 576 Kombinationen von Rollenbeständen, FIFO,
  Skill-/Waffenunabhängigkeit, Ticketintegrität und widersprüchliche Readmodels.
- MariaDB-Regressionen prüfen konkurrierendes Matching und Ready, doppelte
  Befehle, fremde Tickets, Qualifikationswechsel, Ablauf, SQL-Fehler mit Rollback,
  Wiedereintritt sowie tatsächlichen gemeinsamen Schaden und Heilung.
- UI-Regressionen prüfen unbestätigte Qualifikation, Doppelklicks,
  verlorene Antworten und fremde oder nicht verfügbare Readmodels.
- Browsertests registrieren je fünf echte Konten auf Phone, Tablet und Desktop,
  bedienen die Oberfläche und vergleichen das Ticket unabhängig mit den
  Datenbankbytes. Ein Heiler mit Speer demonstriert die Waffenunabhängigkeit.

Das Artefakt `aim259-group-evidence-<head-sha>` enthält JSON-Belege und
Screenshots. Die Belege kennzeichnen ausdrücklich
`runtime: isolated-real-http-mariadb` und `production: false`.
Ein grüner Kandidatenlauf ersetzt keinen Produktionsnachweis nach einer
späteren freigegebenen Migration und Bereitstellung.

Wolfram war während dieser Fortsetzung mit HTTP 404 nicht erreichbar; die
Rollenrechnung wird deshalb als lokale exhaustive Regression ausgewiesen.
Die Amplitude-Suche ergab keine passenden Aurion-/Dungeon-/Queue-/Party-Events;
es wird kein Analytics-Nachweis behauptet.
