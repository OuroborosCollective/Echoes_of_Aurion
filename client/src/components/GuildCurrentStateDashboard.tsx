import { Coins, Hammer, Mountain, Package, Shield, Sparkles, TreePine } from "lucide-react";

export type GuildCurrentStateDashboardProps = Readonly<{
  treasuryBalanceExact: string;
  resourceBalancesExact: Readonly<{ wood: string; stone: string; aether: string }>;
  heldItemsCount: number;
  buildingOptions: readonly Readonly<{
    buildingId: string;
    levelExact: string;
    maximumLevelExact: string;
    canUpgrade: boolean;
  }>[];
}>;

function exact(value: string): string {
  return /^(0|[1-9][0-9]*)$/.test(value) ? value : "—";
}

const BUILDING_LABELS: Readonly<Record<string,string>> = {
  bld_citadel: "Zitadelle",
  bld_turquoise_wall: "Türkiswall",
  bld_grand_bazaar: "Großer Basar",
  bld_sovereign_academy: "Souveräne Akademie",
  bld_aether_wellspring: "Ätherquelle",
  bld_sovereign_auktionator: "Auktionshaus",
};

export default function GuildCurrentStateDashboard(props: GuildCurrentStateDashboardProps) {
  const resources = [
    { key: "wood", label: "Holz", value: exact(props.resourceBalancesExact.wood), icon: TreePine },
    { key: "stone", label: "Stein", value: exact(props.resourceBalancesExact.stone), icon: Mountain },
    { key: "aether", label: "Äther", value: exact(props.resourceBalancesExact.aether), icon: Sparkles },
  ] as const;

  return <section aria-label="Bestätigter Gildenbank-Readback" className="my-6 space-y-5 rounded-2xl border border-amber-500/20 bg-gradient-to-b from-stone-900/90 to-stone-950/90 p-5 shadow-xl">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-800 pb-4">
      <div className="flex gap-2">
        <Shield className="mt-0.5 size-5 text-cyan-400"/>
        <div><h4 className="font-semibold text-amber-100">Gilden-Zentrale</h4>
          <p className="text-xs text-stone-400">Aktueller bestätigter Readback. Keine historischen Lifetime- oder Aktivitätswerte werden aus Beständen geschätzt.</p>
        </div>
      </div>
      <span className="rounded-lg border border-cyan-500/25 bg-cyan-950/30 px-2 py-1 text-[10px] uppercase tracking-wider text-cyan-300">read-only projection</span>
    </header>

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <article className="rounded-xl border border-amber-500/20 bg-black/25 p-3">
        <Coins className="mb-2 size-4 text-amber-400"/><span className="text-xs text-stone-400">Gildenkasse</span>
        <b className="block font-mono text-lg text-amber-200">{exact(props.treasuryBalanceExact)} AURION</b>
      </article>
      <article className="rounded-xl border border-cyan-500/20 bg-black/25 p-3">
        <Package className="mb-2 size-4 text-cyan-400"/><span className="text-xs text-stone-400">Tresor</span>
        <b className="block font-mono text-lg text-cyan-200">{props.heldItemsCount} Items</b>
      </article>
      {resources.slice(0,2).map(item => <article key={item.key} className="rounded-xl border border-stone-700 bg-black/25 p-3">
        <item.icon className="mb-2 size-4 text-stone-300"/><span className="text-xs text-stone-400">{item.label}</span>
        <b className="block font-mono text-lg text-stone-100">{item.value}</b>
      </article>)}
    </div>

    <div className="grid gap-3 md:grid-cols-2">
      <article className="rounded-xl border border-stone-800 bg-black/20 p-4">
        <h5 className="mb-3 text-xs font-semibold uppercase tracking-wider text-stone-400">Ressourcenbestand</h5>
        <div className="space-y-2">
          {resources.map(item => <div key={item.key} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
            <span className="flex items-center gap-2 text-sm text-stone-300"><item.icon className="size-4"/>{item.label}</span>
            <b className="font-mono text-cyan-200">{item.value}</b>
          </div>)}
        </div>
      </article>
      <article className="rounded-xl border border-stone-800 bg-black/20 p-4">
        <h5 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-stone-400"><Hammer className="size-4"/>Gebäude</h5>
        {props.buildingOptions.length ? <div className="space-y-2">{props.buildingOptions.map(building =>
          <div key={building.buildingId} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm">
            <span className="text-stone-300">{BUILDING_LABELS[building.buildingId] ?? building.buildingId}</span>
            <span className="font-mono text-stone-100">Stufe {exact(building.levelExact)}/{exact(building.maximumLevelExact)}{building.canUpgrade ? " · Ausbau möglich" : ""}</span>
          </div>)}</div> : <p className="text-sm text-stone-500">Keine bestätigten Gebäudedaten.</p>}
      </article>
    </div>
  </section>;
}
