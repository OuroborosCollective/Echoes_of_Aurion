# Aurion Questline Continuation Plan

## Scope

This continuation turns the existing pure faction quest graph into a bounded server-authoritative candidate. It preserves the legacy Lyra/Orun quest chain and adds no reward, loot, world-reaction, combat-damage, or deployment behavior. The client may request a faction oath or a decision and render only the resulting confirmed readmodel.

## Verified task list

| Workstream | Planned deliverable | Verification before completion |
| --- | --- | --- |
| Audit | Revision-locked continuation audit and source map | Aurion and WASD SHAs, restrictive license, user rights confirmation, read-only inventory |
| Contracts | Versioned faction questline state, receipt, and readmodel types | Pure unit tests including validation, sorting, replay, oath gates, and faction isolation |
| Data path | Additive schema for faction status and immutable decision receipts | New SQL migration only; no database migration execution |
| Server authority | User-owned status retrieval, oath command, and decision command | Profile lock, server-derived resolution index, idempotency collision and ownership checks |
| Client | Confirmed faction quest journal in the existing React mission UI | tRPC readmodel query and controlled mutation calls; no local completion state |
| Assets | No new asset candidates | No GLB activation, download, or source-asset transfer |
| Tests | Protocol, data-path, route typing, replay and regression suite | Focused tests, `pnpm check`, full `pnpm test`, `git diff --check` |
| Readback | Deterministic browser demo/readmodel evidence | Existing game dev path if a runnable preview is available; otherwise explicitly record the skipped visual readback |
| Release | Single small commit, push, and update of Draft PR #77 | Local, remote, and Draft PR heads identical; no merge, deploy, or database apply |

## Native design

### State model

`aurionFactionQuestlineStates` stores one player-owned allegiance state and the last server-issued resolution index. `aurionFactionQuestDecisions` is append-only evidence of an authored decision. Its unique idempotency key permits exact replays only; use of that key for different input is rejected. A receipt contains player ownership, faction, quest node, decision key, approach, content/ruleset version, deterministic hash, and the server-derived resolution index.

### Command model

A player starts as `free_haven`. The neutral oath must be completed before taking a faction oath. `pledgeFactionQuestline` allows one permanent oath to a non-neutral faction after the neutral prerequisite. `resolveFactionQuestDecision` accepts only an authored decision and approach for a quest node that is currently available to that player’s pledged faction. The server locks the player’s state row, computes the next monotonically increasing resolution index, writes one receipt, validates the readback, and returns the confirmed readmodel.

### Readmodel model

The readmodel is reconstructed from the pledged faction plus sorted persisted completed quest IDs and decision receipts. It exposes only the valid route, available authored objectives, oath status, faction-specific Warfront descriptor, and deterministic hash. It deliberately does not mint rewards, modify combat, alter the global Warfront, or advance the legacy quest chain.

## Test matrix

| Case | Expected result |
| --- | --- |
| Neutral player | Free Haven is selected; neutral oath is available; no permanent oath is inferred |
| Valid neutral oath | Receipt is stored once, and Free Haven mainline becomes available |
| Invalid pre-oath faction switch | Rejected without state mutation |
| Valid permanent faction oath | Exactly one non-neutral faction becomes pledged after neutral mainline completion |
| Foreign faction decision | Rejected without a receipt |
| Locked or unauthored quest decision | Rejected without a receipt |
| Valid authored decision | One receipt, one monotonic resolution index, and confirmed route/readmodel |
| Exact retry | Existing receipt/readmodel is returned with no second receipt |
| Reused idempotency key with different intent | Rejected |
| Input-order replay | Equivalent completed IDs and receipt order produce identical readmodel hashes |
| Warfront convergence | Each pledged faction sees only its own Warfront quest and stable boss while the shared region remains `Warfront` |

## Explicit non-goals

No production migration is applied. No WASD runtime, scheduler, deployment setup, GLB, or asset data is copied. No faction change after oath, reward settlement, NPC memory mutation, loot minting, world reaction, or autonomous boss combat is implemented in this slice. Those require separate, receipt-bound contracts and corresponding isolated database/browser evidence.

[1]: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/77 "Existing deterministic faction questline draft PR"

## Human Story Layer v2

Die Questline-Erweiterung behandelt jede Fraktion als Gemeinschaft mit einem sichtbaren politischen Zweck und einer persönlichen Wahrheit, die von außen nicht vollständig erkannt werden kann. Diese Storydaten sind authored Content und verändern keine serverautorisierte Bedeutung: Der Server entscheidet weiterhin ausschließlich anhand stabiler Questschlüssel, authored Entscheidungsschlüssel, Receiptbindung und monotoner `resolutionIndex`-Werte.

| Fraktion | Persönliche Trägerfigur | Sichtbare Aufgabe | Verborgener menschlicher Kern | Signatur |
| --- | --- | --- | --- | --- |
| Sunward Concord | Mara Venn, Maurerin des Sonnenwalls | Wall, Vorräte und Evakuierungswege sichern | Ihr Bruder wurde als Fremder aus dem Bürgerbuch gestrichen; sie baut einen Ort, an dem niemand seine Daseinsberechtigung beweisen muss. | Mörtel, Bürgerbuch, offene Pforte |
| Ironwardens | Joren Kest, Träger des ersten Schildes | Front halten und Siedlungen schützen | Hinter seiner Härte steht die Angst, wieder jemanden zu verlieren; der letzte Wunsch seines Partners galt den Verwundeten, nicht dem Ruhm. | Schildleder, roter Staub, Rückzugssignal |
| Veiled Covenant | Ilyra Senn, Hüterin der stillen Archive | Einen tödlichen Befehl durch belastbare Information verhindern | Ihre Schwester lebt unter falschem Namen; Geheimhaltung ist für Ilyra eine Form von Fürsorge, nicht bloß Macht. | Maskenfaden, Archivstaub, unvollständige Wahrheit |
| Wayfarer Compact | Tava Orr, Kartografin der Randlande | Einen sicheren Korridor für Flüchtende öffnen | Ihre Karten sind Trauer in Bewegung, weil sie den letzten Weg ihrer Gefährtin nie finden konnte. | Siebte Markierung, Leuchtfeuer, Karte der Rückkehr |
| Free Haven | Niko Pell, Hüter des Brunnenkreises | Wasser, Waffenstillstand und Verhandlung bewahren | Seine Neutralität ist Wiedergutmachung: Er war einst selbst Befehlshaber einer Plünderergruppe und trägt deren Wasserliste. | Brunnenkreis, geteilte Schlüssel, fünfter Weg |

Jede Geschichte besitzt einen sichtbaren Bedarf, eine private Wunde, eine menschliche Wahrheit, einen authored Wendepunkt und ein Endeversprechen. Die UI zeigt diese Erzählung als serverbestätigte Journalebene; sie kann keine Fraktionszugehörigkeit, Questbedeutung, Belohnung oder Weltreaktion selbst festlegen.
