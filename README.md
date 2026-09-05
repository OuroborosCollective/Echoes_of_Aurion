---
description: >-
  Serverautoritäres 3D-Open-World-MMORPG mit persistenter Welt, Quests und
  Gilden.
---

# Echoes of Aurion

**Echoes of Aurion** ist ein 3D-Open-World-MMORPG für Browser und Mobilgeräte. Du erkundest eine persistente Welt, entwickelst deinen Charakter und beeinflusst Regionen durch Quests, Kämpfe, Wirtschaft und Gilden.

Die Welt entsteht deterministisch aus einem versionierten Seed. Der Server autorisiert Bewegung, Kampf, Loot, Quests, Präsenz, Epochen und Weltveränderungen. Clients zeigen ausschließlich bestätigte Zustände an.

## Die Welt von Aurion

Aurion besteht aus verbundenen Sektoren mit eigener Politik, Wirtschaft, Ressourcen und Dungeons. Welt-Events verändern Gefahr, Belohnungen, Knappheit und Beziehungen der Fraktionen.

Die ersten Regionen sind:

1. **Schwelle der Sternwarte**
2. **Windhollow**
3. **Emberfall-Marsch**
4. **Aschengewölbe**

Regionen bleiben langfristig relevant. Ressourcen, Handelsrollen, Fraktionen, Dungeons und Welt-Events bieten eigene Ziele. Mastery verbessert Zugang und Fortschritt. Sie skaliert Gegner nicht automatisch auf dein Level.

## Fortschritt und Aktivitäten

Du baust Fortschritt über serverbestätigte Ergebnisse auf:

* **Quests und Entscheidungen:** Fraktionsgeschichten führen über nachvollziehbare Entscheidungs- und Belohnungsbelege.
* **Kampf und Loot:** Begegnungen erzeugen bestätigte Siege, Gegenstände und Skill-XP.
* **Dungeons:** Normal, Elite, Herausforderung und Endlosmodus nutzen regionale Varianten und Affixe.

Endlosdungeons haben kein Level-Cap. Ihre sichtbaren Kampf- und Belohnungswerte bleiben begrenzt. So bleiben Wirtschaft und Lesbarkeit stabil.

Aurion verwendet keine Klassen und keine globale Charakterstufe. Jede Fähigkeit besitzt eigene XP und eine eigene, cap-freie Stufenlogik. Dein Build entsteht aus trainierten Skills, Ausrüstung und Spielentscheidungen.

## Gemeinschaft und Weltordnung

Gilden koordinieren Territorien, Ressourcen und Diplomatie. Ein Königreich entsteht aus mindestens sechs verbundenen Territorien derselben Gilde. Der Server prüft Mitgliedschaft, Berechtigungen, Ressourcen und Revisionen bei jeder wirksamen Aktion.

Ein persönlicher Turm dient als geschützter Rückkehrpunkt, Lager und später gestaltbarer Raum. Er ist keine Kampfarena.

## Technik

Die Anwendung nutzt **React**, **TypeScript**, **Vite** und **Babylon.js**. Sie streamt Welt-Chunks und passt Detailstufen an Phone, Tablet und Desktop an. Diese Budgets reduzieren Renderlast, niemals den kanonischen Weltzustand.

## Aktueller Veröffentlichungsstand

Die MMORPG-Systeme sind im aktuellen Aurion-Quellstand implementiert und durch Verträge sowie Tests abgesichert. Die öffentliche Auslieferung wird noch schrittweise auf die vollständige Aurion-Laufzeit umgestellt.

Die derzeitige öffentliche Website enthält eine ältere statische Oberfläche. Produktionsmigrationen, die vollständige API und der End-to-End-Nachweis des MMORPG-Flows werden vor ihrer Freigabe separat verifiziert. Dadurch bleiben Konten, Fortschritt und Wirtschaft geschützt.
