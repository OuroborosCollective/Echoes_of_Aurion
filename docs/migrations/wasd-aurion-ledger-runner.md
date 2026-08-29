# WASD → Aurion Migrations-Ledger-Runner

## Zweck

`.github/workflows/aurion-wasd-migration-ledger.yml` verbindet beide Repositories über einen revisionsgepinnten, wiederverwendbaren GitHub-Workflow. WASD erstellt einen Hash-only Quellen-Ledger; Aurion verifiziert ihn an derselben aufgelösten Commit-Revision und erzeugt daraus einen eigenen Plan-/Receipt-Hash.

## Automatische Phasen

| Phase | Ergebnis | Schreibrecht |
| --- | --- | --- |
| WASD-Quelleninventar | Hashes von relevanten `server/src`-Quellen und Domänenzählung | keines |
| Aurion-Zielinventar | Hashes der Migrationen `0021`–`0027` und Journalstatus | keines |
| Plan/Receipt | revisionsgebundener `planSha256` als Artefakt | keines |

Die Schleife läuft alle sechs Stunden und kann mit `workflow_dispatch` auf eine konkrete WASD-Revision gerichtet werden. Der Controller verwendet anschließend ausschließlich die vom WASD-Workflow zurückgelieferte 40-stellige Revision, nie einen beweglichen Quellbranch.

Der Controller führt dabei keinen Builder aus der zu inventarisierenden Quellrevision aus. Er checkt den WASD-Ledger-Builder separat auf die geprüfte Commit-Revision `e39ee9b6c085a1a02e5feb898532ad0e3085c30a` aus, erzeugt den Quellledger damit erneut und vergleicht dessen Manifest-Hash mit dem Output des wiederverwendbaren Workflows. Die Quellrevision wird daher nur als zu hashende Eingabe behandelt.

## Explizite Apply-Grenze

Der Runner hat keine Datenbankverbindung, kein Deploy-Recht und keinen Codepfad für Schema- oder Datenmutationen. Diese Schritte bleiben blockiert:

- `schema_apply`
- `data_backfill`
- `journal_repair`
- `production_deploy`

Eine spätere Produktivmaßnahme braucht einen frischen root-autorisierten Schema-Readback, Backup-/Recovery-Evidenz und eine ausdrückliche Freigabe des konkreten `planSha256`. Ein vorhandener Workflow-Erfolg ist kein Produktionsmigrationsnachweis.

## Nachweis

Die Workflow-Artefakte enthalten nur Quell-, Ziel- und Planhashes sowie keine Zugangsdaten. Hex, Datenbanken, Container und die öffentliche Laufzeit werden von dieser Schleife nicht abgefragt oder verändert.
