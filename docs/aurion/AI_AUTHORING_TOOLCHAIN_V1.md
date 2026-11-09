# Aurion AI Authoring Toolchain v1 (Cookbook patterns, not a second game authority)

## Scope and source identity

This additive adapter is inspired by OpenAI Cookbook patterns for typed tool dispatch, explicit JSON contracts, tool allowlists, negative evaluation and human review: https://github.com/openai/openai-cookbook . No Cookbook runtime is vendored or imported. All actual gameplay code, persistence, auth and world state remain in Echoes_of_Aurion.

The exact source revision of this adapter is the reviewed pull-request SHA, not this document. The established Aurion 100 ms / 10 Hz deterministic simulation tick is unchanged.

## Typed tool catalog

Read-only discovery: authenticated admin tRPC `aurionAuthoring.aiToolCatalog`, or authenticated Aurion Admin MCP `aurion_ai_authoring_catalog`.

Strict, admin-only preview dispatch: tRPC `aurionAuthoring.aiToolPreview`, or scoped Aurion Admin MCP `aurion_ai_authoring_preview({requestJson})`. The latter cannot generate a world proposal without a real live-zone session and never adds its own credentials or authoring rights.

| Tool | Input | Canonical implementation | Result |
| --- | --- | --- | --- |
| `fadenwerk.inspect` | `{tool,sourceJson}` | `fadenwerkInspection` | Source hash, strand diagnostics, preview only |
| `fadenwerk.draft` | `{tool,sourceJson,questlineIndex,version}` | `fadenwerkDraft` | Inactive, quarantined canonical quest template |
| `quest.template.validate` | `{tool,templateJson}` | `QuestTemplateVersionSchema` + `QuestValidator` | Schema and graph diagnostics; no write |
| `npc.behavior.draft` | `{tool,input:{role,mode,brief}}` | Existing Behavior Forge explicit template | Offline blocked/shadow-only recommendation |
| `world.design.propose` | `{tool,input:DesignerInput}` | Existing `proposeWorldForSession` and `WorldDesigner` | Untrusted AI_DRAFT or unresolved; live-zone and revision preconditions |

These are *authoring tools*, not AI-owned simulation commands. The NPC template is **not** an LLM generation. Only the world proposal currently invokes the configured model fabric. The preview dispatcher cannot turn output text into tool calls, execute player actions, change controller bindings, or publish quests.

### Sample requests

```json
{"tool":"npc.behavior.draft","input":{"role":"guard","mode":"tree","brief":"Propose safe guard behavior under existing Aurion rules."}}
```

```json
{"tool":"quest.template.validate","templateJson":"{\"templateId\":\"...\"}"}
```

Invalid JSON and schema mismatches produce compact error diagnostics; invalid graph structures produce the real quest validator's diagnostics. Fadenwerk imports require graph/source checks and cannot import unsupported gameplay or external catalog semantics.

## Godot native transport

`godot-client/net/api/world_authoring_api.gd` now accepts `aiToolCatalog` (authenticated GET) and `aiToolPreview` (authenticated POST) using existing same-origin bearer/session-generation guards, redirect refusal, size limits and transport. The existing WorldStudio now has a touch-friendly navigation row with `Welt & KI`, `Quests & Fadenwerk`, `NPCs`, `Live-Inspektor` and `KI-Werkzeuge`. Switching sections reuses the existing Godot panels and their existing authorization/session handling; it does not start a new game service. The KI-Werkzeuge section reads the exact five-tool allowlist from Aurion and displays `PREVIEW_ONLY` or a fail-closed reason. In the native quest editor, **Questgraph beim kanonischen Aurion-Validator prüfen** sends the current draft to the server and displays graph diagnostics without publishing. Fadenwerk inspect/import, NPC role templates and world proposals use the typed preview dispatcher when the verified catalog is present, with compatibility to the existing standalone preview routes only before the first catalog-discovery attempt in the current session; rejected, failed, and pending catalogs block all five preview aliases. Canonical effect, receipt and readback routes stay separate. World, quest and NPC effect/readback buttons continue to use their existing canonical routes and journals; there is no added automatic Godot world or NPC mutation.

