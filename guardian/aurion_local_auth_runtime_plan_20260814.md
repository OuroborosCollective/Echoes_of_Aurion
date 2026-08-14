# Aurion-eigene Anmeldung — Laufzeitplan

**Geltungsbereich:** Ausschließlich Echoes of Aurion auf `arelogic.space` und dessen bestehender VPS-Releasepfad.

## Erfasster Zustand

| Bereich | Befund |
|---|---|
| Aurion-Codebasis | Der vorhandene Express-/tRPC-Server kann Client und API bereits in einem Node-Prozess ausliefern. |
| Bestehende Sitzung | Geschützte Spielflüsse erwarten eine serverseitig signierte Cookie-Sitzung und einen passenden `users`-Datensatz. |
| VPS-Release | Der GitHub-Workflow liefert aktuell ausschließlich ein statisches Artefakt aus. |
| VPS-Prozess | Kein Aurion-Node-Dienst vorhanden; der vorhandene Aurion-Runner bleibt unverändert. |
| Bestehende lokale Ports | `3000`, `3001` und `8090` sind belegt und werden nicht verändert. |
| Geplanter Aurion-Port | `127.0.0.1:3101` ist frei und wird ausschließlich für den Aurion-Node-Prozess reserviert. |

## Sicherheits- und Architekturgrenzen

1. Die lokale Registrierung erzeugt nur normale Spielerrollen. Eine Admin-Rolle wird niemals durch einen Browserparameter, eine Registrierungseingabe oder eine URL vergeben.
2. Das bestehende signierte Aurion-Sitzungscookie wird wiederverwendet; es wird kein Token in URLs, Local Storage oder Query-Parametern übertragen.
3. Der VPS erhält höchstens einen explizit benannten Aurion-Node-Systemdienst und einen Nginx-Proxy für `/api`. Bestehende Docker-Proxys, die vorhandene `/mcp`-Route und fremde Dienste bleiben unverändert.
4. Vor Promotion werden Schema, Server, UI, Workflow, Nginx-Spiegel und VPS-Readback erneut als zusammenhängender Aurion-Release geprüft.
