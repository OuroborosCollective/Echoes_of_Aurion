import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Approval = { approvalId: string; scope: string; purpose: string; expiresAtMs: number; consumedAtMs: number | null; revokedAtMs: number | null; run: { revision: string; runId: string; runAttempt: number } };
const scopeDetails = {
  "aurion.probe.admin-readback": { label: "Schema-Preflight (lesend)", confirmation: "keine Produktionsmutation" },
  "aurion.probe.gameplay-readback": { label: "Bestehende Gameplay-Beobachtung (lesend)", confirmation: "keine Produktionsmutation; eine inaktive Zone wird nicht gestartet" },
  "aurion.probe.gameplay-session-readback": { label: "Gameplay-Join/Readback (kurzzeitig effectful)", confirmation: "ein kurzlebiger kanonischer Probe-Join und -Leave mit Receipt; keine Browser-Sitzung, kein Spielerticket und keine Spielerbefehle" },
} as const;
type ProbeScope = keyof typeof scopeDetails;
const scopes = Object.keys(scopeDetails) as ProbeScope[];
function isApproval(value: unknown): value is Approval {
  if (!value || typeof value !== "object") return false;
  const approval = value as Approval;
  const timestamp = (time: unknown) => typeof time === "number" && Number.isSafeInteger(time) && time > 0;
  return typeof approval.approvalId === "string" && /^[a-f0-9]{32}$/.test(approval.approvalId)
    && scopes.includes(approval.scope as ProbeScope) && typeof approval.purpose === "string"
    && timestamp(approval.expiresAtMs)
    && (approval.consumedAtMs === null || timestamp(approval.consumedAtMs))
    && (approval.revokedAtMs === null || timestamp(approval.revokedAtMs))
    && !!approval.run && typeof approval.run.revision === "string" && /^[a-f0-9]{40}$/.test(approval.run.revision)
    && typeof approval.run.runId === "string" && /^[1-9][0-9]{0,19}$/.test(approval.run.runId)
    && Number.isSafeInteger(approval.run.runAttempt) && approval.run.runAttempt > 0;
}
function readApprovalLinkPreset() {
  const query = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
  const revision = query.get("aurion_revision") ?? "";
  const runId = query.get("aurion_run_id") ?? "";
  const attemptString = query.get("aurion_attempt") ?? "";
  const requestedScope = query.get("aurion_scope") ?? "";
  const valid = /^[a-f0-9]{40}$/.test(revision) && /^[1-9][0-9]{0,19}$/.test(runId)
    && /^[1-9][0-9]*$/.test(attemptString) && Number.isSafeInteger(Number(attemptString))
    && scopes.includes(requestedScope as ProbeScope);
  return { valid, revision: valid ? revision : "", runId: valid ? runId : "",
    attempt: valid ? Number(attemptString) : 1,
    scope: (valid ? requestedScope : scopes[0]) as ProbeScope };
}
export function ProductionProbeApproval() {
  const [preset] = useState(readApprovalLinkPreset);
  const [revision, setRevision] = useState(preset.revision); const [runId, setRunId] = useState(preset.runId);
  const [attempt, setAttempt] = useState(preset.attempt); const [purpose, setPurpose] = useState(preset.valid
    ? preset.scope === "aurion.probe.gameplay-session-readback" ? "Produktionsrelease Gameplay-Join/Readback" : "Produktionsrelease Schema-Preflight"
    : "");
  const [scope, setScope] = useState<ProbeScope>(preset.scope); const [password, setPassword] = useState("");
  const [confirmed, setConfirmed] = useState(false); const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(""); const [approvals, setApprovals] = useState<Approval[]>([]);
  const request = async (operation: string, body: unknown) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let failure = "Server nicht erreichbar. Ergebnis unbestätigt; gespeicherte Freigaben erneut lesen.";
    try {
      const response = await fetch(`/api/production-probe/${operation}`, { method: "POST", credentials: "same-origin", signal: controller.signal,
        headers: { "Content-Type": "application/json", "X-Requested-With": "AurionOps" }, body: JSON.stringify(body) });
      if (!response.ok) {
        failure = "Freigabe abgelehnt. Admin-Anmeldung, Passwort, Laufbindung und Infrastruktur prüfen.";
        throw new Error();
      }
      failure = "Ungültige Serverantwort. Ergebnis unbestätigt; gespeicherte Freigaben erneut lesen.";
      if (response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new Error();
      const result: unknown = await response.json();
      if (operation === "list" && (!Array.isArray(result) || !result.every(isApproval))) throw new Error();
      if (operation === "approve" && !isApproval(result)) throw new Error();
      return result;
    } catch {
      throw new Error(controller.signal.aborted
        ? "Zeitlimit erreicht. Ergebnis unbestätigt; gespeicherte Freigaben erneut lesen."
        : failure);
    } finally { clearTimeout(timeout); }
  };
  const readApprovals = async () => {
    const saved = await request("list", {}) as Approval[];
    setApprovals(saved);
    setMessage(saved.length === 0 ? "Keine gespeicherten Freigaben für diese Admin-Anmeldung gefunden." : `${saved.length} gespeicherte Freigaben geladen.`);
  };
  const act = async (work: () => Promise<void>) => { setBusy(true); setMessage("Anfrage läuft …"); try { await work(); } catch (error) { setMessage(error instanceof Error ? error.message : "Anfrage abgelehnt."); } finally { setBusy(false); setPassword(""); setConfirmed(false); } };
  return <Card className="border-cyan-200/15 bg-slate-950/70"><CardHeader>
    <CardTitle>Einmalfreigabe für Produktionsprüfungen</CardTitle>
    <CardDescription>Ein konkreter GitHub-Lauf, eine eng gebundene Berechtigung, maximal fünf Minuten. Schema- und Release-Freigaben bleiben separat. Der echte Gameplay-Join ist als effectful Probe ausdrücklich getrennt.</CardDescription>
  </CardHeader><CardContent className="space-y-4"><form className="space-y-3" onSubmit={event => { event.preventDefault(); void act(async () => {
    const run = { repository: "OuroborosCollective/Echoes_of_Aurion", workflow: ".github/workflows/deploy-aurion-zone-runtime.yml", ref: "refs/heads/main", revision, runId, runAttempt: attempt, environment: "production", audience: "aurion-production-probe" };
    const approved = await request("approve", { run, scope, purpose, password, confirmed }) as Approval;
    setApprovals(current => [approved, ...current]); setMessage(`Gespeichert; Ablauf: ${new Date(approved.expiresAtMs).toLocaleString()}`);
  }); }}>
    <p className="break-all text-sm">OuroborosCollective/Echoes_of_Aurion · deploy-aurion-zone-runtime.yml · main · production</p>
    {preset.valid && <p className="text-sm">Linkangaben vor Freigabe prüfen: Run, Revision und Berechtigung sind nur vorausgefüllt, nicht autorisiert.</p>}
    <Label htmlFor="probe-revision">Unveränderliche Commit-SHA (40 Zeichen)</Label><Input id="probe-revision" value={revision} onChange={event => { setRevision(event.target.value); setConfirmed(false); }} pattern="[a-f0-9]{40}" required />
    <Label htmlFor="probe-run">GitHub Run-ID</Label><Input id="probe-run" value={runId} onChange={event => { setRunId(event.target.value); setConfirmed(false); }} pattern="[1-9][0-9]{0,19}" required />
    <Label htmlFor="probe-attempt">Run-Attempt</Label><Input id="probe-attempt" type="number" min={1} step={1} value={attempt} onChange={event => { setAttempt(Number(event.target.value)); setConfirmed(false); }} required />
    <Label htmlFor="probe-scope">Zugelassene Prüfung</Label><select id="probe-scope" className="w-full bg-slate-900 p-2" value={scope} onChange={event => { setScope(event.target.value as ProbeScope); setConfirmed(false); }}>{scopes.map(value => <option key={value} value={value}>{scopeDetails[value].label}</option>)}</select>
    <Label htmlFor="probe-purpose">Zweck und geplante Leseaktionen</Label><Input id="probe-purpose" value={purpose} minLength={8} maxLength={240} required onChange={event => { setPurpose(event.target.value); setConfirmed(false); }} />
    <Label htmlFor="probe-password">Aurion-Passwort erneut bestätigen</Label><Input id="probe-password" type="password" autoComplete="current-password" value={password} maxLength={128} required onChange={event => setPassword(event.target.value)} />
    <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} required />Ich bestätige genau diese Revision, Run-ID, diesen Versuch und Zweck. Ablauf spätestens fünf Minuten nach Bestätigung; {scopeDetails[scope].confirmation}.</label>
    <Button type="submit" disabled={busy || !confirmed}>Einmalig freigeben</Button>
  </form><Button type="button" variant="outline" disabled={busy} onClick={() => void act(readApprovals)}>Gespeicherte Freigaben lesen</Button>
    {message && <p role="status" className="text-sm">{message}</p>}
    {approvals.map(approval => <div key={approval.approvalId} className="rounded border border-cyan-200/20 p-3 text-sm break-all"><p>{approval.run.revision} · Run {approval.run.runId}/{approval.run.runAttempt}</p><p>{approval.scope} · {approval.purpose}</p><p>Ablauf {new Date(approval.expiresAtMs).toLocaleString()} · {approval.revokedAtMs ? "widerrufen" : approval.consumedAtMs ? "verbraucht" : "unverbraucht"}</p>{!approval.consumedAtMs && !approval.revokedAtMs && <Button type="button" variant="outline" disabled={busy} onClick={() => void act(async () => { await request("revoke", { approvalId: approval.approvalId }); await readApprovals(); })}>Widerrufen</Button>}</div>)}
  </CardContent></Card>;
}
