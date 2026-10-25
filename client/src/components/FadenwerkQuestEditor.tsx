import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import type { QuestTemplateVersion } from "@shared/aurionQuestContract";
import { inspectFadenwerk, nextAuthoringVersion, toQuarantinedQuestTemplate } from "@/fadenwerk/legacyQuestAdapter";

/** Presentation/authoring only; never publishes a quest or writes game state. */
export default function FadenwerkQuestEditor({ templates }: { templates: QuestTemplateVersion[] }) {
  const [source, setSource] = useState("");
  const [template, setTemplate] = useState<QuestTemplateVersion | null>(null);
  const [nodeId, setNodeId] = useState("");
  const [message, setMessage] = useState("");
  const inspect = useMemo(() => {
    if (!source.trim()) return null;
    try {
      if (source.length > 1_000_000) throw Error("JSON_LIMIT_1MB");
      return { value: inspectFadenwerk(JSON.parse(source)), error: "" };
    } catch (error) { return { value: null, error: String(error) }; }
  }, [source]);
  const proposed = trpc.aurionQuest.proposeDraft.useMutation();
  const planned = trpc.aurionQuest.publishPlan.useMutation();
  // Presentation-only preflight. The authoritative QuestTemplateVersionSchema is parsed on the server.
  // Do not import the runtime contract here: its replay dependency imports node:crypto.
  const previewReady = !!template && template.title.trim().length > 0
    && template.nodes.length > 0 && template.nodes.length <= 50
    && template.nodes.every(node => node.title.trim().length > 0);
  const selected = template?.nodes.find(n => n.id === nodeId);
  const change = (edit: (t: QuestTemplateVersion) => void) => {
    setTemplate(t => { if (!t) return t; const next = structuredClone(t); edit(next); return next; });
    setMessage("");
  };
  const prepareLegacy = () => {
    try {
      if (!inspect?.value) throw Error("NO_VALID_IMPORT");
      const line = inspect.value.questlines[0];
      if (!line) throw Error("NO_QUESTLINE");
      const next = toQuarantinedQuestTemplate(line, 1);
      setTemplate(next); setNodeId(next.nodes[0]?.id ?? "");
      setMessage("Quarantänisierter Strukturentwurf. Keine Quest veröffentlicht.");
    } catch (error) { setMessage(String(error)); }
  };
  const prepareExisting = (i: number) => {
    if (!templates[i]) return;
    const next = nextAuthoringVersion(templates[i]);
    setTemplate(next); setNodeId(next.nodes[0]?.id ?? "");
    setMessage("Unveröffentlichte neue Vorlagenversion vorbereitet.");
  };
  const requestPlan = async () => {
    if (!template || !previewReady || planned.isPending || proposed.isPending) return;
    try {
      const t = template;
      const proposal = await proposed.mutateAsync({
        templateId: t.templateId, templateVersion: t.version, proposedDataJson: JSON.stringify(t),
      });
      const plan = await planned.mutateAsync({ proposalId: proposal.id });
      setMessage("Aurion-Plan " + plan.planHash + " erstellt; nicht veröffentlicht. Kein Runtime-Receipt.");
    } catch (error) { setMessage("Aurion-Validierung: " + String(error)); }
  };
  return <section className="space-y-4" data-testid="fadenwerk-authoring">
    <p className="text-sm text-slate-400">Fadenwerk arbeitet nur mit Aurion-Entwürfen. Loot, NPCs, Events, Veröffentlichung und Persistenz bleiben serverautoritativ.</p>
    <label className="block text-sm">Aurion-Vorlage kopieren
      <select className="mt-1 w-full rounded bg-slate-900 p-2" defaultValue="" onChange={e => prepareExisting(Number(e.target.value))}>
        <option value="" disabled>Vorlage auswählen</option>
        {templates.map((t,i) => <option key={t.templateId + t.version} value={i}>{t.title} v{t.version}</option>)}
      </select>
    </label>
    <label className="block text-sm">Fadenwerk-v1-JSON prüfen (kein automatischer Import)
      <textarea aria-label="Fadenwerk JSON" className="mt-1 min-h-28 w-full rounded bg-slate-900 p-2 font-mono text-xs" value={source} onChange={e => setSource(e.target.value)} />
    </label>
    {inspect?.error && <p role="alert" className="text-red-300">{inspect.error}</p>}
    {inspect?.value && <div className="space-y-1">
      <p className="text-xs">Stränge: {inspect.value.questlines.length}; Diagnosen: {inspect.value.issues.length}</p>
      <ul className="max-h-44 overflow-y-auto text-xs">
        {inspect.value.issues.map((i,k) => <li key={k} className={i.severity === "blocker" ? "text-amber-300" : "text-slate-400"}>{i.code} · {i.path}</li>)}
      </ul>
      <button type="button" disabled={inspect.value.issues.some(i => i.severity === "blocker")} className="rounded border border-cyan-600 px-3 py-2 disabled:opacity-40" onClick={prepareLegacy}>Nur zulässige Struktur übernehmen</button>
    </div>}
    {template && <div className="space-y-3 rounded border border-slate-700 p-3">
      <h3 className="font-semibold">{template.title} · v{template.version} · {template.quarantined ? "Quarantäne" : "Entwurf"}</h3>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {template.nodes.map(n => <button key={n.id} type="button" aria-pressed={nodeId === n.id} className="rounded border border-slate-600 p-2 text-left text-sm" onClick={() => setNodeId(n.id)}>
          <strong>{n.title}</strong><span className="block text-xs">{n.type} · {n.id}</span>
          <span className="block text-xs text-cyan-300">{template.edges.filter(e=>e.fromNodeId===n.id).map(e=>e.toNodeId).join(", ") || "Ende"}</span>
        </button>)}
      </div>
      {selected && <label className="block text-sm">Knotentitel
        <input className="mt-1 w-full rounded bg-slate-900 p-2" value={selected.title} onChange={e => change(t => { t.nodes.find(n=>n.id===nodeId)!.title=e.target.value; })} />
      </label>}
      <label className="block text-sm">Questtitel
        <input className="mt-1 w-full rounded bg-slate-900 p-2" value={template.title} onChange={e => change(t => { t.title=e.target.value; })} />
      </label>
      {!previewReady && <p role="alert" className="text-red-300 text-sm">Entwurf unvollständig. Die verbindliche Schemaprüfung findet ausschließlich auf dem Aurion-Server statt.</p>}
      <button type="button" disabled={!previewReady || planned.isPending || proposed.isPending} className="rounded border border-cyan-600 px-3 py-2 disabled:opacity-40" onClick={requestPlan}>Aurion-Draft + Plan anfragen (ohne Veröffentlichung)</button>
      <details><summary className="cursor-pointer">Kanonischen Entwurf ansehen</summary><pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(template,null,2)}</pre></details>
    </div>}
    {message && <p role="status" className="break-words text-sm">{message}</p>}
  </section>;
}
