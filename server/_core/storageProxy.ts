import type { Express, Request, Response } from "express";
import { storageGetSignedUrl } from "../storage";

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/:key(*)", async (req: Request, res: Response) => {
    try {
      const key = req.params.key;
      const url = await storageGetSignedUrl(key);
      res.redirect(307, url);
    } catch {
      res.status(404).json({ error: "Storage item not found or storage unconfigured" });
    }
  });
}
