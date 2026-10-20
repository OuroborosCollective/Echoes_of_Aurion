import { createServer, type ServerResponse } from "node:http";
import { once } from "node:events";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProductionProbeApproval } from "./ProductionProbeApproval";

const nativeFetch = globalThis.fetch;
let stop: (() => Promise<void>) | undefined;
async function serve(reply: (response: ServerResponse) => void) {
  const server = createServer((request, response) => {
    expect(request.method).toBe("POST");
    expect(request.url).toBe("/api/production-probe/list");
    expect(request.headers["x-requested-with"]).toBe("AurionOps");
    request.resume();
    reply(response);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as { port: number };
  vi.stubGlobal("fetch", (path: string, options: RequestInit) =>
    nativeFetch(`http://127.0.0.1:${address.port}${path}`, options));
  stop = () => new Promise(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
}
afterEach(async () => { cleanup(); vi.unstubAllGlobals(); await stop?.(); stop = undefined; });

describe("production approval list feedback over HTTP", () => {
  it("announces an empty successful read even with the approval form empty", async () => {
    await serve(response => { response.setHeader("Content-Type", "application/json"); response.end("[]"); });
    render(<ProductionProbeApproval />);
    fireEvent.click(screen.getByRole("button", { name: "Gespeicherte Freigaben lesen" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Keine gespeicherten Freigaben"));
  });

  it("shows progress until the response arrives, then restores the button", async () => {
    let pending: ServerResponse | undefined;
    await serve(response => { pending = response; });
    render(<ProductionProbeApproval />);
    fireEvent.click(screen.getByRole("button", { name: "Gespeicherte Freigaben lesen" }));
    await waitFor(() => expect(pending).toBeDefined());
    expect(screen.getByRole("status").textContent).toContain("Anfrage läuft");
    expect(screen.getByRole("button", { name: "Gespeicherte Freigaben lesen" }).hasAttribute("disabled")).toBe(true);
    pending!.setHeader("Content-Type", "application/json"); pending!.end("[]");
    await waitFor(() => expect(screen.getByRole("button", { name: "Gespeicherte Freigaben lesen" }).hasAttribute("disabled")).toBe(false));
  });

  it("shows a fixed error for an HTTP denial without rendering its body", async () => {
    await serve(response => { response.statusCode = 403; response.end("private-server-detail"); });
    render(<ProductionProbeApproval />);
    fireEvent.click(screen.getByRole("button", { name: "Gespeicherte Freigaben lesen" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Freigabe abgelehnt"));
    expect(document.body.textContent).not.toContain("private-server-detail");
  });

  it("rejects an invalid list without crashing the component", async () => {
    await serve(response => { response.setHeader("Content-Type", "application/json"); response.end("{}"); });
    render(<ProductionProbeApproval />);
    fireEvent.click(screen.getByRole("button", { name: "Gespeicherte Freigaben lesen" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Ungültige Serverantwort"));
  });

  it("renders the server-returned run binding and consumption state", async () => {
    const approval = { approvalId: "a".repeat(32), scope: "aurion.probe.admin-readback", purpose: "Schema prüfen",
      expiresAtMs: 1792519800000, consumedAtMs: 1792519790000, revokedAtMs: null,
      run: { revision: "b".repeat(40), runId: "39469189721", runAttempt: 2 } };
    await serve(response => { response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify([approval])); });
    render(<ProductionProbeApproval />);
    fireEvent.click(screen.getByRole("button", { name: "Gespeicherte Freigaben lesen" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("1 gespeicherte Freigaben geladen"));
    expect(screen.getByText(`${approval.run.revision} · Run 39469189721/2`)).toBeTruthy();
    expect(screen.getByText(/Ablauf .* · verbraucht/)).toBeTruthy();
  });

  it("rejects the HTML fallback with a fixed message", async () => {
    await serve(response => { response.setHeader("Content-Type", "text/html"); response.end("<html>private-routing-detail</html>"); });
    render(<ProductionProbeApproval />);
    fireEvent.click(screen.getByRole("button", { name: "Gespeicherte Freigaben lesen" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Ungültige Serverantwort"));
    expect(document.body.textContent).not.toContain("private-routing-detail");
  });

  it("bounds a stalled response body and allows another read", async () => {
    let calls = 0;
    await serve(response => {
      response.setHeader("Content-Type", "application/json");
      if (++calls === 1) { response.writeHead(200); response.flushHeaders(); response.write("["); }
      else response.end("[]");
    });
    render(<ProductionProbeApproval />);
    const button = screen.getByRole("button", { name: "Gespeicherte Freigaben lesen" });
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Zeitlimit erreicht"), { timeout: 18000 });
    expect(button.hasAttribute("disabled")).toBe(false);
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Keine gespeicherten Freigaben"));
    expect(calls).toBe(2);
  }, 20000);
});
