import { expect, test } from "@playwright/test";
import { createPool, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";

// Real Chromium -> shipped Aurion UI -> real tRPC/auth -> isolated MariaDB.
// The test admin is a genuine local account whose role is changed only in the
// disposable CI database; no authentication or persistence code is mocked.
test.skip(process.env.AURION_FADENWERK_E2E !== "1", "Requires the isolated Fadenwerk browser/DB CI lane.");
test.setTimeout(180_000);

function isolatedDatabaseUrl(): string {
  if (process.env.AURION_E2E_ISOLATED !== "1" || !process.env.DATABASE_URL) {
    throw new Error("FADENWERK_ISOLATED_TEST_DATABASE_REQUIRED");
  }
  const url = new URL(process.env.DATABASE_URL);
  if (
    url.protocol !== "mysql:" ||
    url.hostname !== "127.0.0.1" ||
    url.port !== "3306" ||
    url.pathname !== "/aurion_fadenwerk_test"
  ) throw new Error("FADENWERK_ISOLATED_TEST_DATABASE_REQUIRED");
  return url.href;
}

test("Fadenwerk browser authoring is admin-only, persists a draft and plans without publishing", async ({ page, request, baseURL }) => {
  if (baseURL !== "http://127.0.0.1:3000") throw new Error("FADENWERK_LOCAL_SERVER_REQUIRED");
  const pool = createPool(isolatedDatabaseUrl());
  try {
    const [database] = await pool.query<RowDataPacket[]>("SELECT DATABASE() AS name");
    expect(database[0]?.name).toBe("aurion_fadenwerk_test");

    // Real local registration and cookie-based session; no role/session stubs.
    await page.goto("/");
    await page.getByRole("button", { name: "KONTO ANLEGEN / ANMELDEN", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("tab", { name: "Konto anlegen", exact: true }).click();
    const handle = "fadenwerk_e2e_" + Date.now();
    await dialog.getByLabel("Rufname", { exact: true }).fill(handle);
    await dialog.getByLabel("Passwort", { exact: true }).fill("Aurion-isolated-fadenwerk-regression!");
    await dialog.getByRole("button", { name: "Aurion-Konto erstellen", exact: true }).click();
    await expect(page.getByRole("button", { name: "SPIEL BETRETEN", exact: true })).toBeVisible({ timeout: 30_000 });

    const meResponse = await page.request.get("/api/trpc/auth.me");
    expect(meResponse.status()).toBe(200);
    const me = (await meResponse.json()).result.data.json as { id: number; openId: string; role: string };
    expect(me.id).toBeGreaterThan(0);
    expect(me.openId).toBe("local:" + handle);
    expect(me.role).toBe("user");

    const templatesResponse = await page.request.get("/api/trpc/aurionQuest.templates");
    expect(templatesResponse.status()).toBe(200);
    const templates = (await templatesResponse.json()).result.data.json as Array<{
      templateId: string; version: number; title: string; nodes: Array<{ id: string }>;
    }>;
    expect(templates.length).toBeGreaterThan(0);
    const original = templates[0]!;
    expect(original.nodes.length).toBeGreaterThan(0);

    // A valid proposal made with a real non-admin session must be refused.
    const unauthorized = await page.request.post("/api/trpc/aurionQuest.proposeDraft", {
      data: {
        json: {
          templateId: original.templateId,
          templateVersion: original.version + 1,
          proposedDataJson: JSON.stringify({ ...original, version: original.version + 1, active: false, quarantined: true }),
        },
      },
    });
    expect(unauthorized.status()).toBe(403);
    const denial = await unauthorized.json();
    // The canonical Aurion tRPC transformer serializes errors in error.json.
    expect(denial.error?.json?.data?.code).toBe("FORBIDDEN");

    const [before] = await pool.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS count FROM aurionQuestAdminProposals WHERE authorUserId = ?", [me.id],
    );
    expect(Number(before[0]?.count)).toBe(0);

    // Use the actual persisted permission boundary for this disposable CI user.
    const [promoted] = await pool.execute<ResultSetHeader>(
      "UPDATE users SET role = 'admin' WHERE id = ? AND openId = ? AND role = 'user'",
      [me.id, me.openId],
    );
    expect(promoted.affectedRows).toBe(1);
    const [roles] = await pool.query<RowDataPacket[]>("SELECT role FROM users WHERE id = ?", [me.id]);
    expect(roles[0]?.role).toBe("admin");

    // Operate the shipped React Fadenwerk tab through Chromium, not a component mock.
    await page.goto("/ops/quests");
    await page.getByRole("tab", { name: "Fadenwerk", exact: true }).click();
    const editor = page.getByTestId("fadenwerk-authoring");
    await expect(editor).toBeVisible();
    const select = editor.getByRole("combobox", { name: /Aurion-Vorlage kopieren/i });
    await expect(select.locator("option[value='0']")).toBeAttached();
    await select.selectOption("0");
    const title = "Fadenwerk E2E Entwurf " + handle;
    await editor.getByRole("textbox", { name: "Questtitel", exact: true }).fill(title);
    await expect(editor.getByText(/Unveröffentlichte neue Vorlagenversion vorbereitet/)).toHaveCount(0);

    const planRequest = page.waitForResponse(response =>
      response.url().includes("aurionQuest.publishPlan") && response.request().method() === "POST",
    );
    await editor.getByRole("button", { name: "Aurion-Draft + Plan anfragen (ohne Veröffentlichung)" }).click();
    const planHttp = await planRequest;
    expect(planHttp.status()).toBe(200);
    const status = editor.getByRole("status");
    await expect(status).toContainText("nicht veröffentlicht.");
    await expect(status).toContainText("Kein Runtime-Receipt.");
    const match = /Aurion-Plan ([a-f0-9]{64}) erstellt/.exec((await status.textContent()) ?? "");
    expect(match).not.toBeNull();
    const planHash = match![1]!;

    // Independent readback through a fresh direct MariaDB query, not the POST response.
    const [proposals] = await pool.query<RowDataPacket[]>(
      "SELECT id, authorUserId, templateId, templateVersion, expectedTemplateSetHash, proposedDataJson, receiptHash, status FROM aurionQuestAdminProposals WHERE authorUserId = ?",
      [me.id],
    );
    expect(proposals).toHaveLength(1);
    const proposal = proposals[0]!;
    const payload = JSON.parse(proposal.proposedDataJson as string) as {
      templateId: string; version: number; title: string; active: boolean; quarantined: boolean;
    };
    expect(proposal.authorUserId).toBe(me.id);
    expect(proposal.templateId).toBe(original.templateId);
    expect(proposal.templateVersion).toBe(original.version + 1);
    expect(proposal.status).toBe("draft");
    expect(proposal.receiptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(proposal.expectedTemplateSetHash).toMatch(/^[a-f0-9]{64}$/);
    expect(payload).toMatchObject({
      templateId: original.templateId, version: original.version + 1,
      title, active: false, quarantined: true,
    });

    // A second authenticated server evaluation must agree with the browser plan.
    const readPlan = await page.request.post("/api/trpc/aurionQuest.publishPlan", {
      data: { json: { proposalId: proposal.id } },
    });
    expect(readPlan.status()).toBe(200);
    const evaluated = (await readPlan.json()).result.data.json as {
      planHash: string; proposalReceiptHash: string; requiresHumanConfirmation: boolean;
    };
    expect(evaluated.planHash).toBe(planHash);
    expect(evaluated.proposalReceiptHash).toBe(proposal.receiptHash);
    expect(evaluated.requiresHumanConfirmation).toBe(true);

    const [published] = await pool.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS count FROM aurionQuestTemplateVersions WHERE templateId = ? AND version = ?",
      [original.templateId, original.version + 1],
    );
    expect(Number(published[0]?.count)).toBe(0);

    // Invalid graph -> browser fail-closed, never another proposal.
    const invalid = { version: 1, questlines: [{
      id: "bad_graph", title: "Fehlerhafter Faden", entryNode: "start",
      graph: {
        start: { id: "start", title: "Start", choices: [{ id: "go", label: "Weiter", nextNode: "missing" }] },
        end: { id: "end", title: "Ende", choices: [] },
      },
    }] };
    await editor.getByRole("textbox", { name: "Fadenwerk JSON" }).fill(JSON.stringify(invalid));
    await expect(editor.getByRole("alert")).toContainText("DANGLING_EDGE");
    await expect(editor.getByRole("button", { name: /Aurion-Draft \+ Plan anfragen/ })).toHaveCount(0);
    const [after] = await pool.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS count FROM aurionQuestAdminProposals WHERE authorUserId = ?", [me.id],
    );
    expect(Number(after[0]?.count)).toBe(1);
  } finally {
    await pool.end();
  }
});
