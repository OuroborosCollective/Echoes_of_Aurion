import express from "express";
import { once } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGlbZipPreAuth, GLB_ZIP_UPLOAD_PATH } from "./glbZipUpload";

const servers: Array<ReturnType<express.Express["listen"]>> = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
});

async function serverWithActor(
  authenticate: (request: express.Request) => Promise<{ id: number; role: "user" | "admin" } | null>,
) {
  const app = express();
  app.post(
    GLB_ZIP_UPLOAD_PATH,
    createGlbZipPreAuth({ authenticate }),
    express.raw({ type: "application/zip", limit: "768mb" }),
    (request, response) => {
      response.json({
        parsed: Buffer.isBuffer(request.body),
        bytes: request.body?.length ?? 0,
        actorId: response.locals.glbZipUploader?.id ?? null,
      });
    },
  );
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("ZIP_TEST_TCP_LISTEN_FAILED");
  return `http://127.0.0.1:${address.port}`;
}

const sendZip = (base: string) => fetch(base + GLB_ZIP_UPLOAD_PATH, {
  method: "POST",
  headers: { "Content-Type": "application/zip" },
  body: Buffer.alloc(16, 0x4a),
});

describe("GLB ZIP pre-body authorization", () => {
  it("rejects anonymous requests before buffering the ZIP body", async () => {
    const authenticate = vi.fn(async (request: express.Request) => {
      expect(request.body).toBeUndefined();
      return null;
    });
    const base = await serverWithActor(authenticate);
    const response = await sendZip(base);
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "GLB_AUTHENTICATION_REQUIRED" });
    expect(authenticate).toHaveBeenCalledOnce();
  });

  it("rejects non-admin actors before buffering the ZIP body", async () => {
    const authenticate = vi.fn(async (request: express.Request) => {
      expect(request.body).toBeUndefined();
      return { id: 8, role: "user" as const };
    });
    const base = await serverWithActor(authenticate);
    const response = await sendZip(base);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "GLB_ADMIN_REQUIRED" });
    expect(authenticate).toHaveBeenCalledOnce();
  });

  it("allows an authenticated admin to enter the raw parser with bound identity", async () => {
    const authenticate = vi.fn(async (request: express.Request) => {
      expect(request.body).toBeUndefined();
      return { id: 7, role: "admin" as const };
    });
    const base = await serverWithActor(authenticate);
    const response = await sendZip(base);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ parsed: true, bytes: 16, actorId: 7 });
    expect(authenticate).toHaveBeenCalledOnce();
  });
});
