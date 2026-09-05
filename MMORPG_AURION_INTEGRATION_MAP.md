# Echoes of Aurion — modulare MMORPG-Integration

> **Status:** Kandidatenbranch `aurion/mmorpg-modular-integration` auf GitHub-Main `c44b923bf3c55a5147db68db63307ece1625c793`. Dieses Dokument ist ein Migrationsvertrag, kein Laufzeitnachweis.

## Zielbild

Die bestehende Repository-Struktur bleibt die Basis. Aurion wird als **additive MMORPG-Schicht** integriert: Der Server bleibt alleinige Quelle für Queststatus, Begegnungsstart, Skill-XP, Skillstufen, Loot und Weltsnapshots. Babylon.js visualisiert lediglich bestätigte Zustände. Das gekoppelte LLM sendet ausschließlich erlaubte MCP-Befehle; es erhält weder Datenbank- noch Administrationsschreibrechte.

Jede Fähigkeit führt eigene, exakte XP. Der Server leitet ihre Stufe aus einer ansteigenden, cap-freien Kurve ab. Klassen und eine globale Charakterstufe existieren nicht.

| Bereich                    | Bestehende GitHub-Fläche                                 | Additiver Aurion-Beitrag                                                            | Migrationsregel                                                                   |
| -------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Authentifizierung und tRPC | `server/_core/`, `server/routers.ts`                     | Geschützte Gameplay- und Open-World-Prozeduren                                      | Vorhandene Autorisierung beibehalten; neue Routen nur über geschützte Verfahren   |
| Persistenz                 | `drizzle/schema.ts`, `drizzle/0000–0012`                 | Questfortschritt, Spielsitzungen, Aktionsquittungen, Ausrüstung und Welt-Readmodell | Ausschließlich additive Migration `0013`; keine Tabellenlöschung oder Umbenennung |
| Koop-Gateway               | `server/gateway*.ts`                                     | Sequenzgebundene MCP-Kommandos sowie `F`/`E`/`WASD`/`1–9`                           | Tokenprüfung und Audit bleiben serverseitig; keine Browser-Bypässe                |
| Welt und Kampf             | `client/src/game/scene.ts`, `server/gameplayProtocol.ts` | Turm-zu-Expanse, Questbegegnungen, Dungeonzugang und autoritative Schadensantworten | Keine XP-, Loot- oder Siegmutation im Canvas                                      |
| Genkit und Content         | bestehende LLM-Infrastruktur                             | `liveDeveloperProtocol.ts`, `liveDeveloperGenkit.ts`                                | Ausschließlich reviewbare Vorschläge; keine schreibenden Werkzeuge                |
| Remote-Supabase-Pfad       | `server/supabase/1`                                      | Keine Übernahme oder Löschung ohne nachgewiesene Verwendung                         | Pfad bleibt unverändert und ist aus der Aurion-Migration ausgeschlossen           |

## Integrationsschnitte

Die Zusammenführung folgt einer Abhängigkeitsreihenfolge. Jeder Schnitt bleibt testbar, bevor der nächste beginnt.

| Schnitt                | Dateien oder Flächen                                                            | Ergebnis                                                                                       | Schutzgrenze                                     |
| ---------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| A — reine Verträge     | `server/gameplayProtocol.ts`, `server/openWorldProtocol.ts`, Tests              | Kanonische Quests, Begegnungen, Welt-Readmodell und mobile Budgets                             | Noch keine Router- oder Datenbankmutation        |
| B — additive Daten     | `drizzle/schema.ts`, `drizzle/0013_*`, `server/db.ts`                           | Nutzergebundene Quest- und Spielsitzungsdaten                                                  | Bestehende Migrationshistorie bleibt append-only |
| C — geschützte Dienste | `server/routers.ts`, `server/gatewayProtocol.ts`                                | Autorisierte Start-, Aktions- und Snapshotrouten                                               | Keine direkte Clientdatenbankverbindung          |
| D — Clientadapter      | `client/src/pages/Home.tsx`, `client/src/game/scene.ts`, `client/src/index.css` | Anzeige bestätigter Zustände, NPC-Interaktion, Turmaustritt und kontrollierter Begegnungsstart | Canvas bleibt rein darstellend                   |
| E — Contentvorschläge  | `server/liveDeveloper*.ts`, `client/src/pages/Operations.tsx`                   | Auditierbare Genkit-Vorschläge                                                                 | Kein LLM-Commit, kein direkter Asset-/DB-Write   |

## MMORPG-Autoritätsmodell

Der Spieler oder sein autorisierter LLM-Partner kann Absichten über den bestehenden Kommandokanal äußern. Der Server validiert dabei Sitzungsstatus, strikte Sequenz, freigegebene Aktion, Questvoraussetzung, Begegnungsphase und idempotente Ergebnisbindung. Erst danach liefert er einen neuen Fortschritts- oder Weltsnapshot. Der Client kann darstellend animieren, aber keinen Fortschritt festlegen.

```
MCP/Touch → geschützte Route → Sitzungs-/Questprüfung → atomare Mutation oder Read-Snapshot
        → autoritative Antwort → Babylon/React-Visualisierung
```

## Ausschlüsse dieses Kandidatenbranches

Der Kandidatenbranch enthält weder Secrets noch Live-Provider-Credentials. Er ersetzt nicht den getrennten ATO-MCP-Endpunkt, erzeugt keine künstlichen Spieleritems und führt keine produktive Datenmigration oder Main-Merge aus. Eine Veröffentlichung benötigt separate exakte Checks und eine explizite Freigabe.
