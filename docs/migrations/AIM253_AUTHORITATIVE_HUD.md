# AIM-253: server-backed Open World surfaces

The production bridge renders `AurionAuthorityHud` from validated Aurion readbacks. Standalone AX1 panels remain source/reference components; their generated gold, inventory, attributes, cooldowns, simulated party, NPC rewards and target health are no longer displayed as confirmed player state.

- `player.me`: owner-checked profile, AURION currency, inventory affixes, class and weapon mastery. The class and weapon selectors call the existing protected mutations, then refetch. Stale readbacks cannot trigger those changes.
- `gameplay.progress`: authored quest givers, availability and hand-in status. Acceptance and completion use the existing protected quest operations.
- `gameplay.openWorld`: actual server world epoch and deterministic hash. Map position comes from the authenticated zone snapshot in fixed-point units.
- Community chat, groups, market and crafting open the existing Aurion interfaces above the Open World canvas. They retain their own API callers, authorizations and confirmations.
- Waiting, empty, invalid, failed and stale states remain distinct. A failed database connection no longer returns empty inventory, weapon mastery, chat or group readbacks.
- AX1 simulated adventurers are disposed before the integrated scene starts. They are not connected Aurion players. Disposal deduplicates shared GPU resources.
- Open dialogs and community panels stop server movement and action intents; touch and keyboard use the same guard.

Validation: runtime schemas reject cross-user inventory/profile data, malformed numeric fields and missing world hashes. UI regressions cover absent state, confirmed currency, stale writes and native community routing. Browser/MariaDB CI additionally proves empty inventory, server-declared class lock at level 36 and a weapon change with actual database readback and the confirmed world hash on phone, tablet and desktop.

This slice does not finish AIM-253/AIM-259/AIM-262: authoritative encounter targeting/health, equipment-slot persistence, remote player meshes, the full AX1 atlas/debug controls and remaining asset integrations still need their separate production paths and evidence. These values are not synthesized by the HUD.
