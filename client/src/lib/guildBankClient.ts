import {
  guildBankPlanViewSchema,
  guildBankViewSchema,
  type GuildBankPlanView,
  type GuildBankView,
} from "@shared/guildBankView";
import type { GuildBankOperation } from "@shared/guildBankContract";
export async function bankRequest(
  path: string,
  body?: unknown,
  signal?: AbortSignal
): Promise<unknown> {
  const response = await fetch(`/api/guild/bank${path}`, {
    method: body ? "POST" : "GET",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal,
  });
  if (!response.ok) throw new Error("BANK_REQUEST_NOT_CONFIRMED");
  return response.json();
}
export function ownedBankReadback(
  raw: unknown,
  userId: number,
  guildId: string
): GuildBankView {
  const bank = guildBankViewSchema.parse(raw);
  if (bank.actorUserId !== userId || bank.guildId !== guildId)
    throw Error("BANK_OWNER_MISMATCH");
  return bank;
}
const canonical = (value: unknown): string =>
  Array.isArray(value)
    ? `[${value.map(canonical).join(",")}]`
    : value && typeof value === "object"
      ? `{${Object.keys(value)
          .sort()
          .map(
            key =>
              `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`
          )
          .join(",")}}`
      : JSON.stringify(value);
export async function planBankOperation(
  bank: GuildBankView,
  operation: GuildBankOperation,
  payload: Record<string, unknown>,
  signal?: AbortSignal
): Promise<GuildBankPlanView> {
  const digest = Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(
          canonical([
            "aurion-bank-ui.v1",
            bank.actorUserId,
            bank.guildId,
            bank.revisionExact,
            bank.planningRevisionExact,
            operation,
            payload,
          ])
        )
      )
    )
  )
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
  const idempotencyKey = `gbui_${digest.slice(0, 48)}`;
  const response = guildBankPlanViewSchema.parse(
      await bankRequest(
        "/plan",
        {
          operation,
          expectedRevisionExact: bank.revisionExact,
          idempotencyKey,
          payload,
        },
        signal
      )
    ),
    plan = response.plan;
  if (
    plan.actorUserId !== bank.actorUserId ||
    plan.guildId !== bank.guildId ||
    plan.operation !== operation ||
    plan.expectedRevisionExact !== bank.revisionExact ||
    plan.idempotencyKey !== idempotencyKey ||
    canonical(plan.payload) !== canonical(payload)
  )
    throw Error("BANK_PLAN_SCOPE_MISMATCH");
  return plan;
}
export async function applyBankPlan(
  plan: GuildBankPlanView,
  signal?: AbortSignal
): Promise<GuildBankView> {
  const raw = (await bankRequest(
    "/apply",
    { confirmationHash: plan.confirmationHash },
    signal
  )) as {
    success?: unknown;
    receipt?: Record<string, unknown>;
    readback?: unknown;
  };
  if (
    raw.success !== true ||
    raw.receipt?.confirmationHash !== plan.confirmationHash ||
    raw.receipt.actorUserId !== plan.actorUserId ||
    raw.receipt.guildId !== plan.guildId ||
    raw.receipt.operation !== plan.operation ||
    raw.receipt.expectedRevisionExact !== plan.expectedRevisionExact ||
    raw.receipt.resultingRevisionExact !==
      (BigInt(plan.expectedRevisionExact) + 1n).toString()
  )
    throw Error("BANK_RECEIPT_SCOPE_MISMATCH");
  const bank = ownedBankReadback(raw.readback, plan.actorUserId, plan.guildId);
  if (
    BigInt(bank.revisionExact) <
    BigInt(String(raw.receipt.resultingRevisionExact))
  )
    throw Error("BANK_RECEIPT_READBACK_MISMATCH");
  return bank;
}
