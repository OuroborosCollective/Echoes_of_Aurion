# Klangintegration — Code-Readback

**Zeitpunkt:** 13. August 2026
**Umfang:** Ereignisgebundene Aurion-Soundscape und adaptive Expeditionsmusik.

| Ebene | Implementierter Pfad | Verhalten |
| --- | --- | --- |
| Klangcues | `AurionSoundscape.cue` | Web-Audio-Signale für System, Befehl, Kampf, Verbindung und Warnung; Kampfton moduliert seine Frequenz. |
| Musik | `Home.tsx` → `shapeMusic` | Geloopter Expeditionstrack wird nach System-, Befehls-, Kampf-, Verbindungs- und Warnereignissen in Lautstärke und Wiedergaberate geformt. |
| Sieg | `aurion:mission-state` | Phase `victory` ruft einen separaten Sieg-Musikzustand auf. |
| Bediengrenze | Missionsstart | AudioContext wird erst bei Nutzeraktion entsperrt; bei blockierter Wiedergabe zeigt das UI einen Hinweis zum Klangschalter. |

Diese Prüfung belegt die Ereignisbindung im Quellcode. Eine hörbare Browserabnahme mit Nutzerinteraktion bleibt dem gesonderten offenen Audio-/Browsernachweis vorbehalten.
