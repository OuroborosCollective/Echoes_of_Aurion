# Aurion Audio Asset Ledger

**Runtime base:** `73542eabfe981135593676648d5a2717f3b2c0a8`  
**Candidate branch:** `feature/aurion-audio-system`  
**Protocol:** `aurion-audio.v1`  
**Status rule:** generated files remain `inactive` until release review and browser decode readback.

| Asset | Cue | Duration | Technical format | SHA-256 | Status |
| --- | --- | ---: | --- | --- | --- |
| `public/audio/ambient-tower.wav` | `ambient.tower` | 117.551020 s | PCM S16LE, 44.1 kHz, stereo | `82d7262d1f6231fc6bf79e0552aea4aca9c67a28cc1d57f2724649723b6460dc` | `inactive` |
| `public/audio/ambient-plains.wav` | `ambient.plains` | 114.494694 s | PCM S16LE, 44.1 kHz, stereo | `b8ca19ebcaf62b5e12484d0a0a0980cb8566b7f8256889e901d52228bd76318e` | `inactive` |
| `public/audio/ambient-forest.wav` | `ambient.forest` | 118.386939 s | PCM S16LE, 44.1 kHz, stereo | `946dd349748cea7b8a789ba7e4c8dc75b3cb0ce6cef11ee7e335e8117cf784e8` | `inactive` |
| `public/audio/ambient-cinder-vault.wav` | `ambient.cinder_vault` | 114.703673 s | PCM S16LE, 44.1 kHz, stereo | `3d05daeb328140bce232d2e2035eb3f62cf8b1d98e3c9e2628ef148b69ba062e` | `inactive` |

The four tracks total **465.136326 seconds**. A Wolfram calculation independently confirmed **78.24902334823608 MiB** of uncompressed stereo 16-bit PCM at 44.1 kHz for that aggregate duration. The runtime may use the tracks as optional ambient sources, while the deterministic Web Audio fallback remains available if fetch/decode/autoplay is unavailable.

The assets were generated as original, instrumental, loop-oriented material for Aurion zones. No external voice, artist, song title, or copied melodic reference is used. The repository copy is an additive candidate artifact; no production storage, CDN, database, or deployment was mutated.

## Sound Effects v1

The SFX pack contains 21 deterministic, original PCM S16LE, 44.1 kHz, mono candidates. They are rendered by `scripts/generate_aurion_sfx.py`; a fixed integer formula and fixed synthesis schedule yield reproducible bytes for the same source revision. Every effect remains `inactive` until browser decode readback and release review.

| Asset | Cue | Duration | SHA-256 | Status |
| --- | --- | ---: | --- | --- |
| `combat-attack-sharp.wav` | `combat.attack.sharp` | 0.220 s | `e79824e205d25dbe48242583da4f84df84ceb748e2c0e2f8f91a6e0bba775921` | `inactive` |
| `combat-attack-pointed.wav` | `combat.attack.pointed` | 0.240 s | `5f5eb8735599ec2b2731a81b612f72834cd7ab2ec0376936d4377f2d051c8d5f` | `inactive` |
| `combat-attack-blunt.wav` | `combat.attack.blunt` | 0.320 s | `22c1fba7d34e04193ad3a656c47b245da845edb7eb61e5011f3c9903be4736cc` | `inactive` |
| `combat-spell-heal.wav` | `combat.spell.heal` | 0.740 s | `b2d5161f57180f7e23f3ea20035fc1eacc0f7f396a752c7ee2accf877752b434` | `inactive` |
| `combat-spell-buff.wav` | `combat.spell.buff` | 0.650 s | `351fa48342c23208e2ade14fa59e4047d79ec51efb25060a25ed1ad2deebb289` | `inactive` |
| `combat-creature-wolf-attack.wav` | `combat.creature.wolf.attack` | 0.460 s | `5545f78bc992e58a0601acdb012a6ea361cfc28a6b23600787aa6f31cc390465` | `inactive` |
| `combat-creature-human-attack.wav` | `combat.creature.human.attack` | 0.300 s | `019779bc303b64beb097d0f0694a3b1586efbd24f3e5ecbb479e22eb54e8cdcb` | `inactive` |
| `combat-creature-monster-attack.wav` | `combat.creature.monster.attack` | 0.580 s | `854b738fa34a4e9f3d9a80db027dec2d17564baf72e8478b0c2324c6cfba8364` | `inactive` |
| `combat-creature-wolf-death.wav` | `combat.creature.wolf.death` | 0.660 s | `425b69b7820d07e8958ecf5367a1b6fededf4eaec5d8c4de2573e383f423b15a` | `inactive` |
| `combat-creature-human-death.wav` | `combat.creature.human.death` | 0.580 s | `861a780e496162e7a0d0d8f1412cbe046e354357638e92b7c1951abd3880600f` | `inactive` |
| `combat-creature-monster-death.wav` | `combat.creature.monster.death` | 0.920 s | `a3c346b9e8ee93e88c9a4ba025c2f4cb0299bda5214388c7699afdbf7d9ccc6e` | `inactive` |
| `movement-run-earth.wav` | `movement.run.earth` | 0.520 s | `1a2b9b16dd5caba247b45b8e3436b3824da8b7714f3c7f5373fd5e13fa6610a4` | `inactive` |
| `movement-run-grass.wav` | `movement.run.grass` | 0.520 s | `97837be2d44e7280e174e16af1a1ab55c7faf71e4a78f405ffde5175eefd7990` | `inactive` |
| `movement-run-stone.wav` | `movement.run.stone` | 0.520 s | `a39858722509f87f483bf0bc49b712fa45e0ce00ecc6688570c3df20037f3095` | `inactive` |
| `movement-run-wood.wav` | `movement.run.wood` | 0.520 s | `6ab3f5ee61eba11b218b784985ec8c6f43c5f8ceb2a5f3890a30f6f2590d4102` | `inactive` |
| `movement-run-water.wav` | `movement.run.water` | 0.520 s | `831131ea3761dc5d8ad5fac3d2cc88787646f86463bd51be0dacf655b9fc06e4` | `inactive` |
| `interaction-loot-screw-pouch.wav` | `interaction.loot.screw_pouch` | 0.620 s | `03f9f28765b0732737a92b1c1cd77fce1b85b3d10200111edab945d486d8a77f` | `inactive` |
| `resource-harvest-plant.wav` | `resource.harvest.plant` | 0.450 s | `3d6ed428b5a5873090084462ca9a006373a160d492a44881c42c5a78bd6c33e8` | `inactive` |
| `resource-harvest-wood.wav` | `resource.harvest.wood` | 0.520 s | `5c2de2a9ba690fb834c098a64a2746ca8233314e8e098ffaf63d83196b200cd1` | `inactive` |
| `resource-mine-ore.wav` | `resource.mine.ore` | 0.550 s | `110928b878c0e2c51f97e9de025ed02506d9a479300eeab34f67c652316ee387` | `inactive` |
| `crafting-workbench-saw.wav` | `crafting.workbench.saw` | 0.620 s | `e1b38d2592b31fcbf7e7d0b3be124d3f2b240a43691fe174f4d876bea99559a6` | `inactive` |

