# Explicit identity and time inputs

The seeded gameplay projection from PR #201 stays authoritative only as a renderer of server-approved state. This follow-up removes remaining application-owned `Math.random()` calls outside that projection:

- Sidebar skeleton width is fixed, so render/hydration does not consume random state.
- Local ledger identity and time use an explicit event sequence. Export format 2 declares `event_sequence`; it does not invent wall-clock timestamps. Legacy format-1 entries remain readable, bounded to 28 entries.
- Companion frame request IDs are process-local monotonic correlation numbers, not credentials. Concurrent requests remain distinct and remove their listeners after completion.
- Companion sessions derive from the existing server-issued gateway session ID. Reapplying the same pairing preserves learning progress. Observation hashes require the actual supplied capture timestamp; missing timestamps are rejected.
- LLM retry delays follow a bounded deterministic exponential schedule. A provider Retry-After value is an explicit scheduling input.
- Generated-image storage keys derive from SHA256 of the returned image bytes, not invocation time.

Operational clocks are intentionally distinguished from simulation time: camera capture freshness, authentication/token expiry, login lockouts, OIDC caches, lease expiry and audit timestamps still need actual external time. They are not replaced with a fixed clock or a seeded approximation. The frame processing and learning functions now require time as an explicit input; the acquisition boundary supplies the observed timestamp. These external clocks never resolve loot, mastery or world outcomes.

Regression coverage executes ledger and companion replays with a throwing global random spy and different injected wall clocks (DOM event timestamps are excluded from persisted results), verifies same pairing cannot reset learned rows, exercises concurrent frame correlation, and checks retry bounds and invalid inputs.
