import { createClient } from "redis";

async function checkRedis() {
  const url = process.env.REDIS_URL;
  if (!url) return { status: "MAINTAINED", reason: "REDIS_URL not configured" };
  try {
    const client = createClient({ url });
    await client.connect();
    await client.ping();
    await client.quit();
    return { status: "UP" };
  } catch (err: any) {
    return { status: "DOWN", reason: err.message };
  }
}
