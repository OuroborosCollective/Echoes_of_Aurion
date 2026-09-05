---
description: Technischer Projektüberblick und nachweisgebundener Veröffentlichungsstand.
---

# Echoes of Aurion

**Echoes of Aurion** ist ein serverautoritäres 3D-Open-World-MMORPG für Browser und Mobilgeräte. Die Runtime entwickelt sich auf `main`. Dieser Überblick trennt implementierte Systeme von produktiv nachgewiesenen Funktionen.

Die Referenzrevision ist `main@c0ad8967046c52141cf1b5f69874a0c53117fbe2`. Der vollständige Evidenzstand steht im [AURION\_MIGRATION\_TRUTH\_SNAPSHOT\_2026-08-28.md](AURION_MIGRATION_TRUTH_SNAPSHOT_2026-08-28.md "mention").

## Architektur

Die Welt entsteht aus einem versionierten Seed. Der Server autorisiert Bewegung, Kampf, Loot, Quests, Präsenz, Epochen und Weltänderungen. Clients zeigen nur bestätigte Readmodels.

Die Anwendung verwendet React, TypeScript, Vite und Babylon.js. Das Streaming passt Detailstufen an Gerätebudgets an. Diese Budgets ändern niemals den kanonischen Weltzustand.

## Implementierte Systeme

Der aktuelle Quellstand enthält folgende Systeme:

* Deterministische Welt-, Chunk- und Streamingverträge.
* Serverseitige Quests, Loot, Iteminstanzen, Mastery und Ethos.
* Präsenz, Welt-Epochen und begrenzte Reaktionsketten.
* Faction-Questentscheidungen mit idempotenten Belohnungsbelegen.
* Audio-Cues als reine Präsentation.

Aurion verwendet keine Klassen und keine globale Charakterstufe. Fähigkeiten haben eigene XP und eigene, offene Fortschrittslogik. Builds entstehen aus Fähigkeiten, Ausrüstung und Entscheidungen.

## Nachweisstand

Die Systeme sind in `main` vorhanden und überwiegend durch Verträge oder Tests belegt. Das beweist keine vollständige Produktionsfreigabe.

Die öffentliche Root-Website zeigt weiterhin eine ältere statische Oberfläche. Die vollständige API-Laufzeit, Produktionsdatenbank-Migrationen und der durchgängige Browsernachweis bleiben separat zu verifizieren.

Die Hauptschritte vor einer vollständigen Freigabe sind:

1. Produktionsschema bis Migration `0027` sicher abgleichen.
2. Die Migrationskette für neue und bestehende Umgebungen reparieren.
3. Den vollständigen Golden Slice mit Datenbank- und Browser-Readback prüfen.

Bis dahin gilt eine Funktion nur im höchsten belegten Evidenzstatus. Datei-, Test- oder PR-Existenz allein ist kein Produktionsnachweis.

## Historische Inhalte

Frühere Seiten zu einem lokalen Einzelspieler-Prototyp, einer simulierten Partnerkopplung oder einer itch.io-Auslieferung beschreiben historische Kandidaten. Sie sind keine Aussage über die aktuelle Aurion-Runtime oder eine veröffentlichte Produktion.
