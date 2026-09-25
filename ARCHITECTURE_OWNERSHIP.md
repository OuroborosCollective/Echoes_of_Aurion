---
description: Kanonische Truth-Boundary und Single-Owner-Architektur für Echoes of Aurion.
---

# Architektur: Aurion Single Authority

> **Kanonischer Endzustand.** Echoes of Aurion ist der einzige kanonische Wahrheitsträger, einzige Runtime-Authority und einzige Owner der Spielsysteme. Alle aktiven Regeln, Entscheidungen, Zustände, Persistenz- und Receipt-Ketten gehören Aurion.
>
> **AX1 und WASD sind Legacy-Projekte.** Ihre historischen Repositories, Revisionen, Dateien und Algorithmen dürfen als Provenienz, Migrationsnachweis oder bereits portierte Implementierungsbausteine erhalten bleiben. Sie besitzen dadurch weder aktuelle Wahrheit noch Pflichten noch Runtime-Authority. Sobald Code in Aurion integriert ist, gehört sein aktives Verhalten zur Aurion-Runtime und wird ausschließlich durch Aurion-Verträge, Tests, Receipts und Readback bestimmt.

## Das einzige Ownership-Modell

| Fläche | Kanonischer Owner | Rolle |
| --- | --- | --- |
| Welt, Zonen, Chunks, Kausalität | **Aurion** | einzige Welt- und Simulationswahrheit |
| Gameplay, Combat, Movement, NPCs | **Aurion** | einzige ausführende Gameplay- und Entscheidungslogik |
| Quests, Progression, Loot, Crafting, Economy | **Aurion** | einzige Regel-, Outcome- und Persistenzautorität |
| NPC Memory, Information Ecology, Semantic Memory | **Aurion** | einzige Semantik- und Provenienzautorität |
| MariaDB, Receipts, Readmodels | **Aurion** | kanonische Datenhaltung und Rekonstruktion |
| Account, Auth, Community, Ops, Asset-Governance | **Aurion** | Produkt- und Betriebsautorität |
| Client, Renderer, HUD, Animation, VFX | **Aurion-Runtime** | Darstellung eines bestätigten Aurion-Zustands; keine zweite Wahrheit |
| AX1 | **historische Provenienz** | kein Owner, kein Live-System, keine Runtime-Pflicht |
| WASD | **historische Provenienz** | kein Owner, kein Live-System, keine Runtime-Pflicht |
| GDS, CAG, Wolfram, LLMs, externe Tools | **Aurion unter Analyse-/Authoring-Grenzen** | liefern Vorschläge, Assets oder Analyse, niemals kanonische Spielwahrheit |

## Kanonische Kausalkette

```text
Spieler / Client / Tool
        ↓
Intent oder untrusted proposal
        ↓
Aurion Validierung + Aurion Regel-/Entscheidungslogik
        ↓
Aurion State Transition
        ↓
Aurion Causal / Action Receipt
        ↓
Aurion MariaDB Persistenz
        ↓
Aurion Readback
        ↓
Client-/Web-/Community-Projektionen
```

Es gibt keine parallele Kette wie `Client → AX1`, `WASD → Gameplay` oder `Tool → direkte DB-Wahrheit`.

## Aurion ist der Träger aller aktiven Logik

Alle folgenden Systeme werden in Aurion definiert, validiert, ausgeführt und persistiert:

- Welt- und Zonenregeln einschließlich Tick-/Epoch-Semantik;
- Spielerbewegung und Combat;
- NPC-Bedürfnisse, Ziele, Entscheidungen, Lebenszyklen, Memory und Information Ecology;
- Quests, Dialogfolgen, Dungeon-/Gruppenlogik und Outcomes;
- Loot, Progression, Skill-/Mastery-Systeme, Crafting und Economy;
- Ressourcen, Strukturen, World Pressure und World Director;
- Gilden, Territorien, Housing und soziale Systeme;
- Auth, Community, Asset-Governance, Migrationen, Receipts und Readmodels.

