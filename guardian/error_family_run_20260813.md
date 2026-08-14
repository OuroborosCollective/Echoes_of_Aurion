# Fehlerfamilien-Run — Echoes of Aurion

**Datum:** 13. August 2026
**Geltungsbereich:** Spielzugang, soziale Spielflüsse, Asset-Laufzeit, statische Auslieferung und Releasepfade.

Der Run bündelt zehn aus Architektur und Laufzeit ableitbare Fehlerfamilien. Jede Korrektur wurde mit passenden TypeScript-, Vertrags-, Datenbank-, Build- oder Browserprüfungen erneut ausgeführt. Es wurden keine Testdaten in die Produktionsdatenbank geschrieben.

| Nr. | Fehlerfamilie | Korrektur | Nachweis |
|---:|---|---|---|
| 1 | Instabile Gateway-Abfragen und doppelte Steuerimpulse | Query-Eingaben wurden stabilisiert; eine monotone Sequenzsperre verwirft alte oder doppelte Teamimpulse. | Vertrags- und Browser-Smoke-Tests bestanden. |
| 2 | Alte Teamimpulse nach Moduswechsel | Die Sequenzsperre wird beim Koppeln, Solo-Start, Teamwechsel und Widerruf zurückgesetzt. | TypeScript-Prüfung und Gateway-Tests bestanden. |
| 3 | Cookie-Semantik zwischen HTTP, HTTPS und Einbettung | Cookie-Attribute wurden kontextabhängig korrigiert und mit expliziten Tests abgesichert. | `cookies.test.ts` bestanden. |
| 4 | WebGL-/Babylon-Startfehler blockiert die Oberfläche | GameCanvas nutzt einen sichtbaren Fallback; Zugang und Community bleiben bedienbar. | WebGL-E2E-Smoke bestanden. |
| 5 | CDN-/Modellfehler blockiert die 3D-Vorschau | Babylon- und GLB-Vorschau laden bedarfsorientiert; Fehler fallen kontrolliert auf die Aurion-Oberfläche zurück. | CDN-Ausfall-E2E-Smoke bestanden. |
| 6 | Statischer itch.io-Build ruft Server-API auf | Auth- und Community-Queries werden im statischen Build bewusst deaktiviert; der Gastzugang bleibt lesend verfügbar. | Statischer Browser-Smoke bestanden. |
| 7 | Statische Medien verweisen auf Manus-Storage | GLB-, PBR-, Audio- und Trailermedien werden in `dist/itch/aurion-assets` paketiert und über einen gemeinsamen Resolver geladen. | Statische 404-Anfrageprüfung ergab `[]`. |
| 8 | Babylon-CDN-Pfade doppeln `.js` | Der Build-Resolver erkennt bereits vollständige Modulnamen und erzeugt keine `*.js.js`-URLs mehr. | Statische 404-Anfrageprüfung ergab `[]`. |
| 9 | Markt-, Asset- und Teamdatenpfade driften | Gemeinsame Runtime-Grenzen und rein lesende Datenbank-Smokes prüfen reale Tabellen, Indizes und zentrale Serverabfragen. | Datenbank-Smoke-Suite bestanden. |
| 10 | Release-Artefakte überziehen Assetbudgets | Das Release-Gate prüft Charakterbudgets; die itch.io-Fassung verpackt alle benötigten Medien reproduzierbar. | Asset-Gate und Produktionsbuild bestanden. |

| Gesamtprüfung | Ergebnis |
|---|---|
| TypeScript | `pnpm check` bestanden |
| Vertrags-, Unit-, Client- und Datenbanktests | 15 Testdateien, 49 Tests bestanden |
| Statischer itch.io-Build | Erfolgreich, inklusive sieben lokaler Aurion-Medien |
| Chromium-E2E gegen statischen Build | 4 von 4 Tests bestanden |
| Chromium-E2E gegen laufende Anwendung | 3 von 3 ausgeführten Tests bestanden; ein produktionsspezifischer CDN-Test wurde planmäßig übersprungen |
| Statische 404-Prüfung | Keine fehlenden Release-Anfragen |

Für freigegebene Arenaassets steht zusätzlich ein vollständiger technischer Pfad bereit: Der Admin weist ein bestätigtes `arena`-GLB dem Zielschlüssel `asterion_courtyard` zu; die öffentliche, nur lesende Laufzeitabfrage lädt es anschließend als kontrollierte Szenenerweiterung. Der abschließende Nachweis dieses Pfads bleibt in der Aufgabenliste offen, bis ein tatsächlich von einem Spieler eingereichtes und freigegebenes Arenaasset vorliegt. Die übrigen Restpunkte betreffen ebenfalls angemeldete Akzeptanzpfade mit realen Spielerkonten: Markttransaktionen sowie die vollständige Spieler-GLB-Einreichung mit anschließender Adminentscheidung. Sie werden nicht mit künstlichen Nutzer- oder Marktdaten simuliert.
