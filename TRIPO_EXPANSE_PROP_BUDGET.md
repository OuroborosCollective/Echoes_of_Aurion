# Tripo-Expanse-Propbudget

Die Tripo-Verbindung dient in Aurion ausschließlich zur Erzeugung **statischer, rein visueller Open-World-Props**. Sie ersetzt weder die serverseitige Terrainentscheidung noch den Quest-, Kampf-, Loot- oder Fortschrittsvertrag. Jede Platzierung wird in `OpenWorldSnapshot.props` serverseitig abgeleitet.

| Propfamilie | Tripo-Task | Geometrie | Texturbindung | Maximal sichtbare Platzierungen je Zone | Zielrolle |
| --- | --- | ---: | ---: | ---: | --- |
| Blütenbüschel | `a572240f-8bd2-4cbf-981e-042a8d609e38` | 1.115 Dreiecke | 1 Material, 3 Texturen | 2 | Windhollow-Akzent auf Blumenwiesen |
| Sternenwegmarke | `4d67714b-c9f4-4239-ab2e-74ff596c5cfa` | 930 Dreiecke | 1 Material, 3 Texturen | 1 | Kreuzungs- und Rückkehrorientierung |
| Gartenbegrenzung | `a2af655d-1ab4-40d3-96a7-bbf8797b6ead` | 751 Dreiecke | 1 Material, 3 Texturen | 2 | Emberfall-Acker- und Gartenparzellen |

Der aktuelle Referenzchunk hält höchstens **drei aktive Propplatzierungen** pro Zone. Babylon lädt jede GLB-Familie pro Szene nur einmal als versteckte Vorlage und erzeugt weitere Platzierungen durch Klonen. Neue Propfamilien benötigen vor Aufnahme einen binären GLB-Readback, eine visuelle Vorschau, eine Dreiecksprüfung und eine explizite Serverplatzierung.

> **Nicht verhandelbar:** Das Clientrendering darf ausschließlich bestätigte `kind`, `tileX`, `tileZ`, `rotationY` und `scale` anwenden. Es darf daraus keinerlei Belohnung, Gegner, Interaktion, Spawn, Queststatus oder Spielerfortschritt ableiten.
