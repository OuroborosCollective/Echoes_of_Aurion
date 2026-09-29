## 2025-05-15 - Add clockwork_woods zone to HUD enum
**Learning:** The frontend HUD uses a Zod enum to strictly validate the zoneId from the server readback (in `ax1WorldHudSchema`). When extending backend systems with new zones like `clockwork_woods`, this explicit client-side readback projection schema must also be updated.
**Action:** Always search for `zoneId: z.enum` or similar explicit schema definitions in the frontend (e.g., `AurionAuthorityHud.tsx`) when adding new gameplay zones to the server protocol.
