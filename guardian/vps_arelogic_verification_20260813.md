# VPS- und Domainprüfung — arelogic.space

**Prüfdatum:** 13. August 2026
**Zielhost:** `46.202.154.25`
**Ausgelieferte Revision:** `a783851c-market-20260813T174616Z`

| Prüfung | Ergebnis |
|---|---|
| DNS-Auflösung | `arelogic.space` löst auf `46.202.154.25` auf. |
| HTTP | Leitet per `301` korrekt auf HTTPS weiter. |
| TLS | Zertifikat für `arelogic.space`, ausgestellt durch Let’s Encrypt; gültig bis 11. November 2026. |
| Nginx | Dienst aktiv und Konfiguration nach Bereinigung der doppelten Backup-Datei syntaktisch gültig. |
| Hostrouting | Der einzige aktive `arelogic.space`-Virtual Host nutzt `/var/www/echoes-of-aurion/current`. |
| Aktiver Release | Atomar auf `a783851c-market-20260813T174616Z` umgeschaltet; Release-Marker wurde lokal über HTTPS gelesen. |
| Externer Release-Readback | `https://arelogic.space/.aurion-release.json?release=a783851c-market` lieferte die aktuelle Marktstatus-Revision erfolgreich über IPv4 aus. |
| Auslieferung | Startseite, CSS- und JavaScript-Bundles wurden über die öffentliche Domain mit HTTP 200 protokolliert. |
| Medien | Wayfinder-GLB und Hintergrundmusik liegen im aktiven Release vor. |
| Deployment-Runner | `actions.runner.OuroborosCollective-Echoes_of_Aurion.aurion-static-deployer.service` ist aktiv. |

Die doppelten Nginx-Warnungen wurden durch das Verschieben der versehentlich unter `sites-enabled` geladenen Backup-Konfiguration nach `sites-available/backups` behoben. Die eigentliche aktive Konfiguration und das TLS-Zertifikat wurden nicht ersetzt.
