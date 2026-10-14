import { createClient } from "redis";

export type OptionalRedisClient = ReturnType<typeof createClient>;
export const OPTIONAL_REDIS_TIMEOUT_MS = 1500;

export function redisTimeoutMs(value = OPTIONAL_REDIS_TIMEOUT_MS): number {
  if (!Number.isInteger(value) || value < 1 || value > 5000) {
    throw new Error("Optional Redis timeout is invalid");
  }
  return value;
}

export async function closeOptionalRedis(client?: OptionalRedisClient): Promise<void> {
  if (!client?.isOpen) return;
  try {
    // node-redis 4.x disconnect closes the socket without waiting for a QUIT reply.
    await client.disconnect();
  } catch {
    // Concurrent failures can have already closed the same optional connection.
  }
}

export async function withRedisDeadline<T>(
  client: OptionalRedisClient,
  operation: () => Promise<T>,
  timeoutMs = OPTIONAL_REDIS_TIMEOUT_MS,
): Promise<T> {
  const timeout = redisTimeoutMs(timeoutMs);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("OPTIONAL_REDIS_UNAVAILABLE")), timeout);
      }),
    ]);
  } catch {
    await closeOptionalRedis(client);
    // Driver errors may contain private addresses or connection credentials.
    throw new Error("OPTIONAL_REDIS_UNAVAILABLE");
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function connectOptionalRedis(
  url: string,
  timeoutMs = OPTIONAL_REDIS_TIMEOUT_MS,
): Promise<OptionalRedisClient> {
  const timeout = redisTimeoutMs(timeoutMs);
  let client: OptionalRedisClient | undefined;
  try {
    client = createClient({
      url,
      socket: { connectTimeout: timeout, reconnectStrategy: false },
      disableOfflineQueue: true,
      commandsQueueMaxLength: 64,
    });
    // Observe required error events without repeating private driver text in logs.
    client.on("error", () => {});
    await withRedisDeadline(client, () => client!.connect(), timeout);
    return client;
  } catch {
    await closeOptionalRedis(client);
    throw new Error("OPTIONAL_REDIS_UNAVAILABLE");
  }
}

export async function optionalRedisStatus(
  redisUrl: string | undefined,
  timeoutMs = OPTIONAL_REDIS_TIMEOUT_MS,
): Promise<{ service: string; status: "UP" | "DOWN" | "MAINTAINED"; reason?: string }> {
  const service = "Redis (Cache & PubSub)";
  const url = redisUrl?.trim();
  if (!url) return { service, status: "MAINTAINED", reason: "REDIS_URL environment variable not configured" };
  let client: OptionalRedisClient | undefined;
  try {
    client = await connectOptionalRedis(url, timeoutMs);
    await withRedisDeadline(client, () => client!.ping(), timeoutMs);
    return { service, status: "UP" };
  } catch {
    return { service, status: "DOWN", reason: "Redis unavailable or timed out" };
  } finally {
    await closeOptionalRedis(client);
  }
}
