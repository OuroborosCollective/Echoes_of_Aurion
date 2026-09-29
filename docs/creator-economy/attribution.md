---
description: Deterministische Creator Attribution aus kanonischen Causal Receipts.
---

# Deterministic Creator Attribution

## Ziel

Für jedes eligible Economic Event wird der kausale Beitrag beteiligter Artifacts deterministisch aus bestätigten Receipts abgeleitet.

Für ein Event e:

- Economic Value: V_e
- Contribution Vector: C_e = (c_1, ..., c_n)
- Conservation: Summe c_i = 1

Die Beitragskomponenten können Creator Artifact, NPC-Aktivität, Spieleraktivität, andere Creator-Inhalte, Infrastruktur und System-/World-Beiträge repräsentieren.

## Inputs

Die Attribution muss explizit an folgende Inputs gebunden sein:

- Economic Event ID
- Causal Receipt IDs
- Character/Content Artifact ID
- Artifact Revision / Content Hash
- Source Revision
- Attribution Rule Revision
- definierte Settlement-Konfiguration

Keine versteckte mutable RNG-Quelle, Wall-Clock-Abhängigkeit oder Hostzustandsabhängigkeit.

## Determinismus

Gleiche kanonische Inputs und gleiche Rule Revision müssen dasselbe Attribution-Ergebnis erzeugen.

Tie-Breaks müssen stabil und locale-independent sein.

## Fail Closed

Fehlende, widersprüchliche oder nicht reproduzierbare Evidenz darf nicht in einen erfundenen Attribution-Anteil umgewandelt werden. Solche Fälle bleiben UNPROVABLE bzw. CONTRADICTED.

## Keine Weltmutation

Die Attribution Engine berechnet Evidence/Claims. Sie autorisiert keine Gameplay-Mutation, Loot-, XP-, Progressions- oder World-State-Änderung.

## Referenzimplementierung

Die endgültige Implementierung muss vorhandene Aurion Causal Receipt-, Replay-, World- und Economy-Pfade wiederverwenden und darf keinen zweiten Event-/Simulation-Core einführen.
