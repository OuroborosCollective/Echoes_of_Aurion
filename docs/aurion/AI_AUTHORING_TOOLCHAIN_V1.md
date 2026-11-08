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

`godot-client/net/api/world_authoring_api.gd` now accepts `aiToolCatalog` (authenticated GET) and `aiToolPreview` (authenticated POST) using existing same-origin bearer/session-generation guards, redirect refusal, size limits and transport. This exposes an adapter to the existing editor; **there is no new automatic Godot UI action, scene mutation or client-side authority**. Godot may display returned previews only.

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
| Godot transport / projection | `godot-client/net/api/world_authoring_api.gd` |
| Tests | `server/aiFabric/authoringToolchain.test.ts` |
| Documentation / evidence | This document and one append-only `Memory.md` entry |
| Canonical persistence / tick / economy / combat | **Untouched** |

## Remaining implementation work

A complete cross-surface WorldStudio UI needs user-facing buttons, explicit workflow selection and approval UX. Automated NPC controller activation requires its separately verified archetype/receipt admission contract. Release acceptance, genuine Godot session checks, runtime and MariaDB readback are **not** claimed by these adapters.
