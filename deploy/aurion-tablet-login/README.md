# Private Godot tablet login adapter

This is an optional page inside the existing authenticated noVNC service. It does not alter Aurion's authentication backend, create a new endpoint, relax browser isolation, or grant account access.

The existing Godot client creates its normal PKCE transaction. An operator, acting for the owner, forwards only that client's browser URL to the existing VNC clipboard. The page accepts only the canonical Aurion native-login URL, fetches the existing consent form with the browser's existing same-origin cookie, and requires an explicit normal login confirmation. The original CSRF value is posted to its exact native endpoint. The existing backend issues the one-time callback and Godot's unchanged parser, state binding, PKCE exchange and token authority remain mandatory.

The callback never enters page history, storage, status text, an assistant message, or an application log. It remains in browser/VNC/Godot memory. A bounded, one-attempt operator helper must deliver it into the existing secret Godot field and clear the clipboard. The helper must never print clipboard text, tokens, state, callback queries or private login images. It must stop on success, failure, expiry or cancellation and must not create another login attempt automatically.

`build_page.py` generates a separate optional HTML page and two modules in a new output directory, without changing a live service. It includes `Referrer-Policy: no-referrer` and a CSP with `connect-src 'self' wss://arelogic.space`, `base-uri 'none'` and `form-action 'self'`. Foreign redirects must be blocked. Existing TLS, Basic authentication and exact WebSocket-origin checks remain unchanged. The standard viewer remains available for rollback. Never enable debug logging on this special login page.

`one_attempt.py` is an operator-run helper, not a daemon or service. It validates the active scene, starts at most one requested native attempt, forwards a callback only into that scene's secret field, and exits within the transaction deadline. It logs only fixed phase labels. It does not verify world rendering; that is a separate required readback.

The helper requires `--expected-pid` from an independent readback. Every operation is pinned to that process and the original scene instance; a replacement native transaction stops the helper. Starting a new transaction additionally requires the explicit `--start-new-attempt` option. A denied probe is never bypassed. This code is not an invitation to run the helper without owner authorization.

## Integration scope

The initial public test branch is based on main `e97a0027d69c6a3a3bf32c3590fdcac38b2d114b`, including PR #1320's diagnostics/recovery fixes and PR #1322's Fadenwerk/quest-editor integration. The nine added files do not overlap either integration or open PRs #1321, #1319, #1317 and #1316 as checked on 2026-11-05. Existing server, Godot, schema, deployment service and auth contracts are unchanged. This optional page is not wired into any release or production workflow. No merge or deployment is part of the test-branch approval.

`browser-proof.mjs` runs disposable browser fixtures in GitHub Actions. Fixture success is not a real user login, a live world, or a tablet-device acceptance result. The authenticated real page, real CSRF/Origin boundary, VNC delivery, native session and confirmed live world must be independently read back before claiming success. If any required stage is unavailable, leave activation pending.
