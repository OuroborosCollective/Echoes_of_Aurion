# Fadenwerk Quest Authoring (Draft v1)

Source: Owner-provided Fadenwerk TSX, SHA-256 `a769394823912f1a03bdbda33388d06102b6af875c439612a7e9741380607261`.

New `/ops/quests` tab Fadenwerk uses Aurion's existing templates, `aurionQuest.proposeDraft` and `aurionQuest.publishPlan` only. It cannot execute, publish, grant loot, or mutate the world. Imported Fadenwerk JSON is untrusted and checked fail-closed: missing/duplicate graph ids, edge reachability, cycles, unsupported story/reward/flag/feature semantics and separate catalogs. Safe structure-only imports create inactive, quarantined Aurion templates. Legacy RNG, browser AI calls, placeholder items and new runtime services are not imported.

Evidence: isolated Node.js checks of the adapter family were performed locally; exact PR-head TypeScript, Vitest, server CI and device/runtime readback are not yet established. Production activation, native Godot, loot and AI conversion are separate follow-ups. No runtime, persistence or deployment claim.

## Native Godot quest editor

The existing WorldStudio quest section now offers Fadenwerk source inspection, strand selection, per-strand diagnostics and explicit structure import. Both browser and native authoring reuse `shared/fadenwerkLegacyAdapter.ts`; there is no independent native quest interpreter.

1. Open WorldStudio with a confirmed Aurion admin session and select the quest editor.
2. Paste Fadenwerk-v1 JSON into **Fadenwerk-v1-JSON** and choose **Fadenwerk bei Aurion prüfen**.
3. Select a strand and review its diagnostics. Unmapped rewards, flags, events and catalogs prevent import. The preview does not invent gameplay behavior.
4. Choose a draft version and **Gewählten Fadenwerk-Strang als inaktiven Entwurf übernehmen**. Existing draft text is replaced only after a matching response; edits to the source or selection invalidate a pending conversion.
5. Inspect the graph, select a node and edit its title, or change the quest title. Canonical JSON remains available for roles, conditions, objectives and outcomes.
6. Request the existing Aurion draft/plan. Publishing requires explicit activation, a matching current server plan and the owner confirmation dialog. The existing receipt and separate durable template readback certify publication.

The version field is a proposal, not a reservation; Aurion's existing plan/publish checks reject conflicts. Imported drafts start inactive and quarantined. An uncertain publication blocks further imports and editing until recovery is resolved.

### Authenticated read-only agent interface

The existing `aurionQuest` tRPC router adds two admin-only POST procedures:
- `fadenwerkInspect({sourceJson})`: returns source SHA-256, strand IDs/titles and diagnostics.
- `fadenwerkDraft({sourceJson,questlineIndex,version})`: returns the same source digest and a canonical inactive `QuestTemplateVersion`.

Both responses are marked `previewOnly: true`. They do not create proposals, publish, produce receipts or write gameplay state. Source and inspection payloads are bounded to 120,000 UTF-8 bytes. Converted templates are limited to 64,000 bytes, leaving room for the canonical plan envelope within the existing 65,535-byte persistence limit; selection and version are integer-bounded. Single-node strands are blocked because Aurion requires a distinct start and end. Entry nodes must have exactly one outgoing transition; place choices in a subsequent branch node. Non-empty external item sources and ambiguous generated edge IDs are reported as import blockers. Read-only inspection/conversion failures preserve an existing validated quest plan. Presentation whitespace does not count toward the compact canonical draft limit. Use the existing `proposeDraft`, `publishPlan`, `publish`, `publishReceipt` and `authoringTemplate` contracts for the subsequent authorized operation.

Evidence is separated: native scene tests use clearly synthetic transport; the real HTTP fixture tests serialization and session binding; isolated MariaDB tests exercise the actual server conversion and publication contract. Production deployment and an authenticated live Godot session require independent readback.
