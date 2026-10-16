# Aurion stat allocation integration checkpoint - 2026-10-15

Draft PR #900. DO NOT label complete until all acceptance gates below pass. Owner requires Wolfram verification before formulas are implemented.

## Confirmed
- Only Aurion owns gameplay, persistent receipts and HUD readbacks; old AX1/WASD names are provenance.
- Retired local character logic awarded two stat points per character level and one per weapon mastery level.
- Wolfram checked earned = 2*(characterLevel-1) + sum(weaponMasteryLevel-1), provided each mastery has confirmed source evidence. Level 10, blade 5 gives 22; no cap.
- Legacy local strength impact: +3.5 attack per point; defense: +22 HP per point. Wolfram checked fixed integer analogues.

## Implemented in draft only
- Pure BigInt exact stat wallet and negative tests for duplicate receipts, forged levels, overspending, unconfigured reward sources.
- Unique append-only MariaDB stat-spend receipt, migration 0074, canonical journal, wave manifest and reconciliation tag.
- Authenticated player.statWallet readback and player.allocateStatPoint with profile row lock, idempotency and post-commit readback inside transaction.
- Character modal shows confirmed free and allocated points, with +1 spend intent; no local gameplay mutation.
- ACEG now incorporates confirmed allocated permanent attribute totals. Zone login uses confirmed Strength and Defense for damage and maximum HP.
- Unit and E2E regression sources updated; no proof of passing exact-head CI yet.

## Outstanding blockers (mandatory, do not drop)
1. Exact-head pnpm check, focused tests, all regressions; MariaDB migration schema test and reconciliation green.
2. Migration safely applied in approved release lane, database transactions exercised with concurrent double spend and replay, independent readback.
3. Real character-XP source must generate hash-verified aggregate level-up receipts; existing production may not emit actionKind encounter receipts. Wallet refuses to invent unearned points.
4. Confirm Wolfram-verified point-award quotas for armor, profession, skill, crafting, farming, politics, diplomacy, social and buff progressions. These remain zero/unconfigured, no guessed rates.
5. Connect Agility, Intelligence, Stamina, Perception, Willpower, Treatment and Engineering to server gameplay, skills, crafts, farming and social resolvers with tests; current zone only accepts HP/weaponBonus fields.
6. Persist implants and temporary buffs with expiry, signed earned/consumed receipts and ACEG capability readback; current runtime passes empty implant/buff arrays.
7. Content-author stat-based item requirements, allowing valid low-level over-equipping with proof of effective buffs/implant chain and OE penalties.
8. HUD confirmed source breakdown and real authenticated phone/tablet/desktop browser evidence; exact char XP beyond SQL-int legacy profile fields.
9. PR #897/#898 independent monster drafts. No monster reward payouts or player stat points live until kill receipts and readbacks exist.
10. Merge and deploy only after exact head, immutable container digest, MariaDB readback, runtime health, and in-game verification.

## Authority safety
No client-generated stat balance or fabricated source receipts; no silent migration of local AX1 methods; no direct Wolfram gameplay decisions. Unverified or stale results fail closed.
