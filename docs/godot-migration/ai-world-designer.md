# Aurion AI World Designer

Der World Designer erstellt prüfbare Weltentwürfe aus natürlicher Sprache im vorhandenen Godot-Authoring-Studio. Thomas Markgraf (persönliches Künstlerpseudonym „OuroborosCollective“) bestätigt den konkreten Aurion-Plan vor jeder Weltänderung. Eine KI-Antwort ist niemals ein Receipt oder ein Weltzustand.

## Architekturentscheidung

Die Vermittlung liegt in `server/aiFabric`, innerhalb des vorhandenen Aurion-Servers. Sie läuft ausschließlich in authentifizierten Admin-Authoring-Requests außerhalb der 100-ms-Simulation. Es gibt keinen neuen Weltsimulator, Dienst oder Datenbankvertrag. Godot verwendet weiterhin `aurion.world-design.v1` und den bestehenden Plan/Apply/Receipt/Readback-Vertrag. Die alte unbudgetierte Welt-Propose-Route verweist auf den neuen sitzungsgebundenen Pfad; Quest- und Dungeon-Authoring bleiben unverändert.

| Fläche | Eigentümer und Wirkung |
| --- | --- |
| Kontext | Server liest echten GLB-Katalog, World-Design-Readback und aktive Verbindung des angemeldeten Users. Nach Inferenz werden Verbindung und Revisionen erneut geprüft. |
| Vorschlag | Local oder OpenRouter liefert untrusted JSON; Aurion validiert das vorhandene Draft-Schema, ausgewählte Assets, Chunk und Integer-Koordinaten. |
| Vorschau | Separater Godot-Viewport mit cyanfarbenen Modellen; tatsächliche GLB-Hashes, Parser und Renderbudgets werden wiederverwendet. Keine erfundenen Readbacks. |
| Weltänderung | Bestehender Aurion-Plan, konkrete Bestätigung, Apply, Receipt und unabhängiger GET-Readback. |
| Betriebsdaten | Persistente Datei für Kostenreservierungen und technische Audit-Hashes; keine Weltpersistenz. |

Die Vorschau zeigt höchstens 18 Objekte im ersten ausgewählten Chunk auf einer ausdrücklich flachen Vorschaufläche. Bestehende bestätigte Objekte bleiben im laufenden Welt-Viewport; die separate Vorschau und die Objektzählung zeigen die Differenz. Terrainhöhe, physische Gebäudekollisionen und Wegpassierbarkeit sind damit **nicht bestätigt**. Die aktuellen Kataloghüllen heißen `presentation-envelope-only`. Unbekannte Assets, veraltete Revisionen und doppelte Platzierungsanker werden abgelehnt. Der kanonische Server prüft den Plan anschließend erneut.

## Bedienung

1. Das bestehende Godot-Projekt öffnen. Im Aurion-Dock **AI World Designer öffnen** wählen; der vorhandene Authoring-Einstieg startet.
2. Mit dem Eigentümerkonto anmelden und die echte Zone verbinden. Ohne passende aktive Gameplay-Verbindung lehnt `aiPropose` ab.
3. Katalog laden, **KI-Status und Budget prüfen** wählen. Auto bevorzugt gemäß Serverkonfiguration Local und dann Free. Premium bleibt ohne ausdrückliche Serverfreigabe deaktiviert.
4. Chunk X/Z auswählen, bei Bedarf reale Asset-IDs aus dem Katalog eingrenzen und einen Auftrag eingeben. Beispielsweise: „Erstelle im freigegebenen Testbereich einen Markt mit zwei vorhandenen Marktständen und einem dekorativen Objekt.“
5. Vorschlag anfordern. `AI_DRAFT` und `PREVIEW_ONLY` prüfen: Objektliste, Koordinaten, Differenz, Warnungen und Modellkosten. Der Verlauf hält bis zu 20 Vorschläge nur in dieser Sitzung. Für Überarbeitung **Aktuellen Entwurf zur Verbesserung mitsenden** wählen.
6. Den bestehenden **Aurion-Plan** anfordern. Plan-Hash, Vorgänger und betroffene Objekte prüfen. Erst die konkrete Bestätigung erlaubt Apply.
7. Nach Receipt den unabhängigen Welt-Readback abwarten. `LIVE_READBACK_CONFIRMED` erscheint nur, wenn der aktuelle Zielentwurf zum Receipt passt. Ein inzwischen ersetzter Entwurf wird ausdrücklich als verändert angezeigt.
8. Nach Unterbrechung die bestehende Recovery verwenden. Niemals blind Apply erneut senden. Unbekannte Ergebnisse bleiben `UNRESOLVED`.

## Serverkonfiguration

Das Beispiel enthält keine Zugangsdaten. Ein dedizierter Ausführungsschlüssel und eine dauerhafte, nur für den Server zugängliche Datei sind erforderlich. Ohne Konfiguration startet das Spiel weiterhin; der Designer meldet `NOT_CONFIGURED`.

