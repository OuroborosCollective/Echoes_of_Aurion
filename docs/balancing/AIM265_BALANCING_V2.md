---
description: Reproduzierbare Balancing-Analyse für WASD-Regelparameter.
---

# AIM-265 — WASD Balancing v2

Diese Lane berechnet **Kandidaten für WASD-Regeln**. Sie definiert keine Aurion-Gameplay-Physik.

## Ownership

- **WASD**: normative XP-, Dungeon-, Boss-, Economy-, Chunk-, Housing- und Guild-Balancingregeln.
- **AX1**: sichtbare Content-/Runtime-Projektion der bestätigten Werte.
- **Aurion**: Rechenberichte, Kandidaten-JSON, Provenienz und bestätigte Readmodels speichern/anzeigen.
- **Wolfram/CAG**: Analyse/Falsifikation; niemals Runtime-Authority.

## Reproduzierbare Prüfung

```sh
node --import tsx scripts/balancing/replay-aim265.mjs /tmp/aurion-balancing-v2.json
python scripts/balancing/verify-aim265.py /tmp/aurion-balancing-v2.json
diff -u docs/balancing/aim265-candidate.json /tmp/aurion-balancing-v2.json
python -m unittest discover -s scripts/balancing -p 'test_*.py'
```

Der maschinenlesbare Kandidat bleibt `final: false`. Ein erfolgreicher Replay macht keinen Wert automatisch gameplaywirksam.

## Berechnungsabdeckung

| Fläche | Rechenbeleg | Für Gameplay noch erforderlich |
| --- | --- | --- |
| Mastery/Professionen | exakte cap-freie XP-Progression und Scope-Replays | Übernahme in gebundenes WASD-Ruleset |
| Rezepte/Gathering | Zeit, Inputs, Yield/Carry und Qualitätskandidaten | WASD Crafting-/Gathering-Regel + echte Action Receipts |
| Dungeons | Varianten-/Gruppen-/Etagen-Szenarien und Monotoniechecks | WASD Instance-/Combat-/Reward-Regel |
| Weltbosse | TTK-/Gruppenszenarien und Respawn-Kandidaten | WASD Boss-/Loot-/Pity-Regel |
| Guild/Housing | Kosten- und Perk-Kandidaten | WASD Guild/Housing-Regel |
| Population/Economy | Spielerzahl-, Sink- und Farmraten-Szenarien | gemessene Daten + WASD Economy-Regel |
| Chunks/Straßen | Fixed-point Grenzen und topologische Konnektivität | WASD Terrain/Collision/Placement-Regel |

## Bekannte Rechenkorrekturen

### Koordinaten

WASD-Algorithmen müssen in der AX1-Welt korrekt auf die X/Z-Bodenfläche projiziert werden; Y bleibt Höhe. Ein Adapter darf diese Darstellung übersetzen, aber Aurion besitzt dadurch keine Platzierungsregel.

### Dungeon-Fortschritt

Frühere Kandidaten konnten durch neu gewählte Affixe auf höheren Etagen sinkende Gefahren-/Rewardbudgets erzeugen. Die korrigierte Kandidatenlogik hält Lauf-/Affixreihenfolge stabil und erweitert sie monoton. **Final wird diese Regel erst, wenn sie in WASD versioniert und dort getestet ist.**

## Wolfram

Die bisherigen Wolfram-MCP-Aufrufe scheiterten vor einer Berechnung mit HTTP 404. Deshalb existiert daraus kein Provider-Erfolgsbeleg. Lokale exakte Replays bleiben gültige lokale Evidence, aber werden nicht als Wolfram-Ergebnis bezeichnet.

Ein späterer CAG-Erfolg darf:

- Formeln prüfen;
- Sensitivitäten berechnen;
- Gegenbeispiele finden;
- Parameterkandidaten erzeugen.

Er darf keine Gameplay-Werte live setzen. Die Übernahme erfolgt ausschließlich über einen WASD-Ruleset-Change.

## Acceptance

- jede zentrale Kurve reproduzierbar;
- Kandidat und finale WASD-Regel klar getrennt;
- keine Aurion-Route wendet einen Kandidaten als Gameplayregel an;
- AX1 rendert nur bestätigte Werte;
- fehlende Messdaten werden als offen ausgewiesen;
- Browser-, DB-, Wolfram- und Regel-Evidence bleiben getrennte Ebenen.
