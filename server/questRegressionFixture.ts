import { createPool, type RowDataPacket } from "mysql2/promise";
/** Destructive fixture cleanup is permitted only in the explicitly enabled local test database. */
export async function cleanupQuestRegressionUser(userId: number) {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (process.env.AURION_ENCOUNTER_E2E !== "1" || url.hostname !== "127.0.0.1" || !url.pathname.endsWith("_test")) throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
  const pool = createPool(process.env.DATABASE_URL!);
  try {
    const [rows] = await pool.query<RowDataPacket[]>("SELECT DATABASE() AS name");
    if (rows[0]?.name !== url.pathname.slice(1)) throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
    await pool.query("DELETE FROM itemInstances WHERE ownerUserId=?", [userId]);
    for (const table of ["aurionScopedMasteryEvents","skillProgressionEvents","weaponMasteryReceipts","lootDropReceipts","expeditionResultReceipts","progressionLedger","gameplayActionReceipts","gameplaySessions","gameplayQuestProgress","gameplayDungeonKeys","weaponLoadouts","weaponMasteries","playerProfiles"]) await pool.query(`DELETE FROM ${table} WHERE userId=?`,[userId]);
  } finally { await pool.end(); }
}
