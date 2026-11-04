import { open, readFile, rename, unlink, mkdir } from "node:fs/promises";
import { dirname, isAbsolute } from "node:path";
import { z } from "zod";
import { operationalNow } from "../../shared/operationalClock";
import { FabricError, type Route } from "./policy";

const amount = z.number().int().safe().nonnegative();
const RecordSchema = z.object({
  taskId: z.string(), atMs: amount, route: z.enum(["local", "free", "premium"]), model: z.string(),
  reservedMicros: amount, actualMicros: amount.nullable(), status: z.enum(["reserved", "complete", "unresolved"]),
  inputHash: z.string(), outputHash: z.string().nullable(), sourceRevision: z.string(),
  promptVersion: z.string(), actualModel: z.string().nullable().default(null), provider: z.string().nullable(), tokens: amount.nullable(), validation: z.string(),
}).strict();
export type TaskRecord = z.infer<typeof RecordSchema>;
const StateSchema = z.object({
  version: z.literal(1), spentMicros: amount, blocked: z.boolean(), day: amount, freeAttempts: amount,
  minute: z.array(amount).max(20), cooldowns: z.record(z.string(), amount), records: z.array(RecordSchema).max(1000),
}).strict();
type State = z.infer<typeof StateSchema>;

/** Operational accounting only. All processes must use one persistent path.
 * Lock/unknown state fails closed; never reclaim a possibly live lock or a
 * pending charge on timeout/restart. No world, receipt or gameplay state here. */
export class FabricLedger {
  constructor(readonly file: string, private readonly now = operationalNow) {
    if (!isAbsolute(file)) throw new FabricError("DURABLE_LEDGER_PATH_REQUIRED");
  }
  private async transaction<T>(update: (s: State) => T): Promise<T> {
    await mkdir(dirname(this.file), { recursive: true, mode: 0o700 });
    let lock;
    try { lock = await open(this.file + ".lock", "wx", 0o600); }
    catch { throw new FabricError("LEDGER_LOCKED"); }
    try {
      let state: State;
      try { state = StateSchema.parse(JSON.parse(await readFile(this.file, "utf8"))); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new FabricError("LEDGER_INVALID");
        state = { version: 1, spentMicros: 0, blocked: false, day: Math.floor(this.now() / 86_400_000), freeAttempts: 0, minute: [], cooldowns: {}, records: [] };
      }
      const result = update(state);
      StateSchema.parse(state);
      const temp = await open(this.file + ".next", "w", 0o600);
      try { await temp.writeFile(JSON.stringify(state)); await temp.sync(); } finally { await temp.close(); }
      await rename(this.file + ".next", this.file);
      const directory = await open(dirname(this.file), "r");
      try { await directory.sync(); } finally { await directory.close(); }
      return result;
    } finally { await lock.close(); await unlink(this.file + ".lock"); }
  }
  async reserve(record: Omit<TaskRecord, "atMs" | "actualMicros" | "status" | "outputHash" | "provider" | "tokens" | "validation" | "actualModel">, limitMicros: number, freeDailyLimit: number) {
    return this.transaction(s => {
      const now = this.now();
      if (s.records.some(r => r.taskId === record.taskId)) throw new FabricError("TASK_ALREADY_SUBMITTED");
      if ((s.cooldowns[record.model] ?? 0) > now) throw new FabricError("CIRCUIT_OPEN");
      if (s.blocked) throw new FabricError("COST_UNRESOLVED");
      if (record.route === "premium") {
        if (limitMicros <= 0) throw new FabricError("PREMIUM_NOT_APPROVED");
        if (s.blocked || s.records.some(r => r.status !== "complete")) throw new FabricError("COST_UNRESOLVED");
        if (s.spentMicros + record.reservedMicros > limitMicros) throw new FabricError("BUDGET_EXHAUSTED");
      }
      if (record.route === "free") {
        const day = Math.floor(now / 86_400_000);
        if (day > s.day) { s.day = day; s.freeAttempts = 0; }
        s.minute = s.minute.filter(at => now - at < 60_000);
        if (s.freeAttempts >= freeDailyLimit || s.minute.length >= 20) throw new FabricError("FREE_RATE_LIMIT");
        s.freeAttempts++; s.minute.push(now); // Failed requests also count.
      }
      // Bounded audit storage: explicit rotation needed, never silently erase history.
      if (s.records.length >= 1000) throw new FabricError("LEDGER_CAPACITY");
      const item: TaskRecord = { ...record, atMs: now, actualMicros: null, status: "reserved", outputHash: null, actualModel: null, provider: null, tokens: null, validation: "PENDING" };
      s.records.push(item);
      return item;
    });
  }
  async finish(taskId: string, result: Pick<TaskRecord, "actualMicros" | "outputHash" | "provider" | "tokens" | "validation"> & { actualModel?: string | null }, failed = false) {
    return this.transaction(s => {
      const item = s.records.find(r => r.taskId === taskId);
      if (!item || item.status !== "reserved") throw new FabricError("TASK_NOT_PENDING");
      Object.assign(item, result);
      item.status = result.actualMicros === null ? "unresolved" : "complete";
      if (item.route !== "premium" && result.actualMicros !== null && result.actualMicros > 0) { s.blocked = true; s.spentMicros += result.actualMicros; }
      if (item.route === "premium") {
        if (result.actualMicros === null || result.actualMicros > item.reservedMicros) s.blocked = true;
        s.spentMicros += result.actualMicros ?? item.reservedMicros;
      }
      if (failed) s.cooldowns[item.model] = this.now() + 60_000;
      return { ...item };
    });
  }
  async status(limitMicros: number) {
    return this.transaction(s => ({
      spentMicros: s.spentMicros,
      remainingMicros: Math.max(0, limitMicros - s.spentMicros - s.records.filter(r => r.route === "premium" && r.status === "reserved").reduce((n, r) => n + r.reservedMicros, 0)),
      blocked: s.blocked || s.records.some(r => r.status !== "complete"),
      freeAttempts: Math.floor(this.now() / 86_400_000) > s.day ? 0 : s.freeAttempts,
      freeMinuteAttempts: s.minute.filter(at => this.now() - at < 60_000).length,
      cooldowns: s.cooldowns,
    }));
  }
}
