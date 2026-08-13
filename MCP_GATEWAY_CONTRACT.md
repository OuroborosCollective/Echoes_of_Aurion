# Echoes of Aurion — MCP Gateway Contract

## Zielbild

Die veröffentlichte Erstversion nutzt bewusst einen **lokalen Befehlsadapter**. Eine echte Provider-Kopplung wird erst ergänzt, wenn der Betreiber einen eigenen, autorisierten Gateway-Service und eine Datenschutz-/Einwilligungsstrecke bereitstellt. Das Spiel darf weder eine private Chat-Anwendung kontrollieren noch versteckte Befehle an einen Anbieter senden.

| Bereich | Erstversion | Spätere autorisierte Integration |
| --- | --- | --- |
| Partnerwahl | Sichtbare Auswahl und lokale Testkopplung | OAuth-/API-Key-Flow pro Provider, von der Person aktiv bestätigt |
| Steuerkanal | Browser-Event `aurion:command` | Authentifizierter Server-Endpunkt mit kurzlebigem Session-Token |
| Zulässige Eingaben | `W`, `A`, `S`, `D`, `1` bis `9` | Strikte Allowlist vor jeder Spielmutation |
| Erinnerung | `localStorage` als exportierbares JSON | Opt-in-Speicher mit klarer Aufbewahrungsdauer und Löschfunktion |
| Kontrolle | Sichtbarer Feed und Ledger im HUD | Zusätzlich: Nutzer-Pause, Token-Widerruf, Server-Auditlog |

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

Der Gateway-Service verwirft Nachrichten, deren `protocol` nicht übereinstimmt, deren `command` außerhalb der Allowlist liegt, deren Sequenz nicht streng steigend ist oder deren Session abgelaufen ist. Er speichert niemals Chat-Inhalte im Spiel-Ledger; dort stehen ausschließlich der normalisierte Befehl, ein Zeitstempel und die sichtbare Spielwirkung.

## LLM-Verhalten als Spielvertrag

Der Spielpartner erhält keinen Zugriff auf freie Browser- oder Gerätesteuerung. Stattdessen sollte der Betreiber ihm eine knappe, providerneutrale Instruktion senden:

> Du steuerst nur den Echo Scout in *Echoes of Aurion*. Antworte mit genau einem erlaubten Kürzel: `W`, `A`, `S`, `D` oder einer ausgerüsteten Fähigkeit aus `1`–`9`. Nutze keine anderen Werkzeuge, greife nicht auf private Daten zu und erkläre den Befehl nur auf ausdrückliche Nachfrage.

## Monetarisierung und Administration

Werbung gehört nicht in die kritische Steuerungsschleife, nicht in das Partner-Gateway und nicht zwischen eine Spieleraktion und deren sichtbare Ausführung. Erst nach einem separaten Consent- und Alters-/Datenschutzkonzept sollte eine optionale Rewarded-Ad-Platzierung zwischen abgeschlossenen Runs ergänzt werden. Die Admin-Steuerung benötigt dafür eine echte Backend-Authentifizierung und ist bewusst nicht in diesem statischen Prototyp enthalten.
