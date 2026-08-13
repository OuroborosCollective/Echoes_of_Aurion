# Aurion — GitHub-Workflow-Deployment-Readback

**Zeitpunkt:** 13. August 2026  
**Ziel:** Ausschließlich `https://arelogic.space/` für Echoes of Aurion. Sovereign-Studio-ATO und `areloria.de` waren nicht Teil des Workflows, des Runners oder der Releasepromotion.

## Revisionsgebundener Auslieferungspfad

| Schritt | Nachweis |
| --- | --- |
| Workflowrevision | Squash-Merge von PR #18, Commit `f18b29baecb9f1dea4e0ebb232543439c479c3cf` |
| Hosted-Gate | `pnpm check`, 25 Tests, Static-Build und Medienabgleich erfolgreich |
| Immutable Artifact | GitHub-Artifact `aurion-static-f18b29baecb9f1dea4e0ebb232543439c479c3cf` mit SHA-256-Prüfdatei |
| Lokale Promotion | Repositorygebundener Runner `aurion-static-deployer` holte ausschließlich dieses Artifact und förderte es in `/var/www/echoes-of-aurion/current` |
| Workflowlauf | Run `31697022841`: Hosted-Build erfolgreich; Artifact-Promotion erfolgreich; öffentlicher Rootcheck erfolgreich |

Der Runner führt unter dem eingeschränkten Benutzer `aurion-deploy` aus. Er enthält keine ATO- oder Areloria-Bindung und übernimmt keine speicherintensive TypeScript-Prüfung; diese verbleibt beim GitHub-Hosted-Job.

## Öffentlicher Readback

| Prüfpunkt | Ergebnis |
| --- | --- |
| Root-Build | `https://arelogic.space/` liefert `index-BWq_ED4o.js` mit Last-Modified `13 Aug 2026 11:47:58 GMT` |
| Aurion-UI | DOM- und Browser-Readback zeigen den Zugang „Koop-Verbindung erforderlich“, Partnerwahl, MCP-Slot-CTA und „Hero Trailer ansehen“. |
| Hero-Trailer | `https://arelogic.space/manus-storage/aurion-hero-trailer-en-de_c44ee2e1.mp4` ist per HTTPS erreichbar; 25.137.988 Byte, Byte-Range-Unterstützung vorhanden. |

## MP4-MIME- und Browserabnahme

Der tatsächlich aktive Aurion-Serverblock liegt in `/etc/nginx/sites-enabled/arelogic.space`. Dort wurde ausschließlich eine `location ~* \.mp4$`-Regel mit `default_type video/mp4` ergänzt, nachdem ein Backup erstellt und `nginx -t` erfolgreich ausgeführt worden war. Der anschließende öffentliche Header-Readback liefert `content-type: video/mp4`, `content-length: 25137988` und `accept-ranges: bytes`.

Nach einem frischen Root-Reload öffnete der Browser den Hero-Trailerdialog erfolgreich. Der technische HTML5-Readback bestätigt `currentSrc` auf die Aurion-MP4, `readyState: 4`, `duration: 64.56`, `currentTime: 59.50`, `paused: false`, eine Auflösung von 720 × 1280 und `error: null`. Die eingebrannten deutschen Untertitel sind sichtbar. Diese Korrektur betrifft ausschließlich Aurion; keine ATO- oder Areloria-Route wurde untersucht oder verändert.
