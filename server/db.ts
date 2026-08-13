import { and, desc, eq, gt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { gatewayCommands, gatewaySessions, InsertUser, users } from "../drizzle/schema";
import { ENV } from './_core/env';
import type { AurionCommand } from "./gatewayProtocol";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function createGatewaySession(values: {
  id: string;
  userId: number;
  providerLabel: string;
  tokenDigest: string;
  allowedCommands: string;
  expiresAt: Date;
}) {
  const db = await getDb();
  if (!db) throw new Error("Gateway database is not available");
  await db.insert(gatewaySessions).values(values);
  return getGatewaySessionForUser(values.id, values.userId);
}

export async function getGatewaySessionForUser(id: string, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(gatewaySessions).where(and(eq(gatewaySessions.id, id), eq(gatewaySessions.userId, userId))).limit(1);
  return result[0];
}

export async function listGatewaySessionsForUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(gatewaySessions).where(eq(gatewaySessions.userId, userId)).orderBy(desc(gatewaySessions.createdAt)).limit(12);
}

export async function getActiveGatewaySessionByTokenDigest(tokenDigest: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(gatewaySessions).where(and(eq(gatewaySessions.tokenDigest, tokenDigest), eq(gatewaySessions.status, "active"), gt(gatewaySessions.expiresAt, new Date()))).limit(1);
  return result[0];
}

export async function revokeGatewaySession(id: string, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Gateway database is not available");
  await db.update(gatewaySessions).set({ status: "revoked", revokedAt: new Date() }).where(and(eq(gatewaySessions.id, id), eq(gatewaySessions.userId, userId), eq(gatewaySessions.status, "active")));
}

export async function appendGatewayCommand(values: { gatewaySessionId: string; sequence: number; command: AurionCommand }) {
  const db = await getDb();
  if (!db) throw new Error("Gateway database is not available");
  const latest = await db.select({ sequence: gatewayCommands.sequence }).from(gatewayCommands).where(eq(gatewayCommands.gatewaySessionId, values.gatewaySessionId)).orderBy(desc(gatewayCommands.sequence)).limit(1);
  if (latest[0] && values.sequence <= latest[0].sequence) return { accepted: false as const, reason: "sequence_not_increasing" };
  await db.insert(gatewayCommands).values({ id: `agc_${crypto.randomUUID().replaceAll("-", "")}`, ...values });
  return { accepted: true as const };
}

export async function listGatewayCommandsAfter(gatewaySessionId: string, afterSequence: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(gatewayCommands).where(and(eq(gatewayCommands.gatewaySessionId, gatewaySessionId), gt(gatewayCommands.sequence, afterSequence))).orderBy(gatewayCommands.sequence).limit(40);
}
