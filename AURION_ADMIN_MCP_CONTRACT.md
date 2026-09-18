---
description: Read-only Aurion Admin MCP ohne Gameplay-Mutationsauthority.
---

# Aurion Admin MCP Contract

## Verbindliche Grenze

`/admin-mcp` ist eine **read-only Aurion-Ops-/Account-/Community-/Asset-/Evidence-Fläche**. Es ist keine Game-Master-Konsole und kein Gameplay-Control-Plane.

- WASD besitzt Gameplayregeln und Simulation.
- AX1 besitzt `/play`, HUD, Renderer und Input.
- Aurion Admin MCP darf bestätigte Persistenz-/Evidence-Readmodels lesen.

## Aktuelle Toolklasse

Zulässig sind ausschließlich read-only Werkzeuge, zum Beispiel:

- Capability-/Scope-Readback;
- Account-/Community-/Asset-/Ops-Readbacks;
- read-only Welt-/Player-Zusammenfassungen aus **bereits persistierten WASD-Receipts**;
- Runtime-/Schema-/Evidence-Status ohne Mutation.

Ein World Overview ist eine Anzeige gespeicherter bestätigter Evidence. Er gibt Aurion keine World-Authority.

## Verboten

Kein Admin-MCP-Tool darf:

- Combat, HP, Damage oder Skills verändern;
- Questzustand oder Rewards verändern;
- XP/Level/Mastery gewähren;
- Loot/Crafting/Economy ausführen;
- Gruppen/Dungeons/NPC/World/Chunks/Housing/Guild/Kingdom mutieren;
- SQL/Shell/Git/VPS als Gameplay-Abkürzung ausführen;
- WASD-Regeln zur Laufzeit überschreiben.

## OAuth

Der Resource Server wird serverseitig konfiguriert. Secrets, Issuerwerte und Client-Credentials gehören nicht in Source oder Browser.

```dotenv
OIDC_ISSUER_URL=https://<fusionauth-issuer>
AURION_ADMIN_MCP_RESOURCE_URL=https://arelogic.space/admin-mcp
```

Vor einem Toolcall werden Signatur/JWKS, Issuer, Ablauf, exakte Resource-/Audience-Bindung, `aurion.admin.read` und die persistierte Aurion-Adminrolle geprüft. Token-Displayclaims allein erteilen keine Authority.

## Künftige Schreibflächen

Falls Aurion später administrative Mutationen erhält, dürfen sie nur **Aurion-eigene Nicht-Gameplay-Flächen** betreffen, zum Beispiel Accountmoderation, Forum-/Community-Moderation, Asset-Review oder revisionsgebundene Ops-Aktionen.

Sie werden nicht als MCP-Live-Gameplaytools implementiert. Gameplayänderungen erfolgen ausschließlich als reviewed WASD-Ruleset-/Codeänderung mit eigener Test-/Release-Lane.

## Evidence

Ein erfolgreicher Admin-MCP-Readback beweist nur die gelesene Aurion-Evidencefläche. Er beweist keinen korrekten WASD-Gameplayzustand, solange dieser nicht separat durch WASD-/Runtime-Evidence gebunden ist.

## Regressionen

- kein registriertes Tool besitzt Gameplay-write capability;
- read-only Tools schreiben weder DB noch World-/Player-State;
- Tokenrolle allein reicht nicht;
- fremde/fehlende/stale Evidence fail-closed;
- Secrets werden nicht zurückgegeben;
- Telemetry-/MCP-Health kann keinen Gameplay-Erfolg behaupten.


## Remote Game Development Studio + Authoring

Der Admin-MCP ist die **serverseitige ChatGPT-/n8n-Brücke**. Es ist kein lokaler Rechner und kein Desktop-Connector erforderlich. Der gepinnte Game-Development-Studio-Runtime liegt im Aurion-Produktionscontainer unter `/opt/game-dev`; MCP-Tools rufen ausschließlich die gebundenen Aurion-Adapter auf und besitzen keinen allgemeinen Shell-Zugriff.

### OAuth-Scopes

- `aurion.admin.read` — ausschließlich Readback/Evidence.
- `aurion.admin.assets.write` — GLB/GDS/NPC-Visual Plan→Confirm→Apply.
- `aurion.admin.authoring.write` — World-/Dungeon-Authoring Plan→Confirm→Apply.

Ein Scope impliziert niemals den anderen.

### GDS-Tools

- `aurion_admin_gds_status`
- `aurion_admin_gds_plan`
- `aurion_admin_gds_apply`
- `aurion_admin_named_npc_visual_plan`
- `aurion_admin_named_npc_visual_apply`

`gds_plan` führt serverseitig `game-dev asset inspect/validate` aus. `gds_apply` darf erst mit `APPLY_TO_LIVE_AURION` den Ablauf `package build → package verify → vendor dry-run → vendor --confirm → Aurion ingest → catalog readback` ausführen.

Private, vom Projekteigentümer selbst erzeugte Assets verwenden die Rechtebasis `owner-created-private`; im GDS-Package wird sie als `Proprietary-Owner-Created` dokumentiert. Dafür wird keine erfundene CC-/SPDX-Lizenz verlangt.

Named-NPC-Bindings verwenden einen zweiten Consent-Schritt. Beispiel: `lyra` wird ausschließlich als `npc_lyra` gebunden, nachdem Aurion den NPC und das bereits freigegebene `npc-fallback`-Character-Asset bestätigt hat. GLB-Metadaten erzeugen niemals NPC-, Quest- oder Spawn-Authority.

### Authoring-Tools

- `aurion_admin_world_design_read/plan/apply`
- `aurion_admin_dungeon_design_read/plan/apply`

Diese Werkzeuge verwenden die bereits produktiven Aurion-Authoring-Verträge und benötigen den separaten Authoring-Write-Scope. Rohes SQL, Shell, Git/VPS-Zugriff, direkte World-Delta-Writes oder Reward-Mutationen bleiben nicht verfügbar.
