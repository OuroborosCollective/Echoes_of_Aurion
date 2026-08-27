# Konto-zentrierter Aurion-Einstieg

## Ziel und Bindung

Diese Änderung betrifft ausschließlich die Aurion-Clientführung auf Grundlage von Aurion-Revision `80071370c716b3293af3e62b7544a0d0f172fe98`. Wasd bleibt auf `a4d99432e47b82ce98105eadb30360cd8040ad13` gebunden und liefert für diese UX-Änderung keine neue Spielsemantik.

| Bereich | Entscheidung | Nachweis |
| --- | --- | --- |
| Audit | Die Startseite positioniert den bestehenden MCP-/Partner-Slot als primäre Eintrittshürde. | Bestehender Gate- und Loadout-Pfad in `client/src/pages/Home.tsx`. |
| Vertrag | Der Standardzugang ist ein Aurion-Konto über die bestehende sichere Kontooberfläche; OIDC bleibt über den serverseitigen FusionAuth-Pfad, lokales Konto bleibt optional. | `LocalAuthPanel.tsx`, `/api/oauth/start`, `auth.registerLocal`, `auth.loginLocal`. |
| Datenpfad | Unverändert. Konto-, OIDC-, Gateway-, Quest- und Fortschrittsmutationen bleiben serverseitig. | Keine Server-, Schema- oder Migrationsdatei Teil dieser Scheibe. |
| Client | Gast sieht Kontoerstellung/Anmeldung als Hauptaktion. Nach Authentifizierung ist Solo die Standardaktion; MCP-Kopplung ist als optionales Feature erreichbar. | Komponenten- und Browsertests. |
| Assets | Keine Wasd-GLB-Übernahme, Aktivierung oder Katalogänderung. | Diffprüfung ohne Assetdateien. |
| Tests | Gast darf nicht direkt in Solo-/Gameplayzustand wechseln; Konto- und optionale MCP-Aktionen sind sichtbar. | `Home.test.tsx`, Typprüfung, volle Suite, Produktionsbuild. |
| Readback | Browser zeigt die Kontoerstellung vor jeder Koop- oder Soloaktion; FusionAuth-OIDC-Start bleibt verfügbar. | Sichtbarer Browserreadback nach Kandidatenrollout. |
| Release | Neuer Branch und Draft-PR; kein Datenbankapply. Merge und Produktion nur nach frischer expliziter Freigabe. | Git-/PR-Head-Abgleich und Releaseevidenz. |

## Ausgeschlossen

Die Änderung führt keine neue Authentifizierung ein, ändert keine OIDC-Secrets, entfernt keine MCP-Funktion, erzeugt keinen direkten XP-/Loot-/Questpfad, übernimmt keinen Wasd-10-Hz-Tick und aktiviert keine GLB-Assets.
