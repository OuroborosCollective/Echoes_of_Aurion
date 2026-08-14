# OAuth- und VPS-Diagnose — arelogic.space

**Datum:** 14. August 2026
**Scope:** Ausschließlich Echoes of Aurion auf `46.202.154.25`; keine MCP-Docker-Erstellung und keine Änderung fremder Dienste.

## Bestätigte Ursache

Der Browser erstellt den OAuth-Start korrekt aus `window.location.origin` und übergibt deshalb die Rückleitungsadresse `https://arelogic.space/api/oauth/callback`. Das Manus-OAuth-Portal lehnt diese externe VPS-Domain jedoch für die aktuelle Projektkennung ab. Der Fehler tritt vor jeder Benutzerauthentifizierung auf.

Der projektgebundene Manus-Host `https://aurion3d-6hpapr2g.manus.space` erzeugt dagegen eine Rückleitungsadresse auf dieser erlaubten `manus.space`-Domain. Damit ist die Ursache keine fehlerhafte Spiel-UI und keine fehlerhafte URL-Zusammensetzung im Aurion-Client.

## VPS-Befund

| Bereich | Befund |
|---|---|
| Aktiver Aurion-Release | `/var/www/echoes-of-aurion/current` verweist auf `a783851c-market-20260813T174616Z`. |
| Aurion-Deploymentdienst | `actions.runner.OuroborosCollective-Echoes_of_Aurion.aurion-static-deployer.service` ist aktiv. |
| arelogic.space | Nginx liefert eine statische SPA aus und führt unbekannte Pfade auf `index.html` zurück. |
| OAuth-Callback | Es existiert keine Aurion-Backendroute unter `/api/oauth/callback` im statischen Release. |
| Bestehende `/mcp`-Route | Wurde nur gelesen, nicht verändert. Es wurde kein MCP-Docker, kein MCP-Dienst und keine fremde Architektur erstellt. |

## Konsequenz

Eine funktionsfähige Anmeldung direkt unter `arelogic.space` erfordert entweder eine vom OAuth-Anbieter erlaubte Rückleitungsdomain oder einen bewusst ausgewählten, Aurion-spezifischen Authentifizierungsweg. Eine bloße Nginx- oder Client-Änderung kann die Redirect-Allowlist nicht sicher umgehen.

> Bis zu einer expliziten Richtungsentscheidung wird keine OAuth-Sicherheitsprüfung umgangen, keine Session über URLs übertragen und kein fremder Dienst verändert.
