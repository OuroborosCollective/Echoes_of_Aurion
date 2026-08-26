# Wasd–Aurion Semantikmatrix und erster Vertikalschnitt

## Revisionsbindung

| Rolle | Repository | Revision |
| --- | --- | --- |
| Runtimeziel | `OuroborosCollective/Echoes_of_Aurion` | `80eb075eea9cec719dc559086968e90417c5bee1` |
| Regel-/Contentquelle | `OuroborosCollective/Wasd` | `a4d99432e47b82ce98105eadb30360cd8040ad13` |
| Kandidatenbranch | Aurion | `aurion/wasd-unification-vertical-slice` |

## Vertikaler Spielnachweis

Die erste vollständige Spielschleife bleibt klein, aber schließt alle zwölf Domänen nachweisbar aneinander an. Der Spieler betritt die **Schwelle der Sternwarte**, spricht mit Lyra, akzeptiert „Der Ruf der Sternwarte“, reagiert auf ein deterministisches Resonanz-/Weltwetterereignis, besiegt den Asterion-Sentinel, erhält eine reproduzierbar gerollte Iteminstanz, erhöht Klingenmeisterschaft und Ruf, und sieht den veränderten NPC-, Welt- und Fortschrittszustand im Aurion-Readmodell und im Browser.

| Domäne | Wasd-Semantik | Aurion-Adapter und Nachweis | Status |
| --- | --- | --- | --- |
| Weltregeln | Seed, feste Sortierung, ARE-/Resonanzwerte | `AurionWorldRules` mit `worldSeed`, `ruleSetVersion`, `resolutionIndex` und Hash. | `ADAPT_TO_AURION` |
| Regionen/Chunks/Siedlungen | Regionen, Beobachtung, Raumdruck | Erweiterung von `OpenWorldSnapshot` um Region-/Weltzustand. | `ADAPT_TO_AURION` |
| Umweltreaktionen | Wetter, Ökologie, Gefahr, Resonanz | Reiner `WorldSignal → WorldReaction`-Resolver. | `ADAPT_TO_AURION` |
| Charakter/Fortschritt | XP, Skills, Waffenmeisterschaft, Stamina | Profil-/Mastery-Readmodell und Receiptbindung. | `ADAPT_TO_AURION` |
| Quests | Vorbedingungen, Zustände, Belohnungen | Bestehende Aurion-Questline plus idempotenter Instanzzustand. | `ADAPT_TO_AURION` |
| Loot/Sets | Schatzklasse, Qualität, Basis, Affixe, Set, Receipt | Deterministischer Aurion-Dropgraph und Iteminstanz. | `ADAPT_TO_AURION` |
| NPC-Brain/Needs | Beobachtung, Erinnerung, Bedürfnisse, Ziele | Begrenzter Lyra-/Orun-Need-/Memory-/Decision-Readmodelladapter. | `ADAPT_TO_AURION` |
| Politik/Königreiche/Krieg | Fraktion, Regierung, Diplomatie, Konflikt | Versionierte Faktion-/Politydaten und nicht destruktive Weltfolgen. | `ADOPT_AS_DATA` |
| Lore/Gilden/Expeditionen | Content-/Lore-Tag- und Fortschrittsverknüpfung | Aurion-Loretags und Expanse-/Expedition-Readmodell. | `ADOPT_AS_DATA` |
| Sprache/Dialekte | Semantik, Dialekt, Verständnis, Quarantäne | Datengetriebene Dialogton-/Intent-Interpretation ohne direkte Mutation. | `ADAPT_TO_AURION` |
| GLB-/Featureassets | Validator, Quarantäne, Katalog | Vollinventur; kein Modell vor Rechte-, Hash- und Budgetprüfung aktiv. | `ADAPT_TO_AURION` |
| Persistenz/Evidenz | Quittungen, Replay, Hash, additive Migration | Aurion-Receipt- und Readmodellpfade; migrationsgebundener Ledger nur nach Bedarf. | `ADAPT_TO_AURION` |

## Nicht übertragene Wasd-Mechaniken

Die verpflichtende 10-Hz-Ausführung, direkte serverseitige Infrastrukturkopien, Tickbesitz, ungeprüfte Fremdsecrets und jede direkte LLM-/Clientmutation bleiben ausgeschlossen. Aurion darf einen bestehenden, sequenzierten Zonenpfad nutzen; die neuen Spielfunktionen werden zusätzlich über stabile `resolutionIndex`- und Receiptgrenzen reproduzierbar gemacht.

## Abnahmekriterien des Vertikalschnitts

Die erste Scheibe ist erst fertig, wenn gleiche Eingaben identische Weltreaktion, Queststatus, Dropresultat, NPC-Entscheidung und Fortschrittsreadmodelle liefern; Wiederholungen keine doppelte Belohnung erzeugen; der Client nur bestätigte Werte rendert; und der gesamte Ablauf im Browser sichtbar ist.
