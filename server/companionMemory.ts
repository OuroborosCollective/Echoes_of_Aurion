import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { closeOptionalRedis, connectOptionalRedis, redisTimeoutMs, withRedisDeadline, type OptionalRedisClient } from "./optionalRedis";
import { createHash } from "node:crypto";
import { COMPANION_FEATURE_VECTOR_LENGTH, COMPANION_STATE_VECTOR_LENGTH } from "@shared/companionLearningProtocol";

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
  if (value && typeof value === "object") return `{${Object.keys(value as Record<string, unknown>).sort((a, b) => a.localeCompare(b)).map(key => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function safeSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._:-]/g, "_").slice(0, 128);
}

function validateObservation(observation: CompanionMemoryObservation): void {
  if (!observation.sessionId.trim() || !/^[A-Za-z0-9._:-]{8,128}$/.test(observation.sampleId)) throw new Error("Companion memory identity is missing");
  if (!Number.isInteger(observation.sequenceIndex) || observation.sequenceIndex < 0 || !Number.isInteger(observation.timestampEpoch) || observation.timestampEpoch <= 0) throw new Error("Companion memory sequence is invalid");
  if (observation.featureVector.length !== COMPANION_FEATURE_VECTOR_LENGTH || !observation.featureVector.every(Number.isFinite)) throw new Error("Companion memory feature vector is invalid");
  if (observation.targetAction.length !== 4 || !observation.targetAction.every(value => Number.isFinite(value) && value >= 0 && value <= 1)) throw new Error("Companion memory target action is invalid");
  if (observation.stateVector.length !== COMPANION_STATE_VECTOR_LENGTH || !observation.stateVector.every(Number.isFinite)) throw new Error("Companion memory state vector is invalid");
  if (observation.stateMask.length !== COMPANION_STATE_VECTOR_LENGTH || !observation.stateMask.every(value => value === 0 || value === 1)) throw new Error("Companion memory state mask is invalid");
  if (observation.note.length > 280) throw new Error("Companion memory note is too long");
}

export class CompanionMemoryStore {
  private readonly dataDir: string;
  private readonly redisUrl?: string;
  private readonly redisTimeout: number;
  private redis?: OptionalRedisClient;
  private redisPromise?: Promise<OptionalRedisClient | undefined>;
  private redisUnavailable = false;
  private closed = false;

  constructor(options: { dataDir?: string; redisUrl?: string; redisTimeoutMs?: number } = {}) {
    this.dataDir = path.resolve(options.dataDir ?? process.env.COMPANION_MEMORY_DIR ?? "./data/companion-memory");
    this.redisUrl = (options.redisUrl ?? process.env.REDIS_URL)?.trim() || undefined;
    this.redisTimeout = redisTimeoutMs(options.redisTimeoutMs);
  }

  private async getRedis(): Promise<OptionalRedisClient | undefined> {
    if (!this.redisUrl || this.redisUnavailable || this.closed) return undefined;
    if (this.redis?.isReady) return this.redis;
    if (!this.redisPromise) {
      this.redisPromise = (async () => {
        try {
          const client = await connectOptionalRedis(this.redisUrl!, this.redisTimeout);
          if (this.closed) {
            await closeOptionalRedis(client);
            return undefined;
          }
          this.redis = client;
          return client;
        } catch {
          this.redisUnavailable = true;
          console.warn("[Companion memory] Redis unavailable; local memory remains active");
          return undefined;
        }
      })();
    }
    return this.redisPromise;
  }

  async append(userId: number, observation: CompanionMemoryObservation): Promise<{ stored: true; local: true; redis: boolean; memoryHash: string }> {
    if (!Number.isInteger(userId) || userId < 1) throw new Error("Companion memory userId is invalid");
    validateObservation(observation);
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
      try {
        const added = await withRedisDeadline(redis, () => redis.set(key, serialized.trim(), { NX: true }), this.redisTimeout);
        redisStored = added === "OK";
      } catch {
        this.redisUnavailable = true;
        console.warn("[Companion memory] Redis replication unavailable; local memory remains active");
      }
    }
    return { stored: true, local: true, redis: redisStored, memoryHash: createHash("sha256").update(serialized).digest("hex") };
  }

  async close(): Promise<void> {
    this.closed = true;
    const client = this.redis ?? await this.redisPromise;
    await closeOptionalRedis(client);
  }
}
