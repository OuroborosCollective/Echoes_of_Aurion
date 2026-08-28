# Welt- und Contentregeln

## Deterministische Welt

Die Aurion-Basiswelt wird aus versioniertem Seed, Integer-Chunkkoordinaten und stabilen Generierungsregeln abgeleitet. Unveränderte Basiskarte muss bei gleichem Seed, Regelstand und Koordinaten identisch bleiben. Keine Zufallsquelle im Runtimepfad verwenden; neue Regeln mit einer Content-/Protocolversion versehen.

Die Datenbank speichert nicht jedes unveränderte Objekt, sondern nur Seed-/Epochmetadaten, serverautoritative Readmodels und Deltas. Ein zerstörter Baum, gebautes Objekt, Marktstatus, Questfortschritt oder politisches Ereignis ist ein Delta oder eine versionierte Reaktion und darf nicht ausschließlich aus dem Client entstehen.

## Serverautorität

Clients senden Absichten. Der Server validiert Eigentum, Sequenz, Epoch, Lease, Reichweite, Ressourcen und Replayschutz und erzeugt ein Receipt beziehungsweise Delta. Erst bestätigte Ergebnisse dürfen visualisiert, vertont oder in weitere lokale UI-Zustände übernommen werden.

Audioereignisse, GLB-Platzierung und lokale Animationen sind Präsentation. Sie dürfen niemals Schaden, Loot, XP, Heilung, Buffs, Crafting, NPC-Politik oder Weltökonomie autorisieren.

## WASD-/Areloria-Migration

Übernimm keine WASD-Runtime blind. Extrahiere nur geprüfte Semantik, Contentverträge, deterministische Regeln und referenzierbare Assets. Dokumentiere Ursprungsrevision, Zielvertrag, Transformationsregel und Verifikation in der globalen Ledgerdatei.

Contentmodule sollten unabhängig versioniert werden: NPC, Quest, Loot, Kampf, Ökonomie, Migration, Politik und Weltreaktionen. Jede Integration braucht eine additive Aurion-Repräsentation und darf bestehende Produktionspfade nicht stillschweigend mutieren.

## Tower-Vertrag

Der Tower ist private sichere Heimat und Sternwarte. Er ist Startpunkt, Lager, Rückkehrziel und später einrichtbarer persönlicher Raum. Andere Spieler dürfen nur über bestätigte Einladungs-/Presencepfade eintreten. Der Tower ist nicht als Arena- oder Kampfstart umzudeuten.
