import { trpc } from "@/lib/trpc";
import { decodeOwnedNpcPacket, type PublicNpcSnapshot } from "@shared/npcSnapshotProtocol";
import { decodeOwnedNpcMultiMemory, type PublicNpcMultiMemory } from "@shared/npcMultiMemoryReadmodel";
const goals: Record<PublicNpcSnapshot["goal"],string> = {seek_safety:"Sicherheit suchen",gather_resources:"Ressourcen sammeln",socialize:"Gemeinschaft suchen",gain_reputation:"Ansehen gewinnen",trade:"Handel treiben",expand_influence:"Einfluss ausbauen"};
const names: Record<string,string> = {lyra:"Lyra",orun:"Orun",ax1_merchant_observatory_threshold:"Valen",ax1_merchant_windhollow:"Elowen",ax1_merchant_emberfall:"Torin",ax1_merchant_cinder_vault:"Kael"};
function NpcMemoryPanel({userId}:{userId:number}) {
  const query=trpc.gameplay.npcMultiMemory.useQuery(undefined,{enabled:userId>0,staleTime:15_000,refetchInterval:10_000});
  let npcs: PublicNpcMultiMemory[]|undefined,invalid=false;
  if(query.data){try{npcs=decodeOwnedNpcMultiMemory(query.data,userId).npcs;}catch{invalid=true;}}
  return <section aria-label="NPC-Erinnerungen" data-testid="npc-multi-memory-panel">
    <h4>NPC-Erinnerungen</h4>
    {query.isError||invalid ? <><p role="alert">Die NPC-Erinnerungen konnten nicht bestätigt werden.</p><button onClick={()=>void query.refetch()}>Erinnerungen aktualisieren</button></> : !npcs ? <p role="status">NPC-Erinnerungen werden geladen.</p> : <>
      {query.isStale&&<p role="status">Letzter bestätigter Stand; Aktualisierung ausstehend.</p>}
      {npcs.length===0 ? <p>Noch keine bestätigten Einträge im neuen Erinnerungssystem.</p> : npcs.map(npc=><article key={npc.npcId} data-testid="npc-multi-memory-row" data-npc-id={npc.npcId} data-memory-hash={npc.memoryHash} data-resolution-index={npc.resolutionIndex}>
        <b>{names[npc.npcId]??npc.npcId}</b><p>{goals[npc.goal]}</p>
        <dl><dt>Aktueller Fokus</dt><dd>{npc.counts.working}</dd><dt>Erinnerte Entscheidungen</dt><dd>{npc.counts.episodic}</dd><dt>Gesicherte Fakten</dt><dd>{npc.counts.semantic}</dd><dt>Fähigkeiten</dt><dd>{npc.counts.procedural}</dd></dl>
        {npc.planStatus==="blocked"&&<p>Der nächste Schritt ist noch offen.</p>}
        {npc.conflictedFacts>0&&<p>{npc.conflictedFacts} widersprüchliche Fakten</p>}
        {npc.expiredFacts>0&&<p>{npc.expiredFacts} abgelaufene Fakten</p>}
      </article>)}
    </>}
  </section>;
}
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
    <NpcMemoryPanel userId={userId}/>
  </section>;
}
