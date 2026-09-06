---
description: Natur-Collider, Weltkoordinaten und aktuelle Ownership der Bewegungsprojektion.
---

# Naturkollision und weltweite Bewegung

Die Asset-/Collider-Daten gehören zur AX1-Content-/Presentation-Fläche; die **fachliche Collision- und Movement-Regel gehört WASD**. Aurion darf Collider-/World-Evidence transportieren und Positionen persistieren, aber keine eigene Bewegungsphysik als normative Regelquelle besitzen.

## Assetbestand

Das geprüfte Bundle enthält 40 Stadtmodelle und 112 Naturmodelle mit jeweils drei LODs sowie 112 Natur-Collider. Die Geometrie-/Asset-Provenienz wird über Manifest und SHA-256 gebunden.

`scripts/compile-world-colliders.mjs` darf daraus eine deterministische Collider-Projektion erzeugen. Das erzeugte Manifest beschreibt Geometrie/Content; es ist keine eigenständige Gameplayregel.

## WASD Collision-/Movement-Regel

Kanonische Fragen wie

- Spielerradius und Rundungsmarge;
- erlaubter Schritt pro logischem Tick;
- Blockieren versus Slide;
- Welt-/Chunkgrenzen;
- Reichweitenprüfung;
- Reihenfolge konkurrierender Bewegungsintents

müssen im WASD-Ruleset versioniert sein.

AX1 sendet Richtungs-/Bewegungsintents und rendert bestätigte Positionen. Aurion kann Session-/Transportdaten und bestätigte Positions-/Presence-Receipts persistieren.

## Aktuelle Collider-Contententscheidung

Der vorhandene Content markiert Baum-/Felsfamilien als blockierende Kandidaten, während kleine Dekorationen wie Blumen, Gras, Büsche, Pilze, Äste, Baumstümpfe und ähnliche Props durchgehbar bleiben. Diese Klassifikation darf als AX1-Contentinput in WASD verwendet werden; **die Gameplaywirkung `blocksMovement` wird erst durch die WASD-Regel kanonisch**.

Ein GLB oder Collider kann keine Gameplayphysik allein durch seine Metadaten aktivieren.

## Weltkoordinaten und Persistenz

Die vorhandene Persistenz kann Chunkkoordinaten und lokale Fixed-point-Positionen speichern. Diese DB-Repräsentation ist eine Aurion-Custody-/Readback-Fläche.

Sie entscheidet nicht:

- ob eine Bewegung erlaubt war;
- welchen Collision-Step WASD anwendet;
- ob ein World-Action-Target in Reichweite liegt.

Diese Entscheidungen müssen vor der Persistenz als WASD-Evidence vorliegen.

## AX1-Projektion

AX1 folgt bestätigten Positionssnapshots. Lokale Kinematik darf sichtbare Latenz maskieren, aber nicht als kanonische Position in Persistenz oder andere Clients zurückgeschrieben werden.

LOD, Kamera, Framerate und Asset-Streaming dürfen das WASD-Collisionresultat nicht verändern.

## Legacy-Implementierung

Historische Aurion-Servermodule und Tests enthalten heute noch Teile der Collision-/Movementberechnung. Sie sind **Migration Debt**, solange die fachliche Regel dort statt im WASD-Vertrag lebt. Ihre bisherigen Regressionen bleiben nützliche Gegenbeispiele und Persistenz-/Browser-Evidence, aber kein Ownership-Präzedenzfall.

Bei der nächsten Berührung:

1. Regelparameter und Reducer nach WASD binden;
2. Aurion auf Session/Transport/Persistenz reduzieren;
3. AX1 als Renderer/Input belassen;
4. bestehende Edge-/MariaDB-/Browserfälle gegen den neuen Owner weiterverwenden;
5. Regression ergänzen, die Aurion-eigene Collisionregeln verhindert.

## Evidence

- Collider-Manifest/Hash belegt Assetgeometrie;
- WASD-Reducer/Receipt belegt die Bewegungsentscheidung;
- Aurion-DB-Readback belegt die persistierte bestätigte Position;
- AX1-Browserreadback belegt die sichtbare Projektion.

Keine dieser Ebenen ersetzt eine andere.
