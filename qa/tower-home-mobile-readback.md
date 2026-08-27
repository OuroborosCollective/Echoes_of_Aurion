# Tower-Home — Mobile-/Tablet-Readback

| Viewport | Ergebnis | Nachweis |
|---|---|---|
| Android Phone, 412 × 915 | Die Sternwarten-Hausansicht ist vollständig sichtbar. Die vier Hausfunktionen sowie die CTAs „Loadout vorbereiten“ und „In die Open World“ sind lesbar und als Touchziele erreichbar. | `test-results/tower-home-412x915.png` |
| Android Tablet, 800 × 1280 | Die Hausansicht nutzt die Breite für eine vierteilige Funktionsreihe. Hausfunktionen, Fortschrittspfad und beide CTAs bleiben vollständig sichtbar und überdecken die 3D-Szene nicht unkontrolliert. | `test-results/tower-home-800x1280.png` |

> Beide Viewports wurden mit `e2e/towerHome.mobile.spec.ts` automatisiert geprüft. Der Test bestätigt die Sichtbarkeit sämtlicher vier Hausfunktionen, des Loadout-Übergangs, des Open-World-Übergangs sowie das horizontale Einpassen des Panels.
