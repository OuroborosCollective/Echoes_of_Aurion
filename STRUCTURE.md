---
description: Archivierte Architektur eines frühen statischen Browser-Prototyps.
---

# Echoes of Aurion — Historischer Prototypaufbau

{% hint style="warning" %}
Dieser Aufbau beschreibt einen frühen statischen Prototyp. Er ist nicht die aktuelle, vollständige Aurion-Runtime auf `main`.
{% endhint %}

Der aktuelle Nachweisstand steht im [AURION\_MIGRATION\_TRUTH\_SNAPSHOT\_2026-08-28.md](AURION_MIGRATION_TRUTH_SNAPSHOT_2026-08-28.md "mention").

## Prototypaufbau

```
React frame (Home.tsx)
├── GameCanvas.tsx             Babylon lifecycle and canvas ownership
├── Local Ledger               Browser-local, append-only session memory
├── Connection Gate            Explicitly unlocks loadout after a visible local link
├── Expedition UI              Touch bridge, loadout, partner console and HUD
└── Babylon scene (game/scene.ts)
    ├── GameWorld              World geometry, lights, effects and update loop
    ├── Explorer               WASD / touch-operated human actor
    ├── Echo Scout             LLM-operated companion actor
    ├── Sentinel               Visually reactive opponent
    └── Command Adapter        Normalizes W/A/S/D/1–9 custom events
```

## Historische Grenzen

Die React-Schicht verwaltete Einwilligung, Menüzustand, Touch-Steuerung und lokale Speicherung. Babylon verwaltete Szenengraph, Update-Loop und Figuren-Transformationen. Die Kommunikation verwendete begrenzte Browser-Events.

Der Prototyp enthielt keinen Zugriff auf private Apps, keine versteckte Übertragung und keine externen Zugangsdaten. Die lokale Verbindung war simuliert. Sie ersetzt keine autorisierte Serveranbindung.
