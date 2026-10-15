---
description: "Aurion Preview auf dem Samsung Galaxy Tab A9 installieren und den ersten Start prüfen."
---

# Aurion Preview auf dem Tab A9

Die erste Test-App zeigt die vorbereitete Startansicht. Anmeldung und Online-Spiel sind noch nicht verfügbar. Für den Owner sind weder Godot-Editor noch SDK, Terminal oder Inspector nötig.

## Installation

1. Den im Chat gelieferten geprüften APK-Download öffnen. Die Datei heißt **Aurion-Preview.apk**. Bei einem Actions-Artefakt ist eine GitHub-Anmeldung und das Entpacken der ZIP nötig; im Chat wird nach Möglichkeit die einzelne APK bereitgestellt.
2. Die APK öffnen. Falls Android fragt, die Installation aus dieser Download-App einmal erlauben. Die Bezeichnungen können je nach Android-/Samsung-Version abweichen. Die Freigabe kann anschließend wieder ausgeschaltet werden.
3. **Aurion Preview** starten und das Tablet quer halten. Einen Screenshot mit der unten sichtbaren **Build-ID** im Chat senden. Keine Gerätekennungen oder Zugangsdaten mitsenden.

Wenn Android die Installation blockiert, den genauen Meldungstext zurückmelden. Sicherheitsfunktionen nicht pauschal ausschalten. Der Agent prüft zuerst Paket, Signatur und Gerätekompatibilität.

## Was dieser Test belegt

Ein erfolgreicher Build mit geprüftem Manifest und APK-Signatur ist **BUILD PASS / DEVICE UNVERIFIED**. Erst ein wirklicher Start auf dem Tablet belegt die Geräteausführung. Eine flüssige Startansicht belegt noch keine MMORPG-Leistung; der längere Leistungstest folgt separat.

| Eigenschaft | Test-App |
| --- | --- |
| Anzeigename | Aurion Preview |
| Paket | `org.ouroboroscollective.aurion.godot.preview` |
| Architektur | ARM64; tatsächliche Installation auf dem konkreten Gerät noch zu prüfen |
| Renderer | Godot Compatibility / OpenGL |
| Orientierung | Querformat |
| Berechtigung | INTERNET |
| Template-SDK | minSdk 24 / targetSdk 36 laut gepinntem Godot-4.7.2-Template; APK-Readback ist verbindlich |
| Build-ID | vollständiger Source-Commit, in die APK übernommen und sichtbar |
| Signierung | Debug; Fingerprint steht in `build-evidence.json` |

Der Paketname ist von der Godot-Editor-App getrennt. Bestehende Installationen des Tablets können aus der Entwicklungsumgebung nicht inventarisiert werden. Nicht blind eine andere App deinstallieren.

## Folgeversionen

Der Debugschlüssel liegt ausschließlich im lokalen Build-Arbeitsplatz, niemals im Repository oder APK-Artefakt. Frische CI-Arbeitsplätze erzeugen zunächst neue Debugschlüssel; dadurch ist ein direktes Update zwischen solchen Builds nicht garantiert. Bei Signaturkonflikten wird der konkrete Fingerprint verglichen. Eine nötige Neuinstallation der Preview wird ausdrücklich angekündigt; sie kann lokale Appdaten löschen. Dauerhafte Update-/Release-Signierung folgt in G34. Die erste Preview speichert noch keine Spielstände oder Konten.

## Nachweise und automatischer Build

Der Workflow **Godot Android Preview APK** erzeugt APK, SHA256, Source-/Editor-/Toolchainidentität sowie unabhängige `aapt`-/`apksigner`-Protokolle. Paketname, Versionswerte, INTERNET, SDK, ARM64-Bibliothek, Querformat, Signatur und verpackte Build-ID werden tatsächlich ausgelesen. Tests werden vom Export ausgeschlossen.

Buildskript: `scripts/godot/export-android.mjs`. Das Skript prüft die installierten Werkzeuge vor ihrer Ausführung, exportiert eine isolierte Projektkopie und konfiguriert den Editor automatisch in einem eigenen XDG-Verzeichnis. Die gepinnte SDK-Installation bleibt unverändert. Der klassische APK-Export verwendet die vorhandenen Templates; Gradle und sdkmanager werden nicht aufgerufen. Eine SDK-Lizenzbestätigung wird dadurch nicht behauptet oder als Datei erfunden.

[Zurück zum Arbeitsplatz](workspace.md) · [Geräteprofil](tab-a9-profile.md) · [G08 mit aktuellem Stand](https://github.com/OuroborosCollective/Echoes_of_Aurion/issues/915)
