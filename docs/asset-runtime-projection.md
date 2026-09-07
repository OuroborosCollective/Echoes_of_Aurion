# Aurion uploaded GLB runtime projection

This note is the dependency boundary for the follow-up Draft PR. The intake/category contract is owned by PR #241. Runtime projection work must remain presentation-only:

- `world-environment` and `world-nature`: deterministic, server-derived visual placement; no teleport, collision, quest, loot, reward or world-state authority is granted by a GLB.
- `player-public`: approved character models may be chosen through the existing immutable `playerCharacterAppearances` binding. A different second choice must continue to fail closed.
- remote public player appearance: visual readback only and always subordinate to confirmed zone presence/position.
- `equipment`: a GLB may supply only a mesh for a confirmed equipment slot. It never creates item ownership, stats, rarity, loot, crafting output, or an equip mutation.
- every GLB byte continues to come from the approved hash-addressed Aurion asset endpoint.
