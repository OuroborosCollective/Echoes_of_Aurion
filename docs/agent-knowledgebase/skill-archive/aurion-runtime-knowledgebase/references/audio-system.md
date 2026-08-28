# Audio-Systemreferenz

## Architektur

`AurionSoundscape` ist eine reine Präsentationsschicht. Der AudioContext wird erst durch direkte Nutzerinteraktion freigeschaltet. Der Manager besitzt Master-, Ambient-, Interaction-, Combat-, Movement-, Progression-, Resource- und Crafting-Busse, einen loopenden Ambient-Player, One-Shot-Decoding, deterministische Synth-Fallbacks und Dispose.

## Zonen und Bosses

Die aktuelle Zonenwahl lautet: Home/Tower, Plains-Basispfad, Forest für die globale Expanse, City für Arena 1, Cave für Arena 2, Cinder Vault für Arena 3. `ambient.boss` überschreibt diese Auswahl nur während eines validierten `aurion:boss-encounter`-Events. Der Scope unterscheidet `dungeon` und `world`, ändert aber nicht die Spielautorität.

## Cuegrenzen

Combat-, Resource-, Crafting-, Loot- und Progression-Cues dürfen nur aus bestätigten Ereignissen, Readmodels oder Receipts entstehen. Ein Audio-Cue darf niemals Ressourcen, Schaden, Heilung, Buffs, XP, Loot oder Crafting-Output vergeben. Movement-Cues sind lokal sichtbare Präsentation und müssen gedrosselt beziehungsweise dedupliziert werden.

## Assets

Ambient- und Bossmusik sind PCM S16LE, 44,1 kHz, Stereo. Kurze SFX sind PCM S16LE, 44,1 kHz, Mono. Jede Datei gehört in das Assetledger mit Cue-ID, Pfad, Dauer, SHA-256, Quelle/Revision und Status. `inactive` bedeutet Kandidat: Browser-Decode und Release-Review fehlen noch. `active` nur nach dokumentierter Aktivierung verwenden.

## Mix

Ambient soll Raum geben; Combat kurzfristig hervortreten; Dialog, Loot, Ressourcen und Progression dürfen nicht überdeckt werden. Buslautstärken zentral im Mixer pflegen, keine per-Cue-Multiplikation über verstreute Komponenten. Neue Ducking-Regeln dokumentieren und mit Mobile-Lautsprechern, Kopfhörern und Autoplay-Fallback prüfen.
