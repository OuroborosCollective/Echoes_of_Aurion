# Echoes of Aurion — Structure

```text
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

## Runtime boundaries

The React layer owns consent, menu state, touch controls and local persistence. Babylon owns only the scene graph, the world update loop and actor transforms. Communication uses narrowly scoped browser events: `aurion:command`, `aurion:human-command`, `aurion:begin-expedition` and `aurion:game-event`.

The first release deliberately contains **no private-app access, no hidden transmission and no external credential handling**. It is an auditable, static prototype with a simulated local link. Replacing that link with a genuine provider-specific connector requires a backend gateway, an explicit authorization journey, service-policy review and a user-visible privacy notice.
