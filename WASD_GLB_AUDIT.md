# Wasd-GLB-Audit und Aurion-Quarantäne

| Feld | Befund |
| --- | --- |
| Wasd-Quellrevision | `a4d99432e47b82ce98105eadb30360cd8040ad13` |
| Aurion-Basisrevision | `80eb075eea9cec719dc559086968e90417c5bee1` |
| Vollständiger Auditmanifest | `/home/ubuntu/aurion_wasd_execution/full-audit-manifest.json` |
| Gefundene Wasd-GLB-Kandidaten | 149 |
| Prüfumfang | GLB-2.0-Signatur, Größe und SHA-256 je Kandidat |
| Runtimeaktivierung | Keine |
| Strukturelle Einzelprüfung | 149/149 GLB-2.0-Kandidaten gültig; 0 Fehler |
| Einzelprüfprotokoll | `/home/ubuntu/aurion_wasd_execution/wasd-glb-validation.log` |

Der vollständige SHA-256-Manifest wurde read-only erstellt. Die Zahl von 149 beschreibt **Kandidaten**, nicht freigegebene Aurion-Assets. Alle Kandidaten bleiben deshalb `inactive`/`quarantined`, bis für jeden vorgesehenen Einsatz die Rechtekette, die Szenenrolle, Dateibudget, sichtbare Babylon-Readback, Dreiecks-/Material-/Textur-/Rig-Prüfung und ein expliziter Aurion-Assetkatalogeintrag vorliegen.

Die nach der Abhängigkeitsinstallation erstellte Inventur enthält im allgemeinen Domänenabschnitt auch Drittanbieterdateien aus `node_modules`. Dies ist für GLB-Hashwerte der Wasd-Quelle nicht maßgeblich, aber der Domänenindex darf nicht als Contentvollständigkeitsbeweis interpretiert werden. Ein späterer Releaseaudit muss `node_modules`, Buildausgaben und lokale Testartefakte ausschließen.

> Es wurde weder ein GLB nach Aurion kopiert noch ein Modell aktiviert. Dadurch bleibt die aktuelle spielbare Scheibe unabhängig von ungeklärten Assetrechten und erfüllt die Quarantänepflicht.

Die strukturelle Einzelprüfung bestätigt lediglich, dass **149 von 149** Dateien valide GLB-Container sind. Sie ersetzt weder eine Rechteprüfung noch die Prüfung von Dreiecksanzahl, Texturauflösung, PBR-Materialien, Skelett-/Animationsqualität oder sichtbarer Szeneintegration.
