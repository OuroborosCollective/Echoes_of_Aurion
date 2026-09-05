# Naturkollision und weltweite Bewegung

Alle 568 gelieferten GLB-Dateien bleiben unverändert im geprüften Asset-Bundle:
40 Stadtmodelle und 112 Naturmodelle mit jeweils drei LODs sowie 112 Natur-Collider.
Die Stadtlichter stammen weiterhin aus den eingebetteten GLB-Lichtquellen und
Emissionsmaterialien. Das Natur-Collider-Manifest der Lieferung nennt zusätzlich
`Tent_Leanto_1`, `Tent_Leanto_2` und `Timber_Cut_1`; diese drei Dateien fehlen im Archiv.

## Kollisionsregel

`scripts/compile-world-colliders.mjs` liest die tatsächlichen Meshopt-Geometrien,
wendet ihre Node-Transformationen an und bildet daraus konvexe X/Z-Grundflächen.
Maßstab und Anker entsprechen dem LOD0 des sichtbaren Modells. Alle LODs behalten
diesen Anker. Das Ergebnis in `shared/worldCollisionManifest.json` bindet jede
Fläche an den Collider-SHA256, den Katalog und das Original-Bundle.

Der Server prüft pro 100-ms-Tick den gesamten Weg einer Spielerscheibe mit
350 mm Radius und 1 mm Rundungsmarge. Exakte Ganzzahlprodukte verhindern
Rundungsfehler bei Kanten und dünnen Hindernissen. Bei diagonaler Blockade wird
zuerst eine Bewegung entlang X und dann entlang Z versucht. Clients senden
ausschließlich geordnete Richtungsabsichten. LOD, Kamera und Ladegeschwindigkeit
können das Ergebnis nicht verändern.

Kollision ist ausschließlich für die 42 Baum- und Felsmodelle (`Tree_*`,
`Rock_*`, `Mountain_*`) aktiv. Die 70 übrigen Naturmodelle bleiben durchgehbar:
Blumen, Gras, Büsche, Pilze, Äste, Baumstümpfe, Holzstücke, flache Trittsteine
und kleine Dekoration. Alle 112 gelieferten Collider-Dateien bleiben erhalten;
`blocksMovement` im geprüften Manifest bestimmt ihre Verwendung.
Die aktive Regel verwendet den vollständigen Grundriss. Sie enthält keine
Höhenfreigabe für Springen oder Unterlaufen von Baumkronen. Stadtmodelle ohne gelieferten Collider erhalten dadurch
keine zusätzliche Körperphysik. Vorhandene Landschafts- und Kollisionsquellen
bleiben erhalten; die neue Regel gehört zur Aurion-Serverbewegung.

## Weltkoordinaten und Speicherung

Die bisherige Grenze von ±14,5 m ist durch die vorhandene Weltgrenze ersetzt:
Chunk-Koordinaten von −1.000.000 bis +1.000.000 bei 64 m Chunkgröße.
Globale Millimeterpositionen reichen von −64.000.032.000 bis +64.000.031.999.
`aurionWorldPresenceLeases` speichert Chunk-Koordinaten und zentrierte lokale
Millimeterpositionen von −32.000 bis +31.999 in den vorhandenen INT-Spalten.
Die API rekonstruiert die exakte globale Position. Alte Datensätze in Chunk 0
bleiben kompatibel. Es entsteht keine zusätzliche Migration.

Die vorhandene Presence-Lease wird alle 30 Sekunden erneuert; ihr Ablauf bleibt
bei 120 Sekunden. Weltaktionen prüfen den Zielchunk und die Reichweite gegen
diesen servergespeicherten Stand. Ein Reconnect startet weiterhin im bisherigen
Spawn; die Lease ist kein dauerhafter Spieler-Speicherpunkt.

Der Collider-Cache hält höchstens 256 abgeleitete Chunks. Die GLB-Projektion lädt
weiterhin nur nahe Instanzen und hält ihre bisherigen mobilen Budgets ein.
Instanzmatrizen für Weltmodelle und andere Spieler verwenden einen nahen Ursprung,
damit kleine Positionsunterschiede auch bei großen Weltkoordinaten erhalten bleiben.

## Nachweise

Der Produktionsbuild berechnet die Collider-Datei erneut und verweigert jede
Abweichung. `server/worldNatureCollision.test.ts` prüft Quellen, Kantenfälle,
alle 112 Quelldateien, die 42 aktiven Kollisionsflächen, 70 durchgehbare
Dekorationsmodelle, Weltgrenzen, Chunk-Reichweite und reproduzierbare
Bewegung. `server/worldNatureCollisionMariaDb.test.ts` prüft die echte INT-Speicherung
an beiden Weltenden sowie eine serverbestätigte Aktion im entfernten Chunk.

`e2e/world.nature-collision.spec.ts` legt zwei isolierte Konten über die öffentliche
Registrierung an. Ein Spieler läuft mit Tastatureingaben über die Chunk-Grenze
durch einen Baumstumpf und gegen `Tree_Oak_6`; ein zweiter Browser empfängt denselben Serverstand. Der Test
gleicht WebSocket-Snapshots, sichtbare GLB-Projektion und MariaDB ab und speichert
Screenshots samt revisionsgebundenen Nachweisen. Die Tests laufen ausschließlich
gegen die ausdrücklich geprüfte lokale Testdatenbank.
