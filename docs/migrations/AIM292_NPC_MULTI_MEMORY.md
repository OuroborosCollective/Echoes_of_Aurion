---
description: WASD-eigene NPC-Regeln, vier begrenzte Speicherklassen und bestätigte MariaDB-/AX1-Projektionen.
---

# AIM-292 — Bestätigtes NPC-Gedächtnis

WASD besitzt die NPC-Bedürfnisse, Zielwahl, Lebensplanung, Händlerentscheidungen und Speicherregeln. Aurion speichert ihre bestätigten Ausgaben in MariaDB und liefert authentifizierte Readmodels. AX1 zeigt diese Daten im Kontaktfenster an.

## Revisionsgebundene Regelquelle

Die Quelle liegt in `OuroborosCollective/Wasd/server/src/aurion/npc`. [WASD-PR #2842](https://github.com/OuroborosCollective/Wasd/pull/2842) wurde nach 14 erfolgreichen PR-Workflows gemergt. Aurion bindet Main `ddce5911e7969f26a9c5b2739d3426004b32260d`, Quellhash `fcd4cbc5cfa3deae9389cf1aba6d7d376eec216834b877c30876fb488821442f` und Manifesthash `bb9daee6b2e644ff8cb7f0286057679effd78880c4a87d9eb3d96819c447ae5f` in `config/wasd-npc-capsule.json`.

Das Artefakt enthält den tatsächlichen kompilierten WASD-Code, die gebündelte Zod-v3-Validierung samt Lizenz und strenge TypeScript-Deklarationen. Der Build prüft Dateimenge, Hashes, Compilerbindungen und Herkunft, bevor er den Code verwendet. Die Verbraucher-CI lädt exakt den gebundenen WASD-Commit, baut erneut und vergleicht jede Datei mit dem eingecheckten Artefakt. Laufzeitkonfiguration kann die eingebettete Quellrevision nicht ersetzen.

Die bisherigen Aurion-Module für NPC-Life, NPC-Persistenzprotokoll und Händlerprotokoll sind Imports dieser Quelle. `ax1LivingWorldRuntime` liest den bestätigten Vorgänger und speichert die von WASD zurückgegebenen Anfragen. Alte v2/v3-Receipt-Bytes und 80 Händlerfolgen aus allen vier Regionen sind über isolierte Kompatibilitätsfixtures geprüft. Diese Fixtures sind keine Produktionsreceipts. Nicht berührte historische Aurion-Spielregeln bleiben Migrationsschuld.

## Vier Speicherklassen

| Klasse | Inhalt | Grenze |
| --- | --- | --- |
| Arbeitsgedächtnis | Aktuelles Ziel, geprüfter begrenzter Plan und bestätigter Entscheidungsreceipt | Ein aktueller Entscheidungsbeleg; keine aus einem Plan erfundenen Reservierungen |
| Episodisches Gedächtnis | Tatsächliche Zielentscheidungen mit logischem Index, Region, Beteiligtem, Ergebnis und Herkunft | 24 Einträge; Verfall nach 3.500 logischen Indizes |
| Semantisches Gedächtnis | Typisierte Ziel- und Aufenthaltsfakten aus bestätigten Receipt-Feldern | 64 Fakten mit vollständiger Herkunft, Version, Gültigkeit und sichtbarem Konflikt-/Verfallsstatus |
| Prozedurales Gedächtnis | Revisionsgebundene konfigurierte Fähigkeiten zur Zielwahl und begrenzten Planung | Zwei aktive konfigurierte Fähigkeiten; Schemaobergrenze acht |

Der Gesamtzustand ist auf 262.144 UTF-8-Bytes begrenzt. Wiederholte Zustellung erneuert weder Alter noch Hash. Unbekannte alte Receipts verändern den Zustand nicht; widersprüchliche Wiederholungen werden zurückgewiesen. Sortierung, IDs und Verfall hängen von bestätigten logischen Indizes ab. Beim Kürzen entfällt ein ganzer Eintrag, niemals ein Teil seiner Herkunft.

Jede behaltene Aussage wird gegen die tatsächlichen Quellreceipts geprüft. Die begrenzte Lookup-Menge enthält auch Herkunft, die älter als das Fenster der letzten 64 Zustellungen ist. Ein selbstkonsistenter Hash allein genügt nicht: Auch passend neu gehashte falsche Fakten werden anhand ihres Quellpayloads zurückgewiesen. Freitext, Beobachtungsnamen, LLM-Vorschläge und geplante Aktionen erzeugen keine Ausführungsbelege.

## Transaktion und Migration

`0042_aurion_npc_multi_memory.sql` ergänzt ausschließlich `aurionNpcMemoryReceiptsV4`. Die bisherigen SQL-Dateien und gespeicherten v2/v3-Formate werden nicht umgeschrieben. Jeder neue Eintrag bindet Quellentscheidungsreceipt und dessen Bytehash, WASD-Revision und Quellhash, Vorgängerreceipt und Speicherhash sowie den vollständigen begrenzten Speicherzustand. Eindeutige NPC-/Index- und Quellreceipt-Schlüssel verhindern Duplikate. Datenbanktrigger verbieten UPDATE und DELETE; ein CHECK begrenzt die Payloadgröße.

Die bestehende Sperre auf dem NPC-Zustand serialisiert den Writer. Innerhalb derselben Transaktion wird zuerst der v3-Receipt geschrieben und zurückgelesen, danach der WASD-Speicher daraus abgeleitet, gespeichert und samt seinen Herkunftsbelegen zurückgelesen. Scheitert der Speicherschritt, werden auch NPC-Zustand und Entscheidungsreceipt zurückgerollt. Historische Retries erhalten ihren damaligen Speicherstand. Alte Receipts ohne v4-Eintrag werden nicht rückwirkend als WASD-v4-Herkunft ausgegeben. Der erste neue Speicher kann an einem bereits hohen Produktionsindex beginnen.

Die kanonische Produktionswelle umfasst nun `0021` bis `0042`, mit 43 Journalzeilen insgesamt. Plan, Apply-/Reconcile-Artefakte, isolierte Backup-/Recovery-Proofs und separater Produktionsreadback prüfen dieselbe explizite Menge. Ein Schema- oder Deployment-Erfolg wird erst nach dem zugehörigen tatsächlichen Readback gemeldet.

## AX1 und Betriebsnachweis

`gameplay.npcMultiMemory` ist eine authentifizierte Leseabfrage. Sie liefert höchstens sechs geordnete NPC-Projektionen mit vier Zählern, Ziel/Planstatus, Konflikt-/Verfallszahlen und Prüffeldern. Rohgedächtnis und Receipt-Payloads werden nicht ausgeliefert. AX1 validiert Format, Eigentümer und Grenzen vor der Darstellung. Der bestehende AURS-v2-Zähler behält seine ursprüngliche Bedeutung. Die frühere Admin-Mutation für frei eingegebene NPC-Entscheidungen wurde entfernt.

Der autonome Lauf liest nach jedem tatsächlichen Zone-Tick sowohl Entscheidungs- als auch Speicherreceipt zurück. `/healthz.npcLife.multiMemory` enthält nur deren begrenzte Projektion. Die Browserprüfung beobachtet diesen tatsächlichen Lauf, vergleicht die angezeigte historische Zeile mit MariaDB und prüft Phone, Tablet und Desktop. Lokale Protokoll-/UI-Tests ersetzen diesen Nachweis nicht.

Die Verbraucher-CI und der anschließende kanonische Produktionslauf müssen noch den Abschluss belegen. AIM-293 ergänzt typisierte Aktionsvalidierung und redaktionelle Einwilligung; AIM-294 ergänzt den aus bestätigter Herkunft abgeleiteten Wissensgraphen. Diese Fähigkeiten sind nicht Bestandteil des hier beschriebenen Speicherabschlusses.
