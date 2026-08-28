# Rendering, Streaming und Home

## Multi-Chunk-Streaming

Nutze kanonische Chunkgrößen, integerbasierte Zentren, tierabhängige Budgets und LRU-Caching. Phone, Tablet und Desktop unterscheiden sich in sichtbarer Chunkzahl, Cachebudget und Horizon-Fog-Profil, nicht im Featureumfang. Chunkfenster müssen deterministisch aus Center, Tier, Seed und Protokollstand berechnet werden.

Delta-Seiten werden mit Cursor beziehungsweise `afterSequence` gelesen. Wiederholte Seiten dürfen keine doppelten Objekte oder Zustandsmutationen erzeugen. Rückkehr zum Tower leert beziehungsweise verwirft den temporären Außenraum-Renderzustand kontrolliert und stellt die private Home-Szene wieder her.

## Babylon-Lifecycle

Initialisiere Szene, Materialien, Assets, Inputlistener, Audio und Observables in klaren Lifecycleblöcken. Entferne Listener, Animationen, Bufferquellen und AudioContext beim Unmount/Dispose. Keine globale Mutation ohne Rückbaupfad.

## Horizon Fog

Fogprofile sind an die kanonische Chunkgröße und das Viewport-Tier zu binden. Fog darf die Sichtweite atmosphärisch reduzieren, aber nicht die Chunkauswahl, Serverautorität oder Kollisionsermittlung ersetzen. Desktop-Compositor-Grenzen in headless Harnesses als Testumgebung dokumentieren; Roots/Meshes und funktionale Metriken getrennt bewerten.

## Assetregeln

GLB-Kandidaten deterministisch katalogisieren, Quelle und Revision festhalten und nur passende Modelle in Runtimepfade überführen. Fehlende optionale Assets müssen einen sicheren Fallback besitzen. Niemals ungeprüfte Remote-URLs oder zufällige Assetauswahl in die Produktionsruntime einführen.