```dotenv
AURION_AI_LEDGER_PATH=/var/lib/aurion/ai/world-designer-ledger.json
AURION_AI_OPENROUTER_KEY=
AURION_AI_MODEL_WHITELIST=
AURION_AI_FREE_ORDER=local,free
AURION_AI_FREE_DAILY_LIMIT=50
AURION_AI_PREMIUM_ENABLED=false
AURION_AI_PREMIUM_BUDGET_EUR_MICROS=0
AURION_AI_PREMIUM_APPROVAL=
AURION_AI_APPROVED_USD_PER_EUR=
AURION_AI_OPENCODE_URL=
AURION_AI_OPENCODE_PASSWORD=
AURION_AI_OPENCODE_USERNAME=opencode
AURION_AI_OPENCODE_PROVIDER=
AURION_AI_OPENCODE_MODEL=
AURION_AI_OPENCODE_VERSION=
```

Die Whitelist enthält explizit ausgewählte aktuelle Modell-IDs. Metadaten kommen zur Ausführung von `/api/v1/models`; nur Textmodelle mit ausreichendem Kontext und Output-Limit werden verwendet. Free verlangt `:free` und Nullpreise in allen gemeldeten Dimensionen. `openrouter/free` wird nicht automatisch verwendet. JSON-Ausgabe wird nur angefordert, wenn das Modell `response_format` unterstützt; die Schema-Prüfung findet immer bei Aurion statt. Keine Tools, Vision-, Bild- oder Videoaufträge werden aktiviert.

OpenRouter dokumentiert 20 Free-Anfragen pro Minute, standardmäßig 50 pro Tag und bis zu 1000 nach mindestens 10 USD Guthabenkauf. Aurion prüft `/key` und versucht `/credits`; ohne Kaufnachweis bleibt der lokale Deckel höchstens 50. Auch fehlgeschlagene Versuche zählen. Andere Anwendungen wie ATO teilen das Kontingent: Die lokale Datei kann deren Verbrauch nicht kennen. Der Editor weist den kontoweiten Rest als unverifiziert aus; OpenRouters tatsächliche Ablehnung bleibt maßgeblich. Ein 429 führt niemals zu Premium.

Premium erfordert expliziten Modus, Aktivierung, Freigabereferenz, ein Budget von höchstens 2.000.000 Euro-Mikroeinheiten und einen ausdrücklich festgelegten USD-pro-EUR-Rechenwert. Ohne diese Werte ist das Limit null. Auto bleibt auch mit Pilotfreigabe kostenfrei. Vor jedem bezahlten Aufruf wird pessimistisch reserviert; tatsächliche Kosten werden auch bei fehlerhaftem JSON verbucht. Keine automatische Aufladung und keine unbegrenzten Retries. Pro Route ein Versuch; nach Fehlern ein persistenter 60-Sekunden-Circuit-Breaker pro Modell.

Alle Serverprozesse müssen denselben persistenten Ledgerpfad mit atomarer Dateisperre verwenden. Mehrere Hosts mit unabhängigen Dateien sind nicht unterstützt. Offene Premium-Reservierungen sperren weitere Premium-Aufrufe über Neustarts hinweg. Unerwartete Kosten auf kostenlosen Routen sperren alle weiteren Aufrufe. Bei unbekannten Kosten, `LEDGER_LOCKED`, beschädigter Datei oder 1000 Auditeinträgen nicht löschen oder automatisch zurücksetzen: Dienst anhalten, laufenden Besitzer ausschließen, Originaldatei sichern und Providerverbrauch unabhängig abgleichen. Rotation muss Verbrauch, ungeklärte Reservierungen und Sperren erhalten; ein automatischer Reconciliation-/Rotationsdienst ist noch nicht implementiert.

Audit enthält Task-ID, Template-Version, erwartetes/tatsächliches Modell, Provider, Betriebszeit, Token, Kosten, Validierung und Ein-/Ausgabehash sowie Source-Revision. Keine API-Schlüssel, Rohprompts oder Welttexte im Ledger. Die Zeit und zufällige Task-ID gehören ausschließlich zu Host-I/O, niemals zum Simulationstick.

## Optionales OpenCode

Die Eigentümerinstallation wurde noch nicht verbunden. „NVIDIA Nemotron Flash“ ist keine verifizierte Modell-ID. Vor Aktivierung die installierte Version, `/doc`, Modell-ID, Provider, Kontext und Inferenzadresse prüfen. Ein lokales OpenCode mit NVIDIA-Cloud-Endpunkt gilt nicht als lokale Inferenz. Dieser Adapter akzeptiert zunächst ausschließlich nachgewiesene Loopback-Inferenz mit Nullpreismetadaten; externe NVIDIA-Inferenz benötigt eine eigene Kostenpolicy und ist hier nicht freigeschaltet.

Eine **dedizierte** OpenCode-Instanz ohne produktiven Repositoryzugriff, MCP oder Plugins verwenden. Die normale interaktive OpenCode-Konfiguration wird nicht verändert. `OPENCODE_SERVER_PASSWORD` setzen, dann `opencode serve --hostname 127.0.0.1 --port 4096`. Version exakt in `AURION_AI_OPENCODE_VERSION` eintragen. Vor Verbindung `/config`, `/agent`, `/config/providers` und die lokale OpenAPI-Spezifikation prüfen.

