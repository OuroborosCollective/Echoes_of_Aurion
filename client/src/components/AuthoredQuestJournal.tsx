import { useMemo, useState } from "react";
import { CheckCircle2, GitBranch, ShieldCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";

export function AuthoredQuestJournal() {
  const utils = trpc.useUtils();
  const available = trpc.aurionQuest.available.useQuery();
  const instances = trpc.aurionQuest.myInstances.useQuery();
  const [selectedId, setSelectedId] = useState<string>("");
  const details = trpc.aurionQuest.details.useQuery(
    { instanceId: selectedId },
    { enabled: Boolean(selectedId) },
  );
  const offer = trpc.aurionQuest.offer.useMutation();
  const accept = trpc.aurionQuest.accept.useMutation();
  const choose = trpc.aurionQuest.choose.useMutation();
  const complete = trpc.aurionQuest.complete.useMutation();

  const busy = offer.isPending || accept.isPending || choose.isPending || complete.isPending;
  const selected = details.data;
  const currentNode = useMemo(
    () => selected?.plan.nodes.find(node => node.id === selected.instance.currentNodeId),
    [selected],
  );
  const choices = useMemo(
    () => currentNode?.type === "branch"
      ? selected?.plan.edges.filter(edge => edge.fromNodeId === currentNode.id) ?? []
      : [],
    [currentNode, selected],
  );

  const refresh = async (instanceId?: string) => {
    await Promise.all([
      utils.aurionQuest.myInstances.invalidate(),
      utils.aurionQuest.available.invalidate(),
    ]);
    if (instanceId) {
      setSelectedId(instanceId);
      await utils.aurionQuest.details.invalidate({ instanceId });
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-12">
      <section className="md:col-span-5 space-y-3 rounded-2xl border border-cyan-400/20 bg-black/40 p-3">
        <h4 className="font-serif text-xs uppercase text-amber-300">Aurion-authored Nebenquests</h4>
        {(available.data ?? []).map(template => (
          <div key={template.templateId} className="rounded-xl border border-slate-700 bg-black/40 p-3 text-xs">
            <b className="text-cyan-200">{template.title}</b>
            <p className="mt-1 text-slate-400">{template.description}</p>
            <button
              className="ax1-primary mt-2 transition-all motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed disabled:motion-safe:hover:translate-y-0 disabled:motion-safe:active:scale-100"
              disabled={busy}
              aria-busy={busy}
              title={busy ? "Wird geladen..." : undefined}
              onClick={async () => {
                const offered = await offer.mutateAsync({ templateId: template.templateId });
                await refresh(offered.instance.id);
              }}
            >
              Bestätigtes Angebot öffnen
            </button>
          </div>
        ))}
        {!available.isLoading && !(available.data?.length) && <p className="text-xs text-slate-500">Aktuell erfüllt kein veröffentlichtes Template seine Aurion-Voraussetzungen.</p>}

        <h4 className="pt-2 font-serif text-xs uppercase text-amber-300">Deine Instanzen</h4>
        {(instances.data ?? []).map(instance => (
          <button
            key={instance.id}
            className={`w-full rounded-xl border p-3 text-left text-xs transition-all motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-95 ${selectedId === instance.id ? "border-amber-400 bg-black/60" : "border-slate-700 bg-black/40"}`}
            aria-pressed={selectedId === instance.id}
            onClick={() => setSelectedId(instance.id)}
          >
            <span className="flex items-center gap-2 text-cyan-200">
              {instance.state === "completed" ? <CheckCircle2 size={13} /> : <ShieldCheck size={13} />}
              {instance.templateId} · {instance.state}
            </span>
            <span className="mt-1 block font-mono text-[10px] text-slate-500">{instance.id}</span>
          </button>
        ))}
      </section>

      <article className="md:col-span-7 space-y-3 rounded-2xl border border-slate-700 bg-black/50 p-4">
        {!selected ? <p className="text-sm text-slate-500">Wähle ein bestätigtes Angebot oder eine Quest-Instanz.</p> : <>
          <div>
            <h4 className="font-serif text-base font-bold text-amber-200">{selected.plan.templateId}</h4>
            <p className="mt-1 font-mono text-[10px] text-slate-500">Plan {selected.plan.planHash.slice(0, 20)}… · Graph {selected.plan.graphHash.slice(0, 20)}…</p>
          </div>
          <div className="rounded-xl border border-cyan-400/15 p-3">
            <p className="text-xs uppercase text-cyan-300">{currentNode?.type ?? "unbekannt"}</p>
            <b className="mt-1 block text-sm">{currentNode?.title ?? selected.instance.currentNodeId}</b>
            {currentNode?.objective && <>
              <p className="mt-2 text-xs text-slate-300">{currentNode.objective.description ?? currentNode.objective.key}</p>
              <p className="mt-1 text-xs text-amber-300">
                Fortschritt: {String(selected.instance.objectiveProgress[currentNode.objective.key] ?? 0)} / {String(currentNode.objective.targetValue)}
              </p>
              <p className="mt-2 text-[11px] text-slate-500">Fortschritt entsteht ausschließlich aus dem gebundenen bestätigten Aurion-Event; es gibt keinen manuellen +1-Button.</p>
            </>}
          </div>

          {selected.instance.state === "offered" && <button
            className="ax1-primary transition-all motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed disabled:motion-safe:hover:translate-y-0 disabled:motion-safe:active:scale-100"
            disabled={busy}
            aria-busy={busy}
            title={busy ? "Wird geladen..." : undefined}
            onClick={async () => { await accept.mutateAsync({ instanceId: selected.instance.id }); await refresh(selected.instance.id); }}
          >Quest annehmen</button>}

          {selected.instance.state === "active" && choices.length > 0 && <div className="space-y-2">
            <p className="flex items-center gap-2 text-xs text-cyan-300"><GitBranch size={13} /> Entscheidung</p>
            {choices.map(edge => <button
              key={edge.id}
              className="ax1-primary mr-2 transition-all motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed disabled:motion-safe:hover:translate-y-0 disabled:motion-safe:active:scale-100"
              disabled={busy || Boolean(edge.conditionPredicate)}
              aria-busy={busy}
              title={busy ? "Wird geladen..." : Boolean(edge.conditionPredicate) ? "Bedingung nicht erfüllt" : undefined}
              onClick={async () => { await choose.mutateAsync({ instanceId: selected.instance.id, edgeId: edge.id }); await refresh(selected.instance.id); }}
            >{edge.choiceLabel ?? edge.id}</button>)}
          </div>}

          {selected.instance.state === "active" && currentNode?.type === "end" && <button
            className="ax1-primary transition-all motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed disabled:motion-safe:hover:translate-y-0 disabled:motion-safe:active:scale-100"
            disabled={busy}
            aria-busy={busy}
            title={busy ? "Wird geladen..." : undefined}
            onClick={async () => { await complete.mutateAsync({ instanceId: selected.instance.id }); await refresh(selected.instance.id); }}
          >Quest abschließen</button>}
        </>}
        {(offer.error || accept.error || choose.error || complete.error || details.error) && <p role="alert" className="text-xs text-red-300">Aktion nicht bestätigt. Der aktuelle Aurion-Stand wurde nicht verändert.</p>}
      </article>
    </div>
  );
}
