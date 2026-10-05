/**
 * Guild Overview Dashboard — Admin view for the four-hub guild system.
 *
 * Displays guild influence, trade routes, and political mood across the
 * four Living History hubs. Data comes from the /healthz endpoint via the
 * tRPC `history.getGuildOverview` admin procedure.
 */

import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Landmark, TrendingUp, Swords, Shield, Coins, MapPin, Activity } from "lucide-react";
import { useMemo } from "react";

const HUB_LABELS: Readonly<Record<string, string>> = {
  observatory_threshold: "Observatoriumsschwelle",
  windhollow: "Windhöhle",
  emberfall: "Glutsturz",
  cinder_vault: "Aschegewölbe",
};

const TRADE_POLICY_LABELS: Readonly<Record<string, string>> = {
  free_trade: "Freier Handel",
  protectionist: "Protektionismus",
  caravan_focused: "Karawanen-Fokus",
  self_sufficient: "Selbstversorgung",
};

const DIPLOMACY_LABELS: Readonly<Record<string, string>> = {
  alliance: "Allianz",
  trade_pact: "Handelsabkommen",
  neutral: "Neutral",
  rivalry: "Rivalität",
};

function moodColor(pressure: number): string {
  if (pressure > 0.6) return "text-red-400";
  if (pressure > 0.3) return "text-amber-400";
  return "text-emerald-400";
}

function moodLabel(pressure: number): string {
  if (pressure > 0.6) return "Kritisch";
  if (pressure > 0.3) return "Angespannt";
  return "Stabil";
}

function barWidth(value: number): string {
  return `${Math.max(0, Math.min(100, value * 100)).toFixed(0)}%`;
}

type HubEconomicSnapshot = {
  hubId: string;
  economyPressure: number;
  hazardPressure: number;
  scarcityPressure: number;
  politicsPressure: number;
  tradeVolume: number;
  caravanActivity: number;
  signalCount: number;
};

type GuildState = {
  guildId: string;
  name: string;
  hubId: string;
  leaderNpcId: string;
  members: ReadonlyArray<{ npcId: string; hubId: string; role: string; joinedCycle: number }>;
  tradePolicy: string;
  treasuryCopper: number;
  foundedCycle: number;
  lastElectionCycle: number;
  diplomacy: ReadonlyArray<{ targetGuildId: string; stance: string; sinceCycle: number }>;
  revision: number;
  stateHash: string;
};

