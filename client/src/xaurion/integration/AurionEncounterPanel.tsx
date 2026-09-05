import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { encounterReadbackSchema } from "@shared/encounterReadback";
import { projectReadback, readbackLabels } from "./authoritativeHudProjection";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

export function AurionEncounterPanel({ userId, connected, onAttack }: { userId: number; connected: boolean; onAttack: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const query = trpc.gameplay.currentEncounter.useQuery(undefined, { enabled: userId > 0, staleTime: 10_000, refetchInterval: 5_000 });
  const start = trpc.gameplay.startEncounter.useMutation();
  const current = projectReadback(encounterReadbackSchema.refine(value => !value.active || value.active.userId === userId), query);
  const active = current.data?.active;
  const enemy = current.data?.encounters.find(encounter => encounter.key === active?.encounterKey);
  const fresh = connected && current.state === "live" && !busy && !start.isPending;
  useEffect(() => {
    const refresh = () => { void query.refetch(); };
    const status = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (typeof detail === "object" && detail !== null && "busy" in detail && typeof detail.busy === "boolean") setBusy(detail.busy);
      if (typeof detail === "object" && detail !== null && "message" in detail && typeof detail.message === "string") setMessage(detail.message.slice(0, 240));
    };
    window.addEventListener("aurion:authoritative-action", refresh);
    window.addEventListener("aurion:encounter-status", status);
    return () => { window.removeEventListener("aurion:authoritative-action", refresh); window.removeEventListener("aurion:encounter-status", status); };
  }, [query.refetch]);
  return <section className="aurion-encounter" aria-label="Begegnung" data-state={current.state}>
    <small>{readbackLabels[current.state]}</small>
    {active && enemy ? <><b>{enemy.enemyName}</b><progress aria-label="Bestätigte Gegnergesundheit" value={active.bossHp} max={active.maxBossHp} /><span>{active.bossHp} / {active.maxBossHp} LP</span><button type="button" disabled={!fresh || open} onClick={onAttack}>Angreifen</button></> : <span>{current.state === "live" ? "Keine aktive Begegnung" : "Begegnung wird geprüft"}</span>}
    <button type="button" onClick={() => setOpen(true)}>Begegnungen</button>
    {message && <span role="status">{message}</span>}
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="aurion-authority-hud__dialog" overlayClassName="aurion-authority-hud__backdrop">
        <DialogTitle>Begegnungen</DialogTitle>
        <DialogDescription>Nimm den zugehörigen Auftrag an. Eine laufende Begegnung bleibt bei der Rückkehr zur Sternwarte gespeichert.</DialogDescription>
        {current.data?.encounters.map(encounter => <article className="aurion-authority-hud__card" key={encounter.key}><b>{encounter.name}</b><p>{encounter.enemyName}</p>
          <button type="button" disabled={!fresh || (!encounter.available && active?.encounterKey !== encounter.key) || Boolean(active && active.encounterKey !== encounter.key)} onClick={async () => {
            if (!fresh) return;
            setMessage("");
            try { await start.mutateAsync({ encounterKey: encounter.key }); await query.refetch(); setOpen(false); }
            catch { setMessage("Start nicht bestätigt. Prüfe den Auftrag und aktualisiere die Begegnung."); await query.refetch(); }
          }}>{active?.encounterKey === encounter.key ? "Begegnung fortsetzen" : `${encounter.name} beginnen`}</button>
        </article>)}
        {message && <p role="status">{message}</p>}
      </DialogContent>
    </Dialog>
  </section>;
}
