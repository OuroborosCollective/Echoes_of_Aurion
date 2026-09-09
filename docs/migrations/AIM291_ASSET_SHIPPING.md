---
description: Reproduzierbare GLB-Auslieferung, verifizierte Varianten und begrenzte AX1-Ressourcen.
---

# AIM-291 — Mobile GLB-Auslieferung

AX1 lädt GLB/glTF 2.0 als Darstellung bestätigter Daten. Assetmetadaten vergeben keine Gegenstände, Werte, Kollisionen oder NPC-Entscheidungen. WASD behält die Spielregeln; Aurion liefert Katalog, Transport, Persistenz und Nachweise.

## Reproduzierbare Varianten

Die Pipeline bindet Quellarchive, Katalog, jede Quell-LOD, getrennte Collider, Werkzeugversionen, Dependency-Lock und Transform-Skripte an SHA-256. Die vorhandene Blender-Stufe bleibt für neue Quellen erhalten. Bereits geprüfte LOD-Familien können direkt weiterverarbeitet werden, ohne bestätigte Collider erneut zu erzeugen. Prune/Dedupe und Meshopt werden beim Build ausgeführt; bei neuen Quellen erzeugt Blender die vereinfachten LODs. Die geprüften vorhandenen LODs werden nicht nochmals vereinfacht.

glTF Transform 4.5.0 und KTX Software 4.4.2 sind festgelegt. Das KTX-Archiv wird vor der Verwendung gegen SHA-256 geprüft. Vor der KTX2-Kompression werden alle Rasterformate explizit in PNG überführt: Der Optimierer überspringt sonst vorhandene WebP-Texturen, obwohl sein Prozess erfolgreich endet. Jede erzeugte KTX2-Datei wird deshalb anhand tatsächlicher eingebetteter Bilddaten geprüft.

Der native KTX-Aufruf verwendet ausdrücklich vier Encoder-Threads. Ein lokaler Prozessadapter setzt diesen Parameter vor der Kompression, weil `gltf-transform optimize` ihn sonst aus der CPU-Anzahl ableitet. Aktives UASTC-RDO verwendet zusätzlich die deterministische Option `--uastc-rdo-m`. Die vorhandene Optimierungssequenz und ihre Qualitätswerte bleiben erhalten. Der Adapter reicht Ausgabe und Exitcode des echten Encoders durch; er verändert keine erzeugten Texturbytes. Das Manifest bindet Adapter, natives Encoder-Binary und Parameter per Hash. Der Auditor liest `KTXwriterScParams` aus jeder erzeugten KTX2-Textur zurück und verwirft abweichende Thread-/RDO-Parameter.

`city-foundation-wood-03` und `nature-root-1` besitzen jeweils drei Meshopt/KTX2-LODs und drei separat geprüfte WebP-Alternativen. Zusammen mit dem unveränderten Collider ergeben sich 13 Dateien. Das Offline-Bundle und die Three.js-Basis-Decoder werden beim Build gegen ihre Hashes geprüft. Vor jedem Runtime-Decode werden Bytezahl und SHA-256 der empfangenen GLB geprüft. Nach dem Decode müssen alle referenzierten Materialtexturen tatsächlich vorhanden sein: Three.js kann einzelne Texturfehler abfangen und trotzdem ein Modell zurückgeben. Ein fehlender oder fehlerhafter Basis-Decoder führt deshalb erst nach dieser Vollständigkeitsprüfung zur geprüften Alternative derselben Quell-LOD.

Der CI-Lauf erzeugt zwei vollständige Ausgabesätze mit ausgewiesenen Node-/Python-Versionen und vergleicht alle 13 GLB-Dateien bytegleich miteinander und mit dem eingecheckten Bundle. Zusätzlich müssen Quellbindungen, Transformparameter, Encoderidentität und Skripthashes passen. Unterschiedliche Laufzeitversionen bleiben im jeweiligen Manifest sichtbar. Die aktuellen Manifest-/Bundle-Hashes stehen in `shared/worldAssetShipping.json` und den revisionsgebundenen CI-Artefakten.

KTX2 spart bei diesen Quellen keine Netzbytes: Die Foundation-LOD1 benötigt 1.280.524 Bytes als KTX2 gegenüber 164.876 Bytes als WebP-Alternative. Der Vorteil komprimierter Texturen muss anhand des tatsächlich transkodierten Upload-Payloads beurteilt werden; er darf nicht aus der Dateiendung abgeleitet werden.

## Grenzen pro Geräteprofil

Alle Bytegrenzen verwenden MiB. Das gemeinsame Allokationsprofil wird beim Laden der Anwendung anhand der Fensterbreite festgelegt (Phone unter 768, Tablet unter 1200, sonst Desktop) und bleibt bis zum Neuladen stabil. Größenänderungen können die visuellen Weltziele weiter senken, setzen aber keine bereits vergebenen Allokationen rückwirkend unter eine kleinere Grenze. Die gemeinsame Ressourcenverwaltung umfasst Weltmodelle sowie Charakter-, NPC- und Ausrüstungs-GLBs. Weltinstanzen besitzen zusätzlich eigene Grenzen. Reservierte Texturbytes verwenden konservativ RGBA8 einschließlich Mips, auch wenn Basis eine kleinere GPU-komprimierte Darstellung liefert. Expandierte Accessor-Arrays einschließlich Sparse-Accessors werden vor dem Decode mitgezählt.

