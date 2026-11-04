import { expect, type Page } from "@playwright/test";

/** Observe the real post-registration document and its cookie-authenticated readback. */
export async function completeLocalRegistration(page: Page, handle: string): Promise<void> {
  const origin = new URL(page.url()).origin;
  // The destination is also '/', so waiting for that URL alone can accept the
  // old document while the registration redirect is still in flight.
  const homeNavigation = page.waitForEvent("framenavigated", {
    predicate: frame => frame === page.mainFrame() && frame.url() === `${origin}/`,
    timeout: 15_000,
  });
  const authenticatedReadback = page.waitForResponse(response =>
    response.request().method() === "GET"
    && new URL(response.url()).origin === origin
    && new URL(response.url()).pathname === "/api/trpc/auth.me", { timeout: 15_000 });
  const [readback] = await Promise.all([
    authenticatedReadback,
    homeNavigation,
    page.getByRole("dialog").getByRole("button", { name: "Aurion-Konto erstellen", exact: true }).click(),
  ]);
  expect(readback.status()).toBe(200);
  const body = await readback.json();
  expect(body[0]?.result?.data?.json).toMatchObject({ name: handle, role: "user" });
  await page.waitForLoadState("load", { timeout: 15_000 });
  // Keep the visible product assertion and its normal deadline after the
  // actual document/authentication boundary, rather than checking the old page.
  await expect(page.getByRole("heading", { name: /Eine Welt, die nicht auf dich wartet./ })).toBeVisible();
  await expect(page.getByRole("button", { name: "SPIEL BETRETEN", exact: true })).toBeVisible();
}
