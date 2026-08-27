# WASD → Aurion — Globaler Open-World-Migrationsledger

> **WASD-Quellrevision:** `a4d99432e47b82ce98105eadb30360cd8040ad13`. **Aurion-Ausgangsrevision:** `3ede8d28d07e34bbb232cca36b975986e6b61867`. Dieser Schnitt ersetzt keine private Turmhausinstanz; er schafft den globalen, serverautoritativen Weltvertrag, aus dem ein dauerhaft wachsender Außenraum entstehen kann.

| WASD-Quellsemantik | Aurion-Ziel | Umsetzung in diesem Kandidatenschnitt | Status |
|---|---|---|---|
| `modules/world/WorldSystem.ts`, `WorldState.ts`, `WorldSeed.ts` | Globale Weltidentität und regelgebundener Sektorplan | `globalWorldProtocol.ts` erzeugt einen stabilen Plan mit Weltseed, Epoche, Koordinaten und Hash. | integriert und getestet |
| `modules/questline/worldSpawner.ts` | Deterministische Regionen, Siedlungen, Berufe, Läden und Quests | Jeder Sektor erhält Biome, Siedlungstyp, Bevölkerungskapazität, Berufsanteile und zustandsbezogene Questangebote. | integriert und getestet |
| `modules/world/ResourceSystem.ts`, `ResourcePopulator.ts`, `ResourceScatter.ts` | Ressourcen- und Regenerationskreislauf | Holz/Waldgesundheit, Nahrung, Wasser, Erz und Dürre beeinflussen Questangebote und Migrationsimpulse. | integrierter Regelkern; Tick-Fortschreibung ausstehend |
| `modules/resource/forestResourceRules.ts` | Waldressourcen, Kahlschlag und Wiederbewuchs | Dürre- und Waldgesundheitsdruck erzeugen Forster-/Farmer-Migration sowie Renaturierungs- und Bewässerungsquests. | integrierter Regelkern; Bestandsmutationen ausstehend |
| `modules/npc/*`, `WorldBrain*` | Bedürfnisse, Berufe, Migration und NPC-getragene Aufträge | Berufe und Migrationsgründe sind global abgeleitet; individuelle persistente NPC-Wege werden im nächsten Schnitt an die Welt-Epochentabelle gebunden. | teilweise integriert |
| `modules/politics/*`, `warfront/*` | Stabilität, Nachfolgekrisen, Krieg und Gegenmaßnahmen | Regionale Konfliktdruckwerte erzeugen Unruhe, Nachfolgekrise oder Kriegsfront und leiten Diplomatie-/Verteidigungsquests ab. | integrierter Regelkern; mehrregionale Diplomatie ausstehend |
| `modules/questline/questlineGenerator.ts` | Weltzustand → Questkette | Ressourcen- und Politikzustände erzeugen priorisierte, NPC-zugeordnete Questangebote. | integriert und getestet |

## Wachstumsvertrag

Der globale Plan beginnt mit sechs Sektoren und schaltet anhand des dauerhaft gespeicherten Spielerhochstands **pro weitere vier Spieler einen Sektor** frei, bis zur Obergrenze von 740 Sektoren. Der Vertragskern ist rein und wiederholbar: gleiche Eingaben ergeben denselben Weltplan und denselben Hash. Der getestete Grenzwert erreicht 740 Sektoren ab 2.937 Spielern.

> Der aktuelle Skalierungswert ist absichtlich der persistierbare Bestand registrierter Spieler. Eine echte Online-Präsenz wird erst nach dem geplanten Echtzeit-Registry-Adapter verwendet; sie darf nicht aus flüchtigem Browserzustand abgeleitet werden.

## Persistenz und verbleibende Arbeit

`aurionGlobalWorldStates` speichert den letzten globalen Snapshot; `aurionGlobalWorldEpochReceipts` protokolliert jede Epochenauflösung unveränderlich. Die Datenbankmigration `0021_aurion_global_world_state.sql` legt beide Tabellen an. Noch **nicht** aktiviert ist ein kontinuierlicher serverseitiger Weltzyklus: Dürre, Wiederbewuchs, Handel, NPC-Wanderung und Konflikte werden derzeit bei bestätigter Weltauflösung abgeleitet, aber nicht zeitgesteuert fortgeschrieben. Die Aktivierung verlangt eine bewusste Wahl der permanenten Hostingform, einen idempotenten Epochenjob und ein Player-Presence-Register.
