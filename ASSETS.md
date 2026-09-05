# Echoes of Aurion — Asset Manifest

**Art direction:** cinematic stylized 3D action adventure with a three-quarter isometric camera, weathered honey-stone, brushed bronze, midnight-petrol negative space and purposeful Aurion-Türkis energy. Characters have articulated silhouettes and real material distinction; nothing important reads as a simple cube.

| Asset              | Managed URL                                         | Role                                                |
| ------------------ | --------------------------------------------------- | --------------------------------------------------- |
| Aurion key art     | `/manus-storage/aurion-key-art_21dcbd0d.jpg`        | Visual QA target and connection-gate panorama.      |
| Ruin skybox        | `/manus-storage/aurion-ruin-skybox_e34b0508.jpg`    | World-scale backdrop reference.                     |
| Celestial Sentinel | `/manus-storage/aurion-sentinel_c61957b4.png`       | Partner-link visual and enemy silhouette reference. |
| Aurion sigil       | `/manus-storage/aurion-sigil_e1fd1a34.png`          | Header emblem and browser icon source.              |
| Console detail     | `/manus-storage/aurion-console-detail_4ce4a515.jpg` | Subtle menu material surface.                       |

## Generated asset prompts

The exact prompts were recorded during image generation in the build session. They mandate a premium cinematic mobile game look, no UI text or watermarks, and palette consistency around weathered bronze, sandstone and turquoise energy.

## Repositorygebundener GLB-Katalog

**GLB-Katalogstand:** `a4d99432e47b82ce98105eadb30360cd8040ad13` aus `OuroborosCollective/Wasd`.

**Quellinventarstand:** `a80df4d150cfeb12365fc26886420763eeb18313`, geprüft am 30. August 2026. Dieser Stand aktualisiert die Quellabdeckung. Er aktiviert keine GLBs automatisch.

| Katalogbereich             | Umfang      | Freigabestatus                 |
| -------------------------- | ----------- | ------------------------------ |
| WASD-Prüfkandidaten        | 149 Pfade   | revisionsgebunden geprüft      |
| Eindeutige WASD-GLBs       | 72 Einträge | keine automatische Aktivierung |
| Direkte Laufzeitkandidaten | 38 Einträge | `runtime_load`                 |
| LOD-Vorbereitung           | 28 Einträge | `prepare_lod`                  |
| Parser-Prüfung             | 6 Einträge  | `parser_review`                |
| Aurion-Szenenzuordnungen   | 10 GLBs     | explizites Ziel erforderlich   |

Die GLB-Kennzahlen gelten für den Katalogstand `a4d99432e47b82ce98105eadb30360cd8040ad13`. Sie dürfen nicht ohne neuen Audit auf den Quellinventarstand übertragen werden.

## Open-World-Assetfamilien

| Familie                      | Weltfunktion                   | Browser-/Mobilvertrag                             | Umsetzung                                       |
| ---------------------------- | ------------------------------ | ------------------------------------------------- | ----------------------------------------------- |
| Turmportal und Rückkehrstein | Übergang Turm → Aurion-Expanse | maximal 2.500 Dreiecke, ein PBR-Atlas mit 1024²   | Zunächst prozedural, später GLB-Katalogfreigabe |
| Windhain-Kit                 | erste offene Zone              | höchstens vier wiederkehrende Thin-Instance-Typen | neue Konzeptgrafik und modulare Props           |
| Astralwisp                   | erste Gegnerfamilie            | maximal 1.200 Dreiecke, 24 Bones, Textur 512²     | prozedurale Vorstufe, GLB später                |
| Runenwächter                 | Elite und Questbegegnung       | maximal 4.000 Dreiecke, 48 Bones, Textur 1024²    | GLB-Spezifikation vor Erzeugung                 |
| Aschengewölbe-Torset         | Dungeonzugang                  | maximal 3.500 Dreiecke, ein Atlas 1024²           | vorhandene Prop-Sprache erweitern               |

Neue GLB-Charaktere erhalten PBR Metallic-Roughness, höchstens vier Bone-Einflüsse pro Vertex und die getrennten Clips `idle`, `walk`, `run`, `hit`, `attack_01`, `cast_01`. Vor der Szeneinbindung durchlaufen sie die vorhandene GLB-Freigabe und Zielzuweisung.

## Erzeugte Aurion-GLB-Kandidaten

| Kandidat            | Binärartefakt                                                | Zielbudget                                         | Freigabestatus                                 |
| ------------------- | ------------------------------------------------------------ | -------------------------------------------------- | ---------------------------------------------- |
| Astralwisp          | `/manus-storage/aurion-astralwisp-mobile_8898dcae.glb`       | höchstens 5.000 Faces, eine 512²-Textur, ungeriggt | Binärkandidat vorhanden; Review und Ziel offen |
| Rückkehrstein       | `/manus-storage/aurion-return-stone-mobile_7d892a40.glb`     | höchstens 2.500 Faces, eine 512²-Textur, statisch  | Binärkandidat vorhanden; Review und Ziel offen |
| Sternenpfad-Archway | `/manus-storage/aurion-starpath-archway-mobile_bb96597a.glb` | höchstens 3.500 Faces, ein 1024²-Atlas, statisch   | Binärkandidat vorhanden; Review und Ziel offen |

