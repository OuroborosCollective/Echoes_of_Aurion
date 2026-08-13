# MCP-Gateway — Sequenz- und Sitzungsgrenzen

**Zeitpunkt:** 13. August 2026
**Umfang:** Serverseitiger Nachweis für Sitzungs-Allowlist, strikt steigende Sequenzen, Widerruf und Ablauf.

| Grenze | Laufzeitbindung | Automatisierter Nachweis |
| --- | --- | --- |
| Befehlsallowlist | `allowGatewayCommand` wird vor `appendGatewayCommand` aufgerufen. | Zulässiges `W` wird normalisiert; `9` außerhalb der Sitzung und Freitext werden verworfen. |
| Sequenz | `appendGatewayCommand` nutzt `isStrictlyIncreasingSequence` vor der Persistenz. | Duplikate, rückläufige, nicht-positive und nicht-integrierte Sequenzen werden verworfen. |
| Widerruf/Ablauf | `getActiveGatewaySessionByTokenDigest` prüft nach dem Datenbankfilter zusätzlich `isGatewayGrantActive`, bevor ein MCP-Transport entsteht. | `revoked` und ein Ablaufzeitpunkt gleich/kleiner `now` ergeben keine verwendbare Grant. |

`pnpm check`, `pnpm test` und `git diff --check` bestanden. Die vollständige Suite umfasst nun **25 Tests**. Der Browser-E2E-Pfad mit realer Nutzeranmeldung und Bearer-Pairing bleibt gesondert offen und wurde durch diese Servertests nicht ersetzt.
