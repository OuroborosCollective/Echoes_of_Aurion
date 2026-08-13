# Expeditionsresultat-Quittung — Serverautoritärer Lootpfad

**Zeitpunkt:** 13. August 2026  
**Ziel:** Loot und Waffen-XP dürfen nur aus einem serverbestätigten Expeditionsresultat hervorgehen, nie aus einem Browserereignis oder direkt über einen vom Client gelieferten Gegenstandsinhalt.

## Datenmodell und Bindung

| Ebene | Durchsetzung |
| --- | --- |
| Expeditionsresultat | `expeditionResultReceipts` bindet Nutzer, Expeditions-Key, Seed- und Ergebnisdigest, Bestätiger sowie Idempotenzschlüssel. |
| Loot | `createLootDrop` verlangt eine passende akzeptierte Resultatquittung für Nutzer, Expedition und Seed, bevor Treasure Class, Qualität, Affixe und Iteminstanz aufgelöst werden. |
| Waffen-XP | `recordValidatedWeaponEvent` verlangt dieselbe passende Resultatquittung, bevor Klassen-/Weapon-Track-Grenzen und die idempotente Waffenquittung greifen. |
| Router | Nur `adminProcedure` kann ein Resultat bestätigen oder daraus Loot bzw. Waffenereignisse ableiten. |

## Migrations- und Qualitätsreadback

Die additive Migration `0005_amusing_steve_rogers.sql` legte ausschließlich `expeditionResultReceipts` samt Unique-Index auf den Idempotenzschlüssel und Nutzer-/Expeditionsindex an. Der produktive `SHOW CREATE TABLE`-Readback bestätigt Tabelle und beide Indizes. `pnpm check`, `pnpm test` und `git diff --check` sind grün; die Suite umfasst **26 Tests**.

## Atomare Reward- und Loadoutgrenze

`createLootDrop` schreibt Drop-Receipt und Iteminstanz nun zusammen in einer Datenbanktransaktion. `recordValidatedWeaponEvent` prüft zusätzlich einen serverseitig gespeicherten Ein-Waffen-Loadout sowie einen kanonischen Aktionsschlüssel für den Track und schreibt Waffenreceipt, Mastery und Progressionsledger zusammen in einer Transaktion. Die additive Migration `0006_brainy_the_hand.sql` legte `weaponLoadouts` mit `userId` als Primärschlüssel an; der Produktionsreadback bestätigt diese Tabelle.

Die Regeln prüfen `blade: cleave`, `focus: surge` als zulässige Aktionen und lehnen etwa `blade: bolt` ab. TypeScript, Whitespace-Gate und die vollständige Suite sind nach dieser Ergänzung grün (**27 Tests**).

## Offene Produktionsgrenze

Es wurden keine künstlichen Spieler, Expeditionen, Lootinstanzen oder Waffenpunkte in der Produktionsdatenbank erzeugt. Die neuen Routen, Transaktionen und die Quittungsbindung sind daher strukturell und automatisiert geprüft, aber vollständige administrative Resultat-→Loot-→Inventar- sowie Resultat-→Waffen-XP-Readbacks bleiben eigene E2E-Nachweise.
