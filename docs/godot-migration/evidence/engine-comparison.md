---
description: "Quellengebundener Godot-Unity-Vergleich für Echoes of Aurion; Entscheidungshilfe, kein Runtime-Benchmark."
---

# Evidence: Godot 4.x gegenüber Unity 6

## Aussagegrenze

Dieser Vergleich bewertet die Anforderungen von Echoes of Aurion am 15.10.2026. Er ist kein FPS-Benchmark und kein Beweis für ein gebautes APK. Beide Engines können Android-Clients erstellen und automatisiert bauen. Die Gewichtung bildet den bevorzugten Workflow des Owners ab: möglichst wenig manuelle Editor-, Lizenz- und Dateiarbeit.

## Gemeinsame Anforderungen

- dünner WSS-/JSON-Client für eine unveränderte Aurion-Authority;
- Import vorhandener GLB-Dateien mit Rig, Animationen und PBR-Materialien;
- Touchbedienung und 30-FPS-Pflichtmodus auf Galaxy Tab A9 mit 4 GB RAM;
- reproduzierbare Android-Builds und überprüfbare Vorschau;
- dateibasierte Bearbeitung, Tests und Reviews aus dem Chat;
- keine dauerhafte Doppeltoolchain und keine zweite Gameplaywahrheit.

## Gewichtete Entscheidungsmatrix

Die Skala reicht von 1 (schlechter Fit) bis 5 (starker Fit). `Gewicht × Wert / 5` ergibt die Punkte. Die Werte beurteilen den Projektfit; sie sind keine allgemeinen Enginequalitäten.

| Kriterium | Gewicht | Godot | Unity | Begründung |
|---|---:|---:|---:|---|
| wenig Owner-Handarbeit | 25 | 5 | 3 | Godot ohne Editoraktivierung; Unity Personal benötigt Hub-Anmeldung/Aktivierung |
| Git-/Chat-Automation | 20 | 5 | 4 | Godot TSCN und CLI sind direkt geeignet; Unity hat CLI/YAML, warnt aber vor externer UnityYAML-Erzeugung oder -Bearbeitung |
| Aurion WSS-/JSON-Fit | 15 | 5 | 5 | in beiden Engines als dünner Client lösbar; kein Entscheidungsunterschied |
| vorhandene GLB-Pipeline | 15 | 5 | 3 | Godot dokumentiert GLB direkt; für Unity ist im geprüften Basisscope noch ein konkreter Importweg zu pinnen |
| Android-/4-GB-Steuerbarkeit | 15 | 4 | 4 | beide benötigen echten Build- und Gerätetest; keine pauschale Performancewertung |
| Lizenz-/CI-Reibung | 10 | 5 | 3 | Godot MIT ohne Aktivierung; Unity aktuell ohne Runtime Fee, aber mit Lizenzaktivierung |
| **Gesamt** | **100** | **97** | **73** | Entscheidungsvorsprung für den konkreten Workflow |

## Nachweis je Grenze

