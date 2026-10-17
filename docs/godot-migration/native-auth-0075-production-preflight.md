# G09.A.DB — Produktionsmigration 0075: geprüfte Freigabe, noch kein Apply

Status: **OWNER APPROVED / TECHNICAL PREFLIGHT BLOCKED** (2026-10-17).

Die ausdrückliche Owner-Freigabe für die produktive Native-Auth-Migration 0075 liegt vor. Sie ersetzt keine SHA-gebundene Migrationsidentität, kein reales Backup mit Restore-Test und keinen Datenbank-Readback.

## Ausgangszustand und verbindliche Eingänge

- Ausgangs-SHA: `cc80589ae9a29336a6508468fac017fd45fcf5b1`.
- Kanonischer Schema-Kandidat: `fixtures/native-auth/0075_native_auth_candidate.sql` (vier additive Tabellen).
- Derzeitige produktive Wave: `aurion-production-0021-0074`; letzte Journalmigration `0074_aurion_stat_allocation_receipts`.
- `drizzle/nativeAuthSchema.ts` und `server/nativeAuthPersistence.ts` legen die tatsächlichen Spalten-/Sitzungsverträge fest. Kein neues Autoritätssystem.
- Vorhandener Produktionspfad: `aurion-production-schema-apply.yml` mit exakter Artifact-/OIDC-Bindung sowie `deploy/aurion-production-schema-apply-core` für Backup, isolierten Restore, Apply und Postflight.
- Fehlgeschlagene Deployments 39008189025 und 39005720101: Der Probe-Endpoint `/api/production-probe/bootstrap-status` antwortete `200 text/html` statt `application/json`; fehlende produktive Kontrollfläche wurde korrekt nicht als Erfolg klassifiziert. Lauf 39009163413 war beim Readback noch aktiv.

## Erforderlicher, fail-closed Release-Schritt

1. Vollständige additive `drizzle/0075_aurion_native_auth_sessions.sql` exakt aus der geprüften DDL integrieren. Neue versionierte Produktions-Wave und Journal-Eintrag müssen mit sämtlichen expliziten Listen in Apply, Reconcile, Artifact, Dispatch, Tests und Beleg-Verifikation übereinstimmen.
2. Den isolierten MariaDB-11.4-Testpfad aktualisieren: einmaliges Erzeugen des Schemas **entweder** regulär über Journalmigration **oder** Testfixture, niemals beides; die frühere Guard-Datei darf nicht abgeschwächt werden, sondern muss die neue sichere Betriebsart belegen.
3. SQL-Hash/SHA sowie echte Index-/Spalten- und Nonnull-Readbacks aus `information_schema` erheben. MariaDB-Restore-Rehearsal auf einer separaten Datenbank und Schema-Abgleich auf exakt demselben Commit; keine Mocks oder synthetischen Success-Receipts.
4. Laufende Deployment-Probe kausal reparieren, nicht per Skip/HTML-Fallback. Produktionsdatabase/Container-Identity, Schemazustand, freie Backupkapazität, Schreibsperren und Backup-/Restore-Receipts verifizieren.
5. Ausschließlich das neu versionierte, erneut SHA-gebundene Apply-Artefakt durch den vorhandenen GitHub-OIDC/production-Environment-Runner anwenden. Schema-Postflight, Ledger/Journal-Readback und Health auf tatsächlicher Live-DB unabhängig bestätigen. Keine Behauptung atomaren DDL-Rollbacks.
6. Browser-Auth- und native Refresh-Routen bleiben bis zur späteren G09.B-Freigabe weiter `503 NATIVE_AUTH_CONFIGURATION_UNAVAILABLE`.

## Aktueller Befund

Die Owner-Freigabe ist **nicht** der Blocker. Der aktuelle Dispatcher und die vollständigen Vertragslisten akzeptieren noch keine Migration 0075. Ohne deren Revision wäre jede direkte Live-SQL-Ausführung außerhalb des kanonischen Evidence-Pfades; deshalb ist noch keine produktive DDL ausgeführt worden.

Dieses Dokument ist ein prüfbarer Vorbereitungs-Checkpoint, **kein** Test- oder Live-Migrationsreceipt. Es enthält keine Zugangsdaten.
