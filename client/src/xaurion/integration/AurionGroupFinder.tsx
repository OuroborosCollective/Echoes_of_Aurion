import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { groupReadmodelSchema, groupRoles, groupVariants, type GroupCommand, type GroupReadmodel, type GroupRole } from "@shared/groupInstanceProtocol";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import "./aurionGroupFinder.css";

const roleNames = { tank: "Tank", healer: "Heiler", dps: "Schaden" };
const statusNames = { idle: "Bereit zur Suche", queued: "Warte auf echte Mitspieler", formed: "Gruppe gefunden", entered: "In der gemeinsamen Instanz" };

export function ConfirmedGroupInstance({ data }: { data: GroupReadmodel }) {
  const { ticket, party, player } = data;
  if (!ticket || !party || player.status !== "entered" || !data.enteredUserIds.includes(player.userId) || ticket.partyId !== party.id || ticket.rosterHash !== party.rosterHash || ticket.sourceRevision !== data.sourceRevision || ticket.id !== party.ticketId) return null;
  return <section aria-label="Gemeinsame Instanz" className="aurion-group-instance" data-ticket-id={ticket.id} data-ticket-hash={ticket.hash} data-source-revision={ticket.sourceRevision}>
    <h3>{ticket.label}</h3>
    <p>{ticket.variant} · {data.enteredUserIds.length}/5 eingetreten · {party.phase === "cleared" ? "Gegner besiegt" : `Begegnung ${party.bossIndex + 1}/${ticket.bosses.length}`}</p>
    <svg role="img" aria-label="Bestätigter Instanzplan" viewBox={`-20 -30 ${ticket.rooms.length * 84 + 20} 100`}>
      {ticket.rooms.map((room, index) => <g key={room.id}>
        {index > 0 && <path d={`M${index * 84 - 40} 0h40`} stroke="#49676c" strokeWidth="3" />}
        <rect x={index * 84} y={-20} width="44" height="40" rx="5" fill={index === Math.min(party.bossIndex, ticket.rooms.length - 1) ? "#23696a" : "#172d37"} stroke="#7bafab" />
        <text x={index * 84 + 22} y="5" textAnchor="middle" fill="#e0eee8" fontSize="13">{room.id + 1}</text>
      </g>)}
    </svg>
    <ul>{party.roster.map(member => { const health = party.health.find(h => h.userId === member.userId); return <li key={member.userId}>
      <span>{member.name} · {roleNames[member.role]} · {data.enteredUserIds.includes(member.userId) ? "eingetreten" : "außerhalb"}</span>
      {health && <><progress aria-label={`${member.name} Lebenspunkte`} value={health.hp} max={ticket.playerMaxHp} /><span>{health.hp}/{ticket.playerMaxHp} LP</span></>}
    </li>; })}</ul>
    {party.phase === "active" && <p>{ticket.bosses[party.bossIndex]?.id.replaceAll("_", " ")} · {party.bossHp} LP</p>}
    <p className="aurion-group-note">Gruppenbelohnungen sind noch nicht freigeschaltet. Dieser Lauf vergibt keine EP, Gegenstände oder Questfortschritte.</p>
    <details><summary>Instanzbeleg</summary><code>{ticket.id}</code><code>{ticket.sourceRevision}</code><code>{ticket.hash}</code></details>
  </section>;
}

