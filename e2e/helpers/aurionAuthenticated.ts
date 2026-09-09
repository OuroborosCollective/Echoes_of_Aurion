import { expect, type Page } from "@playwright/test";
import { createPool, type RowDataPacket } from "mysql2/promise";
import { createHash } from "node:crypto";
import { testAnimatedPlayerGlb } from "../../server/glbImportFixtures";

async function ensurePublicAvatar(page: Page, handle: string): Promise<void> {
  const pool = createPool(process.env.DATABASE_URL!);
  try {
    const [users] = await pool.query<RowDataPacket[]>("SELECT u.id FROM users u JOIN localCredentials c ON c.userId=u.id WHERE c.handle=?", [handle]);
    expect(users).toHaveLength(1);
    const userId = Number(users[0]!.id);
    await pool.execute("UPDATE users SET role='admin' WHERE id=?", [userId]);
    const bytes = testAnimatedPlayerGlb("AIM254_Public_Player");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const response = await page.request.post("/api/admin/glb-smart-upload", { data: {
      displayName: "AIM254 public avatar",
      fileName: "aim254-public-player.glb",
      purpose: "player-public",
      contentBase64: bytes.toString("base64"),
    } });
    expect(response.status()).toBe(201);
    expect(await response.json()).toMatchObject({
      accepted: true,
      purpose: "player-public",
      classification: { assetType: "character" },
      receipt: { sha256, targetKey: null, status: "catalog" },
    });
  } finally {
    await pool.execute("UPDATE users u JOIN localCredentials c ON c.userId=u.id SET u.role='user' WHERE c.handle=?", [handle]);
    await pool.end();
  }
}

export async function register(page: Page, handle: string): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "KONTO ANLEGEN / ANMELDEN", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "Konto anlegen", exact: true }).click();
  await dialog.getByLabel("Rufname", { exact: true }).fill(handle);
  await dialog.getByLabel("Passwort", { exact: true }).fill("Aurion-isolated-regression-254!");
  await dialog.getByRole("button", { name: "Aurion-Konto erstellen", exact: true }).click();
  await expect(page.getByRole("button", { name: "SPIEL BETRETEN", exact: true })).toBeVisible({ timeout: 30_000 });
  await ensurePublicAvatar(page, handle);
}

export async function enterAx1(page: Page): Promise<{ runtime: ReturnType<Page["getByTestId"]>; snapshot: any }> {
  const launch = page.getByRole("button", { name: "SPIEL BETRETEN", exact: true });
  await expect(launch).toBeVisible({ timeout: 30_000 });
  const response = page.waitForResponse(candidate => candidate.url().includes("gameplay.enterOpenWorld") && candidate.status() === 200);
  await launch.click();
  const body = await (await response).json();
  const snapshot = (Array.isArray(body) ? body : [body]).map(value => value.result?.data?.json).find(Boolean);
  const runtime = page.getByTestId("xaurion-open-world-runtime");
  await expect(runtime).toBeVisible();
  const gate = page.getByTestId("player-character-selection-gate");
  const avatar = gate.getByRole("radio", { name: /AIM254 public avatar/ });
  const connected = runtime.getByText("BEWEGUNG VERBUNDEN", { exact: true });
  // The gate also renders while the persisted appearance query is loading.
  // Wait for an actionable picker or the already selected character's session.
  await expect(avatar.or(connected).first()).toBeVisible({ timeout: 45_000 });
  if (await avatar.isVisible()) {
    await avatar.click();
    const selectionReply = page.waitForResponse(candidate => candidate.url().endsWith("/api/game/public-player-characters/select") && candidate.request().method() === "POST");
    await gate.getByRole("button", { name: "Dauerhaft wählen", exact: true }).click();
    const selected = await selectionReply;
    expect(selected.status()).toBe(200);
    expect(await selected.json()).toMatchObject({ visibility: "public", immutable: true });
  }
  await expect(connected).toBeVisible({ timeout: 45_000 });
  await expect(page.locator("#three-viewport canvas")).toBeVisible();
  await expect(page.locator(".xaurion-runtime__error")).toHaveCount(0);
  return { runtime, snapshot };
}
