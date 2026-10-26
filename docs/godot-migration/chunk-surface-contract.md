# G18 – native Projektion bestätigter Chunk-Oberflächen

Umfang: `Echoes_of_Aurion` (Basis-Main `6073acfac90733eea5fee24e92c86da4e2c41e56`), G18 #925. Dies ist eine **Teilimplementierung**, kein Abschluss von G18/G19 oder produktives Release.

## Eigentümerschaft

- **Aurion** generiert und speichert die kanonische Chunk-Basis und Delta-Overlays. `server/db.ts:getWorldChunkReadModel` wird nur über den serverseitig authentifizierten `GET /api/game/world-chunk-surface?x=...&z=...` konsumiert.
- **Schutz:** Native Bearer-Auth über vorhandenen `playerRoute`; `db.requireDb()` verhindert einen leeren Fallback, `db.listActiveWorldPresence()` verlangt eine aktive Lease der Zone `observatory_threshold`; nur die eigene oder eine unmittelbar benachbarte 3×3-Chunkzelle ist lesbar. Query-Strings sind streng kanonisch, ganzzahlig und auf ±1.000.000 begrenzt.
- **Godot** ist kein Weltgenerator. Die v5-Zone bestätigt die eigene Position (Millimeter); der Client berechnet nur die bestehende Mittelpunkt-Chunkpartition `floor((positionMm+32000)/64000)` als Suchkoordinate, niemals ein zweites Terrain oder einen WorldSeed. Die Rückgabe muss mit der aktiven WSS-Verbindung, der aktuellen Token-Generation und der bestätigt berechneten Koordinate übereinstimmen.
- `world/chunk_terrain.gd` prüft 256 einmalige 16×16-Tilepositionen, die 64-m-Abmessung, gültige Höhen und sechs erlaubte Surface-IDs und projiziert sie als `ArrayMesh` ohne Collider. Die vier vorhandenen G17-Texturen bleiben reine Darstellungsressourcen. `grass`/`forest_floor` nutzen vorläufig `forest`, `ruin_path` `paving` und `riverbank`/`stone`/`ash` `rock`; dies ist **keine** vollständige visuelle Shader-Parität.
- Vor einem gültigen Readback ist ausschließlich der ausdrücklich neutrale Vorschau-Boden sichtbar. Fehlende, abgelehnte, abgelaufene oder fremde Antworten dürfen weder alte Meshes noch versteckte Fehler hinterlassen. Session-Rücksetzung löscht Terrain und HTTP-Zustand.

## Evidence und Grenzen

- Reale Godot4.7.2-kausale REDs: [fehlendes Mesh-Modul](https://github.com/OuroborosCollective/Echoes_of_Aurion/actions/runs/40251744150), [fehlende Aktiv-Szenenbindung](https://github.com/OuroborosCollective/Echoes_of_Aurion/actions/runs/40252388834).
- Reales Node/Vitest-RED für fehlenden Query-Gate mit isolierter echter MariaDB im CI-Runner: [40252081153](https://github.com/OuroborosCollective/Echoes_of_Aurion/actions/runs/40252081153). Das ist **keine** produktive Datenbank.
- Realer Godot-Code- und Loopback-Wire-Test (AUTH-Doppel und Protokollfixture explizit nicht produktiv): [40252614666](https://github.com/OuroborosCollective/Echoes_of_Aurion/actions/runs/40252614666).
- Echte GLB-Import-/Software-Render-Suite: [40252614635](https://github.com/OuroborosCollective/Echoes_of_Aurion/actions/runs/40252614635).
- **Noch nicht belegt:** erfolgreicher HTTP-GET gegen die produktive aktive MariaDB mit echter Player-Lease, beidseitiger Live-Hash-/Revision-Abgleich, realer 3D-Starterbereich/G19, Kollision/Navigations-/Häuser-/Road-Overlays, stationäres Tab-A9-Frame/VRAM-Profil, signierte APK und Installationsentscheidung.
- Das alleinige JSON-FNV-Format ist kein kryptographischer Inhaltsbeweis. Godot vertraut dem authentifizierten Aurion-Server unter TLS und prüft Struktur und Bindungen. Ein anderer Client darf diese Werte niemals als eigenständig rekonstruierten kanonischen Hash ausgeben.

Nächster produktiver Abnahmepfad: exakter Main-Head + tatsächliche Release-Image-Identität + DB-/WorldLease-Readback + echter geschützter Chunk-HTTP-Response + v5-Welcome/State/Chunk-Mesh + importierte APK auf physischem Tab A9; keine End-of-Migration-Meldung vorher.
