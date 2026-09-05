import { useQuery } from "@tanstack/react-query";
import { ownedGuildGovernance } from "@shared/guildGovernanceView";
import type { GuildCapability, GuildMembershipRole } from "@shared/guildGovernanceContract";

const roles: Record<GuildMembershipRole, string> = {
  founder: "Gründer", officer: "Offizier", member: "Mitglied", applicant: "Bewerber",
};
const capabilities: Record<GuildCapability, string> = {
  member_manage: "Mitglieder verwalten", diplomacy_manage: "Diplomatie verwalten",
  territory_manage: "Territorien verwalten", bank_deposit: "Bankeinzahlungen",
  bank_withdraw: "Bankentnahmen", building_manage: "Gebäude verwalten",
  kingdom_consolidate: "Königreich konsolidieren",
};

export default function GuildGovernancePanel({ userId, guildId }: { userId: number; guildId: string }) {
  const query = useQuery({
    queryKey: ["guild-governance", userId, guildId],
    enabled: userId > 0 && Boolean(guildId),
    staleTime: 10_000,
    refetchInterval: 15_000,
    retry: false,
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/guild/governance", { credentials: "include", signal });
      if (!response.ok) throw Error("GOVERNANCE_READ_FAILED");
      const body = await response.json();
      if (body.success !== true) throw Error("GOVERNANCE_READ_UNCONFIRMED");
      return ownedGuildGovernance(body.governance, userId, guildId);
    },
  });
  const view = query.data;
  return <section aria-label="Gildenpolitik" data-testid="guild-governance-panel">
    <h4>Rolle, Territorien & Königreich</h4>
    {query.isError ? <p role="alert">Die Gildenpolitik konnte nicht bestätigt werden.</p>
      : !view ? <p role="status">Gildenpolitik wird geladen.</p>
      : <>
        <p role="status">{query.isStale ? "Aktualisierung der Gildenpolitik ausstehend." : "Gildenpolitik vom Server bestätigt."}</p>
        <p>Deine Rolle: <b>{roles[view.role]}</b></p>
        {view.kingdom ? <dl>
          <dt>Königreich</dt><dd>{view.kingdom.name}</dd>
          <dt>Herrscher</dt><dd>Explorer {view.kingdom.rulerUserId}</dd>
          <dt>Hauptstadtgebiet</dt><dd>{view.kingdom.capitalTerritoryId}</dd>
        </dl> : <p>Kein bestätigtes Königreich.</p>}
        <h5>Bestätigte Territorien</h5>
        {view.territories.length === 0 ? <p>Keine bestätigten Territorien.</p> : <ul>
          {view.territories.map(territory => <li key={territory.territoryId}>
            {territory.worldId} · Chunk {territory.chunkX}, {territory.chunkZ} · {territory.state === "active" ? "Kontrolliert" : "Umkämpft"}
          </li>)}
        </ul>}
        <h5>Deine ausdrücklich vergebenen Rechte</h5>
        {view.grants.length === 0 ? <p>Keine zusätzlichen Rechte vergeben. Deine Rolle gilt weiterhin.</p> : <ul>
          {view.grants.map((grant, index) => <li key={`${grant.capability}:${grant.scopeKind}:${grant.scopeId}:${index}`}>
            {capabilities[grant.capability]} · {grant.scopeId} · {grant.status === "active" ? "Aktiv" : "Widerrufen"}
          </li>)}
        </ul>}
      </>}
    <button disabled={query.isFetching} onClick={() => void query.refetch()}>Gildenpolitik aktualisieren</button>
  </section>;
}