export function AurionGroupFinder({ open, onClose }: { open: boolean; onClose?: () => void }) {
  const { user, isAuthenticated } = useAuth();
  const query = trpc.groups.read.useQuery(undefined, { enabled: open && isAuthenticated, refetchInterval: open ? 2_000 : false, staleTime: 3_000 });
  const mutation = trpc.groups.command.useMutation();
  const [role, setRole] = useState<GroupRole>("dps");
  const [dungeonId, setDungeonId] = useState<GroupReadmodel["catalog"][number]["id"]>("dungeon_aschengewoelbe");
  const [variant, setVariant] = useState<typeof groupVariants[number]>("normal");
  const [message, setMessage] = useState("");
  const [confirmLeave, setConfirmLeave] = useState(false);
  const busy = useRef(false);
  const parsed = groupReadmodelSchema.safeParse(query.data);
  const data = parsed.success && parsed.data.player.userId === user?.id && !query.isError ? parsed.data : null;
  const current = useRef(data);
  current.current = data;
  const act = useCallback(async (action: GroupCommand["action"]) => {
    const value = current.current;
    if (!value || busy.current) return;
    busy.current = true;
    setMessage("");
    try { await mutation.mutateAsync({ expectedRevision: value.player.revision, action }); }
    catch { setMessage("Die Aktion ist nicht bestätigt. Der aktuelle Gruppenstand wird neu gelesen; prüfe Rolle, Ausrüstung und Bereitschaft."); }
    finally { await query.refetch(); busy.current = false; }
  }, [mutation.mutateAsync, query.refetch]);
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => { if (current.current?.player.status === "queued") void act({ kind: "renew" }); }, 30_000);
    return () => clearInterval(timer);
  }, [open, act]);
  const player = data?.player, party = data?.party, ticket = data?.ticket;
  const fresh = Boolean(data) && !mutation.isPending;
  const compatible = !party || party.sourceRevision === data?.sourceRevision;
  const canActInInstance = fresh && compatible;
  const content = <div className="aurion-group-finder" data-testid="aurion-group-finder">
    {!isAuthenticated ? <p>Bitte melde dich an, um eine Gruppe zu finden.</p> : !data ? <><p role="alert">{query.isError || (query.data && !data) ? "Gruppendaten können nicht bestätigt werden." : "Gruppe wird geladen …"}</p><button type="button" onClick={() => void query.refetch()}>Erneut laden</button></> : <>
      <p role="status">{statusNames[data.player.status]}</p>
      {player?.status === "idle" && <>
        <fieldset disabled={!fresh}><legend>Ausgerüstete Gruppen-Skills</legend>
          <label><input type="checkbox" checked={player.skills.includes("mending_light")} onChange={event => void act({ kind: "equip", skills: event.target.checked ? [...player.skills, "mending_light"] : player.skills.filter(s => s !== "mending_light") })} /> Heilendes Licht · ermöglicht Gruppenheilung mit jeder Waffe</label>
          <label><input type="checkbox" checked={player.skills.includes("guardian_stance")} onChange={event => void act({ kind: "equip", skills: event.target.checked ? [...player.skills, "guardian_stance"] : player.skills.filter(s => s !== "guardian_stance") })} /> Wächterhaltung · ermöglicht die Tankrolle</label>
        </fieldset>
        <label>Dungeon<select value={dungeonId} onChange={event => setDungeonId(event.target.value as typeof dungeonId)}>{data.catalog.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}</select></label>
        <label>Variante<select value={variant} onChange={event => setVariant(event.target.value as typeof variant)}>{groupVariants.map(v => <option key={v}>{v}</option>)}</select></label>
        <fieldset disabled={!fresh}><legend>Deine Rolle · 1 Tank / 1 Heiler / 3 Schaden</legend>{groupRoles.map(r => <label key={r}><input type="radio" name="group-role" value={r} checked={role === r} disabled={!data.qualification.roles.includes(r)} onChange={() => setRole(r)} /> {roleNames[r]}{!data.qualification.roles.includes(r) && " · passende Ausrüstung fehlt"}</label>)}</fieldset>
        <button type="button" disabled={!fresh || !data.qualification.roles.includes(role)} onClick={() => void act({ kind: "join", dungeonId, variant, role, qualificationHash: data.qualification.hash })}>Gruppe suchen</button>
      </>}
      {player?.status === "queued" && <><p>{roleNames[player.role!]} · die Suche bleibt aktiv, solange dieses Fenster geöffnet ist.</p><button type="button" disabled={!fresh} onClick={() => void act({ kind: "cancel" })}>Suche abbrechen</button></>}
      {party && <>
        {!compatible && <p role="alert">Die Serverversion hat sich geändert. Verlasst diese Gruppe und startet eine neue Suche.</p>}
        <p>Gruppenleiter: {party.roster.find(m => m.userId === party.leaderUserId)?.name}</p>
        <ul>{party.roster.map(member => <li key={member.userId}>{member.name} · {roleNames[member.role]} · {data.readyUserIds.includes(member.userId) ? "bereit" : "noch nicht bereit"}</li>)}</ul>
        {party.phase === "ready" && <button type="button" disabled={!canActInInstance} onClick={() => void act({ kind: "ready", partyId: party.id, rosterHash: party.rosterHash, ready: !player!.ready })}>{player?.ready ? "Bereitschaft zurücknehmen" : "Für diese Gruppe bereit"}</button>}
        {ticket && player?.status !== "entered" && <button type="button" disabled={!canActInInstance || ticket.sourceRevision !== data.sourceRevision || party.phase === "aborted"} onClick={() => void act({ kind: "enter", ticketId: ticket.id, ticketHash: ticket.hash })}>Gemeinsame Instanz betreten / fortsetzen</button>}
        {ticket && player?.status === "entered" && <>
          <ConfirmedGroupInstance data={data} />
          <div className="aurion-group-actions"><button type="button" disabled={!canActInInstance || party.phase !== "active" || !data.qualification.weaponTrack} onClick={() => void act({ kind: "strike", ticketId: ticket.id, expectedInstanceRevision: party.instanceRevision })}>Gemeinsam angreifen</button>
            {player.skills.includes("mending_light") && party.health.map(target => <button type="button" key={target.userId} disabled={!canActInInstance || party.phase !== "active" || target.hp <= 0 || target.hp >= ticket.playerMaxHp || !data.enteredUserIds.includes(target.userId)} onClick={() => void act({ kind: "heal", ticketId: ticket.id, expectedInstanceRevision: party.instanceRevision, targetUserId: target.userId })}>{party.roster.find(m => m.userId === target.userId)?.name} heilen</button>)}
            <button type="button" disabled={!canActInInstance} onClick={() => void act({ kind: "exit" })}>Instanz verlassen, Platz behalten</button></div>
        </>}
        {confirmLeave ? <div role="group" aria-label="Gruppe verlassen bestätigen"><p>Dein Austritt beendet diese Fünfergruppe und ihren gemeinsamen Lauf für alle fünf Mitglieder. Danach könnt ihr neu suchen.</p><button type="button" autoFocus onClick={() => setConfirmLeave(false)}>In der Gruppe bleiben</button><button type="button" disabled={!fresh} onClick={async () => { await act({ kind: "leave", partyId: party.id, rosterHash: party.rosterHash }); setConfirmLeave(false); }}>Gruppe verlassen und Lauf beenden</button></div> : <button type="button" onClick={() => setConfirmLeave(true)}>Gruppe verlassen …</button>}
      </>}
    </>}
    {message && <p role="status">{message}</p>}
  </div>;
  if (!onClose) return <main className="aurion-groups-page"><a href="/">Zur Sternwarte</a><h1>Gruppenexpedition</h1>{content}</main>;
  return <Dialog open={open} onOpenChange={value => { if (!value) { setConfirmLeave(false); onClose(); } }}><DialogContent className="aurion-authority-hud__dialog" overlayClassName="aurion-authority-hud__backdrop"><DialogTitle>Gruppenexpedition</DialogTitle><DialogDescription>Echte Mitspieler, bestätigte Rollen und eine gemeinsame Instanz. Das Schließen beendet die Gruppe nicht.</DialogDescription>{content}</DialogContent></Dialog>;
}

export default function AurionGroupsPage() { return <AurionGroupFinder open />; }
