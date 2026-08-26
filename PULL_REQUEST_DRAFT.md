# feat: Aurion–Wasd-Vertikalschnitt für Welt, NPCs und Fortschritt

## Zusammenfassung

Additive Integration der geprüften Welt-, NPC-, Loot- und Fortschrittsverträge; die 149 Wasd-GLB-Pfade sind nach ausdrücklicher Freigabe des Eigentümers dessen rechtliches, geistiges und künstlerisches Eigentum und dürfen für Aurion verwendet werden.

## Ziel dieses Checkpoints

Dieser Draft-PR dokumentiert einen **revisionsgebundenen Integrationscheckpoint**, nicht fälschlich die vollständige Übernahme jeder Wasd-Funktion. Er erweitert Echoes of Aurion additiv; er erstellt keine MSW-/Lua-Portierung und übernimmt keine feste Wasd-Tickpflicht. Alle Spielmutationen bleiben an Aurions bestätigte Quest-, Begegnungs-, Fortschritts- und Receiptpfade gebunden.

## Integrierte Aurion-Gameplay-Scheibe

| Bereich | Umsetzung |
| --- | --- |
| Deterministische Welt | Versionierter `worldSeed`, `resolutionIndex`, Signalauflösung, Wetter-/Dialogton und Readmodell |
| Quests, Loot und Fortschritt | Bestätigter Questabschluss → idempotenter Ergebnisreceipt → deterministischer Loot → Waffenfortschritt |
| NPCs | Begrenzte Needs, reproduzierbare Zielentscheidung, Speicherreadmodell, Dialekt-ID und Schwellenwert für Verständnis |
| Politik und Weltreaktion | Asterion-Polity als deterministisches Readmodell; Kriegs-/Politiksignale bleiben regelgebunden und nicht klientenautoritär |
| Persistenz | Additiv: Weltauflösungen, NPC-Zustände, Entscheidungsevidenz, Polityreadmodelle und Dialogreceipts |
| Client | Sichtbare Weltreaktion, Polity, NPC-Ziel, Sicherheitswert, Dialektprofil, geschützter Dialogdeutungspfad sowie Katalogstatus |
| Zivilisation, Ökonomie und Handwerk | Deterministische Siedlungsauflösung, Marktpreise, Knappheitsprognose, Karawanenmissionen, Crafting, Gildenterritorium und aggressionsbasierte Weltgefahr |
| Expedition, Kampf und Magie | Seedgebundene Raumlayouts und Monster, receiptgebundene Kampfvorschau, wetterabhängige Zauberpotenz sowie begrenzte Reiseresolution |
| Gesellschaft | Versionierte Alterung, Beziehungen, Familie, Erfolge sowie Partyführung, Kapazitäts- und Übergaberegeln |
| Stewardship und Gegenstände | Tickfreie Farming-/Bau-/Haus-/Glaubens-/Tor-/Belagerungsreadmodelle sowie Stapel, Traglast und Bindungs-/Handelsrestriktionen |
| ARE-Weltkern und Siedlungsform | Kappa-geprüfte Weltintegrität und deterministischer Siedlungs-Layoutcompiler als sichtbare Readmodelle |
| AI-Vorschlagsgrenze | Receipt- und indexgebundene NPC-/Schwarmvorschläge; Health-/Diagnosefälle führen niemals Befehle aus oder umgehen Aurions Autoritätsgrenze |
| Exakte Skillprogression | Cap-freie, String-exakte ARE-Progressionskurve für Kampf, Sammeln und Crafting als bestätigtes Questreceipt-Readmodel; ohne neue Persistenz- oder Belohnungsautorität |
| Hostinger-Traefik-Vorbereitung | Additives Dockerfile und `docker-compose.traefik.yml` mit internem Port 3000, `websecure`-/Let’s-Encrypt-Labels, externem `traefik-proxy`-Netzwerk, `/healthz`, sicherem Proxy-Hop und strikt gebundenem Containerport; nicht auf den VPS ausgerollt |

## Vollständige Wasd-Inventur und Quellenbindung

Die breite, funktionsorientierte Inventur der Wasd-Revision `a4d99432e47b82ce98105eadb30360cd8040ad13` enthält **906 Gameplay-/Weltmodule**. Davon sind **712** als Aurion-adaptierbare Funktionsmodule im versionsgebundenen Aurion-Quellkatalog verfügbar, **15** sind bewusst ausgeschlossen (feste Tick-/Watchdog- und nicht passende Betriebslogik) und **179** bleiben Infrastruktur-/Referenzmodule. Der Katalog ist ein überprüfbares Readmodell; er ist kein falscher Beweis, dass alle 712 Semantiken bereits als einzelne Spielerfunktionen implementiert sind.

## Wasd-GLB-Assets

