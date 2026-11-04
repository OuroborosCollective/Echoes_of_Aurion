import type { RequestHandler } from "express";
import { createCorsOriginResolver } from "./corsOrigin";
import type { DefensiveGatewayObserver } from "../defensiveGatewayObserver";

export function createCorsMiddleware(observer: DefensiveGatewayObserver, configured?: string): RequestHandler {
  const allowed = createCorsOriginResolver(configured);
  return (req, res, next) => {
    const origin = allowed(req.headers.origin);
    if (req.headers.origin && !origin) observer.originDenied("http");
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Vary", "Origin");
    }
    if (req.method === "OPTIONS") return res.status(origin ? 204 : 403).end();
    next();
  };
}
