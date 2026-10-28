# Aurion Godot — Mensch + KI Weltstudio (G21 development lane)

This client adds a native **Admin** authoring surface, with existing Aurion server authority only. It does not create world truth, user role, assets or NPCs. The server's `aurionAuthoring` tRPC adminProcedure validates native Bearer credentials, admin role, submitted schema and GLB references.

## Authoring

- A server-confirmed v5 zone must be connected before the editor is configured and opened.
- At viewport widths of at least 960 logical pixels, the Admin editor occupies the right 45% and the confirmed 3D world stays visible on the left; the fullscreen Control ignores game input while its own dock captures authoring input. Below 960 logical pixels the editor uses a full-width mobile fallback. This is UI composition, not new gameplay authority.
- While the editor is open and idle, a 5-second timer may request only authenticated **GET** world-design readback. It pauses during plan/confirmation/unknown Apply state and stops on close or logout. It never issues an automatic `worldApply`; repeated unchanged revisions are not re-projected.
- Catalog → AI draft → human review/edit → server worldPlan SHA-256 → **explicit human confirmation** → one worldApply → separate GET `/api/game/world-design`.
- Any draft edit invalidates the previous plan. A failed/ambiguous apply must not auto-retry.
- A world revision from an apply response is not sufficient; `confirmed_world` emits only after an independent matching GET.
- The 3D scene uses **visibly distinguishable placeholder box meshes**, labelled in metadata, for authorized placements; it does **not** fetch or import GLB models, and is not evidence of live geometry.
- Logout, zone reset, and suspension are session boundaries: in-flight authoring is cancelled and all local world proxies are removed.
- No admin credentials, refresh token, DB access or purchased MCS files are written to project assets.

## Tests and open boundaries

`godot-client/tests/test_world_authoring_contract.gd` checks canonical wire envelope, SHA validation, duplicate IDs, out-of-bound coordinates and readback teardown. Run via the normal SHA-bound `scripts/godot/check.mjs` workflow.

**Still required before a production live multiplayer editor:** side-by-side layout and polling require exact-head headless/GUI/physical-device validation. The read-only GET is admin-authenticated and does not prove non-admin clients receive changed world scenes or models. Other players still need a safe authenticated/authorized world-feed, catalog-backed GLB loading and independent device/multiclient receipt proof.\n\n**Still required before a usable Android editor:** a separate native HTTP fixture covering the actual admin tRPC envelope; authenticated live readback from arelogic.space; SDK/gradle export and sign evidence; Tablet A9 input/layout verification; real catalog-validated GLB world model rendering rather than box proxies. Read-only fixtures cannot prove production deployment. Explicit auth/owner consent is required for live world changes.
