# Echoes of Aurion — Hostinger Traefik Deployment

Diese Vorlage ersetzt die bestehende Nginx-Produktionsbereitstellung **nicht automatisch**. Sie bereitet Aurion für einen Docker-basierten Hostinger-VPS vor, auf dem Traefik bereits TLS, Routing und das externe Docker-Netzwerk verwaltet.

> Die Konfiguration stellt keinen Dienst bereit, ändert keine DNS-Einträge und migriert keine Datenbank. Sie ist zunächst ein revisionsgebundenes Artefakt zur Prüfung auf dem VPS.

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

Erst nach Freigabe der gerenderten Compose-Konfiguration und nach Bestätigung, dass `arelogic.space` auf die VPS-IP zeigt, kann ein verantwortlicher Betreiber den Build und Start durchführen. Vor einer Umschaltung sind die bestehende Nginx-Konfiguration, das aktuelle Release und die DNS-Zone zu sichern.

## Proxy- und Anwendungssicherheit

Aurion bindet im Container an `0.0.0.0:3000`, veröffentlicht diesen Port aber nicht direkt auf dem Host: Nur das externe Traefik-Netzwerk erreicht ihn. Im Produktionsmodus vertraut Express standardmäßig exakt einem Proxy-Hop (`TRUST_PROXY_HOPS=1`), damit Traefiks `X-Forwarded-Proto` sichere Cookies korrekt auslöst. Falls sich zwischen Traefik und Aurion ein weiterer vertrauenswürdiger Reverse Proxy befindet, muss dieser Wert geprüft und ausdrücklich angepasst werden.

`STRICT_PORT=true` verhindert im Container den lokalen Entwicklungs-Fallback auf 3001–3019. Ein Portkonflikt wird damit sichtbar, statt Traefik unbemerkt auf einen falschen Port zu routen.

## Noch nicht autorisierte Aktionen

Diese Vorbereitung führt **keinen** VPS-Zugriff, keine DNS-/TLS-Änderung, keine Datenbankmigration, kein Compose-Start und keinen Wechsel von Nginx zu Traefik aus. Der Draft-PR bleibt bis zu einer expliziten Mergefreigabe offen.
