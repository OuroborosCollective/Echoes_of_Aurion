import { afterEach, expect, it } from "vitest";
import express from "express";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { serveAndroidAssetLinks } from "./androidAssetLinks";

let server: Server | undefined;
let directory: string | undefined;
afterEach(async () => {
  if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server!.close(() => resolve())); }
  if (directory) await rm(directory, { recursive: true, force: true });
});
async function start(present: boolean) {
  directory = await mkdtemp(path.join(tmpdir(), "aurion-dal-"));
  await mkdir(path.join(directory, ".well-known"));
  await writeFile(path.join(directory, ".well-known/private.txt"), "not-public");
  if (present) await writeFile(path.join(directory, ".well-known/assetlinks.json"), await readFile("client/public/.well-known/assetlinks.json"));
  const app = express();
  serveAndroidAssetLinks(app, directory);
  app.use(express.static(directory, { dotfiles: "ignore" }));
  app.use((_req, res) => res.type("html").send("SPA fallback"));
  server = await new Promise<Server>(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}
it("serves the actual Login package and independently observed certificate as JSON before the SPA", async () => {
  const base = await start(true);
  const response = await fetch(base + "/.well-known/assetlinks.json");
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toMatch(/^application\/json/);
  expect(await response.json()).toEqual([{ relation: ["delegate_permission/common.handle_all_urls"], target: {
    namespace: "android_app", package_name: "org.ouroboroscollective.aurion.godot.login",
    sha256_cert_fingerprints: ["F2:E8:FA:1E:81:FB:DA:E5:2E:94:00:AF:32:29:A0:47:79:8D:EB:BE:A0:CF:36:80:A0:4B:E6:54:0D:EF:72:0A"],
  } }]);
  expect(await (await fetch(base + "/.well-known/private.txt")).text()).not.toContain("not-public");
});
it("returns a JSON failure rather than a successful SPA document when the association file is absent", async () => {
  const response = await fetch(await start(false) + "/.well-known/assetlinks.json");
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: "ANDROID_ASSET_LINKS_UNAVAILABLE" });
});
