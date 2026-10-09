---
description: Prüfbare Traefik-Konfiguration für den kontrollierten Aurion-Containerbetrieb.
---

# Traefik Deployment

Aurion wird über revisionsgebundene Release-Artefakte und den kontrollierten GitHub-Workflow bereitgestellt. Traefik übernimmt TLS und Routing. Vor einer Runtime-Promotion müssen die unten beschriebenen Schema-, Backup-, Restore- und Attestationsprüfungen erfolgreich sein.

## Bereitgestellte Artefakte

| Datei                        | Zweck                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `Dockerfile`                 | Mehrstufiger Node-22-Produktionscontainer; Build, nichtprivilegierte Runtime, Port 3000 und `/healthz`-Healthcheck. |
| `docker-compose.traefik.yml` | Aurion-Dienst, Traefik-Labels und externes Proxy-Netzwerk.                                                          |
| `.env.traefik.example`       | Nicht geheime Domain-, Netzwerk-, Zertifikatsresolver- und Imagevariablen.                                          |
| `.dockerignore`              | Schließt lokale Abhängigkeiten, Artefakte, Logs und Umgebungsdateien aus dem Buildkontext aus.                      |

## Abgeleitete Traefik-Zuordnung

| Traefik-Anforderung | Aurion-Wert                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| Routername          | `aurion`                                                                                       |
| Domainregel         | `Host(arelogic.space)` — über `AURION_DOMAIN` konfigurierbar                                   |
| Entrypoint          | `websecure`                                                                                    |
| Zertifikatsresolver | `letsencrypt` — über `TRAEFIK_CERTRESOLVER` konfigurierbar                                     |
| Interner Dienstport | `3000`                                                                                         |
| Docker-Netzwerk     | `areloria_arelorian-network` — auf dem VPS vorhanden und über `TRAEFIK_NETWORK` konfigurierbar |
| Healthcheck         | `GET /healthz`                                                                                 |

Der Entrypoint `websecure` und der Resolver `letsencrypt` entsprechen der vorhandenen Hostinger-Traefik-Konfiguration. Der Read-only-VPS-Check bestätigte, dass Traefik im `host`-Netzwerk läuft und kein Netzwerk `traefik-proxy` existiert. Das vorhandene `areloria_arelorian-network` ist daher als Docker-Netzwerk für den Aurion-Container hinter dem Host-Netzwerk-Traefik vorgesehen. Vor einer Ausführung muss diese Zuordnung nochmals gegen die laufende Traefik-Installation geprüft werden.

## Erforderliche Geheimnisse

Erstelle auf dem VPS eine **nicht versionierte** Datei `.env.production`. Sie wird von Compose zur Runtime eingelesen und darf nicht in Git, Chat oder Compose-Labels stehen.

| Variable                                           | Zweck                                                                                    |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `JWT_SECRET`                                       | Signiert Aurion-Sitzungen; ein langer zufälliger Produktionswert.                        |
| `DATABASE_URL`                                     | Produktionsdatenbankverbindung, falls die authentifizierten Spielpfade aktiviert werden. |
| `OAUTH_SERVER_URL`                                 | Öffentliche OAuth-Serverbasis für Login- und Callback-Flows.                             |
| `VITE_APP_ID`                                      | Aurion-Anwendungskennung, falls vom OAuth-Flow verlangt.                                 |
| `OWNER_OPEN_ID`                                    | Optionaler Owner-/Admin-OpenID-Wert.                                                     |
| `BUILT_IN_FORGE_API_URL`, `BUILT_IN_FORGE_API_KEY` | Nur falls die zugehörigen serverseitigen Funktionen aktiviert werden.                    |

## Prüfung auf dem VPS

Führe diese Kontrollen zuerst **lesend** im Verzeichnis des geklonten Repositories aus:

```bash
docker network inspect areloria_arelorian-network
docker compose --env-file .env.traefik -f docker-compose.traefik.yml config
```

