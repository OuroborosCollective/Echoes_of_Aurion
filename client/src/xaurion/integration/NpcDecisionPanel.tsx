import { trpc } from "@/lib/trpc";
import { decodeOwnedNpcPacket, type PublicNpcSnapshot } from "@shared/npcSnapshotProtocol";
const goals: Record<PublicNpcSnapshot["goal"],string> = {seek_safety:"Sicherheit suchen",gather_resources:"Ressourcen sammeln",socialize:"Gemeinschaft suchen",gain_reputation:"Ansehen gewinnen",trade:"Handel treiben",expand_influence:"Einfluss ausbauen"};
export function NpcDecisionPanel({userId}:{userId:number}) {
  const query=trpc.gameplay.npcSnapshots.useQuery(undefined,{enabled:userId>0,staleTime:15_000,refetchInterval:10_000});
  let npcs: readonly PublicNpcSnapshot[]|undefined, invalid=false;
  if(query.data) {try {npcs=decodeOwnedNpcPacket(query.data,userId).npcs;} catch {invalid=true;}}
  const unavailable=query.isError||invalid;
  return <section aria-label="NPC-Verhalten" data-testid="npc-decision-panel">
    <h3>NPC-Verhalten</h3>
    {unavailable ? <><p role="alert">Das NPC-Verhalten konnte nicht bestätigt werden.</p><button onClick={()=>void query.refetch()}>NPC-Verhalten aktualisieren</button></> : !npcs ? <p role="status">NPC-Verhalten wird geladen.</p> : <>
      {query.isStale && <p role="status">Letzter bestätigter Stand; Aktualisierung ausstehend.</p>}
      {npcs.length===0 ? <p>Noch keine bestätigten Verhaltensentscheidungen für Lyra und Orun.</p> : npcs.map(npc=><article key={npc.npcId}><b>{npc.npcId==="lyra"?"Lyra":npc.npcId==="orun"?"Orun":npc.npcId}</b><p>{goals[npc.goal]}</p><small>{npc.memoryCount} bestätigte Erinnerungen</small></article>)}
    </>}
  </section>;
}