## Expanse-Terrain- und Wegenetzmaterialien

| Oberfläche          | Verwalteter Pfad                                               | Mobilevertrag                                                                            | Laufzeitzuweisung                         |
| ------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------- |
| Gras                | `/manus-storage/aurion-terrain-grass_811245e1.png`             | wiederholbar, 1024²-Kandidat, Teil eines maximal sieben Materialtypen umfassenden Chunks | serverbestätigte Schwellen-Tiles          |
| Blumenwiese         | `/manus-storage/aurion-terrain-flower-meadow_c5078eb0.png`     | wiederholbar, 1024²-Kandidat, keine Einzelblumen-Geometrie                               | serverbestätigte Windhollow-Tiles         |
| Erde                | `/manus-storage/aurion-terrain-earth_f53862cb.png`             | wiederholbar, 1024²-Kandidat, ein gebündelter Materialtyp                                | serverbestätigte Emberfall-/Gewölbe-Tiles |
| Acker               | `/manus-storage/aurion-terrain-farmland_2c4edf2e.png`          | wiederholbar, 1024²-Kandidat, 20 Feld-Tiles im 8×8-Referenzchunk                         | serverbestätigte Emberfall-Felder         |
| Gartenparzellen     | `/manus-storage/aurion-terrain-garden-parcels_8810616b.png`    | wiederholbar, 1024²-Kandidat, 5 Garten-Tiles im 8×8-Referenzchunk                        | serverbestätigte Emberfall-Gärten         |
| Sternenweg          | `/manus-storage/aurion-terrain-starpath_37c69d4b.png`          | wiederholbar, 1024²-Kandidat, Thin Instances je Oberflächentyp                           | serverbestätigte Wegetiles                |
| Sternenweg-Kreuzung | `/manus-storage/aurion-terrain-starpath-crossing_ead3a305.png` | wiederholbar, 1024²-Kandidat, eine Kreuzung im Referenzchunk                             | serverbestätigte Kreuzungstile            |

Die Texturen sind visuelle Ressourcen. Der `OpenWorldSnapshot` legt die 32×32-m-Chunks, 4×4-m-Tiles, die 8×8-Anordnung und die Oberflächenkeys fest. Browsercode gruppiert nur nach bestätigtem Key in höchstens sieben Terrainmaterialien; kein Texturpfad darf Quest-, Loot-, Spawn-, Kampf- oder Fortschrittsdaten ändern.

Kein Kandidat ist automatisch eine aktive In-Game-Ressource. Jeder GLB muss zuerst als Binärdatei, sichtbare Geometrie und Größenbudget geprüft, dann als nicht aktives Katalogasset erfasst und erst nach einer expliziten Zielzuweisung geladen werden.

### Erzeugte Binärkandidaten

| Kandidat               | Verwalteter GLB-Pfad                                         | Binärprüfung                                                            | Aktivierung                                       |
| ---------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------- |
| Astralwisp             | `/manus-storage/aurion-astralwisp-mobile_8898dcae.glb`       | glTF 2.0, 14.760 Bytes, zehn Meshteile                                  | inaktiv, Review offen                             |
| Rückkehrstein          | `/manus-storage/aurion-return-stone-mobile_7d892a40.glb`     | glTF 2.0, 6.420 Bytes, vier Meshteile                                   | inaktiv, Review offen                             |
| Sternenpfad-Archway    | `/manus-storage/aurion-starpath-archway-mobile_bb96597a.glb` | glTF 2.0, 7.272 Bytes, fünf Meshteile                                   | inaktiv, Review offen                             |
| Tripo-Blütenbüschel    | `/manus-storage/aurion-tripo-flower-shrub_e4191cad.glb`      | glTF 2.0, 676.432 Bytes, 1 Mesh, 1.115 Dreiecke, 1 Material, 3 Texturen | visuell geprüft, inaktiv bis zur Expansezuweisung |
| Tripo-Sternenwegmarke  | `/manus-storage/aurion-tripo-starpath-marker_da5fe3a7.glb`   | glTF 2.0, 608.132 Bytes, 1 Mesh, 930 Dreiecke, 1 Material, 3 Texturen   | visuell geprüft, inaktiv bis zur Expansezuweisung |
| Tripo-Gartenbegrenzung | `/manus-storage/aurion-tripo-garden-border_8032d87a.glb`     | glTF 2.0, 613.852 Bytes, 1 Mesh, 751 Dreiecke, 1 Material, 3 Texturen   | visuell geprüft, inaktiv bis zur Expansezuweisung |

Die visuellen Tripo-Readbacks vom 22. August 2026 bestätigen drei mobile Open-World-Kandidaten. Sie bleiben bis zur jeweiligen Binär-/Speicherprüfung und Zielzuweisung nicht aktiv.
