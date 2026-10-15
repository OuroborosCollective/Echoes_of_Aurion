---
description: "Automatischer, isolierter Godot-Arbeitsplatz und nachprüfbare Toolchain-Grenzen."
---

# Godot-Arbeitsplatz

Der Arbeitsplatz installiert den Linux-x64-Editor und eine gepinnte Android-Toolchain ohne Administratorrechte. Der vorhandene GDScript-Vertragstest läuft mit der echten Godot-Runtime. Der Doctor unterscheidet installierte Werkzeuge, SDK-Lizenzstatus, APK-Export, Grafik und physisches Tablet. Eine installierte Toolchain ist noch kein nachgewiesener APK-Export.

Der Agent führt `node scripts/godot/bootstrap.mjs` aus. Der Bootstrap lädt ausschließlich das im Lock festgeschriebene offizielle Godot-Archiv, prüft Größe und SHA-256, extrahiert nur die erwartete ausführbare Datei und prüft deren vollständige Versionskennung. Ein zweiter Lauf prüft den gespeicherten Binary-Hash und verändert bei gültigem Zustand nichts. Ein exklusives Verzeichnis verhindert parallele Installationen. Nach einem harten Prozessabbruch muss der Agent das verbleibende `bootstrap.lock` erst nach Prüfung beenden; es wird nicht automatisch als veraltet ignoriert.

`node scripts/godot/doctor.mjs` gibt maschinenlesbares JSON mit `ready`, `missing` oder `incompatible` aus. Sein Exitcode beschreibt standardmäßig die Editorbereitschaft. Mit `--android` werden zusätzlich die installierten Android-Werkzeuge verlangt. Android, SDK-Lizenzen, APK-Export, Rendering und echtes Tablet haben eigene Zustände.

Standardablage ist das ignorierte Verzeichnis `.aurion-godot` im Checkout. `AURION_GODOT_WORKSPACE` kann auf einen dedizierten leeren Arbeitsplatz zeigen. Keine Systeminstallation, kein sudo, keine Verbindung mit Produktivdatenbank oder VPS. Node und pnpm des Repositories werden nicht verändert. Benötigt werden Linux x64, Node mit fetch-Unterstützung, unzip und tar sowie ausgehendes HTTPS. Editor/Archiv benötigen rund 500 MB; Android einschließlich Cache benötigt zusätzlich etwa 8 GB, mit Staging oder vorheriger Installation bis zu 16 GB. Editor-Downloads sind auf 120 Sekunden, Android-Downloads je Archiv auf 300 Sekunden und die exakte gepinnte Größe begrenzt. Entpacken hat ein Limit von 120 Sekunden. Der CI-Job endet spätestens nach 20 Minuten.

## Nachweis

Der Agent startet nach dem Doctor:

```sh
.aurion-godot/editor/Godot_v4.7.2-stable_linux.x86_64 --headless --path godot-client --script tests/contracts/test_zone_contract.gd
node scripts/godot/verify-contract-parity.mjs
```

Der erste echte Lauf von Godot 4.7.2 meldete `zone-v5 Godot contract verified`. Damit ist die zuvor offene GDScript-Runtime-Prüfung aus G03 belegt. Dies beweist weder Grafikleistung noch eine Serververbindung.

## Android-Werkzeuge

`node scripts/godot/bootstrap-android.mjs` richtet Temurin JDK 17.0.20+8, Command-line Tools 19.0, Platform-Tools 37.0.1, Build-Tools 35.0.1, Platform 35 Revision 2, NDK 28.1.13356709, CMake 3.10.2.4988404 und Godot-4.7.2-Exporttemplates ein. Die unveränderlichen Archiv-URLs, Größen und SHA-256-Prüfsummen stehen im Lock. Google-Pakete wurden zusätzlich gegen die offiziellen SHA-1-Werte aus `repository2-3.xml` geprüft; der Bootstrap verwendet anschließend die gepinnten SHA-256-Werte. Command-line Tools 19.0 ist bewusst festgeschrieben: der aktuelle `latest`-Alias liefert eine neue Android-CLI mit geändertem sdkmanager-Verhalten.

Ein Digest über alle installierten Dateien, Pfade, Dateimodi und Symlinkziele verhindert, dass eine veränderte Installation als unverändert bereit gilt. Der zweite Lauf prüft diesen Digest sowie tatsächliche Versionen von javac, adb und aapt. Ausschließlich die Werkzeuge liegen unter dem im Receipt genannten `android-install-*`-Verzeichnis; entpackte Zwischenstände bleiben außerhalb dieser Identität. Bei einer erforderlichen Neuinstallation bleibt die vorherige Installation zur Diagnose erhalten. Der Agent räumt eigene alte Staging-/Vorgängerverzeichnisse nach erfolgreicher Prüfung gezielt auf.

Der Bootstrap erzeugt keine erfundenen SDK-Lizenzdateien. SDK-Lizenzannahme über das offizielle Werkzeug, Editor-Exportpfade und ein echter APK-Export werden in G08 nachgewiesen. Für spätere Exporte sind Java unter `<installation>/jdk`, SDK unter `<installation>/sdk` und Templates unter `<installation>/data/godot/export_templates/4.7.2.stable` verfügbar; der Exportauftrag setzt dafür die passenden isolierten Editor-/XDG-Pfade automatisch. Du musst keine Inspector-Einstellungen ändern.

GPU-/Software-Rendering wird gesondert geprüft. SoftwareGPU Workbench kann später eine Vorschau liefern; sie ersetzt keinen Godot- oder Tab-A9-Leistungsnachweis. Für den GLB-Import ist kein Blender erforderlich; zusätzliche Asset-Werkzeuge werden erst bei einem konkreten Importbedarf gepinnt.

Quellen: [offizielles Godot-Release](https://github.com/godotengine/godot-builds/releases/tag/4.7.2-stable), [Android-Exportanforderungen](https://docs.godotengine.org/en/4.7/tutorials/export/exporting_for_android.html).

## Tatsächlicher Toolchain-Readback

Der isolierte Lauf bestätigte `javac 17.0.20`, ADB `37.0.1-15733141` und AAPT `v0.2-12874835`. Der Doctor prüfte den vollständigen Installationsbaum erfolgreich. SDK-Lizenzen, APK-Export, GPU und physisches Gerät sind weiterhin als `unverified` ausgewiesen. Das Owner-Foto bestätigt Godot `4.7.2.stable.official [ed1daf0bf]` auf seinem Tab A9; es belegt die Editorversion, keinen Aurion-Spielstart.
