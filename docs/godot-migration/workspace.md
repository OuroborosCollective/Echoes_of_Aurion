---
description: "Automatischer, isolierter Godot-Arbeitsplatz und nachprüfbare Toolchain-Grenzen."
---

# Godot-Arbeitsplatz

G05 wird in zwei prüfbare Teile aufgeteilt. Dieser erste Teil installiert den Linux-x64-Editor ohne Administratorrechte und führt den bereits vorhandenen GDScript-Vertragstest aus. Android-SDK, vollständiges JDK, Exporttemplates und APK-Export sind noch nicht als eingerichtet nachgewiesen. Issue #912 bleibt bis zu diesem zweiten Teil offen.

Der Agent führt `node scripts/godot/bootstrap.mjs` aus. Der Bootstrap lädt ausschließlich das im Lock festgeschriebene offizielle Godot-Archiv, prüft Größe und SHA-256, extrahiert nur die erwartete ausführbare Datei und prüft deren vollständige Versionskennung. Ein zweiter Lauf prüft den gespeicherten Binary-Hash und verändert bei gültigem Zustand nichts. Ein exklusives Verzeichnis verhindert parallele Installationen. Nach einem harten Prozessabbruch muss der Agent das verbleibende `bootstrap.lock` erst nach Prüfung beenden; es wird nicht automatisch als veraltet ignoriert.

`node scripts/godot/doctor.mjs` gibt maschinenlesbares JSON mit `ready`, `missing` oder `incompatible` aus. Sein Exitcode beschreibt ausschließlich die Editorbereitschaft. Android, Rendering und echtes Tablet haben eigene Zustände; Editorbereitschaft bedeutet keine Android-Buildbereitschaft.

Standardablage ist das ignorierte Verzeichnis `.aurion-godot` im Checkout. `AURION_GODOT_WORKSPACE` kann auf einen dedizierten leeren Arbeitsplatz zeigen. Keine Systeminstallation, kein sudo, keine Verbindung mit Produktivdatenbank oder VPS. Node und pnpm des Repositories werden nicht verändert. Benötigt werden Linux x64, Node mit fetch-Unterstützung, unzip, ausgehendes HTTPS und rund 500 MB für Editor/Archiv; der Download ist auf die im Lock festgelegte Größe und 120 Sekunden begrenzt, Unterprozesse auf 60 Sekunden.

## Nachweis

Der Agent startet nach dem Doctor:

```sh
.aurion-godot/editor/Godot_v4.7.2-stable_linux.x86_64 --headless --path godot-client --script tests/contracts/test_zone_contract.gd
node scripts/godot/verify-contract-parity.mjs
```

Der erste echte Lauf von Godot 4.7.2 meldete `zone-v5 Godot contract verified`. Damit ist die zuvor offene GDScript-Runtime-Prüfung aus G03 belegt. Dies beweist weder Grafikleistung noch eine Serververbindung.

## Android-Fortsetzung

Der Lock enthält bereits die offizielle Identität des Exporttemplate-Archivs und die Godot-4.7-Anforderungen an JDK 17, Build-Tools 35.0.1, Platform 35, NDK 28.1.13356709 und CMake 3.10.2.4988404. Diese Einträge sind Anforderungen, kein vollständiger Android-Lock: JDK-Distribution, SDK-Archive, Paketrevisionen und Prüfsummen müssen im zweiten G05-Teil ergänzt und tatsächlich installiert werden. Erst danach darf der Doctor Android als `ready` ausgeben.

GPU-/Software-Rendering wird gesondert geprüft. SoftwareGPU Workbench kann später eine Vorschau liefern; sie ersetzt keinen Godot- oder Tab-A9-Leistungsnachweis. Für den GLB-Import ist kein Blender erforderlich; zusätzliche Asset-Werkzeuge werden erst bei einem konkreten Importbedarf gepinnt.

Quellen: [offizielles Godot-Release](https://github.com/godotengine/godot-builds/releases/tag/4.7.2-stable), [Android-Exportanforderungen](https://docs.godotengine.org/en/4.7/tutorials/export/exporting_for_android.html).
