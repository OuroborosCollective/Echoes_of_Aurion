# Aurion ↔ Godot: visueller Vergleich und Live-Nachweis

Der visuelle Comparator vergleicht zwei bereitgestellte Bilddateien und deren Metadaten. Sein Ergebnis ist eine **Diagnose**, kein Nachweis, dass die Bilder aus authentifizierten Live-Sitzungen stammen. Die Herkunft der Aufnahmen und die Verbindung zu einem serverbestätigten Receipt werden bisher nicht unabhängig geprüft.

Der Live-Abnahmeschritt bleibt daher mit `LIVE_CAPTURE_PROVENANCE_NOT_VERIFIED` gesperrt, auch wenn der Bildvergleich `PASS` meldet. Die zugehörigen Unit-Tests verwenden synthetische Daten und belegen ausschließlich das Verhalten des Comparators.

Für eine spätere Live-Abnahme sind erforderlich:

1. Zwei unabhängig und autorisiert aufgenommene Welt-Viewports aus Aurion und Godot, mit überprüfbarer Herkunft der unveränderten Bildbytes.
2. Derselbe bestätigte Weltzustand, dieselbe aktive Source-Revision, dieselbe Stream- und Receipt-Identität sowie zeitlich ausreichend nahe Aufnahmen.
3. Ein vergleichbarer Kamerastandpunkt, ein gleiches Sichtfeld und gleiche Bildabmessungen.
4. Nachweisbare Darstellung von Terrain, Welt-Assets, einem bestätigten Actor sowie Himmel und Horizont in beiden Clients.
5. Erfolgreiche visuelle Prüfung und unabhängiger Readback der zugehörigen Receipts.

Der Comparator prüft unter anderem Übereinstimmung der gelieferten Metadaten, Bildintegrität, Frische und visuelle Ähnlichkeit. Diese Prüfungen können manipulierte Herkunftsangaben nicht ausschließen. Ein übereinstimmendes Bildpaar, ein laufender Editor oder eine erfolgreiche Netzwerkverbindung allein beweist daher keine Live-Parität.

Aurion bleibt die einzige Autorität für Weltzustand und Gameplay. Der Godot-Client stellt bestätigte Daten dar und erzeugt keine eigene Weltwahrheit. Zugangsdaten gehören weder in Bilder noch in Metadaten oder Testartefakte.
