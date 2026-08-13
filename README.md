# Echoes of Aurion

**Echoes of Aurion** ist ein mobiloptimiertes, isometrisches 3D-Action-Abenteuer für den Browser. Ein menschlicher Explorer und ein sichtbarer Echo Scout bilden ein Team: Der Mensch bewegt sich über WASD oder die Touch-Brücke, während der Scout über einen streng begrenzten Befehlsadapter mit `W`, `A`, `S`, `D` und ausgerüsteten Slots `1`–`9` gesteuert wird.

> Die aktuelle Veröffentlichung verwendet bewusst eine lokale, nachvollziehbare Testkopplung. Sie liest keine privaten Chat-Apps aus und führt keine verdeckten Aktionen bei LLM-Anbietern aus.

## Spielinhalt

Der erste Run führt durch drei Ruinenarenen: die **Sternwarte Asterion**, die **Versunkene Archivhalle** und das **Solarium der letzten Flamme**. Jede Arena verändert Umgebung, Questziel, Sentinel-Integrität und den taktischen Druck. Schutz-, Aufklärungs- und Angriffsprotokolle erzeugen echte, sichtbare Spielwirkungen.

| Steuerung | Wirkung |
| --- | --- |
| `W`, `A`, `S`, `D` | Explorer bewegen; im Partner-Feed bewegt dies den Echo Scout. |
| `F` oder Speer-Button | Explorer-Speersignal gegen den Sentinel. |
| `1`–`9` | Ausgerüstete Partnerfähigkeiten; der Standard-Loadout nutzt `1`, `2` und `9`. |

## Lokale Entwicklung

Die Anwendung basiert auf **React**, **TypeScript**, **Vite** und **Babylon.js**.

```bash
pnpm install
pnpm dev
```

Für die statische Produktionsfassung:

```bash
pnpm check
pnpm build
```

## Architektur

| Bereich | Zuständigkeit |
| --- | --- |
| `client/src/game/scene.ts` | Babylon-Szene, Teamakteure, Sentinel, Schadensregeln und Arenawechsel. |
| `client/src/pages/Home.tsx` | Zugangsgate, Loadout, mobile HUD- und Befehlskonsole. |
| `client/src/lib/ledger.ts` | Exportierbares, lokales JSON-Memory-Ledger im Browser. |
| `MCP_GATEWAY_CONTRACT.md` | Vertrag für eine spätere, autorisierte Server-/MCP-Anbindung. |
| `VPS_DEPLOYMENT.md` | Reversible Bereitstellungsstrategie für die statische Domainfassung. |

## Produktionsstatus

Die aktuelle statische Fassung wird über [arelogic.space](https://arelogic.space) ausgeliefert. Details zu Spiel- und Arena-Entscheidungen liegen in `ARENA_DESIGN.md`, `ASSETS.md`, `STRUCTURE.md` und `PLAN.md`.

## Nächste Erweiterungsstufen

Eine reale LLM-Anbindung benötigt einen separaten, nutzerautorisierten Server-Gateway-Flow mit kurzlebigen Tokens, pro Provider geprüfter Anmeldung, strikt erlaubten Befehlen und einer klaren Einwilligungs-/Löschstrecke. Mehrspielerbetrieb und Werbeformate gehören ebenfalls in separierte, serverseitig abgesicherte Ausbauschritte.
