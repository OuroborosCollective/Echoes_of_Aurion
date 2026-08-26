# Aurion–Wasd: OIDC-Fortsetzungsplan

## Quellenbindung und Grenze

| Gegenstand | Revision | Status |
| --- | --- | --- |
| Wasd-Quellbaukasten | `a4d99432e47b82ce98105eadb30360cd8040ad13` | Read-only auditierte Quelle. |
| Echoes-of-Aurion-Runtimeziel | `d617d0b1333fc7128b91fe11328cbd011334b490` | Ausgangspunkt des Kandidatenbranches `aurion/fusionauth-oidc-adapter`. |
| Assetinventur | 149 Wasd-GLB-Kandidaten, 0 Aurion-GLBs | Kein Kandidat wird durch dieses OIDC-Vorhaben kopiert oder aktiviert. |

> **Scope:** Dieser Kandidat ergänzt ausschließlich eine serverautorisierte, PKCE-gebundene OIDC-Authentifizierung. Der vorhandene lokale Aurion-Login bleibt als separater, bestehender Pfad erhalten. Es erfolgen weder Spielregel-, Progressions-, Loot-, Asset- noch Datenbankmigrationen.

## Aufgabenliste

| Prüfschritt | Nachweisziel | Status |
| --- | --- | --- |
| Audit | Revisionsbindung, OIDC-Discovery und VPS-Laufzeitbefund dokumentiert. | `DONE` |
| Verträge | OIDC-Konfiguration, PKCE/State/Nonce, Callback und User-Claims als reine, testbare Verträge festlegen. | `DONE` — `server/_core/oidcProtocol.ts` plus sechs Vertragsvektoren. |
| Datenpfad | Externe Identität stabil an bestehendes Aurion-`openId` binden, ohne parallele Persistenz. | `DONE` — SHA-256 über `(issuer, subject)` in die bestehende `users.openId`-Quelle. |
| Client | Login nur über serverseitig konfigurierte Start-Route auslösen; keine Client-Secrets. | `DONE` — gleichoriginäre Navigation zu `/api/oauth/start`; lokale Anmeldung bleibt erhalten. |
| Assets | Keine Assetänderung; GLB-Katalog bleibt unverändert. | `NOT_APPLICABLE` |
| Tests | Negative, PKCE-, State-, Nonce-, Claim- und Wiederholungstests ausführen. | `DONE` — TypeScriptprüfung, sechs OIDC-Vertragstests und vollständige Testsuite bestanden. |
| Readback | OIDC-Discovery lokal sowie nach späterer Freigabe Browser-Callback und Sitzungsreadback prüfen. | `BLOCKED` — dedizierter FusionAuth-Client, gültiges TLS und produktive Runtime fehlen noch. |
| Release | Kandidatenbranch, isolierter Commit, Push und Draft-PR; kein Merge, keine Produktion ohne ausdrückliche Freigabe. | `DONE` — Draft-PR #55, lokaler/Remote-/PR-Head vor Dokumentationsupdate identisch auf `cb69702be6de8226881972dea4e8b30d12cd310f`; keine erforderliche CI ausgeführt. |

## 12-Domänen-Abdeckungsmatrix

Die folgenden Zeilen erfassen den Fortsetzungsstand. `Nicht berührt` bedeutet nicht, dass eine Domäne vollständig migriert wäre; sie wird durch diese OIDC-Scheibe weder erweitert noch als abgeschlossen behauptet.

| Nr. | Domäne | Übernahmestatus | Evidenz dieses Kandidaten | Rückkehrpunkt |
| --- | --- | --- | --- | --- |
| 1 | Deterministische Weltregeln | `ADAPT_TO_AURION` | Bestehender Vertikalschnitt; nicht durch OIDC geändert. | Branch verwerfen. |
| 2 | Regionen, Chunks, Siedlungen und Länder | `ADAPT_TO_AURION` | Bestehender Vertikalschnitt; nicht durch OIDC geändert. | Branch verwerfen. |
| 3 | Umwelt- und Ereignisreaktionen | `ADAPT_TO_AURION` | Bestehender Vertikalschnitt; nicht durch OIDC geändert. | Branch verwerfen. |
| 4 | Charakter-, Waffen-, Skill- und Levelprogression | `ADAPT_TO_AURION` | Bestehender Vertikalschnitt; OIDC darf nur bestätigte Nutzeridentität liefern. | Branch verwerfen. |
| 5 | Quests und Weltaufgaben | `ADOPT_AS_DATA` | Bestehender Vertikalschnitt; OIDC nimmt keine Questmutation vor. | Branch verwerfen. |
| 6 | Loot, Affixe, Sets und Iteminstanzen | `ADOPT_AS_DATA` | Bestehender Vertikalschnitt; OIDC nimmt keine Lootmutation vor. | Branch verwerfen. |
| 7 | NPC-Gedächtnis, Bedürfnisse und autonomes Brain | `ADAPT_TO_AURION` | Bestehender Vertikalschnitt; OIDC nimmt keine NPC-Mutation vor. | Branch verwerfen. |
| 8 | Fraktionen, Regierungen, Königreiche, Diplomatie und Kriege | `ADAPT_TO_AURION` | Bestehender Vertikalschnitt; nicht durch OIDC geändert. | Branch verwerfen. |
| 9 | Lore, Content, Expeditionen, Gilden und Ereignisfolgen | `ADOPT_AS_DATA` | Bestehender Vertikalschnitt; nicht durch OIDC geändert. | Branch verwerfen. |
| 10 | Sprachkern, Dialekte und NPC-Verständnis | `ADAPT_TO_AURION` | Bestehender Vertikalschnitt; OIDC nimmt keine Sprach- oder NPC-Entscheidung vor. | Branch verwerfen. |
| 11 | GLB-Modelle, Charakterteile, Waffen und Featureassets | `BLOCKED` | 149 Kandidaten auditert, aber Rechte-, Budget- und Szenenreadback noch offen. | Keine Aktivierung. |
| 12 | Persistenz, Integrität und Evidenz | `ADAPT_TO_AURION` | OIDC nutzt bestehende Nutzerquelle; keine Migration; Candidate-Tests und Readback stehen aus. | Branch verwerfen. |

## Freigabegrenzen

Die sichtbaren FusionAuth-Geheimnisse aus Referenzscreenshots werden nicht wiederverwendet. Die spätere FusionAuth-Client-Registrierung erhält eine neue, dedizierte Client-ID, einen neuen Secret-Wert, PKCE `S256` und genau den Callback `https://arelogic.space/api/oauth/callback`. Das Erstellen oder Ändern dieser Registrierung, TLS-Korrekturen, Push, Draft-PR, Merge und Deployment verlangen jeweils eine konkrete Freigabe im passenden Schritt.
