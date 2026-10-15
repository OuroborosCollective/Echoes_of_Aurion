---
description: "Sprachneutraler HTTPS-, JSON- und WebSocket-Vertrag zwischen Aurion und dem Godot-Client."
---

# Aurion-Clientvertrag: HTTPS, JSON und WSS

## Geltung und Authority

Dieses Dokument friert den vorhandenen Vertrag für [G03 / #910](https://github.com/OuroborosCollective/Echoes_of_Aurion/issues/910) ein. Normative Quellen sind der TypeScript-Server und seine geteilten Validatoren am integrierten Stand. Das sprachneutrale Schema [`zone_v5.schema.json`](../../godot-client/net/contracts/zone_v5.schema.json) ist eine überprüfte Clientprojektion und ändert den Server nicht.

Aurion entscheidet weiterhin Bewegung, Position, Treffer, Schaden, Tod, Loot, Ressourcen, Quests und Wirtschaft. Der Client sendet Intents und zeigt bestätigte Zustände. Er berechnet keine kanonischen Hashes und übernimmt keine Serverregel.

## Transportaufteilung

| Transport | Zweck | Grenze |
|---|---|---|
| HTTPS `/api/trpc` | Anmeldung/Sitzung, einmaliges Zonenticket und übrige bestehende Funktionen | SuperJSON-/tRPC-Hülle, bestehende Authentisierung und CORS/Origin-Regeln beibehalten |
| WSS `/v1/ws` | zeitkritische Zonenintents und bestätigte Zonenprojektion | Protokoll 5, JSON-Textframes; keine Quests oder Wirtschaft erfinden |
| bestehende REST-Routen | GLB-, Katalog-, Appearance- und weitere belegte Projektionen | einzeln aus der Funktionsmatrix portieren |

Das Ticket wird über `gameplay.issueZoneTicket` mit `{zoneId:"observatory_threshold", clientBuild}` angefordert. Es ist kurzlebig, einmalig und geheim zu behandeln. Der Client sendet es nur in der ersten WSS-Nachricht. `consumeZoneTicket` ist eine Server-/Gatewaygrenze und keine öffentliche Clientfunktion.

Der derzeitige Webclient nutzt Cookie-Sitzung und in vorhandenen Previewfällen Bearer-Fallback. Eine native Login-/Renew-/Revokelösung wird in G04 entschieden. Cookies oder Previewtoken werden nicht manuell kopiert.

## Verbindung und Reihenfolge

1. Client bezieht nach erfolgreicher HTTPS-Authentisierung ein einmaliges Zonenticket.
2. Client verbindet zu demselben erlaubten Aurion-Ursprung unter `/v1/ws` und sendet innerhalb von 5 Sekunden einen JSON-Textframe `hello`.
3. Server konsumiert das Ticket genau einmal und sendet `welcome` oder schließt mit Policy Violation 1008. Eine falsche Protokollversion kann vorher `reject/PROTOCOL_VERSION_UNSUPPORTED` auslösen.
4. Erst nach `welcome` werden `move`, `attack` oder `skill` mit streng wachsender `clientSeq` gesendet.
5. `snapshotSeq` und `tick` müssen monoton voranschreiten. Alte oder doppelte Projektionen werden verworfen; Interpolation bleibt reine Darstellung.
6. Reconnect bezieht ein neues Ticket. Ticket und `clientSeq` werden nicht über Verbindungen wiederverwendet.

## Clientnachrichten

| Typ | Pflichtfelder | Besondere Regeln |
|---|---|---|
| `hello` | `ticket`, `zoneId`, `protocolVersion` | Zone derzeit nur `observatory_threshold`; Version exakt 5; Ticket im Serverparser 24–160 Zeichen |
| `move` | `clientSeq`, `input.x`, `input.z` | Achsen ausschließlich `-1`, `0`, `1`; Sequenz 1–2.147.483.647 |
| `attack` | `clientSeq`, `targetEntityId` | Ziel `mob_1` bis `mob_999` gemäß Regex |
| `skill` | `clientSeq`, `skillId`, optional `targetEntityId` | nur die fünf vorhandenen Blade-Skill-IDs; optionales Ziel folgt Mob-Regex |

Der WSS-Server begrenzt jede eingehende Nachricht auf **2.048 UTF-8-Bytes**. Vor `send_text` wird die tatsächlich serialisierte JSON-Nachricht als UTF-8 gemessen. Stringlänge ist dafür kein Ersatz. Binäre Frames werden nicht akzeptiert.

## Servernachrichten

`welcome` und `snapshot` enthalten `zoneId`, `snapshotSeq`, `tick`, `presences`, `mobs`, `combatants` und `resources`. `welcome` ergänzt `protocolVersion`, `connectionId` und `selfEntityId`. Positionen sind sichere Ganzzahlen in Millimetern; `1.000` Einheiten entsprechen einem Meter. Die Umrechnung in Godot-Gleitkomma erfolgt erst an der Darstellungsgrenze.

Weitere Typen:

- `reject` mit einem der neun vorhandenen Codes aus dem Schema;
- `combat` mit Vertrag `wasd-zone-combat.v2`; der historische Name ist Provenienz, Aurion bleibt aktive Authority;
- `telegraph` mit Vertrag `aurion-zone-telegraph.v1` und bestätigten Start-/Impactticks.

Der heutige Browserparser weist JSON-Strings über **65.536 JavaScript-UTF-16-Codeeinheiten** ab. Das ist kein UTF-8-Bytelimit. Der Godot-Decoder führt die Grenzen getrennt und verwirft übergroße, ungültige oder nicht sicher ganzzahlige Werte vor jeder Projektion.

## Zahlen, IDs und Nullwerte

- Alle Sequenzen, Ticks, Benutzer-IDs, Lebens-/Ausdauerwerte und Festkommapositionen müssen Ganzzahlen im JavaScript-Safe-Integer-Bereich sein.
- `clientSeq` besitzt zusätzlich die Obergrenze 2.147.483.647.
- Große IDs bleiben Strings, wenn der vorhandene Vertrag sie als Strings liefert. Sie werden nie über `float` umgewandelt.
- `targetEntityId` bei Mobs und `respawnAtTick` bei Ressourcen können ausdrücklich `null` sein. Das Skillziel ist optional und damit bei JSON-Abwesenheit nicht dasselbe wie `null`.
- Unbekannte Nachrichtentypen werden verworfen beziehungsweise als `UNSUPPORTED_ZONE_COMMAND` beantwortet. Neue Felder oder Typen werden erst nach einem versionierten Serververtrag genutzt.

## tRPC und SuperJSON

Der HTTPS-Endpunkt ist `/api/trpc`. Der Browser verwendet `httpBatchLink` und SuperJSON. Ein Batchrequest trägt Eingaben in nummerierten `{json: ...}`-Hüllen; Antworten liegen in `result.data.json`, während SuperJSON Metadaten beispielsweise Datumswerte rekonstruieren können. Der native Adapter bildet nur die tatsächlich benötigten Prozeduren ab und prüft Fehlerhülle, HTTP-Status und Datentypen.

`issueZoneTicket` liefert Ticket, Zone und Ablaufzeit. Ablaufzeiten werden als Transportdaten gelesen, nicht lokal autoritativ verlängert. Quests, Inventar, Crafting, Markt und soziale Funktionen bleiben auf ihren vorhandenen HTTPS-Verträgen, solange der Server keinen neuen WSS-Vertrag versioniert.

## Paritätsprüfung und Evidence

[`verify-contract-parity.mjs`](../../scripts/godot/verify-contract-parity.mjs) liest Schema und tatsächliche TypeScript-Quellen und bricht bei Drift von Version, Tick, Pfad, Größenlimits, Sequenzgrenze, Vertragsrevisionen oder Godot-Testmarkern ab. Der Godot-Vertragstest prüft Schema-Readback, gültige/ungültige Bewegung sowie getrennte UTF-8-/UTF-16-Zählung.

Der Node-Paritätslauf ist sofort ausführbar. Der Godot-Lauf wird erstmals nach der gepinnten Toolchain in G05 ausgeführt; bis dahin ist seine Nichtausführung eine ausgewiesene Toolchain-Grenze. Produktive Anmeldung und WSS-Betriebsfähigkeit werden separat in G13 belegt.

