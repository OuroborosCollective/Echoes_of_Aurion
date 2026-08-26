# Containerisierte Aurion-Laufzeit: Cutover-Kandidat

## Quellenbindung

| Gegenstand                       | Gebundener Stand                                                              |
| -------------------------------- | ----------------------------------------------------------------------------- |
| Ausgangskandidat                 | `f84473f609d6514a75950fb8bd105909f24174c8` (`aurion/fusionauth-oidc-adapter`) |
| Arbeitsbranch                    | `aurion/container-runtime-cutover`                                            |
| Produktionscheckout, vor Cutover | `d617d0b1333fc7128b91fe11328cbd011334b490`                                    |
| Zieldomain                       | `arelogic.space`                                                              |

## Festgelegte Zielentscheidung

Der Docker-/Traefik-Dienst `aurion` wird nach einer **separaten produktiven Freigabe** die alleinige Aurion-Laufzeit an `arelogic.space`. Der bestehende statische Root-Release und der separate `/_runtime`-Dienst werden nicht stillschweigend weiterentwickelt oder bei einem Merge automatisch aktualisiert.

## Nachweisbare Arbeitsschritte

| Bereich               | Kandidatenänderung                                                                                                       | Nachweis                                                      | Produktionsgrenze                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- | -------------------------------------------------- |
| Statischer Workflow   | Automatische Förderung bei `push main` entfernen; manuellen Rückfallweg belassen.                                        | Workflow-Syntax, Diffprüfung.                                 | Kein GitHub-Workflow wird ausgeführt.              |
| Zonenruntime-Workflow | Automatische Förderung bei `push main` entfernen; manuellen Rückfallweg belassen.                                        | Workflow-Syntax, Diffprüfung.                                 | Kein Systemd-Dienst wird verändert.                |
| Containerbetrieb      | Verbindliche, rollbackfähige Runbook-Anleitung für exakte Gitrevision, Compose-Build, Health- und TLS-Readback ergänzen. | Lokaler Compose-Konfigurationscheck und Dokumentationsreview. | Kein Containerbuild/-start, keine TLS-Anforderung. |
| Authentifizierung     | Vorbereitete VPS-Variablen bleiben unverändert; keine Geheimniswerte versionieren.                                       | Geheimnisscan und Variablennamenprüfung.                      | Kein Secret wird gedruckt oder committed.          |
| Release               | Neuer Draft-PR, lokale/Remote/PR-Revision prüfen.                                                                        | Tests, Build, Git-Diff, PR-Head.                              | Kein Merge.                                        |

## Ausdrücklich ausgeschlossen

Dieser Kandidat verändert weder den VPS noch die FusionAuth-Anwendung, startet oder stoppt keine Container, führt keine Datenmigration aus, setzt keine DNS-/TLS-Konfiguration und führt keinen GitHub-Releaseworkflow aus. Jeder dieser Schritte erfordert später eine konkrete Freigabe.
