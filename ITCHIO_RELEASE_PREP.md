# itch.io-Releasevorbereitung — Echoes of Aurion

## Empfohlener Veröffentlichungsweg

Echoes of Aurion wird als **HTML5 Game** veröffentlicht. itch.io führt HTML5-Spiele direkt in einem iframe aus; für ein mehrteiliges Projekt wird ein ZIP-Archiv benötigt, das im Wurzelverzeichnis eine `index.html` enthält. Alle referenzierten Dateien müssen im Archiv enthalten sein und relativ referenziert werden.[1]

| Bereich | Release-Entscheidung |
| --- | --- |
| Upload-Artefakt | Browserbuild als ZIP mit `index.html` im ZIP-Wurzelverzeichnis |
| Startmodus | Click-to-launch im Vollbildmodus, damit die mobile UI nicht vom Seitenchrome verdeckt wird |
| Mobile | „Mobile Friendly“ aktivieren; itch.io nutzt auf Mobilgeräten den Vollbildstart |
| Externe Gateway-API | Ausschließlich HTTPS; die produktive MCP- und API-Domain muss CORS und sichere Cookies korrekt unterstützen |
| Medien | Cover im Verhältnis 315:250, empfohlen 630×500; drei bis fünf Screenshots |
| Sichtbarkeit | Zunächst privat testen, danach als Public oder Public Restricted veröffentlichen |

## Technische Grenzen

Ein HTML5-Archiv darf höchstens 1.000 Dateien enthalten; extrahiert sind maximal 500 MB zulässig und eine einzelne Datei darf maximal 200 MB groß sein.[1] Die aktuelle Vite-/Babylon-Fassung bleibt bewusst unter diesen Grenzen. Für itch.io sind absolute Assetpfade zu vermeiden, da Projekte in einem CDN-Unterverzeichnis ausgeliefert werden.[1]

Das MCP-Gateway bleibt **nicht** im itch.io-ZIP. Der HTML5-Client kommuniziert ausschließlich über die separate HTTPS-Gateway-Domain. Vor dem öffentlichen Upload wird der E2E-Test mit echter persönlicher Browserkopplung abgeschlossen, damit eine veröffentlichte Fassung keine unvollständige Authentifizierung anbietet.

## Spielseitenentwurf

**Titel:** Echoes of Aurion

**Kurzbeschreibung:** Ein mobiles 3D-Action-Abenteuer, in dem ein Explorer und ein sichtbarer LLM-Partner die letzte Sternwarte von Aurion durchqueren.

**Tags:** `3d`, `action`, `adventure`, `dark-fantasy`, `mobile`, `html5`, `babylonjs`, `ai-companion`

**Screenshot-Motive:** Das Aurion-Partner-Siegel, die Sentinel-Arena im Kampf, der Drei-Arenen-Fortschritt, das Echo-Loadout und die mobile Touch-Steuerung.

## Referenzen

[1] [itch.io: Uploading HTML5 Games](https://itch.io/docs/creators/html5)

[2] [itch.io: Your First Project Page](https://itch.io/docs/creators/getting-started)
