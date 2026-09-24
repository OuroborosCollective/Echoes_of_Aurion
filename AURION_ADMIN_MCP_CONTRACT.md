---
description: Aurion Admin MCP für read-only Evidence sowie explizit gescopte Plan→Confirm Asset- und Authoring-Writes.
---

# Aurion Admin MCP Contract

## Verbindliche Grenze

`/admin-mcp` ist Aurions **remote ChatGPT-/Automation-Control-Plane mit default read-only Authority**. Schreibaktionen existieren nur als getrennt gescopte, typisierte Plan→Confirm-Verträge. Es ist keine rohe Game-Master-, Shell-, SQL- oder VPS-Konsole.

- **Aurion** besitzt Gameplayregeln, Simulation, World-/Quest-/Dungeon-Truth und Persistenz.
- **AX1** rendert bestätigte Aurion-Wahrheit und besitzt Presentation/UI/Input, aber keine Gameplay-Authority.
- **WASD** ist historische Donor-/Migrationsquelle, keine Live-Authority.
- Aurion Admin MCP darf bestätigte Readmodels lesen und ausschließlich die unten dokumentierten gescopten Plan→Confirm-Writes auslösen.

## Aktuelle Toolklasse

Ohne Write-Scope sind ausschließlich read-only Werkzeuge zulässig, zum Beispiel:

- Capability-/Scope-Readback;
- Account-/Community-/Asset-/Ops-Readbacks;
- read-only Welt-/Player-Zusammenfassungen aus **bereits persistierten WASD-Receipts**;
- Runtime-/Schema-/Evidence-Status ohne Mutation.

Ein World Overview ist eine Anzeige gespeicherter bestätigter Evidence. Die World-Authority liegt bereits bei Aurion selbst; der MCP-Readback erzeugt keine neue Authority.

## Verboten

Kein Admin-MCP-Tool darf:

- Combat, HP, Damage oder Skills verändern;
- Questzustand oder Rewards verändern;
- XP/Level/Mastery gewähren;
- Loot/Crafting/Economy ausführen;
- Gruppen/Dungeons/NPC/World/Chunks/Housing/Guild/Kingdom mutieren;
- SQL/Shell/Git/VPS als Gameplay-Abkürzung ausführen;
- Aurion-Regeln oder Runtime-State über rohe, untypisierte Abkürzungen überschreiben.

## OAuth

Der Resource Server wird serverseitig konfiguriert. Secrets, Issuerwerte und Client-Credentials gehören nicht in Source oder Browser.

```dotenv
OIDC_ISSUER_URL=https://<fusionauth-issuer>
AURION_ADMIN_MCP_RESOURCE_URL=https://arelogic.space/admin-mcp
```

Vor einem Toolcall werden Signatur/JWKS, Issuer, Ablauf, exakte Resource-/Audience-Bindung, `aurion.admin.read` und die persistierte Aurion-Adminrolle geprüft. Token-Displayclaims allein erteilen keine Authority.

## Schreibflächen

Schreibaktionen existieren nur hinter expliziten OAuth-Scopes und typisierten Aurion-Verträgen:

- `aurion.admin.assets.write`: GLB/GDS/NPC-Visual Plan→Confirm→Apply.
- `aurion.admin.authoring.write`: World-/Quest-/Dungeon Draft/Plan→Confirm→Publish.

Rohe DB-, Shell-, Git-, VPS-, Reward-, Combat- oder World-Delta-Writes bleiben verboten. Die MCP-Fläche ruft ausschließlich vorhandene Aurion-Services auf und besitzt keine Sonderauthority außerhalb dieser Verträge.

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
- `aurion.admin.authoring.write` — World-/Quest-/Dungeon-Authoring Draft/Plan→Confirm→Apply.

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
- `aurion_quest_draft_propose`
- `aurion_quest_publish_plan`
- `aurion_quest_publish`

Diese Werkzeuge verwenden die bereits produktiven Aurion-Authoring-Verträge und benötigen den separaten Authoring-Write-Scope. Rohes SQL, Shell, Git/VPS-Zugriff, direkte World-Delta-Writes oder Reward-Mutationen bleiben nicht verfügbar.


### n8n / Sovereign Orchestrierung

n8n oder Sovereign dürfen denselben HTTPS-`/admin-mcp`-Vertrag orchestrieren, sofern sie einen gültigen OAuth-Token mit exakt benötigten Scopes besitzen. Sie erhalten dadurch keine zusätzliche Authority. n8n speichert keine GLB-/OIDC-Secrets im Workflow-JSON und darf keine DB-/Shell-/VPS-Abkürzung verwenden.

Der gewünschte Gerätevertrag lautet damit:

`ChatGPT / n8n / Sovereign → HTTPS Admin MCP → Aurion Services → serverseitiges GDS → Receipt/Readback`

Ein lokaler PC oder Desktop-Connector ist nicht Teil dieses Pfads.

---

## Local Pre-Alpha Development Control Channel (`dev/prealpha`)

This is a **development-only, loopback-only, token-authenticated test-control side channel**. It is not a second production admin authority.

### Hard invariants

1. `NODE_ENV=production` always disables both `/dev/admin-mcp` and `/.well-known/aurion-dev-control`, regardless of any enable flag or token.
2. Both endpoints require a loopback Host and reject non-loopback or public `X-Forwarded-Host` values.
3. Both endpoints require an explicitly configured `AURION_DEV_ADMIN_TOKEN` or `AURION_DEV_ADMIN_SECRET`; there is no built-in/default token.
4. The production `/admin-mcp` route remains unchanged and OAuth/OIDC protected.
5. The dev channel exposes only typed development fixture operations and observational readback. Production asset-, quest-, world-authoring- and other write tools remain on the OAuth-protected admin channel.
6. Generic SQL, shell, Git, VPS access and untyped state injection are unavailable.

### Bounded fixture contract

- `aurion_dev_inspect_environment` returns observed environment/authentication configuration status without secrets.
- `aurion_dev_test_zone_reset` is restricted to the existing `observatory_threshold` zone implementation and requires an idempotency key plus `CONFIRM_DEV_ZONE_RESET`.
- `aurion_dev_seed_test_encounter` selects from existing canonical mob definitions and requires an idempotency key.
- `aurion_dev_get_fixture_readback` returns the canonical state hash and selected fixture identity.

The fixture runtime uses the same `AuthoritativeMovementZone`, `ZoneMobRuntime` and canonical-state hashing used by Aurion's live implementation, but it is an isolated development instance and is never the global live `ZoneRegistry`. Fixture operations do not persist production gameplay state.

### Evidence boundary

A successful dev-control response proves only that the isolated development fixture performed the requested bounded operation and that its resulting canonical state can be read back. It does not claim production gameplay success, deployment success, schema success or live-world mutation.
