---
description: "G14: gehashte Originalmodelle und echte Godot-Importprüfung als Grundlage der 3D-Spielwelt."
---

# Originalmodelle für die Godot-3D-Spielwelt

Das Ziel aus [#906](https://github.com/OuroborosCollective/Echoes_of_Aurion/issues/906) bleibt der dreidimensionale Aurion-Client mit gemeinsamer Weltgestaltung. Die vorhandene Punktkarte ist ein früher Verbindungs- und Projektionsnachweis. Dieser Schritt bearbeitet [G14 / #921](https://github.com/OuroborosCollective/Echoes_of_Aurion/issues/921): reale Quelldateien, Zuordnungsquellen und tatsächliche Godot-Kompatibilität vor der Integration von Figuren und Welt.

## Tatsächlich vorhandene Quellen

Der [Quellkatalog](../../godot-client/assets/catalog/source-manifest.json) bindet alle zwölf unter `assets/` getrackten GLBs an SHA-256, Dateigröße und Herkunft. Originale bleiben unverändert. Die beiden GLBs unter `test/fixtures/aurion-glb/` sind Testquellen und werden nicht zu Shipping-Assets erklärt. Die 49 Identitäten der Monsterregistry sind externe Referenzen; ihre Bytes liegen nicht unter diesen zwölf Repositoryquellen.

| Familie | GLBs | Dreiecke | Bones | Clips |
| --- | ---: | ---: | ---: | --- |
| Animierter Standardspieler | 1 | 2.996 | 32 | AttackCombo, Death, Fight, Idle, Jump, Run, Walk |
| Clockwork Stalker | 1 | 1.300 | 22 | Idle, Walk, Run, Attack, Death, CastSpell, Jump, Fall, Block |
| Asterion Courtyard | 3 | 3.735 / 2.781 / 1.818 | 0 | keine |
| Brunnen | 2 | 2.132 / 1.053 | 0 | keine |
| Straßenlaterne | 4 | 4.172 / 3.128 / 2.086 / 1.042 | 0 | keine |
| Eiche | 1 | 1.466 | 0 | keine |

Die Player- und Umgebungsquellen besitzen dokumentierte Owner-Provenienz; die Fantasy-Quellen besitzen Repository-Buildskripte. Die externen Quaternius-Referenzen verweisen auf die dokumentierte CC0-Archivevidence. Herkunft, Lizenzbeleg, aktive Serverzuordnung und tatsächliche Datei sind verschiedene Nachweise. Der Katalog erteilt keine neue Lizenz und setzt keine Serverzuordnung.

## Reproduzierbare Prüfung

```bash
node --test scripts/godot/audit-assets.test.mjs
node scripts/godot/bootstrap.mjs
node scripts/godot/asset-import-runtime.mjs
LIBGL_ALWAYS_SOFTWARE=1 xvfb-run -a node scripts/godot/asset-import-runtime.mjs --render
```

Die Prüfung liest echte GLB-Geometrie, eingebettete Texturgrößen über Aurions vorhandenen Imageparser, Skins, Clipkanäle und Erweiterungen. Godot importiert jede Quelle mit `GLTFDocument`, erzeugt ihre Szene und liest Dreiecke, Materialien, Bounds, Bones und Animationen zurück. Neun Posen je Clip prüfen tatsächlich veränderte Skeletttransformationen. Ein korrekter Clipname allein genügt nicht: Eine gültige GLB mit absichtlich statischen Idle-Samplern muss scheitern. Ein falscher Quellhash muss ebenfalls scheitern.

Der Renderlauf verwendet dieselben Quellbytes mit Kamera und Licht in einer ausdrücklich bezeichneten Assetprobe. Er verlangt sichtbare Geometrie und unterschiedliche Bilder zweier Walk-Posen. JSON, Logs, PNGs und die revisionsgebundenen Receipts werden im Workflow **Godot 3D source asset audit** archiviert. Software-OpenGL belegt keine Tab-A9-Leistung. Skelettbewegung allein belegt weder korrekt deformierte Haut noch die visuelle Qualität aller Clips; diese bleiben gesonderte Prüfungen.

## Grenze und nächster Schritt

Diese Assetprobe ist keine Live-Welt und kein neuer APK-Spielmodus. Sie baut weder lokale Spielregeln noch erfundene Weltplatzierungen. Der nächste Schritt ist [G15 / #922](https://github.com/OuroborosCollective/Echoes_of_Aurion/issues/922): kontrollierte Godot-Ausgaben mit Quellhash und Importprofil. Darauf folgen [G16 / #923](https://github.com/OuroborosCollective/Echoes_of_Aurion/issues/923), bestätigte 3D-Figuren, und [G18 / #925](https://github.com/OuroborosCollective/Echoes_of_Aurion/issues/925), die tatsächlich bestätigte Weltgeometrie. Persistente Bearbeitung folgt den vorhandenen Aurion-Plan/Apply-/Receipt-Verträgen aus [G42 / #949](https://github.com/OuroborosCollective/Echoes_of_Aurion/issues/949).
