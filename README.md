---
description: Echoes of Aurion — persistentes 3D-MMORPG mit lebendiger, deterministischer Welt.
---

# Echoes of Aurion

**Ein persistentes 3D-MMORPG, in dem die Welt nicht auf dich wartet.**

Aurion ist die gemeinsame Welt, das Regelwerk, der Simulator und die Erinnerung des Spiels. Alles, was im Spiel wirklich passiert — Weltzustand, NPC-Entscheidungen, Kämpfe, Quests, Loot, Fortschritt, Wirtschaft, Beziehungen und dauerhafte Konsequenzen — entsteht in der kanonischen Aurion-Runtime und wird als bestätigte, nachvollziehbare Spielgeschichte gespeichert.

Die besondere Idee ist eine **Living World**: NPCs sollen nicht bloß auf Skriptpunkte reagieren. Sie beobachten bestätigte Ereignisse, entwickeln Bedürfnisse und Erfahrungen, erinnern sich, kommunizieren Informationen, verändern ihre Pläne und reagieren auf eine Welt, die sich gleichzeitig weiterentwickelt. Dadurch entsteht Spielfluss aus Ursachen und Konsequenzen statt aus einer festen Abfolge von Questmarkern.

## Das Spiel in einem Satz

**Erkunde eine persistente Welt, kämpfe, sammle, baue, handle und entscheide — während deterministische, selbständig handelnde NPCs und Ökosysteme auf deine Aktionen reagieren und ihre eigenen Geschichten weiterführen.**

## Gameplay-Features

| Feature | Was du erlebst |
| --- | --- |
| **Living World** | Die Welt läuft weiter: Ressourcen, Konflikte, Populationen, Märkte, Fraktionen und lokale Ereignisse beeinflussen sich gegenseitig. |
| **Self-Acting NPCs** | NPCs verfolgen Bedürfnisse und Ziele, treffen nachvollziehbare Entscheidungen und reagieren auf bestätigte Ereignisse statt nur auf vorgefertigte Dialogschalter. |
| **Erinnerung & Gerüchte** | Erfahrungen werden zu Erinnerungen, Informationen werden zwischen NPCs weitergegeben und widersprüchliche Berichte bleiben nachvollziehbar, statt magisch zu einer einzigen Wahrheit verschmolzen zu werden. |
| **Deterministischer Spielfluss** | Gleiche Weltursachen und gleiche Eingaben führen reproduzierbar zur gleichen Zustandsentwicklung. Zufall ist nur dort erlaubt, wo er explizit Teil eines kontrollierten Aurion-Vertrags ist. |
| **Combat & Progression** | Kämpfe, Skills, Meisterschaften, Loot und Fortschritt greifen in dieselbe persistente Welt ein und erzeugen bestätigte Folgen. |
| **Crafting & Economy** | Sammeln, Verarbeiten, Handwerk, Handel und lokale Ressourcen bilden einen spielbaren Kreislauf, der sich mit der Welt entwickelt. |
| **Quests & Konsequenzen** | Aufgaben sind Teil der Weltgeschichte. Entscheidungen und Ergebnisse werden zu realen, persistenten Ereignissen. |
| **Persistente Abenteuer** | Welt-, Charakter- und Progressionszustände werden über die Aurion-Datenhaltung rekonstruierbar erhalten. |

## Der Living-World-Kreislauf

```text
BEOBACHTEN
    ↓
BEDÜRFNIS / ERFAHRUNG
    ↓
ENTSCHEIDUNG
    ↓
AKTION
    ↓
WELTKONSEQUENZ
    ↓
ERINNERUNG / INFORMATION
    ↓
NEUE BEOBACHTUNG
    ↺
```

Das ist der Kern des Spielflusses: Ein Ereignis endet nicht zwingend dort, wo der Spieler die Animation gesehen hat. Seine Wirkung kann später an anderer Stelle wieder auftauchen — bei einem anderen NPC, in einer Quest, im Handel, in einer Fraktion oder in der nächsten Generation von Entscheidungen.

## Was macht die Welt glaubwürdig?

Aurion behandelt die Welt nicht als dekorative Bühne. **Bestätigte Zustände sind Ursache, nicht nur Darstellung.** Deshalb werden Logik, Entscheidungen, Datenbankzustand und Receipts gemeinsam geführt.

Client und Renderer dürfen die Welt zeigen, Eingaben erfassen und Präsentation betreiben. Sie erzeugen keine alternative Spielwahrheit.

Historische AX1- und WASD-Bausteine sind weitgehend in Aurion übernommen. Ihre alten Projektgrenzen, Source-Pins und Dateinamen können als Provenienz erhalten bleiben; sie sind jedoch keine aktuellen Owner und keine separaten Runtime-Systeme.

## Einstieg

**Noch nicht angemeldet?** Erstelle deinen Zugang und erkunde die Spielsysteme.

**Bereits registriert?** Betritt direkt die bestätigte Open-World-Session.

Die Startseite im Client ist deshalb keine technische Portalübersicht mehr, sondern die **Spieler-Einstiegsseite**: Atmosphäre, Gameplay, Living World und der Weg ins Spiel stehen im Mittelpunkt.

## Architektur

Aurion ist der **einzige Owner und Wahrheitsträger**:

- World, Simulation, Tick/Epoch, NPCs und Gameplay
- Quests, Combat, Loot, Progression, Crafting und Economy
- Memory, Information Ecology und Semantic Memory
- MariaDB, Receipts, Readmodels und Runtime-State
- Account, Community, Assets und Operations

AX1 und WASD sind historische Provenienzquellen beziehungsweise bereits migrierte Implementierungsbausteine. GDS, CAG, Wolfram und LLMs sind Werkzeuge für Analyse, Authoring, Prüfung oder Präsentation und niemals eine zusätzliche Spielwahrheit.

Die verbindliche technische Definition steht in [ARCHITECTURE_OWNERSHIP.md](ARCHITECTURE_OWNERSHIP.md).

## Technische Dokumentation

- [Architektur — Aurion Single Authority](ARCHITECTURE_OWNERSHIP.md)
- [Dokumentationsindex](docs/)
- [Deployment & Runtime](CONTAINER_RUNTIME_DEPLOYMENT.md)
- [Audio-System](AURION_AUDIO_SYSTEM.md)
- [Historische Migrationsprovenienz](docs/migrations/README.md)

Datiertes Guardian-/QA-Material beschreibt den Stand seiner jeweiligen Revision und ist keine aktuelle Architekturdefinition.