function HubCard({ hubId, guild, economicSnapshot }: {
  hubId: string;
  guild: GuildState | undefined;
  economicSnapshot: HubEconomicSnapshot | undefined;
}) {
  const hubLabel = HUB_LABELS[hubId] ?? hubId;

  return (
    <Card className="border-cyan-200/15 bg-slate-950/70">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-amber-100">
            <MapPin className="h-4 w-4 text-cyan-300" />
            {hubLabel}
          </CardTitle>
          {guild ? (
            <Badge className="bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/10">
              {TRADE_POLICY_LABELS[guild.tradePolicy] ?? guild.tradePolicy}
            </Badge>
          ) : (
            <Badge variant="outline" className="border-slate-500/30 text-slate-400">
              Keine Gilde
            </Badge>
          )}
        </div>
        <CardDescription className="text-xs">
          {economicSnapshot ? `${economicSnapshot.signalCount} Wirtschaftssignale` : "Keine Wirtschaftsdaten"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Guild info */}
        {guild ? (
          <div className="space-y-2 rounded-lg border border-cyan-200/10 bg-cyan-400/[.03] p-3">
            <div className="flex items-center gap-2">
              <Landmark className="h-3.5 w-3.5 text-amber-300" />
              <span className="text-sm font-medium text-amber-50">{guild.name}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-slate-400">
              <span><Users className="mr-1 inline h-3 w-3" />{guild.members.length} Mitglieder</span>
              <span><Coins className="mr-1 inline h-3 w-3" />{guild.treasuryCopper} Kupfer</span>
              <span>Leiter: {guild.leaderNpcId.replace("ax1_merchant_", "")}</span>
              <span>Revision: {guild.revision}</span>
            </div>
            {/* Member roles */}
            <div className="flex flex-wrap gap-1 pt-1">
              {guild.members.map((m) => (
                <Badge key={m.npcId} variant="outline" className={`text-[10px] ${m.role === "leader" ? "border-amber-300/40 text-amber-200" : "border-cyan-300/20 text-cyan-100/70"}`}>
                  {m.role === "leader" ? "★" : ""}{m.npcId.replace("ax1_merchant_", "")}
                </Badge>
              ))}
            </div>
            {/* Diplomacy */}
            {guild.diplomacy.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1 border-t border-cyan-200/10">
                {guild.diplomacy.map((d) => (
                  <Badge key={d.targetGuildId} variant="outline" className={`text-[10px] ${
                    d.stance === "alliance" ? "border-emerald-300/30 text-emerald-200" :
                    d.stance === "rivalry" ? "border-red-300/30 text-red-200" :
                    "border-slate-400/30 text-slate-300"
                  }`}>
                    {DIPLOMACY_LABELS[d.stance] ?? d.stance}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-slate-500 italic">In diesem Hub wurde noch keine Gilde gegründet.</p>
        )}

        {/* Economic indicators */}
        {economicSnapshot && (
          <div className="space-y-2">
            <div className="flex items-center gap-1 text-xs text-cyan-200/60">
              <Activity className="h-3 w-3" /> Wirtschaftsindikatoren
            </div>
            {/* Economy pressure */}
            <div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Wirtschaftsdruck</span>
                <span className={moodColor(Math.abs(economicSnapshot.economyPressure))}>
                  {economicSnapshot.economyPressure > 0 ? "↑" : "↓"} {Math.abs(economicSnapshot.economyPressure * 100).toFixed(0)}%
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-slate-800">
                <div className="h-full rounded-full bg-cyan-400/60" style={{ width: barWidth(Math.abs(economicSnapshot.economyPressure)) }} />
              </div>
            </div>
            {/* Trade volume */}
            <div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400"><TrendingUp className="mr-1 inline h-3 w-3" />Handelsvolumen</span>
                <span className="text-amber-100">{(economicSnapshot.tradeVolume * 100).toFixed(0)}%</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-slate-800">
                <div className="h-full rounded-full bg-amber-400/60" style={{ width: barWidth(economicSnapshot.tradeVolume) }} />
              </div>
            </div>
            {/* Scarcity */}
            <div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Knappheit</span>
                <span className={moodColor(economicSnapshot.scarcityPressure)}>
                  {moodLabel(economicSnapshot.scarcityPressure)}
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-slate-800">
                <div className="h-full rounded-full bg-orange-400/60" style={{ width: barWidth(economicSnapshot.scarcityPressure) }} />
              </div>
            </div>
            {/* Hazard */}
            <div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400"><Swords className="mr-1 inline h-3 w-3" />Gefahrenindex</span>
                <span className={moodColor(economicSnapshot.hazardPressure)}>
                  {moodLabel(economicSnapshot.hazardPressure)}
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-slate-800">
                <div className="h-full rounded-full bg-red-400/60" style={{ width: barWidth(economicSnapshot.hazardPressure) }} />
              </div>
            </div>
            {/* Politics */}
            <div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400"><Shield className="mr-1 inline h-3 w-3" />Politische Stimmung</span>
                <span className={moodColor(economicSnapshot.politicsPressure)}>
                  {moodLabel(economicSnapshot.politicsPressure)}
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-slate-800">
                <div className="h-full rounded-full bg-purple-400/60" style={{ width: barWidth(economicSnapshot.politicsPressure) }} />
              </div>
            </div>
            {/* Caravan activity */}
            {economicSnapshot.caravanActivity > 0 && (
              <div className="flex items-center gap-1 text-xs text-cyan-100/70 pt-1">
                <MapPin className="h-3 w-3" />
                {economicSnapshot.caravanActivity} Karawanenroute(n) aktiv
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function GuildOverviewDashboard() {
  const overview = trpc.history.getGuildOverview.useQuery(undefined, { refetchInterval: 5000 });

  const hubData = useMemo(() => {
    if (!overview.data?.available) return [];
    const npcLife = overview.data.npcLife as Record<string, unknown> | null;
    const npcGuilds = overview.data.npcGuilds as Record<string, unknown> | null;
    if (!npcLife || !npcGuilds) return [];

    const economicImpact = npcLife.economicImpact as { hubs?: HubEconomicSnapshot[] } | null;
    const guilds = (npcGuilds.guilds as GuildState[] | undefined) ?? [];
    const hubSnapshots = economicImpact?.hubs ?? [];

    const hubIds = ["observatory_threshold", "windhollow", "emberfall", "cinder_vault"];
    return hubIds.map((hubId) => ({
      hubId,
      guild: guilds.find((g) => g.hubId === hubId),
      economicSnapshot: hubSnapshots.find((h) => h.hubId === hubId),
    }));
  }, [overview.data]);

  if (overview.isLoading) {
    return <p className="text-sm text-slate-400">Gildendaten werden geladen…</p>;
  }

  if (!overview.data?.available) {
    return (
      <Card className="border-amber-200/15 bg-slate-950/70">
        <CardContent className="pt-6">
          <p className="text-sm text-slate-400">
            Die Gilden-Übersicht ist nicht verfügbar. Der NPC-Lebenszyklus muss aktiv sein (Datenbankverbindung erforderlich).
          </p>
        </CardContent>
      </Card>
    );
  }

  const npcLife = overview.data.npcLife as Record<string, unknown> | null;
  const npcGuilds = overview.data.npcGuilds as Record<string, unknown> | null;
  const guildCount = (npcGuilds?.guildCount as number) ?? 0;
  const totalMembers = (npcGuilds?.totalMembers as number) ?? 0;
  const cycle = (npcLife?.livingHistoryCycle as number) ?? null;
  const confirmedNpcCount = (npcLife?.confirmedNpcCount as number) ?? 0;
  const totalNpcCount = (npcLife?.totalNpcCount as number) ?? 4;
  const economicImpact = npcLife?.economicImpact as Record<string, unknown> | null;

  return (
    <div className="space-y-5">
      {/* Summary stats */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-cyan-300/10 bg-slate-950/70">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] tracking-[.16em] text-cyan-100/55">GILDEN</p>
                <p className="mt-2 text-2xl font-semibold text-amber-100">{guildCount}</p>
              </div>
              <Landmark className="h-5 w-5 text-cyan-300" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-cyan-300/10 bg-slate-950/70">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] tracking-[.16em] text-cyan-100/55">MITGLIEDER</p>
                <p className="mt-2 text-2xl font-semibold text-amber-100">{totalMembers}</p>
              </div>
              <Users className="h-5 w-5 text-cyan-300" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-cyan-300/10 bg-slate-950/70">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] tracking-[.16em] text-cyan-100/55">AKTIVE NPCS</p>
                <p className="mt-2 text-2xl font-semibold text-amber-100">{confirmedNpcCount}/{totalNpcCount}</p>
              </div>
              <Activity className="h-5 w-5 text-cyan-300" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-cyan-300/10 bg-slate-950/70">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] tracking-[.16em] text-cyan-100/55">ZYKLUS</p>
                <p className="mt-2 text-2xl font-semibold text-amber-100">{cycle ?? "—"}</p>
              </div>
              <TrendingUp className="h-5 w-5 text-cyan-300" />
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Global economic summary */}
      {economicImpact && (
        <Card className="border-amber-200/15 bg-slate-950/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-amber-100">Globale Wirtschaftsbilanz</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-3 md:grid-cols-6">
              <div className="text-center">
                <p className="text-[10px] tracking-[.14em] text-cyan-200/60">HANDEL</p>
                <p className="mt-1 text-lg font-bold text-amber-100">{((economicImpact.totalTradeVolume as number) ?? 0 * 100).toFixed(0)}%</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] tracking-[.14em] text-cyan-200/60">KNAPPHEIT</p>
                <p className="mt-1 text-lg font-bold text-orange-300">{(((economicImpact.totalScarcityPressure as number) ?? 0) * 100).toFixed(0)}%</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] tracking-[.14em] text-cyan-200/60">GEFAHR</p>
                <p className="mt-1 text-lg font-bold text-red-300">{(((economicImpact.totalHazardPressure as number) ?? 0) * 100).toFixed(0)}%</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] tracking-[.14em] text-cyan-200/60">WIRTSCHAFT</p>
                <p className="mt-1 text-lg font-bold text-cyan-300">{(((economicImpact.totalEconomyPressure as number) ?? 0) * 100).toFixed(0)}%</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] tracking-[.14em] text-cyan-200/60">POLITIK</p>
                <p className="mt-1 text-lg font-bold text-purple-300">{(((economicImpact.totalPoliticsPressure as number) ?? 0) * 100).toFixed(0)}%</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] tracking-[.14em] text-cyan-200/60">KARAWANEN</p>
                <p className="mt-1 text-lg font-bold text-emerald-300">{(economicImpact.totalCaravanActivity as number) ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Per-hub cards */}
      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        {hubData.map(({ hubId, guild, economicSnapshot }) => (
          <HubCard key={hubId} hubId={hubId} guild={guild} economicSnapshot={economicSnapshot} />
        ))}
      </section>

      {hubData.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-8">
          Noch keine Gilden- oder Wirtschaftsdaten verfügbar. Der NPC-Lebenszyklus muss mindestens einen Zyklus durchlaufen haben.
        </p>
      )}
    </div>
  );
}
