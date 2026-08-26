# Browser-QA: Aurion–Wasd-Kandidat

| Prüffeld | Befund |
| --- | --- |
| Lokale URL | `http://localhost:3000/` |
| Aufgerufene Ansicht | Öffentlicher Aurion-Einstiegsbereich ohne Anmeldung |
| Ergebnis | Erfolgreich geladen; keine sichtbare Laufzeitausnahme |
| Sichtbare Einstiegspfade | Solo-Expedition, Kontoanmeldung, Charakterwahl, Team-/MCP-Zugang |
| Welt-Readmodell | Nicht abrufbar ohne angemeldete Spielsitzung; erwartete Zugriffsgrenze |
| UI-Befund | Responsive Gate-Ansicht mit lesbaren Controls und sichtbarem 3D-Kalibrierzustand |

Die öffentliche Ansicht bestätigt ausschließlich die Clientstartfähigkeit. Quest-, Loot-, NPC-, Sprach-, Polity- und Weltreaktionsdaten sind bewusst geschützte Spielreadmodelle und benötigen einen authentifizierten Spielkontext; sie wurden zusätzlich über Unit-, Vertrags- und TypeScript-Tests geprüft.
