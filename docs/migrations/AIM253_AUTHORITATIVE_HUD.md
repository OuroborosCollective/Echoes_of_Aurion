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

## Player, blacksmith and mobile HUD repair (5 September 2026)

The owner's screenshots exposed an oversized intermediate HUD and a small, static
player. The world now adapts the unit frame, gold/black palette, icon menu, action
cluster and modal layout from `-ax1@d356881538dae23c3aa97364a5596d48b6ac3079`
(`src/components/GameHUD.tsx`, blob `ff8d15df3296c4ddb59cdbbcfc2188ff60831bf7`).
Inventory, character and quest surfaces retain the authenticated Aurion readbacks;
contacts have a separate tab. Secondary menus collapse on phone/tablet. Missing
health/cooldown values are not filled with AX1 prototype numbers.

The supplied player GLB (`67669ddf21fe0bf68fe193eba00b35207ef28a4c49940061df9dad2b72cd90b8`)
contains named Idle/Walk/Run/Fight/Jump/Death clips with no changing tracks.
`scripts/repair-player-animation.py` checks that exact source hash and writes a new
GLB version with actual bone motion. Geometry, textures, weights, sockets and the
already moving AttackCombo stay intact. The original is retained as a fixture.
The corrected version uses the ordinary upload and expected-current-assignment
replacement flow; committing the file alone does not publish it to the catalog.

`AnimatedGlbActor` measures the imported mesh, fits a two-metre wrapper and anchors
animated foot contact to the terrain. The imported skeleton is preserved; server
movement selects Idle/Walk/Run and confirmed actions trigger attacks. The actor's
clock and skeleton pose are measured directly for browser verification.

The supplied blacksmith GLB (`38fe974913fef9e86b27fa93f2b30b75f069c27afbc05c3ec69736d946920137`)
is recognized from its internal rig/clip names as `npc_blacksmith`, independently
of the player slot and upload filename. The server publishes the smith at X=3 m,
Z=-14 m, beside the imported Royal Forge anvil and clear of its collision radius;
rendering uses sampled terrain elevation. Within five metres, interaction
plays the original ShopInteract and opens the existing transactional crafting
service. This adds a service NPC, not new autonomous NPC decisions or recipes.

`e2e/aim253.glbActors.spec.ts` runs against the isolated MariaDB and built app on
phone, tablet and desktop. It uses the complete GLBs through the real admin UI,
checks byte/assignment readback, actual bone changes, movement, foot contact and
smith interaction, and captures world/menu screenshots. Local geometry tests
omit image decoding only; their result alone is not a browser rendering proof.
