import { createServer, type Socket } from "node:net";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createClient } from "redis";
import { afterEach, describe, expect, it } from "vitest";
import { CompanionMemoryStore } from "./companionMemory";
import { closeOptionalRedis, optionalRedisStatus, redisTimeoutMs } from "./optionalRedis";

const cleanup: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

function observation(sequenceIndex = 0) {
  return {
    sessionId: "redis_socket_regression", sequenceIndex, timestampEpoch: 1,
    sampleId: `redis_sample_${sequenceIndex}`, featureVector: Array(16).fill(0.25),
    targetAction: [0.5, 0.25, 1, 1] as [number, number, number, number],
    stateVector: [1, 1, 1, 0, 0, 1], stateMask: [1, 1, 1, 1, 1, 1], note: "socket regression",
  };
}

async function memoryStore(redisUrl: string) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "aurion-redis-test-"));
  cleanup.push(() => rm(dir, { recursive: true, force: true }));
  const store = new CompanionMemoryStore({ dataDir: dir, redisUrl, redisTimeoutMs: 100 });
  cleanup.push(() => store.close());
  return { store, dir };
}

// External protocol fixture: real sockets and the actual pinned node-redis client.
// This is regression evidence, not a claim about the production Redis service.
async function endpoint(stall: "all" | "PING" | "SET" | "none") {
  const sockets = new Set<Socket>();
  const commands: string[] = [];
  let accepted = 0;
  const server = createServer(socket => {
    accepted++;
    sockets.add(socket);
    socket.on("error", () => {});
    socket.on("close", () => sockets.delete(socket));
    let buffer = Buffer.alloc(0);
    socket.on("data", data => {
      buffer = Buffer.concat([buffer, data]);
      while (buffer.length) {
        const headerEnd = buffer.indexOf("\r\n");
        if (headerEnd < 0) return;
        const count = Number(buffer.subarray(1, headerEnd).toString());
        let cursor = headerEnd + 2;
        const args: string[] = [];
        for (let index = 0; index < count; index++) {
          const end = buffer.indexOf("\r\n", cursor);
          if (end < 0) return;
          const length = Number(buffer.subarray(cursor + 1, end).toString());
          cursor = end + 2;
          if (buffer.length < cursor + length + 2) return;
          args.push(buffer.subarray(cursor, cursor + length).toString());
          cursor += length + 2;
        }
        buffer = buffer.subarray(cursor);
        const command = (args[0] ?? "").toUpperCase();
        commands.push(command);
        if (stall === "all" || stall === command) continue;
        socket.write(command === "PING" ? "+PONG\r\n" : "+OK\r\n");
      }
    });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test endpoint failed");
  cleanup.push(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });
  return {
    url: `redis://127.0.0.1:${address.port}`, commands, sockets,
    accepted: () => accepted,
  };
}

describe("optional Redis failure boundaries", () => {
  it("reports blank configuration as intentionally unconfigured", async () => {
    expect(await optionalRedisStatus("  ")).toMatchObject({ status: "MAINTAINED" });
    const { store } = await memoryStore("");
    expect(await store.append(7, observation())).toMatchObject({ local: true, redis: false });
  });

  it("validates operation budgets", () => {
    for (const invalid of [0, -1, NaN, Infinity, 0.5, 5001]) expect(() => redisTimeoutMs(invalid)).toThrow();
    expect(redisTimeoutMs()).toBe(1500);
  });

  it("bounds a silent handshake and closes the failed socket", async () => {
    const peer = await endpoint("all");
    expect(await optionalRedisStatus(peer.url, 50)).toMatchObject({ status: "DOWN" });
    await new Promise(resolve => setTimeout(resolve, 25));
    expect(peer.sockets.size).toBe(0);
    expect(peer.accepted()).toBe(1);
  });

  it("bounds PING after a successful handshake without leaking a client", async () => {
    const peer = await endpoint("PING");
    expect(await optionalRedisStatus(peer.url, 50)).toMatchObject({ status: "DOWN" });
    expect(peer.commands).toContain("PING");
    await new Promise(resolve => setTimeout(resolve, 25));
    expect(peer.sockets.size).toBe(0);
  });

  it("returns a locally persisted append when SET never replies, then stays local", async () => {
    const peer = await endpoint("SET");
    const { store, dir } = await memoryStore(peer.url);
    expect(await store.append(7, observation())).toMatchObject({ stored: true, local: true, redis: false });
    expect(await store.append(7, observation(1))).toMatchObject({ local: true, redis: false });
    const rows = (await readFile(path.join(dir, "user-7", "redis_socket_regression.jsonl"), "utf8")).trim().split("\n");
    expect(rows).toHaveLength(2);
    expect(peer.commands.filter(command => command === "SET")).toHaveLength(1);
    expect(peer.accepted()).toBe(1);
  });

  it("shares one in-flight connection across concurrent independent local writes", async () => {
    const peer = await endpoint("none");
    const { store } = await memoryStore(peer.url);
    const results = await Promise.all(Array.from({ length: 8 }, (_, index) => store.append(index + 1, observation())));
    expect(results.every(result => result.redis)).toBe(true);
    expect(peer.accepted()).toBe(1);
    await store.close();
    expect(peer.commands).not.toContain("QUIT");
  });

  it("closes an in-flight connect and starts no Redis work after close", async () => {
    const peer = await endpoint("all");
    const { store } = await memoryStore(peer.url);
    const append = store.append(7, observation());
    // Wait until the real socket has been accepted rather than assuming fs timing.
    for (let attempt = 0; attempt < 100 && peer.accepted() === 0; attempt++) await new Promise(resolve => setTimeout(resolve, 2));
    await store.close();
    expect(await append).toMatchObject({ local: true, redis: false });
    expect(await store.append(7, observation(1))).toMatchObject({ local: true, redis: false });
    expect(peer.accepted()).toBe(1);
  });

  it("never returns a private invalid connection string in health errors", async () => {
    const result = await optionalRedisStatus("unsupported://private-endpoint.invalid:6379", 50);
    expect(result).toMatchObject({ status: "DOWN", reason: "Redis unavailable or timed out" });
    expect(JSON.stringify(result)).not.toContain("private-endpoint");
  });

  it("reports successful PING and closes without waiting for QUIT", async () => {
    const peer = await endpoint("none");
    expect(await optionalRedisStatus(peer.url, 100)).toMatchObject({ status: "UP" });
    expect(peer.commands).toContain("PING");
    expect(peer.commands).not.toContain("QUIT");
  });

  it.skipIf(!process.env.AURION_REDIS_TEST_BINARY)("replicates and independently reads back from a real Redis process", async () => {
    const reservation = createServer();
    await new Promise<void>(resolve => reservation.listen(0, "127.0.0.1", resolve));
    const address = reservation.address();
    if (!address || typeof address === "string") throw new Error("port reservation failed");
    await new Promise<void>(resolve => reservation.close(() => resolve()));
    const child = spawn(process.env.AURION_REDIS_TEST_BINARY!, ["--bind", "127.0.0.1", "--port", String(address.port), "--save", "", "--appendonly", "no"], { stdio: ["ignore", "pipe", "pipe"] });
    cleanup.push(async () => { if (child.exitCode === null) { child.kill("SIGTERM"); await once(child, "exit"); } });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Redis test startup timed out")), 5000);
      child.once("error", error => { clearTimeout(timer); reject(error); });
      child.stdout.on("data", data => { if (String(data).includes("Ready to accept connections")) { clearTimeout(timer); resolve(); } });
      child.once("exit", () => { clearTimeout(timer); reject(new Error("Redis test process exited")); });
    });
    const url = `redis://127.0.0.1:${address.port}`;
    const inspector = createClient({ url, socket: { reconnectStrategy: false, connectTimeout: 1000 } });
    inspector.on("error", () => {});
    await inspector.connect();
    cleanup.push(() => closeOptionalRedis(inspector));
    const { store, dir } = await memoryStore(url);
    expect(await optionalRedisStatus(url)).toMatchObject({ status: "UP" });
    const result = await store.append(7, observation());
    expect(result.redis).toBe(true);
    const local = (await readFile(path.join(dir, "user-7", "redis_socket_regression.jsonl"), "utf8")).trim();
    const redis = await inspector.get("aurion:companion:memory:7:redis_socket_regression:0");
    expect(redis).toBe(local);
    await store.close();
    for (let index = 0; index < 5; index++) expect(await optionalRedisStatus(url)).toMatchObject({ status: "UP" });
    await new Promise(resolve => setTimeout(resolve, 25));
    expect(await inspector.info("clients")).toMatch(/connected_clients:1\r?\n/);
    await closeOptionalRedis(inspector);
    child.kill("SIGTERM");
    await once(child, "exit");
    const offline = await memoryStore(url);
    expect(await offline.store.append(7, observation())).toMatchObject({ local: true, redis: false });
  }, 10000);
});
