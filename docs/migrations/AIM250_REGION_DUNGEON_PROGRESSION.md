# AIM-250 — Regionen, Chunks und Dungeons ohne obsolete Gebiete

Status: **Migrationsvertrag und ausführbarer deterministischer Resolver**  
Regeln: `aurion-region-progression.v1` / `aurion-dungeon-progression.v2`

Dungeon v2 bindet die Affix-Reihenfolge an den unveränderlichen Laufbeleg, sodass
höhere Etagen keine geringere Schwierigkeit oder Belohnung durch Neuverlosung
erhalten. Details und reproduzierbare Gegenbeispiele stehen in
[AIM-265](../balancing/AIM265_BALANCING_V2.md). Diese Protokollrechnung ist noch
kein Nachweis einer aktiven Dungeon-Instanz; dafür bleibt AIM-259 erforderlich.

## Autoritätskette

```text
Arelorian/WASD rules
  -> Aurion GlobalWorldPlan (worldSeed, epoch, sectors, polity/resources)
  -> deterministic region/event/dungeon resolver
  -> accepted server receipt or world delta
  -> later persistence in AIM-251
  -> read-only 3D/HUD projection in AIM-253
```

Der Resolver legt keinen zweiten Weltzustand an. Regionen werden aus dem bestehenden `GlobalWorldPlan` abgeleitet. Persistiert werden in der folgenden Lane ausschließlich akzeptierte Deltas, Events und Receipts, nicht sämtliche erneut berechenbaren Regiondaten.

## Keine klassische Levelzone

AIM-250 verwendet absichtlich **kein Player-Level-Mirroring**. Ein Charakter mit hoher Mastery verwandelt die Sternwarte nicht automatisch in ein Hochlevel-Gebiet. Gefahr entsteht aus:

- fester regionaler Identität;
- aktuellem servergebundenem Welt-Event;
- Konfliktdruck und Stabilität der regionalen Politik;
- Gruppengröße;
- Dungeonvariante, Floor und Affixen.

Mastery verbessert Zugang, XP-Pacing und bounded Rewards. Sie setzt nicht heimlich die Gegnerwerte gleich dem Spielerlevel.

## Regionale Identitäten

Die ersten vier Sektoren bleiben verbindlich:

1. Schwelle der Sternwarte
2. Windhollow
3. Emberfall-Marsch
4. Aschengewölbe

Weitere Sektoren erhalten deterministisch eine Identität aus Clockwork Woods, Frostkronen-Marsch, Sunwatch-Bastion, Flüsternde Grenze, Tidescar-Küste und Starfall-Ruinen. Jeder konkrete Sektor behält trotzdem seine eigene ID, Koordinate, generierte Biome-/Siedlungs-/Polity-Lage und seinen eigenen Event-Hash.

Jede regionale Identität besitzt:

- Fraktion und politische Bedeutung;
- dauerhafte Wirtschaftsrolle;
- mindestens zwei charakteristische Ressourcen;
- exakte Mastery-Gates statt globaler Levelgrenzen;
- eigenes Dungeon-Thema;
- feste Danger-/Reference-Budgets;
- wechselnde Welt-Events.

Damit bleiben frühe Gebiete sinnvoll: Ihre Ressourcen, Händler-, Diplomatie-, Handwerks-, Navigations- und Dungeonrollen verschwinden nicht, nur weil spätere Sektoren freigeschaltet wurden.

## Dynamische Welt-Events

Events werden aus `worldSeed + epoch + sectorId + resolutionIndex` gewählt und gehasht. Der Katalog enthält:

`caravan_fair · leyline_tempest · succession_crisis · ancestral_migration · masterwork_demand · dungeon_breach · harvest_tide · border_congress`

Ein Event verändert bounded Danger-/Reward-/Scarcity-/Politics-Werte und trägt zugleich eine NPC-Direktive. Damit kann AIM-251 den bestätigten Event später mit NPC Memory, Wirtschaft und Politik persistieren, ohne dass der Client ein Ereignis erfindet.

## Old-region relevance

Jede Region liefert explizite Relevanzgründe:

```text
unique resource
+ economy role
+ faction/politics
+ regional dungeon
+ current world event
+ global reward floor
```

Der AIM-249-Korridor bleibt verbindlich:

- normale regionale Rewards niemals unter `7500 bps` allein wegen ihres Alters;
- dynamische regionale Rewards maximal `25000 bps`;
- Dungeon-Rewards maximal `50000 bps`;
- Combat-Budget maximal `60000 bps`.

## Dungeon-Varianten

Vier Varianten nutzen denselben receipt-gebundenen Resolver:

- `normal`
- `elite`
- `challenge`
- `endless`

Endless-Floors sind kanonische Dezimalstrings/BigInt und besitzen kein Levelcap. Der sichtbare `challengeScoreExact` kann unbegrenzt wachsen; Combat-/Reward-Projektionen bleiben bounded, damit Zahlen und Ökonomie nicht explodieren. Höhere Floors erhalten zusätzliche, aber maximal sechs eindeutige Affixe.

Affixe beeinflussen nicht nur Kampfwerte. Sie tragen Economy- und Politics-Folgen wie Materialschwankungen, Karawanenrisiko, Handwerksnachfrage, Grenzsicherheit oder Fraktionskonflikte. Der konkrete Affixsatz hängt von Weltseed, Epoch, Region, Dungeon, Variante, Floor und einem echten SHA-256-Source-Receipt ab.

## Chunk- und AOI-Budgets

Phone, Tablet und Desktop besitzen getrennte Grenzen für:

- aktive Mobs und NPCs;
- Props und Partikel;
- Remote Players und AOI-Radius;
- High/Medium/Low LOD;
- serverseitigen Tick-Divisor für entfernte Projektionen.

Diese Budgets reduzieren Rendering-/Interest-Arbeit, niemals die kanonische Weltwahrheit.

## Dateien

- `server/aurionRegionCatalog.ts` — regionale Identitäten, Events und Dungeon-Affixe
- `server/aurionRegionProgressionProtocol.ts` — stateless GlobalWorldPlan → Region-Projektion
- `server/aurionDungeonProgressionProtocol.ts` — receipt-gebundene Dungeon-/Endless-Logik
- `server/aurionChunkPerformanceProtocol.ts` — Phone/Tablet/Desktop-AOI-/LOD-Budgets
- `shared/aurionRegionProgressionCatalog.json` — maschinenlesbarer Vertrag für spätere Projektionen
- `server/aim250RegionProgression.test.ts` — Determinismus-, Relevanz-, Mastery-, Dungeon- und Performance-Regression

## Abgrenzung

AIM-250 erzeugt keine neue Datenbankmigration, keine UI-Fassade, keinen Deploy und kein vorgezogenes Release-/Continuity-Gate. AIM-251 bindet akzeptierte regionale/Dungeon-Ereignisse an das Persistenz- und Event-Ledger. AIM-253 rendert die autoritativen Readmodels. AIM-254 führt später die konsolidierte Replay-/Browser-/Visual-Evidence durch.
