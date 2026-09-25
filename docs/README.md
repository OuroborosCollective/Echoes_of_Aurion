---
description: Kanonischer Index der aktuellen technischen Dokumentation.
---

# Technische Dokumentation

Die aktuelle Dokumentation folgt der Single-Owner-Architektur aus [ARCHITECTURE_OWNERSHIP](../ARCHITECTURE_OWNERSHIP.md).

## Kanonisch

1. [Architektur — Aurion Single Authority](../ARCHITECTURE_OWNERSHIP.md)
2. [Naturkollision und weltweite Bewegung](world-nature-collision.md)
3. [Balancing v2](balancing/AIM265_BALANCING_V2.md)
4. [Kanonischer World Causal Root](aurion-world-causal-root.md)
5. [Cross-Zone Handover V2](aurion-cross-zone-handover-v2.md)
6. [Effect Intent Journal](aurion-effect-intent-journal.md)
7. [Headless Causal Oracle V2](aurion-headless-causal-oracle-v2.md)

## Aktive Architektur

**Aurion ist der einzige Owner und Wahrheitsträger.**

Aurion besitzt und führt die aktive Spielwelt, Gameplay- und NPC-Logik, Quests, Combat, Progression, Loot, Crafting, Economy, Gruppen, Fraktionen, Memory, Information Ecology, Datenbanken, Receipts, Readmodels, Account, Community, Assets und Operations.

Client, Renderer und UI sind Projektion und Eingabeoberfläche der bestätigten Aurion-Wahrheit.

AX1 und WASD sind historische Provenienzquellen beziehungsweise bereits migrierte Implementierungsbausteine. Ihre alten Repositories, Revisionen und Dateinamen sind keine aktuelle Authority und erzeugen keine Runtime-Pflichten.

CAG, Wolfram, LLMs und externe Tools können analysieren, authoren oder prüfen; ihre Ergebnisse sind niemals selbst kanonische Spielwahrheit.

## Historische Evidence

Datiertes Material unter `guardian/`, `qa/` und `docs/migrations/` darf für Herkunft, Migrationsverlauf und Fehlerhistorie erhalten bleiben. Alte Owner-/Authority-Formulierungen sind **historische Aussagen**, nicht aktuelle Arbeitsanweisungen.

Bei einem Widerspruch gilt:

```text
aktueller Aurion-Code
→ aktuelle Aurion-Tests
→ Runtime-/DB-/Receipt-Readback
→ ARCHITECTURE_OWNERSHIP.md
→ historische Provenienz
```

## Dokumentationsregel

Neue Dokumente müssen ausdrücklich kennzeichnen, ob sie aktuelle Aurion-Architektur, aktuelle Aurion-Implementierung, revisionsgebundene Evidence oder historische Provenienz beschreiben. Historische Migrationsnamen dürfen nicht als aktuelle Ownerbezeichnungen verwendet werden.
