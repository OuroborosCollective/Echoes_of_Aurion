# Aurion Questline Continuation Audit

## Scope and source binding

This continuation extends the existing deterministic faction-questline candidate in **Echoes of Aurion**. The working baseline is commit `1d0dd72b9e32e891282000ed13bb4907745121dd` on branch `candidate/aurion-questlines-faction-paths-20260828`. The inspected WASD source revision is `a4d99432e47b82ce98105eadb30360cd8040ad13`.

## Rights confirmation

On 28 August 2026, the requesting user explicitly stated in this task that they are the personal WASD license holder and authorized continuation of the Aurion integration. This is recorded as a task-scoped authorization statement, not as a replacement for the WASD license text or a general redistribution grant.

## Audit boundaries

The WASD source is used only as a reviewed semantic reference. No WASD runtime, scheduler, deployment setup, database configuration, secrets, assets, or source files are copied into Aurion. The Aurion target remains the sole runtime and will receive only additive, native TypeScript, Drizzle, tRPC, and client-facing readmodel changes.

## Confirmed implementation gap

The existing `server/aurionQuestlineProtocol.ts` provides an authored graph and pure resolution. It does not yet persist faction allegiance, decisions, or questline receipts, expose protected faction-quest commands, or provide a confirmed faction-questline readmodel to the client. The continuation will address this gap without applying any migration or changing production data.

## Evidence status

| Evidence | Status | Detail |
| --- | --- | --- |
| Aurion baseline revision | Confirmed | `1d0dd72b9e32e891282000ed13bb4907745121dd` |
| WASD source revision | Confirmed | `a4d99432e47b82ce98105eadb30360cd8040ad13` |
| Rights chain | Task-scoped confirmation | User self-attested as WASD license holder on 2026-08-28 |
| Read-only audit manifest | Confirmed | `../aurion-wasd-audit-manifest.json`; 149 WASD GLB candidates, 0 Aurion GLBs |
| Production migration | Not performed | A migration may be authored and tested only; it will not be applied |
| Deployment, merge, or release | Not performed | Each requires a separate explicit user instruction |

## Next work

Define the versioned, receipt-bound faction questline state model, add protected intent routes and persistence contracts, then prove replay, faction-isolation, oath, neutral-route, and Warfront convergence invariants.

[1]: https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/77 "Existing deterministic faction questline draft PR"
[2]: https://github.com/OuroborosCollective/Wasd "WASD source repository"
