---
description: Audio als reine AX1-Präsentations- und Side-Channel-Schicht.
---

# Aurion Audio System

## Zweck und Ownership

Audio ist eine **reine Präsentationsschicht**.

- **AX1** besitzt Audioausgabe, Busse, Cue-Rendering und visuell/auditiv synchronisierte Presentation.
- **WASD** besitzt die Gameplayevents, aus denen gameplaybezogene Cues abgeleitet werden.
- **Aurion** darf Audioassets, Freigabemetadaten und Preferences hosten/persistieren, aber keine Gameplaywirkung aus Audio erzeugen.

Audio kann niemals Bewegung, Treffer, Schaden, Loot, Questfortschritt, XP, Crafting, World-State oder Persistenz autorisieren.

## Eventfluss

```text
WASD confirmed gameplay event
→ Aurion transport/readback if persistence is involved
→ AX1 validated audio cue
→ audio output
```

Für rein lokale UI-Sounds darf AX1 direkt einen UI-Cue auslösen, solange dieser keine Gameplaybedeutung besitzt.

## Cue-Klassen

| Kategorie | Quelle |
| --- | --- |
| Ambient | bestätigte sichtbare AX1 Zone/Region/Environment-Projektion |
| Movement | sichtbare bestätigte Bewegung/Oberfläche |
| Combat | bestätigtes WASD Combat-Event |
| Interaction | bestätigte Interaktion bzw. rein lokale UI-Aktion |
| Loot/Resource/Crafting | erst nach bestätigtem WASD-Receipt/Event |
| Progression | erst nach bestätigtem WASD-Progressions-Event |

Ein Cue darf niemals als Bestätigung des Events zurück in Gameplaycode fließen.

## Runtimegrenzen

- ein AudioContext ist Presentation-Infrastruktur, keine Authority;
- Autoplay-/Decodefehler bleiben nicht-blockierend;
- fehlende Assets dürfen Gameplaystate nicht verändern;
- Deduplizierung, Fade, Lautstärke und Device-Budgets sind rein visuell/auditiv;
- Render-/Wall-clock-Zeit darf nur Audioanimation steuern, nicht WASD-Semantik.

## Assetvertrag

Audioassets können mit SHA-256, Format, Dauer, Quelle, Contentversion und Cue-Ziel inventarisiert werden. `active` bedeutet ausschließlich: technisch geprüft und für Presentation freigegeben.

Ein Assetname, Cue oder Sound darf keine Attackrange, Damage, Lootchance, Questwirkung oder andere Gameplayregel definieren.

## Evidence

- WASD Receipt/Event beweist den fachlichen Trigger;
- AX1 Audio-Test beweist die Presentation;
- Asset-Hash/Decode beweist die Audiodatei;
- Aurion-Host-/DB-Readback beweist gegebenenfalls gespeicherte Asset-/Preference-Daten.

Diese Evidenceebenen bleiben getrennt.