The SFX pack’s measured total raw duration is **11.030 seconds** and its measured payload is **973,770 bytes (0.928659 MiB)** as 44.1-kHz/16-bit/mono PCM, so it remains modest alongside the zone music. A future resource/crafting action must dispatch a fully valid `aurion:audio-cue` event only after the corresponding server-authoritative receipt is confirmed. No SFX can itself grant resources, loot, damage, healing, buffs, experience or crafting output.

## World ambience extension

The world ambience extension adds three original, loop-oriented candidates. They remain `inactive` until release review and browser decode readback.

| Asset | Cue | Duration | Technical format | SHA-256 | Status |
| --- | --- | ---: | --- | --- | --- |
| `public/audio/ambient-forest-world.wav` | `ambient.forest` | 116.611 s | PCM S16LE, 44.1 kHz, stereo | `ebcfa648ff20d33f326eef4107a648dd7a61eb191a8b4586b22e67740c76e7a2` | `inactive` |
| `public/audio/ambient-cave-world.wav` | `ambient.cave` | 118.073 s | PCM S16LE, 44.1 kHz, stereo | `13aa4c6f734d6b6692f69bda64a58cd073d1aa7b6d6f3c13fad4d726473fc0b1` | `inactive` |
| `public/audio/ambient-city-world.wav` | `ambient.city` | 176.823 s | PCM S16LE, 44.1 kHz, stereo | `e31e43a40909f127001f1621e73cd61b8558c01b85abc3f299fabb65a530df1d` | `inactive` |

The new tracks are mapped deterministically in `Home.tsx`: Tower for Home, Cinder Vault for arena 3, Cave for arena 2, City for arena 1, Forest for the global streamed Expanse, and Plains for the remaining expedition baseline. The files are also copied by the static/Itch packager into the same flattened `aurion-assets` namespace used by `resolveAurionAsset`.

## Dungeon and world boss theme

A separate shared boss theme is available for long Dungeon-Endboss and Weltboss encounters. It is intentionally quieter than a transient combat hit, but more focused than ordinary zone ambience; the boss scope is selected by the encounter event while the same loop remains musically recognizable across both scales.

| Asset | Cue | Scope | Duration | Technical format | SHA-256 | Status |
| --- | --- | --- | ---: | --- | --- | --- |
| `public/audio/ambient-boss-dungeon-world.wav` | `ambient.boss` | `dungeon` / `world` | 147.122 s | PCM S16LE, 44.1 kHz, stereo | `e7713ea4aabc3f6f0bb54fe478cc2c8e8c509877281854bf76b1c8363d350daa` | `inactive` |

The runtime activates this track for the Cinder Vault endboss and accepts the same `aurion:boss-encounter` contract with `scope: "world"` for future server-authoritative worldboss encounters. The normal zone track returns when the event is closed. No boss music event can create or modify combat state.
