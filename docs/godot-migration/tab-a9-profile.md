---
description: "Verbindliches Ziel- und Messprofil für Echoes of Aurion auf einem Samsung Galaxy Tab A9 mit 4 GB RAM."
---

# Samsung Galaxy Tab A9: Ziel- und Abnahmeprofil

## Geltungsbereich

Dieses Profil bearbeitet [G02 / #908](https://github.com/OuroborosCollective/Echoes_of_Aurion/issues/908). Es setzt messbare Produktbudgets, bevor Enginewahl und Optimierung beginnen. Es belegt noch keinen erfolgreichen Android-Build und keine gemessene Geräteleistung.

Der neue Client bleibt eine Eingabe- und Darstellungsschicht. Aurion bleibt alleinige Authority für Spiel-, Welt- und Persistenzzustand. Leistungsoptimierung darf deshalb keine lokale Gameplayentscheidung oder zweite Simulation einführen.

## Verifizierte Angaben und offene Felder

| Feld | Wert | Evidenzstatus |
|---|---:|---|
| Gerätefamilie | Samsung Galaxy Tab A9, nicht A9+ | Herstellerreferenz |
| Display | 8,7 Zoll, 1340 × 800 Pixel, bis 60 Hz | Herstellerreferenz |
| Arbeitsspeicher | 4 GB | vom Owner am 15.10.2026 bestätigt |
| Ausrichtung | Querformat und Vollbild als Produktvorgabe | festgelegte Zielvorgabe |
| Modellnummer / Wi-Fi oder Mobilfunk | unbekannt | späterer Gerätecheck |
| Speichergröße und freier Speicher | unbekannt | späterer Gerätecheck |
| Android-Version, API-Level, Sicherheitsstand | unbekannt | spätere Diagnoseansicht |
| SoC, GPU und Treiberversion | unbekannt | spätere Diagnoseansicht |
| thermisches Verhalten | unbekannt | nur am physischen Gerät messbar |

Primärquelle für die Herstellerangaben: [Samsung Galaxy Tab A9](https://www.samsung.com/uk/business/tablets/galaxy-tab-a/galaxy-tab-a9-wifi-graphite-64gb-sm-x110nzaaeua/). Variantenbezogene Werte werden nicht auf das konkrete Owner-Gerät übertragen, solange dessen Modellnummer fehlt.

## Verbindlicher Basismodus

- **Pflichtmodus:** 30 FPS im Querformat. 60 FPS ist eine optionale Qualitätsstufe und kein Freigabeblocker.
- **Messfenster:** drei Minuten Warmup, anschließend zwanzig Minuten zusammenhängende Messung.
- **Darstellung:** native Displayfläche 1340 × 800; interne Renderauflösung und Skalierung werden mit dem Build protokolliert.
- **Bedienung:** Touch ist vollständig nutzbar. Physische Tastatur und Maus bleiben ergänzend.
- **Netz:** reale Aurion-Verbindung; Testserver, Zone, Latenzprofil und Build-SHA werden je Lauf festgehalten.
- **Authority:** Bewegung und Aktionen werden als Intents gesendet; nur bestätigte Aurion-Zustände zählen als Spielzustand.

## Budgets vor der ersten Optimierung

Diese Werte sind Freigabekriterien. Sie werden nach der ersten echten Baseline nur durch eine dokumentierte Produktentscheidung geändert, nicht um einen Lauf nachträglich grün zu färben.

| Messgröße | Pflichtgrenze auf dem 4-GB-Gerät |
|---|---:|
| Bildrate | 30-FPS-Ziel ohne dauerhaftes Absinken unter 27 FPS |
| Framezeit P95 | höchstens 40 ms |
| Framezeit P99 | höchstens 50 ms |
| lange Frames | höchstens 1 Frame über 100 ms pro Minute, Ladeübergänge separat markiert |
| Prozessspeicher PSS, stabil | höchstens 1.200 MiB |
| Prozessspeicher PSS, Spitze | höchstens 1.536 MiB |
| Kaltstart bis bedienbarer Anmeldung | höchstens 15 s |
| Anmeldung bis bedienbarer Startzone | höchstens 20 s |
| Stabilität | kein Crash, ANR oder Low-Memory-Kill im Messfenster |
| Thermik | kein anhaltender Status „severe“ oder höher; Status und Taktabfall protokollieren |

PSS ist die Android-Hauptmetrik. RSS darf ergänzend erfasst werden, ersetzt PSS aber nicht. Ein Desktopwert, Emulatorlauf oder Datenblatt gilt nicht als Tab-A9-Nachweis.

## Tablet-UI-Budget

Die 1340 × 800 Pixel werden als veränderliche Fläche behandelt, weil Systemleisten und geteilte Ansicht nutzbaren Platz abziehen können.

- interaktive Ziele mindestens 48 logische Pixel breit und hoch;
- Fließtext zunächst mindestens 16 logische Pixel;
- mindestens 16 logische Pixel Abstand zu nutzbaren Bildschirmrändern;
- Bewegung links, Kamera rechts, primäre Aktionen in Daumenreichweite;
- keine wichtige Aktion ausschließlich über Hover, Rechtsklick oder Tastatur;
- UI bleibt bei Systemleisten und Größenänderung erreichbar, ohne verdeckte Pflichtaktionen;
- Touchbelegung, HUD-Skalierung und optionale Eingabehilfen werden ohne Godot-Inspector über versionierte Profile steuerbar.

## Reproduzierbares Testszenario

Der erste vergleichbare Gerätesweep wird später mit demselben freigegebenen Build ausgeführt:

1. App kalt starten und bis zur bedienbaren Anmeldung messen.
2. Mit einem Testkonto über den kanonischen Aurion-Login anmelden.
3. Startzone laden und Build-, Server-, Renderer- und Geräteidentität in der Diagnoseansicht prüfen.
4. Fünf Minuten bewegen und Kamera drehen, fünf Minuten kämpfen, fünf Minuten Inventar/Quest/HUD bedienen, fünf Minuten dichte Szene oder kontrollierte Wiederholung ausführen.
5. Messdatei exportieren oder über die Diagnoseansicht teilen; keine Seriennummer, IMEI, Sitzung oder Zugangsdaten aufnehmen.

Jeder Lauf nennt mindestens Build-SHA, Engine und Version, Renderer, interne und physische Auflösung, Qualitätspreset, Zone, sichtbare Entitäten, Netzprofil, Android-Version, Gerätemodell, RAM-Klasse und Messdauer. Physisches Gerät, Emulator und Desktop werden getrennt ausgewiesen.

## Abnahme und spätere Zuständigkeit

Dieses Dokument und [`tab_a9.json`](../../godot-client/config/device_profiles/tab_a9.json) frieren die Planungsbudgets ein. Der kurze Owner-Ablauf steht unter [Gerätecheck](device-check.md). Die spätere physische Messung gehört zu [G31 / #938](https://github.com/OuroborosCollective/Echoes_of_Aurion/issues/938); ein grüner Dokumentationscheck ersetzt sie nicht.