Die erste Ausgabe muss das existierende externe Areloria-Netzwerk bestätigen; Traefik selbst läuft auf diesem VPS im Host-Netzwerk und wird nicht als Mitglied eines Docker-Bridge-Netzwerks geführt. Die zweite Ausgabe muss insbesondere diese Werte zeigen: Router `aurion`, `websecure`, den korrekten Zertifikatsresolver, `Host(arelogic.space)` und `loadbalancer.server.port=3000`.

Build und Start auf Produktion erfolgen über den gated Release-Workflow. Die lesende Compose-Prüfung ersetzt weder dessen Schema-Gates noch die revisionsgebundenen Recovery-Nachweise.

## Proxy- und Anwendungssicherheit

Aurion bindet im Container an `0.0.0.0:3000`, veröffentlicht diesen Port aber nicht direkt auf dem Host: Nur das externe Traefik-Netzwerk erreicht ihn. Im Produktionsmodus vertraut Express standardmäßig exakt einem Proxy-Hop (`TRUST_PROXY_HOPS=1`), damit Traefiks `X-Forwarded-Proto` sichere Cookies korrekt auslöst. Falls sich zwischen Traefik und Aurion ein weiterer vertrauenswürdiger Reverse Proxy befindet, muss dieser Wert geprüft und ausdrücklich angepasst werden.

`STRICT_PORT=true` verhindert im Container den lokalen Entwicklungs-Fallback auf 3001–3019. Ein Portkonflikt wird damit sichtbar, statt Traefik unbemerkt auf einen falschen Port zu routen.

## Revisionsgebundene Schema-Reparatur

Der Produktionsworkflow führt die Schema-Prüfung und gegebenenfalls Reparatur vor dem Bau beziehungsweise Neustart des Anwendungscontainers auf dem VPS aus. Aurion bleibt die einzige Laufzeit- und Persistenzautorität. Historische Migrationstags werden nicht umbenannt oder als eigenständige Dienste aktiviert.

1. Der Memory-Recorder synchronisiert den einzelnen Integrationseintrag und dispatcht anschließend den Release-Workflow. Beide nutzen die gemeinsame Concurrency-Gruppe `aurion-production-release-main`. Reine Dokumentationsänderungen lösen keinen Runtime-Release aus. Ein bereits vorhandener, vollständiger Eintrag mit `<!-- integration-memory: pr=<Nummer> -->` verhindert einen zweiten Eintrag.
2. Der Dispatch übergibt den zuvor geprüften Commit als verpflichtendes `expected_sha`. Der Release-Workflow verlangt vor dem Build, dass `github.sha` exakt dazu passt; ein zwischenzeitlicher Wechsel von `main` bricht mit `RELEASE_DISPATCH_REVISION_MISMATCH` ab. Der kanonische Ledger-Plan und die unabhängige Hosted-Runner-Attestationsprüfung bleiben an denselben Commit gebunden. `SCHEMA_DISPATCH_STALE_MAIN` bleibt ebenfalls ein Abbruchgrund; die Guards dürfen nicht umgangen werden.
3. Der Root-Promoter mit Protokoll 3 installiert über `--prepare-schema` nur die geprüften Schema-Artefakte. Der Anwendungscontainer wird dabei nicht gebaut oder verändert.
4. Der Root-Apply erzeugt einen frischen Readback. Bei Drift erstellt `repair-aurion-production-schema.ts` einen zusätzlichen Reparaturplan mit eigenem Hash, Struktur-/Journal-Fingerprint und 15 Minuten Gültigkeit. Dieser ersetzt den kanonischen Ledger-Hash nicht.
5. Vor jedem Apply entstehen ein logischer Dump und ein Restore in einer isolierten MariaDB ohne Produktionsnetzwerk. Additive Reparaturen werden zuerst an diesem Restore ausgeführt. Der echte Apply regeneriert den Plan unter Datenbanksperre und verlangt identische Ausgangsstruktur, Journalhistorie und SQL-Hashes. Ein Host-Lock serialisiert den gesamten Versuch.
6. Ein neuer Read-only-Prozess muss alle 50 Migrationen als passend bestätigen. Auch ein bereits passendes Schema benötigt einen neuen Backup-/Restore-Nachweis vor der Runtime-Promotion.
7. Nach der Promotion prüft eine authentifizierte Sitzung einen echten Zone-Ticket-Handshake, Welcome und Folgesnapshot, fortschreitende NPC-Auflösungen sowie den Gilden-Readback aus MariaDB. Causal Assurance wird neu gelesen und ihr tatsächlicher Status protokolliert. Die grafische Darstellung bleibt eine eigene Prüfung; ein erfolgreicher Netzwerk-Readback bestätigt kein Bild.

