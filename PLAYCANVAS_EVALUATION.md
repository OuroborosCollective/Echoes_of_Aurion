# PlayCanvas-Evaluierung für Echoes of Aurion

## Ergebnis

PlayCanvas kann als **Entdeckbarkeits- und Launch-Schicht** dienen, aber nicht als verdeckter MCP-Client oder als Ersatz für den autorisierten Gateway-Server. Ein öffentlicher PlayCanvas-Project-Eintrag kann einen spielbaren Primary Build bereitstellen; die offizielle Dokumentation beschreibt dafür permanente Build-Links und einen stabilen Projektlink. Öffentliche Projekte können außerdem in öffentlichen Projektlisten erscheinen, während private Projekte davon ausgenommen sind.[1][2]

Die Discovery-Seite von PlayCanvas enthält sowohl direkt gehostete Projekte als auch Einträge, deren **Play**-Link auf eigene externe Domains verweist. Damit ist ein Launch-Eintrag, der sichtbar auf `https://arelogic.space` führt, eine zulässige Produktarchitektur – eine Aufnahme in redaktionelle Showcase-Bereiche ist jedoch nicht automatisch garantiert.[3]

## Empfohlene Architektur

```text
PlayCanvas-Projektseite / Build
        │
        ├─ sichtbarer „PLAY ECHOES OF AURION“-Einstieg
        ▼
https://arelogic.space/play
        │
        ├─ OAuth / API-Token nur im Gateway
        ├─ Sitzungs- und Einwilligungsprüfung
        ├─ MCP-Kommando-Validierung: W,A,S,D,1…9
        └─ serverseitiges Ledger und Rate-Limits
        ▼
Spiel-Client im Browser
```

Die PlayCanvas-Schicht darf keine Provider-Schlüssel erhalten oder weiterreichen. Die Verwendung eines eingebetteten externen Spiels ist nur dann sinnvoll, wenn der iframe-Host und der Game-Server klar getrennt abgesichert werden; die robustere Variante für Echoes of Aurion ist ein sichtbarer Launch-Button oder ein schlanker PlayCanvas-Prolog mit Weiterleitung auf die eigene Domain.

## Umsetzungsschritte

1. Ein öffentliches PlayCanvas-Projekt `Echoes of Aurion — Aurion Gate` mit 720×720-Projektgrafik, kurzer Beschreibung und sichtbarem Launch-Button anlegen.
2. Den Primary Build als kurze, eigenständige Eingangsszene veröffentlichen und den Button zu `https://arelogic.space/play` führen lassen.
3. Auf der eigenen Domain das autorisierte MCP-Gateway betreiben; nur dieses validiert Provider-Sitzungen und wandelt erlaubte Ausgaben in Koop-Befehle um.
4. Für bessere Auffindbarkeit den öffentlichen Projektstatus, Artwork, Beschreibung und eine klare Demo-Schleife pflegen. Eine redaktionelle Aufnahme in Explore-/Showcase-Bereiche bleibt eine Plattformentscheidung.

## Quellen

[1] [PlayCanvas Hosting](https://developer.playcanvas.com/user-manual/editor/publishing/web/playcanvas-hosting/)

[2] [PlayCanvas Project Settings](https://developer.playcanvas.com/user-manual/editor/projects/settings/)

[3] [PlayCanvas Explore](https://playcanvas.com/explore)