| Grenze | Godot | Unity | Schluss für Aurion |
|---|---|---|---|
| Lizenz | MIT; Nutzung und Änderung erlaubt, Lizenzhinweis erforderlich | Unity Personal aktuell bis 200.000 USD Umsatz/Finanzierung; Runtime Fee aufgehoben | Godot reduziert Konten- und Aktivierungsarbeit; Unity wird nicht mit einer veralteten Runtime-Fee-Behauptung abgewertet |
| Aktivierung | keine Editor-Lizenzaktivierung | Editor benötigt aktivierte Lizenz; Personal wird über Unity Hub angemeldet | Godot ist einfacher für autonome Arbeitsumgebungen |
| Headless/CI | `--headless`, `--import`, `--export-release` dokumentiert | Batchmode und Command-Line-Build dokumentiert | beide automatisierbar; konkrete Version und Exportprofile müssen gepinnt werden |
| Szenendateien | TSCN ist größtenteils menschenlesbar und VCS-freundlich | Szenen/Prefabs können textserialisiert sein; UnityYAML ist eine eigene Teilmenge und soll laut Referenz nicht extern erzeugt oder editiert werden | Godot ist für direkte, prüfbare Dateiänderungen risikoärmer |
| WebSocket | `WebSocketPeer` unterstützt Client, Textframes und Polling | im Rahmen dieser Entscheidung kein differenzierender Blocker nachgewiesen | vorhandenen Aurion-Vertrag zuerst in Godot kapseln |
| GLB | glTF 2.0 empfohlen; `.glb` direkt unterstützt | konkreter Paket-/Importpfad muss vor einem Unity-Spike gepinnt werden | Godot startet mit der vorhandenen Quellform; echte Aurion-Assets bleiben Pflichtprüfung |
| Android | offizieller Exportweg benötigt unter anderem JDK und Android SDK | offizieller Android-/CLI-Buildweg vorhanden, zusätzlich aktivierte Editorlizenz | keine Engine erhält ohne echtes APK und Tab-A9-Lauf einen Runtimepunkt |
| Renderer | Mobile- und Compatibility-Renderer vorhanden; Szenen können Anpassungen beim Wechsel brauchen | keine für Aurion gemessene Überlegenheit belegt | Renderer wird in G05/G08 gewählt, protokolliert und auf dem Gerät gemessen |

## Tatsächlicher Umgebungsbefund

Ein read-only Pfadcheck am 15.10.2026 ergab:

| Werkzeug | Befund |
|---|---|
| `godot` / `godot4` | nicht installiert |
| Unity Editor | nicht installiert |
| `adb` / Android `sdkmanager` | nicht installiert |
| Java | vorhanden |
| physisches Tab A9 | nicht an die Arbeitsumgebung angebunden |

Dieser Befund sagt nur, was für den nächsten Toolchainschritt fehlt. Er misst weder Enginequalität noch Geräteleistung. Die SoftwareGPU-Werkbank gehört zu `ARE-SOFTWAREGPU-ENGINE` und ist keine Godot-Vorschau. Ein unmittelbar nutzbarer Godot-MCP-Worker für dieses Repository wurde noch nicht nachgewiesen; diese Fähigkeit wird in G36–G40 getrennt geprüft.

## Offizielle Quellen

### Godot

- [MIT-Lizenz](https://godotengine.org/license/)
- [Kommandozeile, Headless-Import und Export](https://docs.godotengine.org/en/stable/tutorials/editor/command_line_tutorial.html)
- [TSCN-Textformat](https://docs.godotengine.org/en/stable/engine_details/file_formats/tscn.html)
- [Unterstützte 3D-Formate und GLB](https://docs.godotengine.org/en/stable/tutorials/assets_pipeline/importing_3d_scenes/available_formats.html)
- [WebSocketPeer](https://docs.godotengine.org/en/stable/classes/class_websocketpeer.html)
- [Android-Export](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_android.html)
- [Rendererübersicht](https://docs.godotengine.org/en/stable/tutorials/rendering/renderers.html)

### Unity

- [Aktuelle Preis- und Schwellenänderungen](https://unity.com/products/pricing-updates)
- [Aufhebung der Runtime Fee](https://unity.com/blog/terms-update-runtime-fee-cancellation)
- [Lizenzaktivierung](https://docs.unity.com/en-us/engine/6000.3/manual/get-started/install-and-upgrade/licenses-and-activation)
- [Unity-Hub-Lizenzverwaltung](https://docs.unity.com/en-us/hub/manage-license)
- [Build über die Kommandozeile](https://docs.unity3d.com/6000.0/Documentation/Manual/build-command-line.html)
- [Textbasierte Szenendateien](https://docs.unity3d.com/6000.0/Documentation/Manual/TextSceneFormat.html)
- [UnityYAML-Grenzen](https://docs.unity3d.com/6000.0/Documentation/Manual/UnityYAML.html)

