# Aurion Audio System v1

## Zweck und Grenze

Das Audiosystem ist eine **reine Präsentationsschicht**. Es liest bestätigte beziehungsweise lokal sichtbare Gameplayereignisse und kann niemals Bewegung, Schaden, Loot, Questfortschritt, XP, Weltzustand oder Persistenz autorisieren. Jeder Cue ist an `shared/audioProtocol.ts` gebunden. Die Runtime akzeptiert ausschließlich valide `AudioEvent`-Payloads über `aurion:audio-cue`; unbekannte und kategoriewidrige Payloads werden verworfen.

## Kategorien und Trigger

| Kategorie | Triggerquelle | Cuefamilie | Verhalten |
| --- | --- | --- | --- |
| Ambient | bestätigte Zone/Chunk-/Tower-Sichtbarkeit | Tower, Plains, Forest, Cave, City, Wetland, Stone Ruins, Cinder Vault | ein Loop pro aktiver Zone; optionaler Assetpfad plus Fallback |
| Interaction | sichtbare NPC-Interaktion, bestätigtes Lootreadmodell | maskulin, feminin, neutral, Schraubenbeutel | kurzer Cue ohne Zustandsmutation |
| Combat | bestätigte Kampfaction oder sichtbar bestätigter Gegnerimpuls | scharf, spitz, stumpf; Magie, Heilung, Buff; Wolf, Mensch, Monster für Angriff und Tod | deduplizierte One-Shots auf dem Combat-Bus |
| Movement | lokaler Schritt auf bestätigter Oberfläche | Footstep und Run für Erde, Gras, Stein, Holz, Wasser | kurzer Surface-Cue mit 80-ms-Deduplizierung |
| Resource | bestätigter Ernte-/Abbaureceipt | Pflanzenernte, Holzhacken, Erzabbau mit Picke | erst nach serverseitiger Bestätigung auslösen |
| Crafting | bestätigter Crafting-Receipt oder sichtbarer bestätigter Arbeitsschritt | Werkbank-Säge | erst nach serverseitiger Bestätigung auslösen |
| Progression | bestätigter Level-up-/Victory-Event | Level-up | niemals aus UI-Vorschau |

## Aktuelle Ereignisbrücke

Die Ambientauswahl bleibt deterministisch und nutzt ausschließlich vorhandene Zustände: Home spielt Tower, Arena 3 Cinder Vault, Arena 2 Cave, Arena 1 City, die globale gestreamte Expanse Forest und der verbleibende Expeditionspfad Plains. Die Babylon-Szene übergibt einen bestätigten Explorerangriff als `combat.attack.pointed`, Echo-Impulse als `combat.magic`, Sentinelangriffe als `combat.creature.monster.attack` und den bestätigten Sentinel-Sieg als `combat.creature.monster.death`. Die Home-Komponente validiert die Payload per `isAudioEvent` und leitet sie anschließend an `AurionSoundscape` weiter. Damit bestehen keine parallelen Autoritätspfade und keine Audioaktion beeinflusst Spielwerte.

Die vollständige SFX-Matrix steht ebenfalls über die typsichere, validierte `aurion:audio-cue`-Brücke bereit. Künftige Waffen-, Heil-/Buff-, Wolf-/Mensch- sowie Loot-/Ernte-/Mining-/Craftingdienste dürfen einen Cue ausschließlich aus einem bestätigten Readmodell oder Receipt ableiten. Der Renderer besitzt für jeden registrierten Cue einen synthetischen Fallback, falls ein optionales WAV nicht geladen oder dekodiert werden kann.

## Browser- und Mobilverhalten

AudioContext wird ausschließlich durch direkte Nutzerinteraktion freigeschaltet. Autoplay-Fehler bleiben nicht-blockierend; ein fehlendes oder defektes Asset darf den Renderer nicht unterbrechen. Bus-Lautstärken sind für mobile Lautsprecher konservativ voreingestellt. Der Ambient-Loop wird beim Tower-/Expanse-Wechsel ersetzt und beim React-/Babylon-Unmount vollständig beendet. Kurz-SFX sind mono, 44.1 kHz, 16-bit PCM und belegen gemeinsam gemessene 0.928659 MiB.

## Assetvertrag

Zone-Musik und SFX werden mit SHA-256, Format, Dauer, Quelldefinition, Contentversion und Zielcue inventarisiert. Ein Asset wird erst nach technischem Decode-Readback und Review als `active` geführt. Die 21 SFX sind durch `scripts/generate_aurion_sfx.py` revisionsgebunden renderbar; die drei neuen Weltambiences sind als `ambient-forest-world.wav`, `ambient-cave-world.wav` und `ambient-city-world.wav` inventarisiert und werden vom Static-/Itch-Packager mitgeführt. Ein zweiter Renderlauf erzeugte identische SHA-256-Listen. Die Runtime besitzt für alle Cues einen deterministischen Synth-Fallback; externe Audio-URLs sind optional und niemals gameplaykritisch.

## Rückkehrpunkt

Die Integration bleibt auf dem Kandidatenbranch `feature/aurion-audio-system` vom Aurion-Main-Head `73542eabfe981135593676648d5a2717f3b2c0a8`. Es gibt keine Datenbankmigration, keinen Scheduler und keine Produktionsmutation.
