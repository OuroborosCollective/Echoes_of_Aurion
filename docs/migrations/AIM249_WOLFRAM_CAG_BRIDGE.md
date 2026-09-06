# AIM-249 — Wolfram CAG Bridge

## Zweck

Aurion erhält einen serverseitigen, begrenzten Zugriff auf die Wolfram Computation-Augmented Generation (CAG) Component APIs für mathematische Analyse und Balancing-Evidence.

Diese Bridge ist **keine Gameplay-Authority**. Wolfram-Ausgaben dürfen Formeln, Sensitivitäten und Kandidaten belegen, aber niemals direkt Spieler-, Welt-, Loot-, Economy- oder Progressionszustand mutieren. Jede übernommene Regel bleibt an die bestehende WASD/Aurion-Regel-, Test- und Receipt-Kette gebunden.

## Provider

Feste Origin: `https://services.wolfram.com`

Unterstützte CAG-Komponenten:

- `/api/cag/v1/WolframLanguageCompute`
- `/api/cag/v1/WolframLanguageHints`
- `/api/cag/v1/WolframAlphaResult`
- `/api/cag/v1/WolframAlphaContext`

Dokumentation:

- https://www.wolfram.com/apis/documentation/
- https://www.wolfram.com/apis/documentation/cag/wolfram-language-computation-api/
- https://www.wolfram.com/apis/documentation/cag/wolfram-language-hints-api/
- https://www.wolfram.com/apis/documentation/cag/wolfram-alpha-results-api/
- https://www.wolfram.com/apis/documentation/cag/wolfram-alpha-context-api/

## Secret Boundary

Der API-Key wird ausschließlich serverseitig als `WOLFRAM_CAG_API_KEY` gelesen.

- kein Client-Bundle
- kein Repositoryliteral
- kein MCP-Output
- kein Log-/Error-Reflection
- kein Receipt mit Key oder Key-Fingerprint

Fehlt der Key oder ist seine Form ungültig, bleiben die Provider-Tools im Admin-MCP deaktiviert. Der secret-freie Status-Toolcall bleibt sichtbar.

## Admin MCP

Der bestehende OAuth-geschützte Aurion Admin MCP registriert bei konfiguriertem Provider:

- `aurion_admin_wolfram_compute`
- `aurion_admin_wolfram_hints`
- `aurion_admin_wolfram_alpha_results`
- `aurion_admin_wolfram_alpha_context`
- `aurion_admin_wolfram_canary`

`aurion_admin_wolfram_status` ist immer verfügbar und macht keinen externen Provider-Aufruf.

Alle CAG-Tools sind read/external-analysis only. Die existierenden GLB-Write-Scopes und Gameplay-Grenzen werden nicht erweitert.

## Evidence Envelope

Jeder erfolgreiche CAG-Aufruf liefert:

- feste Component-/Endpoint-Identität
- SHA-256 des kanonischen Requests
- SHA-256 des normalisierten Ergebnisses
- Provider-Code
- Provider-UUID, sofern Wolfram eine liefert
- begrenztes Resultat
- `mutationAuthority: none` auf Status/Canary-Ebene

Provider-HTTP-Fehler reflektieren keine Response-Bodies, damit ein Anbieterfehler niemals Credentials oder fremde Daten in Toolausgaben spiegelt.

## Canary

`scripts/balancing/wolfram-cag-canary.ts` führt die feste exakte Wolfram-Language-Rechnung

`Total[Range[1000]^2]`

aus und akzeptiert ausschließlich ein Ergebnis, das `333833500` enthält. Ein erfolgreicher Canary belegt Provider-Erreichbarkeit und gültige CAG-Credentials; er belegt noch keine konkrete Balancingregel.

## Bezug AIM-249 / AIM-265

AIM-249 und AIM-265 dürfen anschließend konkrete XP-, Dungeon-, Weltboss-, Economy-, Chunk-/Stadt- oder Progressionsrechnungen über dieselbe Bridge erneut ausführen. Lokale exakte Replays bleiben weiterhin erforderlich; Wolfram ist ein unabhängiger Rechen-/Knowledge-Readback, kein Ersatz für deterministische Aurion-Regressionen.
