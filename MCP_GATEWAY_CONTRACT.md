# Echoes of Aurion — MCP Gateway Contract

## Zielbild

Die veröffentlichte Erstversion nutzte bewusst einen **lokalen Befehlsadapter**. Der aktuelle Ausbaustand ergänzt eine serverseitige, providerneutrale MCP-Grundlage: Ein angemeldeter Explorer kann einen kurzlebigen Pairing-Token ausstellen, den nur ein MCP-fähiger LLM-Client als Bearer-Berechtigung verwenden darf. Das Spiel darf weder eine private Chat-Anwendung kontrollieren noch versteckte Befehle an einen Anbieter senden.

| Bereich | Erstversion | Spätere autorisierte Integration |
| --- | --- | --- |
| Partnerwahl | Sichtbare Auswahl und lokale Testkopplung | Einwilligungsgebundener MCP-Pairing-Token pro Spielsession |
| Steuerkanal | Browser-Event `aurion:command` | Geschützter Streamable-HTTP-Endpunkt `/mcp` mit Bearer-Token |
| Zulässige Eingaben | `W`, `A`, `S`, `D`, `1` bis `9` | Strikte Allowlist vor jeder Spielmutation |
| Erinnerung | `localStorage` als exportierbares JSON | Zusätzlich serverseitiger Audit nur für Befehl, Reihenfolge und Zeitstempel |
| Kontrolle | Sichtbarer Feed und Ledger im HUD | Token-Widerruf im UI, Ablauf nach acht Stunden, serverseitiges Auditlog |

## Normierte Befehlshülle

```json
{
  "protocol": "aurion.command.v1",
  "sessionId": "opaque-short-lived-session",
  "sequence": 42,
  "command": "9",
  "issuedAt": "2026-08-13T00:00:00.000Z",
  "source": "authorized-llm-partner"
}
```

Der Gateway-Service verwirft Nachrichten, deren `command` außerhalb der Allowlist liegt, deren Sequenz nicht streng steigend ist oder deren Session abgelaufen beziehungsweise widerrufen ist. Er speichert niemals Chat-Inhalte im Spiel-Ledger; dort stehen ausschließlich der normalisierte Befehl, ein Zeitstempel und die sichtbare Spielwirkung. Bearer-Tokens werden nur als SHA-256-Digest gespeichert und nie erneut angezeigt.

## Endpoint-Isolation

Der **Echoes-of-Aurion-MCP** verwendet ausschließlich den projektspezifischen Endpunkt `https://aurion3d-6hpapr2g.manus.space/mcp`. Er ist unabhängig vom Sovereign-Studio-ATO-MCP. Der ATO-ChatGPT-Tunnel bleibt auf seiner eigenen VPS-Laufzeit und seinem bestehenden Tunnelprofil; Aurion verwendet diesen Tunnel weder als Proxy noch als Host- oder Credentialquelle.

Am 13. August 2026 wurde der Aurion-Endpunkt mit einem frischen, nicht persistierten Pairing-Token über Streamable HTTP erfolgreich initialisiert. Die autorisierte Werkzeugliste enthielt ausschließlich `aurion_get_mission_contract` und `aurion_send_command`; der schreibfreie Missionsvertrag antwortete erfolgreich. Dabei wurden weder ein Spielbefehl ausgelöst noch Token, Sitzungskennung oder Chatinhalt protokolliert.

Für eine öffentliche Remote-MCP-Veröffentlichung ist Streamable HTTP der aktuelle Transport; MCP-Autorisierung verwendet OAuth 2.1-konforme Bearer-Tokens, die bei jeder Anfrage im Header und nie in der URL übertragen werden sollen.[1] Die bereits implementierte Pairing-Berechtigung ist der spielinterne Zugangsschutz. Vor einer breiten LLM-Client-Kompatibilität muss sie noch durch einen vollständigen OAuth-2.1-Authorization-Server mit Resource Metadata und PKCE erweitert werden.[1]

## LLM-Verhalten als Spielvertrag

Der Spielpartner erhält keinen Zugriff auf freie Browser- oder Gerätesteuerung. Stattdessen sollte der Betreiber ihm eine knappe, providerneutrale Instruktion senden:

> Du steuerst nur den Echo Scout in *Echoes of Aurion*. Antworte mit genau einem erlaubten Kürzel: `W`, `A`, `S`, `D` oder einer ausgerüsteten Fähigkeit aus `1`–`9`. Nutze keine anderen Werkzeuge, greife nicht auf private Daten zu und erkläre den Befehl nur auf ausdrückliche Nachfrage.

## Monetarisierung und Administration

Werbung gehört nicht in die kritische Steuerungsschleife, nicht in das Partner-Gateway und nicht zwischen eine Spieleraktion und deren sichtbare Ausführung. Erst nach einem separaten Consent- und Alters-/Datenschutzkonzept sollte eine optionale Rewarded-Ad-Platzierung zwischen abgeschlossenen Runs ergänzt werden. Die Admin-Steuerung benötigt dafür eine echte Backend-Authentifizierung und ist bewusst nicht in diesem statischen Prototyp enthalten.

## Referenzen

[1] [Model Context Protocol: Authorization](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)
