import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Approval = { approvalId: string; scope: string; purpose: string; expiresAtMs: number; consumedAtMs: number | null; revokedAtMs: number | null; run: { revision: string; runId: string; runAttempt: number } };
const scopes = ["aurion.probe.admin-readback", "aurion.probe.gameplay-readback"] as const;
export function ProductionProbeApproval() {
  const [revision, setRevision] = useState(""); const [runId, setRunId] = useState("");
  const [attempt, setAttempt] = useState(1); const [purpose, setPurpose] = useState("");
  const [scope, setScope] = useState<string>(scopes[0]); const [password, setPassword] = useState("");
  const [confirmed, setConfirmed] = useState(false); const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(""); const [approvals, setApprovals] = useState<Approval[]>([]);
  const request = async (operation: string, body: unknown) => {
    const response = await fetch(`/api/production-probe/${operation}`, { method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-Requested-With": "AurionOps" }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error("Freigabe abgelehnt. Admin-Anmeldung, Passwort, Laufbindung und Infrastruktur prüfen.");
    return response.json();
  };
  const act = async (work: () => Promise<void>) => { setBusy(true); setMessage(""); try { await work(); } catch (error) { setMessage(error instanceof Error ? error.message : "Anfrage abgelehnt."); } finally { setBusy(false); setPassword(""); setConfirmed(false); } };
  return <Card className="border-cyan-200/15 bg-slate-950/70"><CardHeader>
    <CardTitle>Einmalfreigabe für Produktionsprüfungen</CardTitle>
    <CardDescription>Ein konkreter GitHub-Lauf, ein Leserecht, maximal fünf Minuten. Schema- und Release-Freigaben bleiben separat. Vor jedem Verbraucher ist eine eigene Bestätigung nötig.</CardDescription>
  </CardHeader><CardContent className="space-y-4"><form className="space-y-3" onSubmit={event => { event.preventDefault(); void act(async () => {
    const run = { repository: "OuroborosCollective/Echoes_of_Aurion", workflow: ".github/workflows/deploy-aurion-zone-runtime.yml", ref: "refs/heads/main", revision, runId, runAttempt: attempt, environment: "production", audience: "aurion-production-probe" };
    const approved: Approval = await request("approve", { run, scope, purpose, password, confirmed });
    setApprovals(current => [approved, ...current]); setMessage(`Gespeichert; Ablauf: ${new Date(approved.expiresAtMs).toLocaleString()}`);
  }); }}>
    <p className="break-all text-sm">OuroborosCollective/Echoes_of_Aurion · deploy-aurion-zone-runtime.yml · main · production</p>
    <Label htmlFor="probe-revision">Unveränderliche Commit-SHA (40 Zeichen)</Label><Input id="probe-revision" value={revision} onChange={event => { setRevision(event.target.value); setConfirmed(false); }} pattern="[a-f0-9]{40}" required />
    <Label htmlFor="probe-run">GitHub Run-ID</Label><Input id="probe-run" value={runId} onChange={event => { setRunId(event.target.value); setConfirmed(false); }} pattern="[1-9][0-9]{0,19}" required />
    <Label htmlFor="probe-attempt">Run-Attempt</Label><Input id="probe-attempt" type="number" min={1} step={1} value={attempt} onChange={event => { setAttempt(Number(event.target.value)); setConfirmed(false); }} required />
    <Label htmlFor="probe-scope">Zugelassene Prüfung</Label><select id="probe-scope" className="w-full bg-slate-900 p-2" value={scope} onChange={event => { setScope(event.target.value); setConfirmed(false); }}>{scopes.map(value => <option key={value} value={value}>{value}</option>)}</select>
    <Label htmlFor="probe-purpose">Zweck und geplante Leseaktionen</Label><Input id="probe-purpose" value={purpose} minLength={8} maxLength={240} required onChange={event => { setPurpose(event.target.value); setConfirmed(false); }} />
    <Label htmlFor="probe-password">Aurion-Passwort erneut bestätigen</Label><Input id="probe-password" type="password" autoComplete="current-password" value={password} maxLength={128} required onChange={event => setPassword(event.target.value)} />
    <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} required />Ich bestätige genau diese Revision, Run-ID, diesen Versuch und Zweck. Ablauf spätestens fünf Minuten nach Bestätigung; keine Produktionsmutation.</label>
    <Button type="submit" disabled={busy || !confirmed}>Einmalig freigeben</Button>
  </form><Button variant="outline" disabled={busy} onClick={() => void act(async () => setApprovals(await request("list", {})))}>Gespeicherte Freigaben lesen</Button>
    {message && <p role="status" className="text-sm">{message}</p>}
    {approvals.map(approval => <div key={approval.approvalId} className="rounded border border-cyan-200/20 p-3 text-sm break-all"><p>{approval.run.revision} · Run {approval.run.runId}/{approval.run.runAttempt}</p><p>{approval.scope} · {approval.purpose}</p><p>Ablauf {new Date(approval.expiresAtMs).toLocaleString()} · {approval.revokedAtMs ? "widerrufen" : approval.consumedAtMs ? "verbraucht" : "unverbraucht"}</p>{!approval.consumedAtMs && !approval.revokedAtMs && <Button variant="outline" disabled={busy} onClick={() => void act(async () => { await request("revoke", { approvalId: approval.approvalId }); setApprovals(await request("list", {})); })}>Widerrufen</Button>}</div>)}
  </CardContent></Card>;
}
