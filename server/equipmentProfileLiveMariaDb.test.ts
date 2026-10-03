import { createServer } from "node:http";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { once } from "node:events";
import { createPool, type Pool } from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { users, playerProfiles } from "../drizzle/schema";
import { getDb, issueZoneConnectionTicket } from "./db";
import { ax1StarterItemId, ensureAx1StarterEquipment } from "./ax1StarterEquipmentPersistence";
import { equipPlayerItem, unequipPlayerItem } from "./playerUiPersistence";
import { consumeZoneTicketWithCombatProfile } from "./zoneCombatPersistence";
import { enqueuePendingEquipmentProfiles } from "./aurionEquipmentProfilePersistence";
import { registerZoneGateway } from "./zoneGateway";
import { globalZoneRegistry } from "./zoneRuntime";
import { globalTickRecorder } from "./causality/tickRecorder";
import { ZONE_PROTOCOL_VERSION } from "../shared/zonePresenceContract";
import { appRouter } from "./routers";

const suite = process.env.DATABASE_URL?.endsWith("/aurion_equipment_live_test") ? describe : describe.skip;
const userId = 771001;
const starter = { id: ax1StarterItemId(userId), version: "ax1_starter" as const };
const httpApp = express();
httpApp.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext: async () => ({ user: { id: userId }, req: {}, res: {} }) as any }));
const server = createServer(httpApp);
let pool: Pool;
let gateway: ReturnType<typeof registerZoneGateway> | undefined;
let socket: WebSocket | undefined;
const messages: any[] = [];
async function until(predicate: () => boolean) {
  for (let i = 0; i < 200; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 20)); }
  throw new Error("LIVE_EQUIPMENT_READBACK_TIMEOUT");
}
async function clean() {
  await pool.query("DROP TRIGGER IF EXISTS equipment_abort_receipt");
  for (const [table, column] of [["aurionEquipmentProfileReceipts", "userId"], ["zoneConnectionTickets", "userId"], ["aurionEquipmentSlots", "userId"], ["aurionAx1StarterEquipmentStates", "userId"], ["aurionAx1StarterEquipmentReceipts", "userId"], ["aurionPlayerUiSettings", "userId"], ["weaponLoadouts", "userId"], ["playerProfiles", "userId"], ["users", "id"]]) {
    await pool.query(`DELETE FROM \`${table}\` WHERE \`${column}\` IN (?,?)`, [userId, userId + 1]);
  }
  await pool.query("DELETE FROM aurionCausalTickReceipts WHERE zoneId='observatory_threshold'");
  await pool.query("DELETE FROM aurionCausalCheckpoints WHERE zoneId='observatory_threshold'");
}
async function rows() {
  const [rows] = await pool.query("SELECT * FROM aurionEquipmentProfileReceipts WHERE userId=? ORDER BY LENGTH(revisionExact),revisionExact", [userId]);
  return rows as any[];
}
suite("live equipment authority on real MariaDB and the existing socket", () => {
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (url.hostname !== "127.0.0.1" || url.pathname !== "/aurion_equipment_live_test") throw new Error("ISOLATED_EQUIPMENT_DATABASE_REQUIRED");
    pool = createPool(process.env.DATABASE_URL!); await clean();
    const db = (await getDb())!;
    await db.insert(users).values([userId, userId + 1].map(id => ({ id, openId: `local:equipment_live_${id}` })));
    await db.insert(playerProfiles).values([userId, userId + 1].map(userId => ({ userId, level: 1 })));
    await ensureAx1StarterEquipment(userId);
  });
  afterAll(async () => {
    if (socket && socket.readyState !== WebSocket.CLOSED) { socket.close(); await once(socket, "close"); }
    gateway?.close(); if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
    await globalTickRecorder.flushPersistence();
    if (pool) { await clean(); await pool.end(); }
  });
  it("commits receipts atomically, changes combat without rejoining, and safely retries/reorders real outbox deliveries", async () => {
    // Inject a DB failure after the equipment writes, before the mutation receipt commits.
    await pool.query("CREATE TRIGGER equipment_abort_receipt BEFORE INSERT ON aurionEquipmentProfileReceipts FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='equipment rollback proof'");
    await expect(unequipPlayerItem(userId, starter)).rejects.toThrow();
    await pool.query("DROP TRIGGER equipment_abort_receipt");
    expect(await rows()).toHaveLength(0);
    const [rolledBack] = await pool.query("SELECT p.equipmentRevisionExact,p.inventoryRevisionExact,s.status FROM playerProfiles p JOIN aurionAx1StarterEquipmentStates s ON p.userId=s.userId WHERE p.userId=?", [userId]);
    expect(rolledBack).toEqual([expect.objectContaining({ equipmentRevisionExact: "0", inventoryRevisionExact: "0", status: "equipped" })]);

    gateway = registerZoneGateway(server, undefined, consumeZoneTicketWithCombatProfile);
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    const address = server.address() as { port: number };
    const ticket = await issueZoneConnectionTicket({ userId, zoneId: "observatory_threshold", clientBuild: "equipment-live-proof" });
    socket = new WebSocket(`ws://127.0.0.1:${address.port}/v1/ws`, { origin: "http://localhost" });
    socket.on("message", raw => messages.push(JSON.parse(String(raw))));
    await once(socket, "open");
    socket.send(JSON.stringify({ type: "hello", ...ticket, protocolVersion: ZONE_PROTOCOL_VERSION }));
    await until(() => messages.some(message => message.type === "welcome"));
    const welcome = messages.find(message => message.type === "welcome");
    const zone = globalZoneRegistry.get("observatory_threshold");
    const player = () => zone.getCanonicalZoneState().players.find(player => player.userId === userId)!;
    expect(player()).toMatchObject({ weaponEquipped: true, weaponBonus: 15, equipmentRevisionExact: "0" });

    // Drop the first post-commit delivery; the persisted outbox must repair it.
    const droppedDelivery = vi.spyOn(zone, "enqueueEquipmentProfile").mockImplementationOnce(() => {});
    await unequipPlayerItem(userId, starter);
    expect(droppedDelivery.mock.calls.length).toBeGreaterThan(1);
    droppedDelivery.mockRestore();
    expect(zone.connectionIdForUser(userId)).toBe(welcome.connectionId);
    expect(player()).toMatchObject({ weaponEquipped: false, weaponBonus: 0, equipmentRevisionExact: "1", maxHealth: 520 });
    const first = (await rows())[0]!;
    expect(first.appliedCausalReceiptHash).toMatch(/^sha256:/);
    const [causal] = await pool.query("SELECT inputJson FROM aurionCausalTickReceipts WHERE receiptHash=?", [first.appliedCausalReceiptHash]);
    expect((causal as any[])).toHaveLength(1);
    expect(JSON.parse((causal as any[])[0].inputJson)).toEqual(expect.arrayContaining([expect.objectContaining({ type: "equipment_profile", entityId: `player:${userId}`, clientSeq: 0, receipt: expect.objectContaining({ id: first.id, hash: first.receiptHash }) })]));

    socket.send(JSON.stringify({ type: "move", clientSeq: 1, input: { x: 0, z: -1 } }));
    await until(() => player().z < -1_500);
    socket.send(JSON.stringify({ type: "move", clientSeq: 2, input: { x: 0, z: 0 } }));
    await until(() => player().lastAcceptedClientSeq === 2);
    let seq = 3;
    for (let i = 0; i < 20 && !messages.some(message => message.type === "combat" && message.attackerEntityId === `player:${userId}` && message.hit); i++) {
      const before = messages.filter(message => message.type === "combat" && message.attackerEntityId === `player:${userId}`).length;
      socket.send(JSON.stringify({ type: "attack", clientSeq: seq++, targetEntityId: "mob_12" }));
      await until(() => messages.filter(message => message.type === "combat" && message.attackerEntityId === `player:${userId}`).length > before);
    }
    expect(messages.filter(message => message.type === "combat" && message.attackerEntityId === `player:${userId}` && message.hit)).toEqual(expect.arrayContaining([expect.objectContaining({ damage: 1, skillId: null })]));
    const health = player().health, lastSeq = player().lastAcceptedClientSeq;
    await Promise.all([equipPlayerItem(userId, starter, null), equipPlayerItem(userId, starter, null)]);
    expect(await rows()).toHaveLength(2);
    expect(player()).toMatchObject({ equipmentRevisionExact: "2", weaponEquipped: true, weaponBonus: 15, maxHealth: 540, lastAcceptedClientSeq: lastSeq });
    expect(player().health).toBeLessThanOrEqual(health);
    expect(zone.connectionIdForUser(userId)).toBe(welcome.connectionId);

    // Simulate lost delivery acknowledgment, then independently reload/retry the persisted outbox.
    await pool.query("UPDATE aurionEquipmentProfileReceipts SET appliedCausalReceiptHash=NULL WHERE userId=?", [userId]);
    await enqueuePendingEquipmentProfiles(userId); await enqueuePendingEquipmentProfiles(userId);
    await until(() => zone.getPendingIntents().length === 0);
    await globalTickRecorder.flushPersistence();
    expect((await rows()).every(row => row.appliedCausalReceiptHash)).toBe(true);
    expect(player()).toMatchObject({ equipmentRevisionExact: "2", weaponEquipped: true, weaponBonus: 15 });

    const second = (await rows())[1]!;
    await pool.query("UPDATE aurionEquipmentProfileReceipts SET appliedCausalReceiptHash=NULL,mutationJson=? WHERE id=?", [JSON.stringify({ ...JSON.parse(second.mutationJson), userId: userId + 1 }), second.id]);
    await expect(enqueuePendingEquipmentProfiles(userId)).rejects.toThrow("EQUIPMENT_RECEIPT_HASH_MISMATCH");
    await pool.query("UPDATE aurionEquipmentProfileReceipts SET mutationJson=? WHERE id=?", [second.mutationJson, second.id]);
    socket.send(JSON.stringify({ type: "equipment_profile", clientSeq: seq++, receipt: JSON.parse(second.mutationJson) }));
    await until(() => messages.some(message => message.type === "reject" && message.code === "UNSUPPORTED_ZONE_COMMAND"));
    const injectedHttp = await fetch(`http://127.0.0.1:${address.port}/api/trpc/player.unequipItem`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ json: { ...starter, type: "equipment_profile", weaponBonus: 9999, equipmentRevisionExact: "9" } }),
    });
    expect(injectedHttp.status).toBe(400);
    const caller = appRouter.createCaller({ user: { id: userId }, req: {}, res: {} } as any);
    await expect(caller.player.unequipItem({ ...starter, weaponBonus: 9999, equipmentRevisionExact: "9" } as any)).rejects.toThrow();
    const foreign = appRouter.createCaller({ user: { id: userId + 1 }, req: {}, res: {} } as any);
    await expect(foreign.player.unequipItem(starter)).rejects.toThrow("OWNED_ITEM_REQUIRED");
    expect(player().equipmentRevisionExact).toBe("2");
    const [revisions] = await pool.query("SELECT inventoryRevisionExact,equipmentRevisionExact FROM playerProfiles WHERE userId=?", [userId]);
    expect(revisions).toEqual([expect.objectContaining({ inventoryRevisionExact: "0", equipmentRevisionExact: "2" })]);
    // A fresh join/reconnect reads the durable equipment watermark, without claiming HP checkpoint recovery.
    const freshTicket = await issueZoneConnectionTicket({ userId, zoneId: "observatory_threshold", clientBuild: "equipment-reconnect-proof" });
    expect((await consumeZoneTicketWithCombatProfile(freshTicket))!.combatProfile).toMatchObject({ equipmentRevisionExact: "2", equipmentReceiptHash: second.receiptHash, weaponEquipped: true });
  }, 25_000);
});
