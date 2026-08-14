# Android-APK-Build

Echoes of Aurion bleibt technisch ein Webspiel. Der Android-Workflow verpackt den **budgetgeprüften itch.io-HTML5-Build** in eine schlanke Capacitor-Shell. Damit teilen Web, itch.io und Android dieselben Spielregeln, 3D-Assets und Runtime-Grenzen.

| Eigenschaft | Festlegung |
|---|---|
| Android-Anwendung | `im.aurion.echoes` |
| Artefakt im Workflow | `echoes-of-aurion-debug-apk` |
| Build-Gate | `pnpm build:itch` einschließlich Release-Asset-Prüfung |
| Java-Laufzeit | Temurin 21 |
| APK-Typ | Unsigned Debug-APK für interne Tests |

Die Workflow-Datei [`.github/workflows/android-apk.yml`](.github/workflows/android-apk.yml) erzeugt das Android-Projekt nur im CI-Workspace, synchronisiert `dist/itch` und legt anschließend die Debug-APK als GitHub-Artifact ab. Ein Play-Store-Release benötigt später eine separate Signatur- und App-Bundle-Konfiguration; diese wird bewusst nicht mit Platzhalter-Credentials hinterlegt.

Die lokale Erstlaufprüfung vom **13. August 2026** hat die Shell erfolgreich angelegt und synchronisiert sowie `assembleDebug` erfolgreich ausgeführt. Das Resultat war eine **4,3-MiB-Debug-APK** unter `android/app/build/outputs/apk/debug/app-debug.apk`; der GitHub-Workflow lädt denselben Pfad als Artifact hoch.

Für einen lokalen Test ist die Reihenfolge identisch. `android:sync` erzeugt die Shell beim ersten Aufruf selbstständig und synchronisiert anschließend den HTML5-Build:

```bash
pnpm android:sync
pnpm android:apk:debug
```

Die in `build:itch` ausgelagerte Babylon-ESM-Laufzeit wird aus einer versionierten HTTPS-CDN-Quelle geladen. Android-Geräte benötigen daher beim ersten Start Netzwerkzugang. Der Produktivbuild bleibt klein; ein vollständig offlinefähiger Client wäre ein gesondertes Paketierungsziel mit einem deutlich größeren App-Bundle.
