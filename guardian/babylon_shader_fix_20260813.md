# Babylon.js-Shaderfix — Nachweis

**Fehlerbild:** Der Browser meldete bei der Canvasinitialisierung `VERTEX SHADER ERROR: 0:7: '<' : syntax error` mit `#define EMISSIVE`.

## Ursache und Korrektur

Die mehrdeutigen Babylon-Importpfade für `default.vertex` und `default.fragment` konnten unter Vite als Assetpfade statt als Shaderquelltext optimiert werden. Die Missionsszene importiert nun die expliziten `.js`-Module, erhält deren exportierten GLSL-Text und registriert `defaultVertexShader` sowie `defaultPixelShader` unmittelbar im `ShaderStore`.

## Abnahme

| Prüfschritt | Ergebnis |
| --- | --- |
| `pnpm check` | bestanden |
| `pnpm test` | bestanden: 25 Tests |
| Frischer Canvas-Reload | bestanden: Start-/Canvasansicht sichtbar |
| Browserprotokoll nach Reload | Keine neue Vertex-Shader- oder Szeneninitialisierungsmeldung; die im Log noch sichtbaren Shaderfehler stammen aus dem früheren Lauf um 10:18:59 UTC. |

Die Fehlerbehebung ist auf die Shaderinitialisierung begrenzt. Der separate authentifizierte Missions- und Audiopfad bleibt weiterhin ein offener E2E-Nachweis.
