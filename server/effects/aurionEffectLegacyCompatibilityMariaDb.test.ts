import { describe, expect, it } from "vitest";
import mysql from "mysql2/promise";
import type WebSocket from "ws";
import { AuthoritativeMovementZone } from "../zoneRuntime";
import { globalTickRecorder } from "../causality/tickRecorder";

const suite = process.env.NODE_ENV === "test" &&
  process.env.AURION_EFFECT_LEGACY_E2E === "1" &&
  process.env.DATABASE_URL ? describe : describe.skip;

const socket = { readyState: 1, OPEN: 1, send: () => {}, close: () => {} } as unknown as WebSocket;

suite("Effect journal rollout compatibility on canonical 0051 schema", () => {
  it("keeps the authority tick path operational before 0052 exists", async () => {
    const url = new URL(process.env.DATABASE_URL!);
    expect(url.pathname).toMatch(/_test$/);
    const connection = await mysql.createConnection(process.env.DATABASE_URL!);
    try {
      const [tables] = await connection.query<any[]>(
        "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()",
      );
      const names = tables.map(row => row.TABLE_NAME);
      expect(names).toContain("aurionCausalTickReceipts");
      expect(names).not.toContain("aurionEffectIntents");
      expect(names).not.toContain("aurionEffectDeliveryReceipts");

      const zoneId = "observatory_threshold:pre-0052";
      await connection.query("DELETE FROM aurionCausalCheckpoints WHERE zoneId=?", [zoneId]);
      await connection.query("DELETE FROM aurionCausalTickReceipts WHERE zoneId=?", [zoneId]);
      const zone = new AuthoritativeMovementZone(zoneId as any);
      zone.sourceRevisionOverride = process.env.AURION_RELEASE_SHA ?? "";
      zone.join({ userId: 24_052, socket });
      zone.tick();
      await globalTickRecorder.flushPersistence();

      const [rows] = await connection.query<any[]>(
        "SELECT receiptHash,postStateHash FROM aurionCausalTickReceipts WHERE zoneId=? ORDER BY tick DESC LIMIT 1",
        [zoneId],
      );
      expect(rows).toHaveLength(1);
      expect(String(rows[0]?.receiptHash)).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(String(rows[0]?.postStateHash)).toMatch(/^sha256:[a-f0-9]{64}$/);
    } finally {
      await connection.end();
    }
  });
});