Eine ausgelagerte Funktion darf daher nicht deshalb als „Owner“ gelten, weil ihr Modul historisch `wasd*` oder `ax1*` heißt.

## Legacy-Provenienz ist keine Authority

Historische Source-Pins sind weiterhin nützlich, wenn sie Herkunft, Migrationsstand, Hashes oder Reproduzierbarkeit dokumentieren.

Sie bedeuten nicht:

- dass das alte Repository zur Laufzeit erreichbar sein muss;
- dass eine alte Revision aktuelle Regeln definiert;
- dass Aurion auf einen fremden Reducer warten muss;
- dass AX1/WASD ein getrenntes Datenbank-, Gameplay- oder Entscheidungsmodell betreiben;
- dass eine neue Änderung zuerst in einem Legacy-Projekt implementiert werden muss.

Ein historischer Hash beantwortet **„woher stammt diese Implementierung?“**, nicht **„wer besitzt sie heute?“**.

## Projektion und Eingabe

Der Client darf Eingaben sammeln, bestätigte Zustände rendern und lokale Presentation betreiben. Er darf niemals Gameplay-Truth lokal erzeugen oder historische AX1-/WASD-Logik als externe Authority behandeln.

## Determinismus

Determinismus ist eine Eigenschaft der **Aurion-Runtime**. Historische WASD-Algorithmen, die bereits portiert wurden, sind innerhalb Aurion deterministische Implementierungsbausteine. Ihre Herkunft bleibt Provenienz; die kanonische Regel ist die in Aurion getestete und ausgeführte Fassung.

Wolfram/CAG kann Mathematik, Graphen, Formeln und Varianten analysieren. Das Analyseergebnis ist niemals selbst Gameplay-, Welt- oder Persistenzwahrheit.

## Datenbanken und Receipts

Aurion besitzt sämtliche kanonischen Datenbanken und Receipt-Ketten:

`Preview/Intent → Aurion Validation → Aurion Effect → Receipt → DB Commit → unabhängiger Readback`

Keine Legacy-DB, kein Client-Store und kein externes Projekt darf parallel kanonische Spielzustände besitzen.

## Migration

Die Migration von AX1/WASD ist keine Übergabe von Authority. Sie ist eine Übernahme von Code und Provenienz in Aurion. Bereits übernommener Code ist Aurion-Code; verbleibende Legacy-Namen sind Kompatibilitäts- oder Herkunftsmarker.

Eine fehlende Legacy-Quelle darf keine aktuelle Runtime blockieren.

## Betriebs- und Evidence-Grenze

| Evidence | Belegt |
| --- | --- |
| Aurion Runtime | Aurion-Ausführung |
| MariaDB Readback | Aurion-Persistenz |
| Causal/Action Receipt | ausgeführte Aurion-Transition |
| Browser/Client | Projektion der bestätigten Aurion-Wahrheit |
| Legacy-Source-Hash | Provenienz der übernommenen Implementierung |
| Wolfram/CAG-Ergebnis | Analyse, nie Runtime-Truth |

Ein grüner Legacy-Check kann daher nie einen kanonischen Aurion-Readback ersetzen.

## Nicht verhandelbar

- **Ein Owner:** Aurion.
- **Eine Wahrheit:** der bestätigte Aurion-State.
- **Eine Persistenzautorität:** Aurion MariaDB.
- **Eine Gameplay-/Entscheidungslogik:** Aurion Runtime.
- **Eine Receipt-Kette:** Aurion.
- **Keine Rückdelegation an AX1 oder WASD.**
- **Keine neue zweite Wahrheitsschicht.**
- **Keine Fake-/Mock-Evidence als Produktionsnachweis.**

## Arbeits- und Merge-Gate

`Memory.md lesen → aktuellen main-Head prüfen → isolierter Branch → Implementierung → gezielte Regression → volle Regression → Runtime/DB/Evidence → genau ein Memory.md-Eintrag → Exact-Head prüfen → Merge → main-Readback`
