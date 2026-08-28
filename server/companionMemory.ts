import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "redis";

type RedisConnection = ReturnType<typeof createClient>;
import { createHash } from "node:crypto";

export type CompanionMemoryObservation = {
  sessionId: string;
  sequenceIndex: number;
  timestampEpoch: number;
  sampleId: string;
  featureVector: number[];
  targetAction: [number, number, number, number];
  stateVector: number[];
  stateMask: number[];
  note: string;
};

type MemoryEnvelope = CompanionMemoryObservation & { userId: number; memoryVersion: "aurion-companion-memory.v1" };

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

function safeSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._:-]/g, "_").slice(0, 128);
}

export class CompanionMemoryStore {
  private readonly dataDir: string;
  private readonly redisUrl?: string;
  private redis?: RedisConnection;
  private redisPromise?: Promise<RedisConnection | undefined>;

  constructor(options: { dataDir?: string; redisUrl?: string } = {}) {
    this.dataDir = path.resolve(options.dataDir ?? process.env.COMPANION_MEMORY_DIR ?? "./data/companion-memory");
    this.redisUrl = options.redisUrl ?? process.env.REDIS_URL;
  }

  private async getRedis(): Promise<RedisConnection | undefined> {
    if (!this.redisUrl) return undefined;
    if (this.redis?.isReady) return this.redis;
    if (!this.redisPromise) {
      this.redisPromise = (async () => {
        try {
          const client = createClient({ url: this.redisUrl });
          client.on("error", (error) => console.warn("[Companion memory] Redis unavailable", error instanceof Error ? error.message : error));
          await client.connect();
          this.redis = client;
          return client;
        } catch (error) {
          console.warn("[Companion memory] Redis connection failed; local memory remains active", error instanceof Error ? error.message : error);
          return undefined;
        }
      })();
    }
    return this.redisPromise;
  }

  async append(userId: number, observation: CompanionMemoryObservation): Promise<{ stored: true; local: true; redis: boolean; memoryHash: string }> {
    if (!Number.isInteger(userId) || userId < 1) throw new Error("Companion memory userId is invalid");
    if (!observation.sessionId.trim() || !observation.sampleId.trim()) throw new Error("Companion memory identity is missing");
    const envelope: MemoryEnvelope = { ...observation, userId, memoryVersion: "aurion-companion-memory.v1" };
    const serialized = `${canonicalJson(envelope)}\n`;
    const userDir = path.join(this.dataDir, `user-${userId}`);
    await mkdir(userDir, { recursive: true });
    const filePath = path.join(userDir, `${safeSegment(observation.sessionId)}.jsonl`);
    const existing = await readFile(filePath, "utf8").catch((error: { code?: string }) => error.code === "ENOENT" ? "" : Promise.reject(error));
    if (!existing.split("\n").some((line) => line.includes(`\"sampleId\":\"${observation.sampleId}\"`))) await appendFile(filePath, serialized, "utf8");
    const redis = await this.getRedis();
    let redisStored = false;
    if (redis) {
      const key = `aurion:companion:memory:${userId}:${safeSegment(observation.sessionId)}:${observation.sequenceIndex}`;
      const added = await redis.set(key, serialized.trim(), { NX: true });
      redisStored = added === "OK" || added === null;
    }
    return { stored: true, local: true, redis: redisStored, memoryHash: createHash("sha256").update(serialized).digest("hex") };
  }

  async close(): Promise<void> {
    if (this.redis?.isOpen) await this.redis.quit();
  }
}
