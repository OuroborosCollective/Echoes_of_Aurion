import express, { type RequestHandler } from "express";

/** Existing JSON/urlencoded parsing order and the general 50mb cap stay intact.
 * Cap only standalone auth procedures; mixed tRPC batches may carry uploads. */
export function authBodyLimit(): RequestHandler {
  const json = express.json({ limit: "16kb" });
  const form = express.urlencoded({ limit: "16kb", extended: true });
  return (req, res, next) => {
    const path = req.path;
    const native = /^\/api\/native-auth\/(start|exchange|refresh|revoke)\/?$/i.test(path);
    const local = /^\/api\/trpc\/auth\.(loginLocal|registerLocal)\/?$/i.test(path);
    if (req.method !== "POST" || (!native && !local)) return next();
    // A one-procedure httpBatchLink request remains small and is bounded too.
    json(req, res, error => error ? next(error) : form(req, res, next));
  };
}
