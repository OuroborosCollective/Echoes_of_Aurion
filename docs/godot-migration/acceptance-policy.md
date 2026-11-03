---
description: "Geräteunabhängige Abnahme für Aurion: physische Tab-A9-Proben sind optional, fachliche Nachweise bleiben erforderlich."
---

# Geräteunabhängige Abnahme

Owner-Entscheidung vom **03.11.2026** für das gesamte Repository und seinen Issue-Backlog.

Eine Aufgabe darf abgeschlossen werden, sobald ihr fachlicher Umfang am richtigen Stand belegt ist. Ein bestimmtes privates Gerät ist keine Voraussetzung dafür. Diese Regel ersetzt ältere gegenteilige Gerätepflichten in Planungsunterlagen, Issues und PR-Beschreibungen.

| Prüfgrenze | Verbindlichkeit |
| --- | --- |
| Physisches Samsung Tab A9, dessen Verfügbarkeit und Erststart | Optional; kein Issue-, PR-, Merge- oder Releasegate |
| Modellbezogene FPS-, Framezeit-, PSS-/RAM- und Wärmemessungen | Optionale Kompatibilitäts- und Optimierungsdaten |
| G31 / #938 als Vorgänger einer anderen Aufgabe | Entfällt; der verpflichtende physische Sweep wurde abbestellt |
| Responsive Layouts, Touchziele, Fokus, Cancel, Pause/Resume | Fachlich erforderliche native/Android-Prüfung bleibt bestehen; kein bestimmtes physisches Modell nötig |
| Android-Export, Paket-/Manifest-/Signatur-/App-Link-Vertrag und JNI | Passende echte Build-, Paket- und Android-/Emulatorprüfung bleibt bestehen |
| Authentifizierung, Autorisierung, Server-/DB-Zustand, Replay, Receipts, Fog | Passende echte Integrations- und Runtime-Nachweise bleiben bestehen |
| Begrenzte Payload-, Mesh-, Speicher- und Queryarbeit | Bestehende Funktions- und Ressourcenverträge bleiben bestehen |

Desktop, Software-Rendering, Android-Emulator, isolierte echte Datenbankintegration und Produktion belegen jeweils ihre eigene Grenze. Ein Emulatorlauf wird nicht zum physischen Gerätemesswert. Nicht ausgeführte physische Tests bleiben `UNVERIFIED`; sie werden weder abgehakt noch als erfolgreicher Ersatzlauf ausgegeben.

## Backlog-Abschluss

- G08 / [#915](https://github.com/OuroborosCollective/Echoes_of_Aurion/issues/915) ist für den belegten automatischen APK-Build und Paket-/Artefakt-Readback abgeschlossen. Der frühere physische Erststart hält diese Buildaufgabe nicht offen.
- G31 / [#938](https://github.com/OuroborosCollective/Echoes_of_Aurion/issues/938) wurde als verpflichtendes gerätespezifisches Messprogramm **nicht weiter geplant**. Das bedeutet keinen bestandenen Leistungs- oder Wärmetest.
- Andere Aufgaben bleiben nur für tatsächlich fehlende Fachfunktionen, Integration oder erforderliche Nachweise offen. Beispielsweise sind Gebäudedachgeometrie, echter Backendlogin und vollständige Co-Creation-Runden durch den Wegfall eines Gerätegates nicht automatisch umgesetzt.

Das [Tab-A9-Profil](tab-a9-profile.md), sein [optionaler Gerätecheck](device-check.md) und die Installationsanleitung bleiben als freiwillige Hilfen erhalten. Budgets und unbekannte Gerätewerte bleiben als Referenzdaten nachvollziehbar.
