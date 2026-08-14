# Aurion: Wolfram-Balance- und Skalierungsnotiz

Die folgenden Werte wurden am 13. August 2026 mit dem Wolfram Language Evaluator berechnet. Sie sind eine **nachvollziehbare Entwurfsgrundlage** und verändern keine Live-Ökonomie automatisch. Bestehende serverseitige Werte bleiben allein maßgeblich, bis eine separate Gameplay-Änderung mit Tests beschlossen wird.

## Systemverkauf und Marktgrenzen

Der vorhandene Systemverkauf verwendet `Gegenstandsstufe × Qualitätsmultiplikator × 3`. Die Multiplikatoren betragen 1, 2, 4, 8 und 12 für Normal, Magisch, Selten, Set und Einzigartig.

| Qualität | Stufe 25 | Stufe 50 | Stufe 75 | Stufe 99 |
|---|---:|---:|---:|---:|
| Normal | 75 | 150 | 225 | 297 |
| Magisch | 150 | 300 | 450 | 594 |
| Selten | 300 | 600 | 900 | 1.188 |
| Set | 600 | 1.200 | 1.800 | 2.376 |
| Einzigartig | 900 | 1.800 | 2.700 | 3.564 |

Der aktuelle Maximalpreis im Auktionshaus von **1.000.000 Aurion** liegt bei ungefähr dem 281-Fachen des höchsten berechneten Systemverkaufswertes. Das lässt Raum für seltene Handelspreise, sollte aber später mit Gebühren oder Preisbeobachtung gegen künstliche Preisblasen abgesichert werden.

## Progressions- und Koop-Skalierung

Für eine quadratisch ansteigende, aber nicht exponentiell explodierende Testkurve wurde `Stufen-XP(n) = round(100 × (n − 1)^1,7)` ausgewertet. Die daraus kumulierten Orientierungswerte lauten:

| Zielstufe | Kumulierte XP |
|---:|---:|
| 10 | 16.127 |
| 25 | 208.567 |
| 50 | 1.393.275 |
| 75 | 4.201.876 |
| 99 | 8.931.111 |

Für Zwei-Personen-Expeditionen ist ein konservatives Modell sinnvoll: Gegnergesundheit `1,65×`, gemeinsame Belohnung `1,5×`. Bei gleichmäßiger Teilung beträgt die Belohnung pro Person `0,75×` des Solo-Werts. Der Kooperationsvorteil entsteht dadurch über Sicherheit, Rollen und schnellere Zielerfüllung, nicht über eine ungebremste Währungsquelle.

## Runtime- und Assetbudget

Die gebauten Standardcharaktere liegen bei 1.992.236 beziehungsweise 2.237.768 Byte, 4.987 beziehungsweise 4.955 Dreiecken, je einem Material, einem Skin und drei Animationen. Beide liegen damit deutlich unter dem im Release-Gate erzwungenen **15.000-Dreiecke-pro-Charakter**-Budget und der **16-MiB-GLB-Grenze**. Das bereits aktive Release-Gate verhindert einen itch.io-Build, wenn diese geprüften Basisassets die definierten Grenzen verlassen.

> Nächste Balanceentscheidung: Zuerst Telemetrie für tatsächliche Aurion-Quellen und -Senken beobachten; erst danach Multiplikatoren oder Auktionsgebühren verändern.

## Nachweis

Die Berechnung verwendete Wolfram-Ausdrücke für Qualitätswerte, kumulierte XP und Zwei-Personen-Skalierung. Der verwendete Toolaufruf und die Werte sind im Ausführungsverlauf dieser Projektarbeit nachvollziehbar. Wolfram dokumentiert die Nutzung des zustandsfreien Language Evaluators über seine Wolfram-Language-Umgebung.[^1]

[^1]: [Wolfram Language](https://www.wolfram.com/language/)
