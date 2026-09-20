import { trpc } from "@/lib/trpc";
import { decodeOwnedNpcPacket, type PublicNpcSnapshot } from "@shared/npcSnapshotProtocol";
import { decodeOwnedNpcMultiMemory, type PublicNpcMultiMemory } from "@shared/npcMultiMemoryReadmodel";
import { decodeOwnedNpcActions, type PublicNpcAction } from "@shared/npcActionReadmodel";
import { decodeOwnedNpcSemanticGraphs, type PublicNpcSemanticGraph } from "@shared/npcSemanticGraphReadmodel";
import { decodeOwnedNpcProjectionProvenance, type PublicNpcProjectionProvenance } from "@shared/npcSemanticGraphProvenanceReadmodel";
const goals: Record<PublicNpcSnapshot["goal"],string> = {seek_safety:"Sicherheit suchen",gather_resources:"Ressourcen sammeln",socialize:"Gemeinschaft suchen",gain_reputation:"Ansehen gewinnen",trade:"Handel treiben",expand_influence:"Einfluss ausbauen"};
const names: Record<string,string> = {lyra:"Lyra",orun:"Orun",ax1_merchant_observatory_threshold:"Valen",ax1_merchant_windhollow:"Elowen",ax1_merchant_emberfall:"Torin",ax1_merchant_cinder_vault:"Kael"};
function NpcActionPanel({userId}:{userId:number}) {
  const query=trpc.gameplay.npcActions.useQuery(undefined,{enabled:userId>0,staleTime:15_000,refetchInterval:10_000});
  let actions:PublicNpcAction[]|undefined,invalid=false;
  if(query.data){try{actions=decodeOwnedNpcActions(query.data,userId).actions;}catch{invalid=true;}}
  return <section aria-label="Bestätigte NPC-Aktionen" data-testid="npc-action-panel">
    <h4>Bestätigte NPC-Aktionen</h4>
    {query.isError||invalid ? <><p role="alert">Die ausgeführten NPC-Aktionen konnten nicht bestätigt werden.</p><button onClick={()=>void query.refetch()}>Aktionen aktualisieren</button></> : !actions ? <p role="status">Bestätigte NPC-Aktionen werden geladen.</p> : <>
      {query.isStale&&<p role="status">Letzter bestätigter Aktionsstand; Aktualisierung ausstehend.</p>}
      {actions.length===0 ? <p>Noch keine durch Effect-Readback bestätigte NPC-Aktion.</p> : actions.map(action=><article key={action.npcId} data-testid="npc-action-row" data-npc-id={action.npcId} data-action-receipt-id={action.actionReceiptId} data-effect-readback-hash={action.readbackHash} data-resolution-index={action.resolutionIndex}>
        <b>{names[action.npcId]??action.npcId}</b>
        <p>Ausgeführt: {action.action}</p>
        <small>Receipt {action.actionReceiptId.slice(0,18)}…</small>
      </article>)}
    </>}
  </section>;
}
function NpcSemanticGraphPanel({userId}:{userId:number}) {
  const query=trpc.gameplay.npcSemanticGraph.useQuery(undefined,{enabled:userId>0,staleTime:15_000,refetchInterval:10_000});
  let graphs:PublicNpcSemanticGraph[]|undefined,invalid=false;
  if(query.data){try{graphs=decodeOwnedNpcSemanticGraphs(query.data,userId).graphs;}catch{invalid=true;}}
  return <section aria-label="Verifizierter NPC-Erinnerungsgraph" data-testid="npc-semantic-graph-panel">
    <h4>Verifizierter Erinnerungsgraph</h4>
    {query.isError||invalid ? <><p role="alert">Der semantische Erinnerungsgraph konnte nicht bestätigt werden.</p><button onClick={()=>void query.refetch()}>Graph aktualisieren</button></> : !graphs ? <p role="status">Verifizierter Erinnerungsgraph wird geladen.</p> : <>
      {query.isStale&&<p role="status">Letzter verifizierter Graphstand; Aktualisierung ausstehend.</p>}
      {graphs.length===0 ? <p>Noch kein verifizierter Graphstand verfügbar.</p> : graphs.map(graph=><article key={graph.npcId} data-testid="npc-semantic-graph-row" data-npc-id={graph.npcId} data-graph-hash={graph.graphHash} data-result-hash={graph.resultHash} data-source-result-hash={graph.sourceResultHash} data-generation={graph.generation} data-provenance-status={graph.provenanceStatus}>
        <b>{names[graph.npcId]??graph.npcId}</b>
        <p>{graph.nodes.length} aktive Knoten · {graph.relations.length} bestätigte Beziehungen</p>
        <small>Generation {graph.generation} · Provenienz {graph.provenanceStatus}</small>
        <ul>{graph.nodes.filter(node=>node.semanticKey!==null).slice(0,6).map(node=><li key={node.nodeId}>{node.kind}: {node.semanticKey}</li>)}</ul>
        {(graph.excluded.expired+graph.excluded.contradicted+graph.excluded.superseded)>0&&<p>{graph.excluded.expired} abgelaufen · {graph.excluded.contradicted} widersprochen · {graph.excluded.superseded} ersetzt</p>}
      </article>)}
    </>}
  </section>;
}
function NpcProjectionProvenancePanel({userId}:{userId:number}) {
  const query=trpc.gameplay.npcProjectionProvenance.useQuery(undefined,{enabled:userId>0,staleTime:15_000,refetchInterval:10_000});
  let projections:PublicNpcProjectionProvenance[]|undefined,invalid=false;
  if(query.data){try{projections=decodeOwnedNpcProjectionProvenance(query.data,userId).projections;}catch{invalid=true;}}
  return <section aria-label="Verifizierte Projektions-Provenienz" data-testid="npc-projection-provenance-panel">
    <h4>Verifizierte Projektions-Provenienz</h4>
    {query.isError||invalid ? <><p role="alert">Die Projektions-Provenienz konnte nicht bestätigt werden.</p><button onClick={()=>void query.refetch()}>Provenienz aktualisieren</button></> : !projections ? <p role="status">Verifizierte Projektions-Provenienz wird geladen.</p> : <>
      {query.isStale&&<p role="status">Letzter verifizierter Provenienzstand; Aktualisierung ausstehend.</p>}
      {projections.length===0 ? <p>Noch kein verifizierter Projektions-Provenienzstand verfügbar.</p> : projections.map(projection=><article key={projection.npcId} data-testid="npc-projection-provenance-row" data-npc-id={projection.npcId} data-generation={projection.generation} data-source-revision={projection.sourceRevision} data-provenance-status={projection.provenanceStatus}>
        <b>{names[projection.npcId]??projection.npcId}</b>
        <small>Generation {projection.generation} · Provenienz {projection.provenanceStatus}</small>
        <p>Quellrevision {projection.sourceRevision.slice(0,12)}…</p>
      </article>)}
    </>}
  </section>;
}
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
    <NpcActionPanel userId={userId}/>
    <NpcSemanticGraphPanel userId={userId}/>
    <NpcProjectionProvenancePanel userId={userId}/>
  </section>;
}
