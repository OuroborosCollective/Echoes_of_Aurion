# Confirmed multiplayer projection

This slice connects existing Aurion zone snapshots to visible remote-player meshes and the authoritative HUD/atlas. It does not create simulated names, levels, equipment, hit points or group memberships.

- One instanced capsule mesh renders at most 127 other accounts from a maximum 128-user zone. Account identities determine display-only tint. Positions remain server fixed-point coordinates, projected onto terrain for rendering.
- Snapshot validation requires canonical player identities, unique users, safe integer sequences/ticks, valid position bounds and bounded payload/count. The transport waits for the authenticated welcome and rejects duplicate or older snapshots.
- A newly authenticated reconnect supersedes that user's old zone connection. Leaving the old connection cannot remove its successor. Capacity fails closed before adding another user.
- A generation-owned renderer applies complete validated snapshots, removes departed actors, clears on disconnect and disposes instanced resources once. Invalid terrain/snapshot input cannot partially update it.
- Presence persistence admits only one in-flight refresh. Closing waits for that write before releasing the lease, preventing late writes from resurrecting disconnected presence. A socket closed during the asynchronous ticket/lease handshake cannot leave an active player behind.

Validation includes real gateway registration/release, delayed-write ordering and failure, snapshot ordering/size/identity bounds, duplicate-user replacement, mesh ownership and atomic projection. The isolated browser/MariaDB workflow additionally creates two separate accounts through the registration UI, verifies reciprocal actor counts and replicated movement, checks the database presence, reads the other actor in the atlas and verifies departure removal. That browser result remains pending until CI passes.

The capsules are explicit fallback actor visuals; remote profile/GLB appearance, full party role queues and instanced dungeon membership remain separate migrations. This is not a production device or dungeon-completion proof.
