---
name: aurion-runtime-knowledgebase
description: Aurion-Runtime-Knowledgebase für zukünftige Agenten. Verwende diesen Skill bei Arbeiten an Echoes of Aurion, WASD/Areloria-Unifikation, deterministischer Welt, serverautoritativen Aktionen, Babylon-Rendering, Audio, Linear/GitHub-Evidenz oder release-sicheren Kandidatenbranches.
---

# Aurion Runtime Knowledgebase

Arbeite in Echoes of Aurion **additiv, revisionsgebunden und nachweisbar**. Lies nur die Referenzdatei, die für die konkrete Aufgabe erforderlich ist.

## Verbindlicher Ablauf

1. Ermittle Repository, Branch, aktuellen `main`-Stand und Arbeitsbaum.
2. Lies `docs/agent-knowledgebase/INDEX.md` und die passende Referenz.
3. Trenne strikt zwischen deterministischer Basiserzeugung, serverautoritativen Receipts und rein visuellen beziehungsweise auditiven Cues.
4. Verändere keine Produktion, Datenbank, Scheduler- oder Live-Konfiguration ohne ausdrücklichen Releaseauftrag.
5. Verankere jede Änderung in einem kleinen Commit mit klarer Begründung und konkreten Test-/Readbacknachweisen.
6. Dokumentiere offene Grenzen statt sie durch Annahmen zu verdecken.

## Harte Leitplanken

- Keine WASD-Runtime kopieren. Übernimm nur explizit geprüfte Regeln, Contentverträge und Evidenz.
- Keine `Math.random()`-basierte Weltlogik. Nutze Seed, Integer-Koordinaten, versionierte Regeln und deterministische Hashes.
- Der Server bleibt Autorität für Aktionen, Ressourcen, Kampf, Loot, Quests, Präsenz, Epochen und Deltas.
- Audio und Rendering dürfen niemals Spielzustand autorisieren.
- Der Tower ist private sichere Heimat, nicht Arena: Start, Lager, Rückkehrpunkt und später einrichtbarer Raum.
- Mobile-first bedeutet keine Featurekürzung: Phone, Tablet und Desktop erhalten denselben Funktionsumfang mit passenden Budgets.
- Bei jeder Änderung Runtime-Check, Regression und gegebenenfalls Browser-/WebGL-/Audio-Readback einplanen.

## Referenznavigation

- Welt-, Migrations- und Contentregeln: `references/world-and-content.md`
- Rendering, Streaming und Tower: `references/rendering-and-home.md`
- Audio, Mix, Assets und Cuegrenzen: `references/audio-system.md`
- Verifikation, GitHub, Linear und Releasegrenzen: `references/verification-and-release.md`
- Agentenübergabe und Arbeitsprotokoll: `references/agent-handoff.md`

## Abschlussformat

Liefere am Ende immer: geänderte Dateien, Commit/PR-Referenz, ausgeführte Prüfungen, bekannte Einschränkungen und den nächsten sicheren Schritt. Behaupte keine Aktivierung, wenn ein Asset oder Feature nur als Kandidat vorliegt.