Erforderlicher Konfigurationsauszug (Platzhalter durch die tatsächlich geprüften IDs ersetzen):

```json
{
  "model": "local/VERIFIED_MODEL_ID",
  "small_model": "local/VERIFIED_MODEL_ID",
  "permission": "deny",
  "compaction": { "auto": false },
  "mcp": {},
  "plugin": [],
  "agent": {
    "aurion-designer": {
      "model": "local/VERIFIED_MODEL_ID",
      "steps": 1,
      "permission": "deny"
    }
  },
  "provider": {
    "local": {
      "options": { "baseURL": "http://127.0.0.1:8000/v1" }
    }
  }
}
```

Die Providerdefinition einschließlich SDK und Modellfähigkeiten muss zur echten Installation passen; der Auszug installiert kein Modell. Auch automatische Nebenmodelle müssen dieselbe kostenlose lokale Inferenz verwenden. Der Adapter prüft dies, verlangt einen deny-all-Agenten und erzeugt eine eigene Session mit deny-all-Berechtigung. Ein Auftrag darf nur Text zurückgeben; Toolteile werden abgelehnt.

Bei getrennten Rechnern ausschließlich einen autorisierten verschlüsselten privaten Tunnel verwenden, beispielsweise eine SSH-Rückleitung auf **127.0.0.1 des VPS**. Den Port niemals öffentlich veröffentlichen. Bei Docker ist Container-Loopback ein eigener Netzwerkraum: Die sichere Tunnelterminierung muss dort erreichbar sein, ohne auf `0.0.0.0` auszuweichen. Keine GitHub-/Produktions-/OpenRouter-Secrets an OpenCode weitergeben. Abziehen des lokalen Rechners ergibt OFFLINE/TIMEOUT; Auto darf anschließend nur die erlaubte Free-Route versuchen. AUTH_FAILED und MODEL_UNAVAILABLE bleiben sichtbar.

## Typisierte Agentenschnittstelle

Vorhandenes authentifiziertes tRPC, keine neue ChatGPT-API:

| Route | Methode | Vertrag |
| --- | --- | --- |
| `aurionAuthoring.catalog` | GET | Reale Katalogrevision, Assets, Weltentwürfe |
| `aurionAuthoring.aiStatus` | GET | Provider-, Modell-, Rate- und Budgetstatus; Admin |
| `aurionAuthoring.aiPropose` | POST | `DesignerInput`: request, mode, optional modelId/draft, aktive zoneId/connectionId, chunkX/Z, optionale assetIds |
| `aurionAuthoring.worldPlan` | POST | Bestehender kanonischer Draft und Operation-ID |
| `aurionAuthoring.worldApply` | POST | Bestehender konkreter Plan-Hash und `APPLY_WORLD_DESIGN` |
| `aurionAuthoring.worldReceipt` | POST | Bestehende exakte Operations-Recovery |
| `/api/game/world-design` | GET | Unabhängiger Welt-Readback |

ChatGPT Work kann bei tatsächlich vorhandenem autorisiertem Toolzugriff diese Verträge nutzen. Diese Änderung richtet keinen externen ChatGPT-Endpunkt und keinen zusätzlichen MCP-Server ein.

## Prüfbarkeit und verbleibende Grenzen

`server/aiFabric/*.test.ts` prüft Dateipersistenz, Parallelitätsreservation, Routing, Metadaten und echten lokalen HTTP-Transport mit ausdrücklich synthetischen Providerantworten. Die isolierte MariaDB-Lane prüft echte Katalogeinlagerung, Plan/Bestätigung, Apply, Duplikatschutz, Receipt und separaten Readback. Godot-Headless prüft echte Engine, GLB-Parser, getrennte Vorschau, bestehende Weltprojektionen und HTTP-Transport. Diese Tests beweisen keine externe Modellantwort oder Produktionsweltänderung.

Vor produktiver Abnahme fehlen weiterhin ein echter freigegebener Modellaufruf, die aktive Eigentümersitzung, ein konkret ausgewiesener Testbereich und eine bestätigte kleine Marktplanung. Erst nach ausdrücklicher Bestätigung dieses Plans dürfen der echte Apply und Readback als Live-Abnahme erfolgen. Aktuelle GLB-Präsentationshüllen beweisen weder feste Gebäudekollisionen noch Passierbarkeit. Wolfram ist ein optionaler unabhängiger Analyseweg, keine Laufzeitpflicht. Bestehende visuelle Regressionsschwellen, Android/JNI-Prüfungen und Release-Gates werden nicht abgeschwächt.

Offizielle Referenzen: [OpenRouter Limits](https://openrouter.ai/docs/api/reference/limits), [Modelle](https://openrouter.ai/docs/api/api-reference/models/get-models), [OpenCode Server](https://opencode.ai/docs/server/), [OpenCode Agents](https://opencode.ai/docs/agents/). Bedingungen bei Aktivierung erneut prüfen.
