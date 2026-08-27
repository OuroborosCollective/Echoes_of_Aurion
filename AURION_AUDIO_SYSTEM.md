# Aurion Audio System v1

## Zweck und Grenze

Das Audiosystem ist eine **reine Präsentationsschicht**. Es liest bestätigte bzw. lokal sichtbare Gameplayereignisse und kann niemals Bewegung, Schaden, Loot, Questfortschritt, XP, Weltzustand oder Persistenz autorisieren. Alle Cues sind an `shared/audioProtocol.ts` gebunden.

## Kategorien und Trigger

| Kategorie | Triggerquelle | Cuefamilie | Verhalten |
| --- | --- | --- | --- |
| Ambient | bestätigte Zone/Chunk-/Tower-Sichtbarkeit | Tower, Plains, Forest, Wetland, Stone Ruins, Cinder Vault | ein Loop pro aktiver Zone, optionaler Assetpfad, Fallback-Synthese |
| Interaction | sichtbare NPC-Interaktion/Questdialog | maskulin, feminin, neutral | kurzer Sprach-/Resonanz-Cue, keine Zustandsmutation |
| Combat | bestätigte Aktion oder sichtbarer Monster-/Magieimpuls | Monster, Magie, Blade, Staff, Spear, Focus | deduplizierte One-Shots auf Combat-Bus |
| Movement | lokal sichtbarer Schritt auf bestätigter Oberfläche | Earth, Grass, Stone, Wood, Water | kurzer Surface-Cue mit 80-ms-Deduplizierung |
| Progression | bestätigter Level-up-/Victory-Event | Level-up | auf Progression-Bus, niemals aus UI-Vorschau |

## Browser- und Mobilverhalten

AudioContext wird ausschließlich durch direkte Nutzerinteraktion freigeschaltet. Autoplay-Fehler werden geschluckt und als UI-Hinweis zurückgegeben; ein fehlendes oder defektes Asset darf den Renderer nicht unterbrechen. Bus-Lautstärken sind mobilfreundlich konservativ voreingestellt. Der Ambient-Loop wird beim Tower-/Expanse-Wechsel ersetzt und beim React-/Babylon-Unmount vollständig beendet.

## Assetvertrag

Generierte Musik und SFX werden als `inactive` Kandidaten mit SHA-256, Format, Dauer, Lautheit, Quelle, Prompt-/Contentversion und Zielcue inventarisiert. Ein Asset wird erst nach technischem Decode-Readback als `active` referenziert. Die Runtime besitzt für jeden Cue eine deterministische Synthese als degradierenden Fallback; externe Audio-URLs sind optional und niemals gameplaykritisch.

## Rückkehrpunkt

Die Integration bleibt auf dem Kandidatenbranch `feature/aurion-audio-system` vom Aurion-Main-Head `73542eabfe981135593676648d5a2717f3b2c0a8`. Es gibt keine Datenbankmigration, keinen Scheduler und keine Produktionsmutation.
