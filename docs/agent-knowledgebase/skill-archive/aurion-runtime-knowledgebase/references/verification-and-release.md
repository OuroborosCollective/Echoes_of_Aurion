# Verifikation und Release

## Vor jeder Änderung

Arbeitsbaum, Branch, Remote und Zielrepository prüfen. Produktionsbranch nicht als Experiment verwenden. Für neue Arbeit einen Kandidatenbranch mit nachvollziehbarem Basiscommit anlegen.

## Prüfklassen

| Bereich | Mindestnachweis |
|---|---|
| TypeScript | `pnpm check` oder projektäquivalente Typprüfung |
| Unit-/Contracttests | Betroffene Vitest-Suites, insbesondere Shared-Verträge und Eventvalidatoren |
| Runtime | Browser-/Canvas-/Babylon-Smoke-Test, falls UI oder Szene geändert wurde |
| WebGL | Phone/Tablet/Desktop-Readback; Headless-Compositorgrenzen explizit notieren |
| Datenbank | Isolierte MariaDB-E2E für Concurrency, Replay, Lease, Presence, Epoch und Receipts |
| Audio | Decode, Format, Dauer, Hash und Autoplay-/Fallbackverhalten |
| Repository | `git diff --check`, sauberer Arbeitsbaum, Commit-/PR-Referenz |
| Produktsteuerung | Linear-Evidenzkommentar mit Revision, Testresultat und offenen Grenzen |

## GitHub- und Linear-Evidenz

Jeder PR braucht Basisrevision, Ziel, geänderte Verträge, Testnachweise und Produktionsgrenze. Linear-Kommentare müssen reale Evidenz referenzieren; keine behaupteten Tests oder erfundenen Readbacks. Draft-PRs bleiben Draft, bis Reviewkriterien erfüllt sind.

## Deploymentgrenze

Mergen, Deployen und Liveschalten sind getrennte Entscheidungen. Eine Datei oder ein PR in `main` ist nicht automatisch ein aktiviertes Produktionsasset. Assetledger-Status, Browser-Decode und Releaseentscheidung getrennt führen.

## Fehlerberichte

Bei einem Fehler zuerst Ursache, betroffenen Scope und sicheren Rückkehrpunkt dokumentieren. Keine destruktive Reparatur ohne Backup oder revertierbaren Commit. Headless-Tests nicht als Beweis für reale mobile Audio-/GPU-Wiedergabe überinterpretieren.
