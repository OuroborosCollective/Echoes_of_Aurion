import type { Express } from "express";
import { ENV } from "./env";
import { sdk } from "./sdk";
import { getDb } from "../db";
import { glbAssetSubmissions } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { mayPresignSubmissionKey } from "./storageAccessPolicy";

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    // Forge signs object keys with a privileged credential: check exact
    // player submission visibility/ownership before requesting a signed URL.
    // Public legacy art keys keep their existing anonymous access contract.
    if (key.startsWith("aurion/submissions/glb/")) {
      let requesterUserId: number | null = null;
      try {
        const user = await sdk.authenticateRequest(req);
        requesterUserId = user?.id ?? null;
      } catch {
        // A missing login is not an error for public submissions.
      }
      try {
        const allowed = await mayPresignSubmissionKey(key, requesterUserId, async storageKey => {
          const database = await getDb();
          if (!database) return null;
          const [submission] = await database.select({
            ownerId: glbAssetSubmissions.submittedByUserId,
            visibility: glbAssetSubmissions.visibility,
          }).from(glbAssetSubmissions).where(eq(glbAssetSubmissions.storageKey, storageKey)).limit(1);
          return submission ?? null;
        });
        if (!allowed) {
          res.status(404).send("Storage object not found");
          return;
        }
      } catch (error) {
        console.error("[StorageProxy] submission authorization unavailable:", error);
        res.status(503).send("Storage authorization unavailable");
        return;
      }
    } else if (!await mayPresignSubmissionKey(key, null, async () => null)) {
      res.status(400).send("Invalid storage key");
      return;
    }

    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }

    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/",
      );
      forgeUrl.searchParams.set("path", key);

      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
      });

      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }

      const { url } = (await forgeResp.json()) as { url: string };
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }

      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}