### Reparaturgrenze

Die explizit zugelassene Menge umfasst `0067`, `0069`, `0071` sowie `0025`, `0030`, `0031`, `0033`, `0066`, `0068`. Der Plan wählt ausschließlich passende `CREATE TABLE`, `ADD COLUMN`, `ADD INDEX` und `ADD CHECK`-Anweisungen aus den revisionsgebundenen Originalmigrationen. Insbesondere werden `craftingReceiptId` und die NPC-Gildentabellen nicht ausgelassen.

Vorhandene Spalten, Defaults, zusätzliche Spaltenattribute, Indizes, Checks und Trigger müssen zum Vertrag passen. Unbekannte Strukturen, widersprüchliche Constraints, Fremdschlüssel oder Präfixindizes außerhalb des unterstützten Vertrags stoppen den gesamten Plan. Eine fehlende, bereits journalisierte Tabelle wird wegen möglichem Datenverlust nicht automatisch neu erstellt. Bestehende Journaleinträge werden niemals überschrieben oder gelöscht; eindeutig fehlende freigegebene Einträge können nach vollständigem Strukturabgleich ergänzt werden.

Ein blockierter Plan wird rootgeschützt im Schema-Apply-Zustandsverzeichnis aufbewahrt. Der Operator muss den konkreten Konflikt prüfen. Es gibt weder einen automatischen `DROP`-/`MODIFY`-Pfad noch Docker-Cleanup oder eine automatische Wiederherstellung über die laufende Produktionsdatenbank.

### Einmalige Voraussetzungen und Betrieb

Der bisherige Promoter mit Protokoll 2 kann Schema-Vorbereitung nicht getrennt ausführen. `SCHEMA_PREPARE_CAPABILITY_REQUIRED` verlangt daher eine vertrauenswürdige Root-Installation des geprüften Protokoll-3-Promoters. Der alte Promotionseinstieg darf dafür nicht als Abkürzung aufgerufen werden: Er könnte den Spielcontainer vor den neuen Gates verändern. Danach installiert der neue Vorbereitungspfad die jeweils revisionsgebundenen Schema-Werkzeuge selbst.

Das GitHub-Environment `production` benötigt `AURION_READBACK_SESSION`: eine gültige Sitzung eines vorhandenen autorisierten Prüfkontos, dessen Admin-Recht für den bestehenden Gilden-Readback benötigt wird. Der Workflow verifiziert dieses Recht vor Schema-Vorbereitung und Mutation. Er erzeugt keine Accounts, Rollen oder Ersatz-Tokens. Sitzungen und OIDC-JWTs gehören ausschließlich in die vorgesehenen geheimen Laufzeitkanäle.

OIDC autorisiert weiterhin ausschließlich den eng gebundenen Root-Apply. Ein HTTP 401 beim Alignment-Controller betrifft dessen separate GitHub-API-Authentifizierung und wird durch das Apply-OIDC nicht repariert. Container-Heap-OOM und Darstellung müssen nach erfolgreicher Schema-Reparatur separat anhand neuer Runtime-Evidenz geprüft werden.

Der Workflow `aurion-root-schema-apply-artifact-proof.yml` prüft den echten Root-Core mit isolierter MariaDB, Dump/Restore, partieller Reparatur, Daten-Erhalt, manipulierten/veralteten Plänen und blockierter unbekannter Drift. Zusätzlich müssen der gewöhnliche Apply und der unabhängige Reconciler falsche Defaultwerte sowie unerwartetes `ON UPDATE` sowohl bei einem partiellen als auch bei einem vollständigen Schema erkennen. Diese Tests belegen die Implementierung, nicht die Ausführung auf Produktion.
