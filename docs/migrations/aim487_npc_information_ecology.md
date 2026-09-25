---
description: Deterministische NPC-Informationsevolution aus bestätigten Receipts.
---

# AIM-487 — NPC Information Ecology

Die Information Ecology ist eine eigene Aurion-Persistenz-/Evidence-Fläche. Sie erweitert den vorhandenen NPC-Multi-Memory und Semantic Graph V2 nicht durch neue Graph-Authority.

## Lebenszyklus

\`experienced → remembered → communicated → corroborated / contradicted → trusted / uncertain → expired\`

Jeder Übergang erzeugt einen neuen append-only Information Receipt. Der vorherige Receipt bleibt erhalten und wird über \`previousReceiptId\` referenziert.

## Truth Boundary

Der Vertrag benennt NPC-Entscheidung, NPC-Memory, NPC-Action, World, Quest und Semantic-Graph-Receipts als mögliche Quellen. Der aktuelle Schreibpfad verifiziert ausschließlich echte NPC-Entscheidungs-Receipts per MariaDB-Readback und lässt dafür nur die belegte Aussage `npc_decision` über den NPC und sein gespeichertes Ziel zu. Für alle anderen Arten fehlt derzeit der quellenspezifische Verifier; sie werden beim Schreiben abgewiesen. Insbesondere kann ein NPC-Entscheidungs-Receipt keine zerstörte Karawane oder generierte Struktur beweisen. CAG-/LLM-/Renderer-Ausgaben sind keine Faktquellen.

Eine Information enthält Welt-, Akteur-, Subject-, Predicate- und Value-Identität, festen \`confidenceBps\`, logischen Index, optionale Ablaufgrenze und die ursprüngliche Receipt-/Revision-/Causal-Provenienz.

## Determinismus

Kommunikation erhält eine deterministische ID aus Source-Receipt, Empfänger und logischem Index. Es gibt keine zufällige Gossip-Auswahl und keine Wall-Clock-Abhängigkeit.

Konflikte werden nicht kollabiert. Unterschiedliche Werte derselben Claim-Key-Familie bleiben getrennte Fact-Linien und werden explizit als \`contradicted\` markiert.

Trust ist eine reine Regelentscheidung über explizite Fixed-Point-Werte: mindestens zwei Korroborationen, keine Widersprüche und mindestens 8000 BPS.

## Restart und Compaction

Der aktuelle Knowledge-State wird aus append-only Receipts rekonstruiert. Die Provenienz-Zusammenfassung erhält die komplette Receipt-Lineage und die ursprüngliche Source-Identität; ein kompaktes Readmodel verliert den Ursprung nicht.

## Consumer Boundary

Action-/Quest-Verbraucher dürfen nur \`corroborated\` oder \`trusted\` Fakten vor Ablauf verwenden. Private Memory-/Receipt-Payloads sind nicht Teil der kompakten Presentation-Projektion.

## Evidence

Die Pure-Regressions prüfen Identität, Idempotenz, Konfliktbewahrung, logische Ablaufzeit, Welt-Scope, Trust, Provenienz und Consumer-Filter. Die MariaDB-Suite prüft echten Insert/Readback, idempotente Kommunikation und Restart-Style-Rekonstruktion gegen eine isolierte Datenbank.