| Grenze | Phone | Tablet | Desktop |
| --- | ---: | ---: | ---: |
| Sichtbare Weltinstanzen | 48 | 64 | 84 |
| Gewählte Weltmodelle | 18 | 24 | 30 |
| Weltcache | 24 | 32 | 40 |
| Weitere aktive GLB-Kopien | 12 | 20 | 32 |
| Reservierte Animationsaktionen | 8 | 12 | 20 |
| Gleichzeitige Decodejobs | 2 | 2 | 2 |
| Basis-Worker je Renderer | 1 | 1 | 2 |
| Gemeinsame Modell-Allokationen | 40 | 56 | 80 |
| Texturreserve | 48 | 96 | 192 |
| Decodierte Geometrie-/Texturreserve | 64 | 128 | 256 |
| Einzelner GLB-Download | 8 | 12 | 16 |
| Gleichzeitige Downloadreserve | 16 | 24 | 32 |
| Asset-Arbeitssatz: Decode + zweimal Downloadreserve | 96 | 192 | 384 |

Zwei Animationsaktionen je animierter Kopie decken den laufenden Clip und einen Übergang ab. Ein weiterer Wechsel beendet den vorherigen Übergang; abgeschlossene Übergänge werden gestoppt. Kopien teilen die Ressourcen ihres Cache-Eintrags. Erst wenn keine Kopie sie verwendet, darf der Cache sie entsorgen. Veraltete asynchrone Ergebnisse, Ausrüstungstausch, ungültige Modelle und Renderer-Abbau geben ihre Kopien frei. Ungebundene URL-Fallbacks und lokale Gegenstandsvergabe aus dem visuellen Katalog werden abgewiesen.

Speicherdruck schaltet die Weltprojektion auf LOD2, halbiert ihre Modell-/Instanzziele und entfernt ungenutzte Cache-Einträge. Eine abgewiesene Darstellung verändert weder bestätigte Receipts noch den Weltzustand. Asset-Allokationsgrenzen sind keine Obergrenze für den gesamten Browserprozess; Terrain, Browser, JavaScript-Laufzeit und Treiber besitzen zusätzliche Kosten.

## Prüfungen und ihre Aussage

Der dedizierte Workflow `AIM-291 Asset Shipping` führt tatsächliche authentifizierte Browserläufe gegen eine isolierte MariaDB mit Phone-, Tablet- und Desktop-Viewport aus. Er verlangt erfolgreich transkodierte KTX2-Texturen und einen tatsächlichen Renderer-Aufruf für ein ausgeliefertes Modell, blockiert anschließend den echten WASM-Download in einer frischen Seite und verlangt gezeichnete, geprüfte Raster-Alternativen. Die Kamera wird über die normale Zoom-Eingabe eingestellt. Welt-, Katalog- und Collider-Hashes müssen gleich bleiben.

Die Nachweise enthalten Decodezeiten, tatsächlich empfangene Bytes, Resource-Timing-Netzwerte, transkodierte Mip-Payloads, Allokationsspitzen und alle Profilgrenzen. Alle 500 ms werden CDP-JavaScript-Heap und die Summe der RSS-Werte der Chromium-Prozesse erfasst. Die RSS-Summe zählt gemeinsam verwendete Seiten mehrfach; Sampling kann kurze Spitzen verpassen. Diese Zahlen und SwiftShader-Renderings zertifizieren weder native Mobilgeräte noch Treiber-VRAM oder authentifiziertes Produktionsspiel.

Der ursprüngliche Lauf auf `2f139bd8ba594082da32398d695580519c0a4d4b` bestand alle drei Browserprofile, scheiterte aber beim Vergleich mit dem eingecheckten Bundle: Die lokalen KTX-Metadaten enthielten neun Threads, die CI-Ausgabe vier. Dieser Fehler begründet den expliziten Encodervertrag. Frühere Browserbelege gelten für ihren damaligen Head. Für die Korrektur werden vollständige Neugenerierung, neue Browserläufe und anschließend kanonische Produktions- und Schema-Readbacks verlangt; deren tatsächlicher Abschluss wird im PR dokumentiert.

## Primärquellen

- [glTF Transform CLI](https://gltf-transform.dev/cli)
- [Three.js KTX2Loader](https://threejs.org/docs/pages/KTX2Loader.html)
- [KHR_texture_basisu](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_texture_basisu)
- [KTX Software 4.4.2](https://github.com/KhronosGroup/KTX-Software/releases/tag/v4.4.2)
- [KTX Encoderparameter](https://github.khronos.org/KTX-Software/ktxtools/ktx_create.html)
