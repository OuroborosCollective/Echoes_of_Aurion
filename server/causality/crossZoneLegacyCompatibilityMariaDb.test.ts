import { describe, expect, it } from "vitest";
import mysql from "mysql2/promise";
import { AurionCrossZoneSynchronizationService } from "./crossZoneSynchronizationService";

const suite = process.env.NODE_ENV === "test" &&
  process.env.AURION_CROSS_ZONE_LEGACY_E2E === "1" &&
  process.env.DATABASE_URL ? describe : describe.skip;

suite("Cross-zone legacy rollout compatibility on pre-0051 schema", () => {
  it("uses only pre-0051 columns for legacy initiate/read/consume", async () => {
    const url = new URL(process.env.DATABASE_URL!);
    expect(url.pathname).toMatch(/_test$/);
    const connection = await mysql.createConnection(process.env.DATABASE_URL!);
    try {
      const [columns] = await connection.query<any[]>(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='aurionCrossZoneTransfers' ORDER BY ORDINAL_POSITION",
      );
      const names = columns.map(row => row.COLUMN_NAME);
      expect(names).toContain("transferHash");
      expect(names).not.toContain("handoverVersion");
      expect(names).not.toContain("transferReceiptHash");
      await connection.query("DELETE FROM aurionCrossZoneTransfers");

      const service = new AurionCrossZoneSynchronizationService();
      const id = await service.initiateTransfer(
        "echoes-of-aurion-global",
        "observatory_threshold",
        77,
        "echoes-of-aurion-global",
        "windhollow",
        {
          schema: "aurion.transfer.payload.v1",
          entityId: "player:23999",
          kind: "player",
          data: { userId: 23999 },
        },
      );
      const pending = await service.getPendingInboundTransfers("echoes-of-aurion-global", "windhollow");
      expect(pending).toHaveLength(1);
      expect(pending[0]).toMatchObject({ id, status: "PENDING", sourceTick: 77 });

      await service.consumeTransfers([id], 88);
      expect(await service.getPendingInboundTransfers("echoes-of-aurion-global", "windhollow")).toEqual([]);
      const [rows] = await connection.query<any[]>(
        "SELECT status,targetTick FROM aurionCrossZoneTransfers WHERE id=?",
        [id],
      );
      expect(rows).toEqual([expect.objectContaining({ status: "CONSUMED", targetTick: 88 })]);
    } finally {
      await connection.end();
    }
  });
});
