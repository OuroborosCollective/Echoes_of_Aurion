import type { GameDevelopmentStudioRuntimeReadback } from "./gameDevelopmentStudioRuntime";

export type DevGdsStatusConfirmation = "CONFIRM_DEV_GDS_STATUS";
export type DevGdsInspectConfirmation = "CONFIRM_DEV_GDS_INSPECT";
export type DevGdsValidateConfirmation = "CONFIRM_DEV_GDS_VALIDATE";

function assertDevGdsEnabled(): void {
  if (process.env.NODE_ENV === "production") throw new Error("DEV_CONTROL_CHANNEL_DISABLED");
}

async function loadRuntime(): Promise<typeof import("./gameDevelopmentStudioRuntime")> {
  return import("./gameDevelopmentStudioRuntime");
}

export async function executeGdsStatus(
  confirmation: DevGdsStatusConfirmation,
): Promise<GameDevelopmentStudioRuntimeReadback> {
  assertDevGdsEnabled();
  if (confirmation !== "CONFIRM_DEV_GDS_STATUS") throw new Error("DEV_CONTROL_CONFIRMATION_REQUIRED");
  const runtime = await loadRuntime();
  return runtime.resolveGameDevelopmentStudioRuntimeReadback();
}

export async function executeGdsInspectApprovedAsset(
  assetId: string,
  confirmation: DevGdsInspectConfirmation,
): Promise<Readonly<Record<string, unknown>>> {
  assertDevGdsEnabled();
  if (confirmation !== "CONFIRM_DEV_GDS_INSPECT") throw new Error("DEV_CONTROL_CONFIRMATION_REQUIRED");
  const runtime = await loadRuntime();
  return runtime.inspectApprovedAsset("inspect", assetId);
}

export async function executeGdsValidateApprovedAsset(
  assetId: string,
  confirmation: DevGdsValidateConfirmation,
): Promise<Readonly<Record<string, unknown>>> {
  assertDevGdsEnabled();
  if (confirmation !== "CONFIRM_DEV_GDS_VALIDATE") throw new Error("DEV_CONTROL_CONFIRMATION_REQUIRED");
  const runtime = await loadRuntime();
  return runtime.inspectApprovedAsset("validate", assetId);
}
