# Fadenwerk Quest Authoring (Draft v1)

Source: Owner-provided Fadenwerk TSX, SHA-256 `a769394823912f1a03bdbda33388d06102b6af875c439612a7e9741380607261`.

New `/ops/quests` tab Fadenwerk uses Aurion's existing templates, `aurionQuest.proposeDraft` and `aurionQuest.publishPlan` only. It cannot execute, publish, grant loot, or mutate the world. Imported Fadenwerk JSON is untrusted and checked fail-closed: missing/duplicate graph ids, edge reachability, cycles, unsupported story/reward/flag/feature semantics and separate catalogs. Safe structure-only imports create inactive, quarantined Aurion templates. Legacy RNG, browser AI calls, placeholder items and new runtime services are not imported.

Evidence: isolated Node.js checks of the adapter family were performed locally; exact PR-head TypeScript, Vitest, server CI and device/runtime readback are not yet established. Production activation, native Godot, loot and AI conversion are separate follow-ups. No runtime, persistence or deployment claim.
