---
description: Reproduzierbare GLB-Auslieferung, verifizierte Varianten und begrenzte AX1-Ressourcen.
---

# AIM-291 — Mobile GLB-Auslieferung

AX1 lädt GLB/glTF 2.0 als Darstellung bestätigter Daten. Assetmetadaten vergeben keine Gegenstände, Werte, Kollisionen oder NPC-Entscheidungen. WASD behält die Spielregeln; Aurion liefert Katalog, Transport, Persistenz und Nachweise.

## Reproduzierbare Varianten

Die Pipeline bindet Quellarchive, Katalog, jede Quell-LOD, getrennte Collider, Werkzeugversionen, Dependency-Lock und Transform-Skripte an SHA-256. Die vorhandene Blender-Stufe bleibt für neue Quellen erhalten. Bereits geprüfte LOD-Familien können direkt weiterverarbeitet werden, ohne bestätigte Collider erneut zu erzeugen. Prune/Dedupe und Meshopt werden beim Build ausgeführt; bei neuen Quellen erzeugt Blender die vereinfachten LODs. Die geprüften vorhandenen LODs werden nicht nochmals vereinfacht.

glTF Transform 4.5.0 und KTX Software 4.4.2 sind festgelegt. Das KTX-Archiv wird vor der Verwendung gegen SHA-256 geprüft. Vor der KTX2-Kompression werden alle Rasterformate explizit in PNG überführt: Der Optimierer überspringt sonst vorhandene WebP-Texturen, obwohl sein Prozess erfolgreich endet. Jede erzeugte KTX2-Datei wird deshalb anhand tatsächlicher eingebetteter Bilddaten geprüft.

`city-foundation-wood-03` und `nature-root-1` besitzen jeweils drei Meshopt/KTX2-LODs und drei separat geprüfte WebP-Alternativen. Zusammen mit dem unveränderten Collider ergeben sich 13 Dateien. Das Offline-Bundle und die Three.js-Basis-Decoder werden beim Build gegen ihre Hashes geprüft. Vor jedem Runtime-Decode werden Bytezahl und SHA-256 der empfangenen GLB geprüft. Ein fehlender oder fehlerhafter Basis-Decoder führt zur geprüften Alternative derselben Quell-LOD.

Die beiden unabhängigen lokalen Builds lieferten identische Bytes für alle 13 Dateien und das Manifest. Der CLI-Validator bestätigte alle Dateien. Manifest: `681142dbb6c00af536c926bb5bc2b99e575fae60b28edd8c28dbd1ca1b667636`; Bundle: `e03559d4bfd0c1dbeedcde43bc6633bd43cf3e1e2296b7e1f26ffa241eb7adc7`. Der CI-Lauf wiederholt diese Builds mit ausgewiesenen Node-/Python-Versionen und vergleicht die GLB-Bytes zusätzlich mit dem eingecheckten Bundle. Unterschiedliche Laufzeitversionen bleiben im jeweiligen Manifest sichtbar.

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

Der dedizierte Workflow `AIM-291 Asset Shipping` führt tatsächliche authentifizierte Browserläufe gegen eine isolierte MariaDB mit Phone-, Tablet- und Desktop-Viewport aus. Er verlangt erfolgreich transkodierte KTX2-Texturen, blockiert anschließend den echten WASM-Download in einer frischen Seite und verlangt sichtbare, geprüfte Raster-Alternativen. Welt-, Katalog- und Collider-Hashes müssen gleich bleiben.

Die Nachweise enthalten Decodezeiten, tatsächlich empfangene Bytes, Resource-Timing-Netzwerte, transkodierte Mip-Payloads, Allokationsspitzen und alle Profilgrenzen. Alle 500 ms werden CDP-JavaScript-Heap und die Summe der RSS-Werte der Chromium-Prozesse erfasst. Die RSS-Summe zählt gemeinsam verwendete Seiten mehrfach; Sampling kann kurze Spitzen verpassen. Diese Zahlen und SwiftShader-Renderings zertifizieren weder native Mobilgeräte noch Treiber-VRAM oder authentifiziertes Produktionsspiel.

Status beim Anlegen dieser Dokumentation: lokale Reproduzierbarkeit und gezielte Regressionen geprüft; exakte CI-Browserergebnisse, Review, Merge und Produktionsabschluss stehen noch aus. Die automatisierten Anforderungen sind keine Behauptung, dass der jeweilige Lauf bereits bestanden hat.

## Primärquellen

- [glTF Transform CLI](https://gltf-transform.dev/cli)
- [Three.js KTX2Loader](https://threejs.org/docs/pages/KTX2Loader.html)
- [KHR_texture_basisu](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_texture_basisu)
- [KTX Software 4.4.2](https://github.com/KhronosGroup/KTX-Software/releases/tag/v4.4.2)
