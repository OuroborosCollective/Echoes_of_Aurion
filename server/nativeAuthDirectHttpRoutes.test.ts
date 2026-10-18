import type { Express, Request, Response } from "express";
import { HttpError } from "@shared/_core/errors";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sdk } from "./_core/sdk";
import {
  CONFIRMED_EQUIPMENT_VISUAL_V2_PATH,
  registerConfirmedEquipmentVisualRoutes,
} from "./confirmedEquipmentVisualRoutes";
import { registerGlbSmartUpload } from "./glbSmartUpload";

vi.mock("./_core/sdk", () => ({
  sdk: { authenticateRequest: vi.fn() },
}));

type RouteHandler = (request: Request, response: Response) => Promise<unknown>;

function captureGetRoutes(register: (app: Express) => void): Map<string, RouteHandler> {
  const routes = new Map<string, RouteHandler>();
  const app = {
    get: vi.fn((path: string, handler: RouteHandler) => {
      routes.set(path, handler);
      return app;
    }),
    post: vi.fn(() => app),
    use: vi.fn(() => app),
  } as unknown as Express;
  register(app);
  return routes;
}

function responseRecorder(): Response {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
    setHeader: vi.fn(),
  } as unknown as Response;
  vi.mocked(response.status).mockReturnValue(response);
  vi.mocked(response.json).mockReturnValue(response);
  return response;
}

describe("native access expiry at direct HTTP routes", () => {
  beforeEach(() => {
    vi.mocked(sdk.authenticateRequest).mockReset();
    vi.mocked(sdk.authenticateRequest).mockRejectedValue(
      new HttpError(401, "NATIVE_AUTH_SESSION_EXPIRED"),
    );
  });

  it("preserves the refresh signal for confirmed equipment readback", async () => {
    const route = captureGetRoutes(registerConfirmedEquipmentVisualRoutes)
      .get(CONFIRMED_EQUIPMENT_VISUAL_V2_PATH);
    const response = responseRecorder();

    await route!({} as Request, response);

    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.json).toHaveBeenCalledWith({ error: "NATIVE_AUTH_SESSION_EXPIRED" });
  });

  it("preserves the refresh signal for GLB player readback", async () => {
    const route = captureGetRoutes(registerGlbSmartUpload)
      .get("/api/game/public-player-characters");
    const response = responseRecorder();

    await route!({} as Request, response);

    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.json).toHaveBeenCalledWith({ error: "NATIVE_AUTH_SESSION_EXPIRED" });
  });
});
