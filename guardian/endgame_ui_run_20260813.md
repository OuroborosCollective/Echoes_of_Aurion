# Endgame-Oberfläche — Nachweis

**Zeitpunkt:** 13. August 2026  
**Umfang:** Eigene Spielerregisterkarte für serverbestätigtes Inventar, Set-Boni, Klassenresonanz, Waffenmeisterschaft und Gildenlangzeitziele.

## Gelieferter Lese- und UI-Vertrag

| Fläche | Serverquelle | Darstellung |
| --- | --- | --- |
| Inventar | Eigene `itemInstances`, geordnet nach Erstellzeit; Affixe werden defensiv aus den gespeicherten Daten gelesen. | Qualitätsbadge, Gegenstandsstufe, Set-Key und Affixwerte |
| Set-Fortschritt | Serverberechnete aktive Boni aus den vorhandenen Set-Instanzen. | Teilefortschritt und aktivierte Modifikatoren |
| Klassenresonanz | Bestehende geschützte Klassenroute; Server lässt die einmalige Wahl nur ab Stufe 36 zu. | Auswahl nur bei verfügbarer Freischaltung, sonst bestätigter Status |
| Waffenmeisterschaft | Eigene serverbestätigte Meisterschaftswerte. | Pfad, Stufe und XP |
| Langzeitmotiv | Bestehende Gildenmitgliedschaft und Saisonpunkte. | Gildenrolle, Stufe, Saisonfortschritt und Hinweis auf Receipt-Grenze |

## Prüfungen

| Check | Ergebnis |
| --- | --- |
| `pnpm check` | bestanden |
| `pnpm test` | bestanden: 6 Testdateien, 22 Tests |
| Serverautorität | Spielerroute liest Inventar und Boni ausschließlich mit `ctx.user.id`; kein fremder Nutzerparameter wird angenommen. |

## Offene Nachweise

Es wurden keine künstlichen Loot-, Set- oder Waffenereignisse erzeugt. Die leeren Zustände der Oberfläche bleiben deshalb real und erwarten validierte Expeditionsergebnisse. Eine tatsächliche Beutevergabe und Waffen-XP-Gutschrift mit Datenbank-Readback bleibt ein eigenständiger offener Nachweis.
