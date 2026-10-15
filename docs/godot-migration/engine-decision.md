---
description: "Verbindliche, überprüfbare Engineentscheidung für den dünnen Aurion-Client auf dem Galaxy Tab A9 mit 4 GB RAM."
---

# Engineentscheidung: Godot 4.x

**Status:** Angenommen für die Clientmigration  
**Datum:** 15.10.2026  
**Aufgabe:** [G00 / #909](https://github.com/OuroborosCollective/Echoes_of_Aurion/issues/909)  
**Grundlage:** [Architektur und Migrationsplan](architecture.md), [Tab-A9-Profil](tab-a9-profile.md) und [Vergleichsnachweis](evidence/engine-comparison.md)

## Entscheidung

Der neue Echoes-of-Aurion-Client wird mit einer in G05 fest zu pinnenden stabilen **Godot-4.x-Version und GDScript** aufgebaut. Der bestehende TypeScript-Server bleibt unverändert Aurions einzige Gameplay-, Welt-, NPC-, Quest-, Wirtschafts- und Persistenz-Authority.

Unity wird nicht parallel eingerichtet. Es bleibt ein begrenzter Rückfallkandidat, falls einer der unten definierten Gates mit Godot reproduzierbar scheitert und ein identischer Unity-Mikrospike den konkreten Blocker nachweislich löst.

Diese Entscheidung beruht auf Automatisierbarkeit, Repositoryfit und geringem Owneraufwand. Sie behauptet keinen pauschalen Leistungsvorsprung von Godot und keinen bestandenen Android-Gerätetest.

## Warum Godot hier passt

1. **Direkter Protokollfit:** Godot besitzt einen WebSocket-Client für Textframes. Der vorhandene WSS-/JSON-Vertrag kann als dünne Transport- und Projektionsschicht umgesetzt werden; Aurion-Logik bleibt auf dem Server.
2. **Vorhandene Assets:** Godot dokumentiert glTF 2.0 und GLB als unterstützte beziehungsweise empfohlene 3D-Formate. Die tatsächlichen Aurion-Animationen, Materialien und Android-Importkosten werden trotzdem einzeln geprüft.
3. **Chat- und Git-Arbeit:** TSCN-Szenen und GDScript sind textbasiert und reviewbar. Headless-Import, Tests und Export sind über die Godot-CLI vorgesehen. Dadurch kann der Agent den Großteil der Arbeit über Dateien, CI und reproduzierbare Befehle erledigen.
4. **Geringe Zugangslast:** Godot steht unter MIT und benötigt keine Editor-Lizenzaktivierung. Unity Personal ist aktuell ebenfalls kostenfrei innerhalb seiner Schwelle und die Runtime Fee ist aufgehoben; Unity verlangt jedoch eine aktivierte Lizenz und bei Personal eine Hub-Anmeldung. Das erhöht die manuelle und CI-bezogene Zugangslast für diesen Ein-Personen-Workflow.
5. **Begrenzter Client:** Aurion benötigt keine zweite MMO-Simulation in der Engine. Der Client sammelt Intents, rendert bestätigte Zustände und kann deshalb klein und modular bleiben.

## Festgelegte technische Richtung

- `godot-client/` bleibt die einzige Enginefläche im Repository.
- GDScript ist der Standard für Transport, Projektion, Szenensteuerung, UI und Diagnostik. C# wird nur nach einer eigenen begründeten Entscheidung eingeführt.
- WSS- und HTTPS-Daten werden gegen versionierte, sprachneutrale Verträge validiert. Godot erzeugt keine kanonischen Gameplaywerte.
- GLB-Quellen bleiben außerhalb der Spiellogik; abgeleitete Imports und Profile sind reproduzierbar und hashgebunden.
- Der Pflichtmodus für das Tab A9 mit 4 GB bleibt 30 FPS. 60 FPS ist optional.
- Szenen-, Input-, Export- und Qualitätswerte werden als Dateien versioniert. Der Owner muss keine Routinewerte im Inspector pflegen.

## Verbindliche Gates

| Gate | Nachweis | Bei Scheitern |
|---|---|---|
| G05 Toolchain | gepinnte Godot-Version, Exporttemplates, JDK und Android SDK; Headless-Import reproduzierbar | kleinsten Setupfehler beheben; keine Engineumwahl allein wegen fehlender Installation |
| G08 Android | reproduzierbares Debug-APK lässt sich auf dem echten Tab A9 installieren und starten | Ursache zwischen Toolchain, Manifest, Gerät und Projekt trennen |
| G13 Netzwerk | echter Login sowie WSS-Welcome/Snapshot gegen Aurion ohne zweite Authority | Vertrag/Auth korrigieren; gleiche Servergrenze beibehalten |
| G17 Asset | eine repräsentative animierte Aurion-GLB-Figur und ein Umweltasset importieren korrekt | Importprofil oder Quellasset gezielt korrigieren |
| G31 Gerät | 20-Minuten-Lauf hält die versionierten 30-FPS-, PSS-, Ladezeit-, Stabilitäts- und Thermikbudgets | einen begrenzten Godot-Optimierungsslice durchführen und erneut messen |
| G36–G40 Automation | Agent kann Dateien, Szenen, Tests, Build und Vorschau mit echtem Readback bearbeiten | kleinstes fehlendes Tool ergänzen; UI-Behauptungen ohne Vorschau bleiben unzulässig |

## Wann die Entscheidung wieder geöffnet wird

Eine Unity-Prüfung wird nur eröffnet, wenn mindestens ein konkreter Blocker nach einem begrenzten Godot-Fix bestehen bleibt:

- repräsentative animierte GLB-Datei kann nicht mit korrektem Rig, Animation und Material importiert werden;
- reproduzierbarer Android-Build oder Installation auf dem echten Tab A9 bleibt unmöglich;
- das 4-GB-Gerät verfehlt nach einem gezielten Optimierungsslice weiterhin ein verbindliches Budget;
- der Agent kann Szenen und Builds nicht mit überprüfbarem Readback bearbeiten, sodass regelmäßige manuelle Editorarbeit des Owners nötig wäre.

Dann verwendet der Unity-Mikrospike dasselbe Asset, denselben Aurion-Vertrag, dieselbe Touchfläche und dasselbe Messprofil. Nur ein belegter Vorteil am konkreten Blocker rechtfertigt die Umplanung. Der bestehende Issue- und Dateiplan bleibt als Provenienz erhalten.

## Aktuelle Evidence-Grenze

In der Arbeitsumgebung wurden am 15.10.2026 weder Godot noch Unity, ADB oder Android SDK gefunden; Java ist vorhanden. Ein physisches Tab A9 ist nicht mit dieser Umgebung verbunden. Die verfügbare SoftwareGPU-Werkbank zielt auf ein anderes Repository und ersetzt weder Godot- noch Unity-Runtime-Evidence. Deshalb folgen Installation, APK und Gerätemessung in ihren eigenen Gates und werden hier nicht vorgetäuscht.

Die nächste Aufgabe ist [G03 / #910](https://github.com/OuroborosCollective/Echoes_of_Aurion/issues/910): der sprachneutrale Aurion-Clientvertrag. Danach pinnt G05 die konkrete Godot-Version und Toolchain.

