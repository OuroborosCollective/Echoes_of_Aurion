import type { Express } from "express";
import path from "node:path";

/** Expose only the Android association file, never the whole hidden directory. */
export function serveAndroidAssetLinks(app: Express, publicDirectory: string) {
  app.get("/.well-known/assetlinks.json", (_req, res) => {
    res.type("application/json");
    res.sendFile(path.resolve(publicDirectory, ".well-known/assetlinks.json"), { dotfiles: "allow" }, error => {
      if (error && !res.headersSent) res.status(404).json({ error: "ANDROID_ASSET_LINKS_UNAVAILABLE" });
    });
  });
}
