# Lokaler Wasd-GLB-Szenenvorschau-Readback

| Feld | Befund |
| --- | --- |
| Datum | 2026-08-26 |
| Laufzeit | Lokaler Entwicklungsserver auf Port 3001, da Port 3000 bereits belegt war |
| Vorschauparameter | `?wasd_scene_preview=emberfall_water_source` |
| Kandidat | `wasd_d043b07bc436ceb2` (`client/public/assets/models/objects/brunnen.glb`) |
| Katalogstatus | `INACTIVE` — keine Produktionszuordnung oder Katalogaktivierung |
| Erstes Browserreadback | Aurion-Startansicht geladen; Canvas und sichtbarer Boot-Status „STERNWARTE WIRD KALIBRIERT“ vorhanden; keine sichtbare Runtime-Ausnahme oder Fallbackmeldung |
| Zweites Browserreadback | Browserkontext wurde unerwartet auf `about:blank` zurückgesetzt; deshalb **kein** erfolgreicher Mesh-/Speicher-/Fallback-Nachweis und keine Aktivierung |

> Das Ergebnis bestätigt lediglich den geladenen lokalen Aurion-Startzugang. Der zwingende Babylon-Sichtnachweis für das Brunnenmodell fehlt weiterhin; der Assetkatalog bleibt deshalb inaktiv.

## Konsolenreadback

Der erneute lokale Aufruf erzeugte einen funktionierenden WebGL2-/Babylon-Start (`Babylon.js v9.20.1 - WebGL2`). Die Konsole meldete jedoch unabhängige `Internal Server Error`-Ladefehler für bereits vorhandene optionale Aurion-Strukturprops unter `/manus-storage/`; sie meldete **keinen** eindeutigen Erfolg oder Fehler für die Roh-GitHub-URL des Wasd-Brunnens. Dadurch ist weder ein sichtbarer Brunnenmesh noch der erforderliche Speicher-/Fallback-Nachweis belegt.

> Konsequenz: `wasd_d043b07bc436ceb2` bleibt `INACTIVE`. Die lokale Vorschau ist lediglich eine testbare, opt-in Zuordnung und keine Freigabe zur Produktionsaktivierung.

## Diagnostischer Arena-Readback

Nach Ergänzung eines sichtbaren Statusreadbacks meldete der lokale Browser für den opt-in Brunnenpfad eindeutig `Arena-GLB failed`. Die WebGL2-/Babylon-Laufzeit selbst startete, aber die Konsole zeigte zugleich `Internal Server Error` für vorhandene optionale Aurion-Modelle im `/manus-storage/`-Pfad. Da der Fehlerstatus keine sichere, unabhängige Bestätigung einer Mesh-/Textur- oder Speicherprüfung des Raw-GitHub-Brunnens erlaubt, wurde **keine** Aktivierung vorgenommen.

| Gate | Status |
| --- | --- |
| Revisionsbindung, SHA-256, GLB-2.0-Grundprüfung | erfüllt (bestehendes Detailinventar) |
| Rechtefreigabe | vom Eigentümer bestätigt |
| Budget (1.911.884 Bytes, 10.450 Dreiecke) | katalogisiert als streambar |
| Lokaler Babylon-Readback | fehlgeschlagen |
| Produktions-/Katalogaktivierung | nicht erfolgt; `INACTIVE` |

> Die Loadursache muss in einer Umgebung mit funktionierendem verwaltetem Assetpfad und isolierbarem Netzwerkreadback geprüft werden. Ein erneuter blinder lokaler Ladeversuch wäre kein neuer Nachweis.
