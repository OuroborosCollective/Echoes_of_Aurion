import { trpc } from "@/lib/trpc";
import { standingLabels, standingReadbackSchema } from "@shared/npcStanding";
import { projectReadback, readbackLabels } from "./authoritativeHudProjection";

const names: Record<string, string> = { lyra: "Lyra", orun: "Orun", sunward_concord: "Sonnenkonkord", ironwardens: "Eisenwächter", veiled_covenant: "Verhüllter Bund", wayfarer_compact: "Wandererpakt", free_haven: "Freihafen" };
export function NpcStandingPanel({ userId }: { userId: number }) {
  const query = trpc.gameplay.relationshipStanding.useQuery(undefined, { enabled: userId > 0, staleTime: 15_000, refetchInterval: 10_000 });
  const state = projectReadback(standingReadbackSchema.refine(v => v.userId === userId), query);
  return <section aria-label="Beziehungen" data-testid="npc-standing-panel" data-state={state.state}>
    <h3>Beziehungen & Ansehen</h3><p role="status">{readbackLabels[state.state]}</p>
    {state.data?.entries.filter(e => e.kind === "npc_relation" || e.sourceCount > 0).map(entry => <article className="aurion-authority-hud__card" key={`${entry.kind}:${entry.id}`}>
      <b>{names[entry.id] ?? entry.id}</b><p>{standingLabels[entry.tier]} · Ansehen {entry.score}</p>
      <p>{entry.sourceCount === 0 ? "Noch keine bestätigten Beziehungsevents." : `${entry.sourceCount} bestätigte Abschlüsse · Beziehungsmeisterschaft ${entry.levelExact} · ${entry.xpExact} EP`}</p>
    </article>)}
    {state.data?.social.filter(s => s.usesExact !== "0").map(s => <p key={s.id}>{s.id === "friendship" ? "Freundschaft" : "Diplomatie"}: Meisterschaft {s.levelExact} · {s.xpExact} EP</p>)}
    {(state.state === "error" || state.state === "stale") && <button onClick={() => void query.refetch()}>Beziehungen aktualisieren</button>}
  </section>;
}
