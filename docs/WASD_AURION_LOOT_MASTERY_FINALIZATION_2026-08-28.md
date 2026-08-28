# Aurion–WASD Loot-/Mastery-Finalisierung

## Ziel und Quellenbindung

Dieser Kandidat überführt ausschließlich geprüfte Spielsemantik aus dem referenzierten Aurion–WASD-Arbeitsstand in **Echoes of Aurion**. Die Runtime bleibt Aurion; es wurden keine Wasd-Runtimeverzeichnisse kopiert, keine MapleStory-Worlds-/Lua-Anteile übernommen und keine Produktionsmigration ausgeführt.

| Quelle | Revision / Status |
| --- | --- |
| Echoes of Aurion Basis | `a80bed3a91aa333ed2290f7476a5a1302ee61b01` (`origin/main`) |
| Wasd Auditquelle | `a4d99432e47b82ce98105eadb30360cd8040ad13` (`origin/main`) |
| Neue Datenmigration | `drizzle/0025_aurion_loot_mastery_ethos.sql`, nur als Datei vorbereitet |
| VPS-Readback | Host `srv1491137.hstgr.cloud`, Kernel `5.15.0-187-generic`, read-only Preflight erfolgreich |

## Implementierter Schnitt

Die Ergänzung umfasst versionierte Loot-Katalogdaten, deterministische V2-Lootauflösung, receiptgebundene Iteminstanzen, exakte Meisterschaftsfortschreibung und begrenzte Ethos-Readmodels. Die Datenbankzugriffe validieren Benutzer-, Encounter-Receipt-, Seed-, Versions- und Idempotenzbindungen serverseitig. Der Client erhält dadurch ausschließlich bestätigte Readmodelle; er autorisiert weder Loot noch Fortschritt.

Die Migration definiert Katalog-, Ausrüstungs-, Meisterschafts-, Ethos-, Loot-Receipt- und Iteminstanz-Tabellen additiv. Die Migration wurde **nicht** auf dem VPS angewendet. Eine Anwendung oder ein Ledger-Backfill erfordert einen separaten, ausdrücklichen Releaseauftrag.

## Prüfungen

| Prüfung | Ergebnis |
| --- | --- |
| Neue Loot-/Mastery-Unit- und Guard-Tests | 13 bestanden, 3 erwartungsgemäß übersprungen |
| Vollständige Vitest-Suite | 58 Testdateien bestanden, 11 übersprungen; 206 Tests bestanden, 22 übersprungen |
| TypeScript | `pnpm check` erfolgreich |
| Diff-Whitespace | `git diff --check` erfolgreich |
| VPS-Verbindung | Paramiko-Verbindung mit Host-Key-Prüfung erfolgreich |
| VPS-Aktion | Nur `hostname`, `id`, Kernel-, Container- und Checkout-Inventur; keine Mutation |

Die beiden datenbankabhängigen E2E-Suiten bleiben ohne explizite isolierte Testdatenbank übersprungen. Das ist ein offener Nachweis, keine Behauptung einer Produktionsabnahme.

## Releasegrenzen

Es wurde weder eine Produktionsdatenbank verändert noch ein Container neu gestartet, ein Deployment ausgelöst oder ein bestehender PR gemerged. Der nächste sichere Schritt ist ein Kandidatencommit auf einem neuen Branch, anschließend ein **Draft-PR** gegen `main`. Vor jeder produktiven Migration muss eine konkrete Freigabe für genau diese Migration und Zielumgebung vorliegen.

## Sicherheitsnachweis

Das vom Nutzer übermittelte Passwort wurde nicht in Repositorydateien, Skripten, Logs oder diesen Bericht geschrieben. Aus Sicherheitsgründen sollte das Passwort nach Abschluss des Zugriffs rotiert werden, da es im Chat übermittelt wurde.