On mobile/desktop, open the existing WorldStudio through the game HUD, authenticate with an Aurion admin session, and choose `KI-Werkzeuge` to verify the shared catalog. Follow its section links to author. `Quests & Fadenwerk`: inspect a source, import a quarantined strand, inspect the graph, validate at Aurion, and only separately propose/plan/publish after explicitly enabling a new version. `NPCs`: read confirmed actor observations, draft a shadow template, and compare outside the simulation tick; controller activation is not implemented. `Welt & KI`: select a server-confirmed chunk and approved catalog assets, request a model draft, review/edit locally, request a plan, confirm, recover a receipt if uncertain, and independently read back the world. The `Live-Inspektor` shows the confirmed zone projection without fabricating source revision or state/receipt hashes.

UI negative tests reject unknown tool catalogs, mismatched tool replies, stale drafts and missing sessions, while a separate native transport test covers HTTP serialization and session generation. These tests are isolated acceptance evidence; a real authenticated production UI workflow is not proven without a separate deployed readback.

## Effectful handoffs remain separate

- **Quest / Fadenwerk**: `aurionQuest.proposeDraft` → `publishPlan` → explicit `publish` confirmation → `publishReceipt` and independent `authoringTemplate` readback.
- **NPC**: `aurionAuthoring.behaviorActors` and `behaviorTest` provide actual confirmed observations and offline comparisons. Forge activation is still **BLOCKED**; no arbitrary model/controller may be installed.
- **World**: authenticated live `aurionAuthoring.worldPlan` → confirmation-bound `worldApply` → `worldReceipt` → independent canonical `/api/game/world-design` readback.
- **Model/call metadata**: external model prompts are untrusted data. An LLM response is neither a receipt nor a server revision.

## Security and acceptance

- Strict discriminated-union input allowlist; unrecognized tools, extra fields, unsupported actions and model-created `apply` keys are rejected.
- No new network services, API keys, background tasks, migration, direct SQL, gameplay mutation, PR merge, production VPS or runtime promotion.
- Every real write continues to use Aurion's own admin scopes, exact plan hash/explicit confirmation, canonical effects and independent readback.
- Test: `pnpm exec vitest run server/aiFabric/authoringToolchain.test.ts server/aiFabric/behaviorAuthoring.test.ts server/questCompiler/fadenwerkAuthoring.test.ts`; run repository `pnpm check`, affected regressions and Godot headless in CI. These are repository checks, not deployment evidence.
- RED is a dedicated test-first commit. Green requires tests on the exact final PR SHA; do not infer success from a previous head.
- Runtime and Android device proof require a separately authorized, deployed and independently read-back release. A successful compile or PR does not mean the AI toolchain is active on arelogic.space.

## Tracked-file classification

| Class | Changed surface |
| --- | --- |
| Core / production authoring boundary | `server/aiFabric/authoringToolchain.ts`, `server/routes/aurionAuthoringRouter.ts` |
| Effect / connector, without gameplay authority | `server/adminMcp.ts` |
| Godot transport / projection | `godot-client/net/api/world_authoring_api.gd`, `godot-client/ui/screens/world_authoring_studio.gd`, `godot-client/ui/screens/quest_authoring_editor.gd` |
| Tests | `server/aiFabric/authoringToolchain.test.ts`, `godot-client/tests/test_ai_authoring_toolchain_ui.gd`, `scripts/godot/check.mjs` |
| Documentation / evidence | This document and one append-only `Memory.md` entry |
| Canonical persistence / tick / economy / combat | **Untouched** |

## Remaining implementation work

A full **native WorldStudio control surface is added in this PR, pending exact-head Godot/headless and independent live verification**. Automated NPC controller activation requires its separately verified archetype/receipt admission contract. Release acceptance, genuine Godot session checks, runtime and MariaDB readback are **not** claimed by these adapters.
