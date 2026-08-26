# Echoes of Aurion – containerisierte Produktionslaufzeit

## Zweck und Geltungsbereich

Dieses Dokument beschreibt ausschließlich den **später separat freizugebenden** Betrieb der vollständigen Aurion-Anwendung als Docker-/Traefik-Dienst auf `arelogic.space`. Es ersetzt keine Freigabe, führt keine Konfiguration aus und enthält keine Geheimniswerte.

Der Containerdienst ist die maßgebliche Laufzeit für Benutzeroberfläche, Aurion-API und FusionAuth-OIDC-Callback. Die bisherigen GitHub-Workflows für das statische Root-Release und die separate `/_runtime`-Zonenlaufzeit bleiben als **manuell auslösbare Rückfallwege** vorhanden, dürfen den Containerpfad jedoch nicht bei einem Merge nach `main` überschreiben.

## Freigabegrenzen

| Schritt                       | Erfordert explizite Freigabe                                | Darf nicht erfolgen                                                  |
| ----------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------- |
| Kandidatenprüfung             | nein                                                        | Kein Merge, kein VPS-Eingriff.                                       |
| Merge nach `main`             | ja                                                          | Keine manuelle Auslösung der statischen oder Zonenruntime-Workflows. |
| VPS-Bereitstellung            | ja, nach erfolgreichem Merge                                | Keine Geheimniswerte ausgeben oder versionieren.                     |
| Öffentliche TLS-/OIDC-Abnahme | ja, als Teil der Bereitstellung                             | Keine Akzeptanz eines selbstsignierten Zertifikats.                  |
| Rücknahme                     | ja, falls nicht schon im genehmigten Rollbackplan enthalten | Keine Datenbankmigration oder Datenlöschung.                         |

## Vorbedingungen

Die folgenden Kriterien sind vor einer Bereitstellung nachzuweisen:

| Bedingung             | Erwarteter Nachweis                                                                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quellrevision         | Die zur Bereitstellung ausgewählte 40-stellige `main`-Revision enthält sowohl den OIDC-Adapter als auch diesen Cutover-Kandidaten.                                              |
| OIDC-Konfiguration    | `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` und `OIDC_REDIRECT_URI` sind in der nicht versionierten `.env.production` vorhanden; ihr Inhalt wird nicht angezeigt. |
| Compose-Konfiguration | `docker compose -f docker-compose.traefik.yml config` löst erfolgreich auf, ohne Werte aus `.env.production` zu drucken.                                                        |
| Netzwerk              | Das externe Docker-Netzwerk `areloria_arelorian-network` ist vorhanden und der Traefik-Container verwendet es.                                                                  |
| TLS                   | Traefik lauscht auf 80/443, hat einen funktionierenden Let’s-Encrypt-Resolver und kann die Domain bedienen.                                                                     |
| Runtime-Artefakt      | `dist/.aurion-runtime-build.json` enthält genau die ausgewählte 40-stellige Quellrevision; ein Vite-Build auf dem VPS ist nicht zulässig.                                       |
| Rückkehrpunkt         | Der aktuell ausgerollte Git-SHA und der Zustand vor Containerstart sind schriftlich festgehalten.                                                                               |

## Kontrollierter Bereitstellungsablauf

Nach einer separaten Produktivfreigabe erfolgt die Bereitstellung in dieser Reihenfolge:

1. Den ausgewählten Merge-Commit auf dem VPS in einem revisionsbenannten Checkout bereitstellen und seine 40-stellige `HEAD`-Revision gegen den PR-Merge-Commit prüfen.
2. Die `.env.production` auf das Vorhandensein der erforderlichen Namen und die restriktiven Dateirechte prüfen, ohne Werte auszugeben.
3. In einer ausreichend dimensionierten, geprüften Buildumgebung `AURION_RELEASE_SHA=<Revision> pnpm build:runtime-artifact` ausführen. Das erzeugte `dist` muss zusammen mit seiner Manifestrevision geprüft und als Artefakt an den VPS übertragen werden.
4. `docker compose -f docker-compose.traefik.yml config` ausführen und die Traefik-Labels, das externe Netzwerk sowie den Healthcheck validieren.
5. Ein Runtime-Image ausschließlich aus der gebundenen Revision und dem übertragenen `dist`-Artefakt erstellen. Die Build-Argumentrevision muss mit `dist/.aurion-runtime-build.json` übereinstimmen; auf dem VPS darf kein Vite-Build stattfinden.
6. Das verifizierte Image mit `docker compose -f docker-compose.traefik.yml up -d aurion` starten.
7. Den lokalen Healthcheck und den Traefik-Servicezustand prüfen. Erst danach das öffentliche TLS-Zertifikat und `https://arelogic.space/healthz` ohne Zertifikatsumgehung prüfen.
8. Den vollständigen OIDC-Login mit PKCE durchlaufen und nachweisen, dass der Callback auf dieselbe Origin zurückkehrt, eine Aurion-Sitzung entsteht und keine Geheimniswerte in Logs vorkommen.
9. Den aktiven Containerimage-Digest, die Git-Revision, den Traefik-Readback und das Ergebnis der OIDC-Abnahme protokollieren.

## Nicht zulässige Abkürzungen

Ein selbstsigniertes Zertifikat darf nicht akzeptiert oder mittels `curl --insecure` im abschließenden Nachweis umgangen werden. Es wird kein Client-Secret im Browser, im Repository, in GitHub Actions, in Docker-Labels, in Containerlogs oder in Berichten hinterlegt. Die statischen und Zonenruntime-Workflows dürfen nicht parallel zum Containerdienst gefördert werden.

## Rücknahme

Bei fehlendem Healthcheck, ungültigem TLS-Zertifikat, falscher Routerzuordnung oder OIDC-Fehler wird der neue Aurion-Container gestoppt und entfernt. Datenbankvolumes, die FusionAuth-Anwendung und `.env.production` bleiben unverändert. Der vorher dokumentierte Laufzeitstatus bildet den Rückkehrpunkt; eine Rücknahme darf keine Datenbankmigration oder Löschung auslösen.
