---
description: Aktueller Account- und Portalfluss ohne Aurion-Gameplay-Authority.
---

# Konto-zentrierter Aurion-Einstieg

Aurion ist vor dem Spiel das **Portal**, nicht der Spielkern.

## Route ownership

| Route/Fläche | Owner | Zweck |
| --- | --- | --- |
| `/` | Aurion | Landing, Login/Account, Communitynavigation, bewusster Spielstart |
| `/account` | Aurion | Account + read-only persistierte Charakter-/Companiondaten |
| `/community` | Aurion | Community, Forum und Community-Events |
| `/play` | AX1 | eigentliche Spielruntime |

WASD bleibt die Gameplayregelquelle für alles, was nach dem Start im Spiel passiert.

## Einstieg

1. Gast sieht Aurion Landing Page und Accountzugang.
2. Anmeldung/Registrierung erzeugt nur Auth-/Accountstate.
3. Ein expliziter Startwunsch navigiert in die AX1-`/play`-Runtime.
4. AX1 erzeugt Intents; WASD entscheidet Gameplayzustand.
5. Rückkehr beendet die Spielruntime und führt zurück zum Aurion-Portal.

Auth darf nie als Nebeneffekt Combat-, Quest-, Progressions- oder World-State erzeugen.

## Accountseite

Die Accountseite darf bestätigte persistierte Daten anzeigen:

- Level und Gesamtfortschritt;
- Skill-/Mastery-Stände;
- Gildenzugehörigkeit;
- Inventar und Ausrüstung;
- Achievements nur bei vorhandener bestätigter WASD-Projektion;
- Companion-Trainings-/Sample-/Receipt-Metadaten.

Sie darf **keine** Gameplaymutation anbieten. Insbesondere kein Equip, Craft, Loot, Quest, Progression, Combat, Market, Dungeon, Housing oder Guild-/Kingdom-Gameplay.

## Community

Community- und Forum-Schreibrechte sind echte Aurion-Ownership. Community-Event-Metadaten dürfen geschrieben werden. Gameplayfolgen eines Events benötigen dagegen einen separaten WASD-Regelvertrag.

## Acceptance

- Gast kann keinen Gameplayzustand über Websitecalls erzeugen;
- Login verändert nur Account/Session;
- `/play` mountet AX1, nicht `Home.tsx`-Gameplay;
- Account-/Communityseiten besitzen keine Gameplaymutationsrouten;
- read-only Daten zeigen nur persistierte bestätigte Evidence;
- fehlende/stale Daten werden ehrlich als nicht verfügbar/stale dargestellt.