| Eigenschaft | Befund |
| --- | ---: |
| Inventarisierte Pfade | 149 |
| Strukturell valide GLB-2.0-Container | 149 |
| Eindeutige SHA-256-Assets | 72 |
| Duplikatpfade | 77 |
| Eindeutige Größe | 599.243.337 Bytes |
| Sofort streambare Kandidaten | 38 |
| LOD-/Performance-Review erforderlich | 28 |
| Parser-Review erforderlich | 6 |

Die Eigentums- und Nutzungsfreigabe ist dokumentiert. Der Katalog verwendet revisionsgebundene, CORS-erreichbare Quell-URLs und aktiviert LOD-/Parser-Reviewkandidaten nicht automatisch. Der kleine Brunnenkandidat `wasd_d043b07bc436ceb2` wurde als `INACTIVE` für `emberfall_settlement_water_source` katalogisiert (1.911.884 Bytes, 10.450 Dreiecke); sein lokaler opt-in Babylonreadback meldete `Arena-GLB failed`, sodass keine Aktivierung oder Produktionszuordnung erfolgt ist. Eine kopierbasierte Übernahme von 599 MB in das Git-Repository ist absichtlich nicht Bestandteil dieses Checkpoints.

## Migrationen

Die Migrationen `0016_wasd_aurion_world.sql` und `0017_wasd_aurion_content_seed.sql` sind additiv und im Drizzle-Journal registriert. Sie wurden **nicht** gegen eine Produktionsdatenbank ausgeführt. Vor Release sind Backup, Migrations-Readback und Schemaabgleich erforderlich.

## Nachweise

| Prüfung | Ergebnis |
| --- | --- |
| TypeScript | bestanden |
| Vollständige Testausführung | 116 bestanden, 7 umgebungsbedingt übersprungen |
| Modulquellkatalog | 712 adaptierbare Module, revisionsgebunden getestet |
| GLB-2.0-Einzelprüfung | 149/149 gültig |
| GLB-Detailinventur | 72 eindeutige Assets, Budgets und Rollen katalogisiert |
| Anonyme Browseransicht | Aurion-Startansicht geladen; opt-in Brunnenreadback meldet fehlgeschlagen und hält den Kandidaten inaktiv |
| Zusätzliche Adaptertests | Zivilisation/Knappheit 7, Expedition/Kampf/Magie/Reise 5, Gesellschaft/Party 5, Stewardship 4, Gegenstände 2, Weltintegrität/Siedlungsform 2, AI-Vorschläge 3, exakte Skillprogression 4 sowie inaktive GLB-Szenenkatalogisierung 1 bestanden |
| Produktionsbuild | bestanden: `pnpm build:sandbox` mit `NODE_OPTIONS=--max-old-space-size=1536` und 300-Sekunden-Zeitbudget; nach Traefik-Vorbereitung erneut erfolgreich (Vite 46,55 s) |

Die übersprungenen Tests benötigen lokale OAuth-/Datenbank-/Zoneninfrastruktur. Der frühere `SIGTERM`-Befund wurde als zu knappes Ausführungszeitbudget eingegrenzt: Der Vite-Build benötigt hier rund 46 Sekunden und ist mit mindestens 120 Sekunden, für Diagnosen 300 Sekunden, sowie dem verifizierten `pnpm build:sandbox` reproduzierbar. Die Umami-Placeholder- und Babylon-Chunkwarnungen bleiben sichtbar, sind aber keine Buildfehler. Der erfolgreiche Build ersetzt weder die übersprungenen E2E-Tests noch Review, Merge- oder Releasefreigabe.

## Nicht enthalten / weitere Integrationspakete

Die vollständige Implementierung aller 712 adaptierbaren Wasd-Semantiken ist nach diesem Checkpoint noch offen. Die nächsten Pakete folgen der vorhandenen Migrationsmatrix pro Domäne (tieferes Charakter-/Skill- und Kampfruleset, Weltgenerator/Biome/Spawns, Lore-/Content-Importe, kontrollierte Dialoge sowie weitere GLB-Szenenzuordnung nach erfolgreichem isolierten Babylonreadback) mit Zieladapter, Test und sichtbarem Spielerreadback. Globale Balancierung, Produktionsmigration, Deployment, MSW/Lua-Portierung und ein Merge nach `main` sind nicht Bestandteil dieses Draft-PR.

> Reviewende sollten zuerst `WASD_AURION_SEMANTICS.md`, `WASD_AURION_MIGRATION_MATRIX.md`, `WASD_BROAD_GAMEPLAY_MODULE_LEDGER.md`, `WASD_GLB_AUDIT.md`, `WASD_GLB_DETAIL_INVENTORY.md`, `guardian/wasd_aurion_browser_qa.md`, `guardian/wasd_aurion_glb_scene_preview_qa.md`, `guardian/vite_sigterm_diagnosis.md`, `TRAEFIK_DEPLOYMENT.md` und die beiden Additivmigrationen lesen.
