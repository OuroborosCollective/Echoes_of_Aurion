import React, { useMemo, useState } from "react";
import {
  ArrowUpDown,
  Boxes,
  Check,
  Footprints,
  Heart,
  Package,
  Shield,
  Sparkles,
  Sword,
  Tag,
  X,
  Zap,
} from "lucide-react";
import { Ax1Modal } from "./Ax1Modal";

export type Ax1InventoryQuality = "normal" | "magic" | "rare" | "set" | "unique" | "mythic";
export type Ax1PaperdollSlot = "helmet" | "shoulders" | "chest" | "arms" | "weapon" | "relic" | "shield" | "legs" | "boots" | "mount";
export type Ax1InventoryCategory = "gear" | "unclassified";

export type Ax1InventoryItem = {
  key: string;
  id: string;
  name: string;
  levelExact: string;
  quality: Ax1InventoryQuality;
  status: "owned" | "equipped" | "pending_pickup";
  sourceSlot: string | null;
  paperdollSlot: Ax1PaperdollSlot | null;
  category: Ax1InventoryCategory;
  stats: Record<string, number>;
  icon: string;
};

export type Ax1InventoryProjection = {
  items: Ax1InventoryItem[];
  autoLoot: boolean;
  goldExact: string | null;
  gearScoreExact: string | null;
  pityCounters: Record<string, string> | null;
  silhouetteHarmony: string | null;
  aurionResonance: string | null;
};

type Filter = "all" | "gear" | "materials" | "consumables" | "furniture";
type Sort = "rarity" | "name";

const QUALITY_LABEL: Record<Ax1InventoryQuality, string> = {
  normal: "Gewöhnlich",
  magic: "Magisch",
  rare: "Selten",
  set: "Set",
  unique: "Einzigartig",
  mythic: "Mythisch",
};
const QUALITY_RANK: Record<Ax1InventoryQuality, number> = { normal: 0, magic: 1, rare: 2, set: 3, unique: 4, mythic: 5 };
const SLOT_LABEL: Record<Ax1PaperdollSlot, string> = {
  helmet: "Kopfschutz",
  shoulders: "Schultern",
  chest: "Brustharnisch",
  arms: "Armschienen",
  weapon: "Haupthand-Waffe",
  relic: "Relikt / Amulett",
  shield: "Schild / Nebenhand",
  legs: "Beinschienen",
  boots: "Stiefel",
  mount: "Reittier",
};
const SOURCE_SLOT_LABEL: Record<string, string> = {
  main_hand: "Haupthand-Waffe",
  off_hand: "Nebenhand",
  head: "Kopfschutz",
  chest: "Brustharnisch",
  hands: "Handschutz",
  legs: "Beinschienen",
  feet: "Stiefel",
  belt: "Gürtel",
  ring: "Ring",
  amulet: "Amulett",
  focus: "Fokus",
  relic: "Relikt",
};

const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function sourceIcon(slot: Ax1PaperdollSlot): React.ReactNode {
  if (slot === "weapon") return <Sword className="w-3.5 h-3.5" />;
  if (slot === "shield" || slot === "shoulders") return <Shield className="w-3.5 h-3.5" />;
  if (slot === "chest") return <Heart className="w-3.5 h-3.5" />;
  if (slot === "legs" || slot === "boots") return <Footprints className="w-3.5 h-3.5" />;
  if (slot === "relic") return <Zap className="w-3.5 h-3.5" />;
  if (slot === "mount") return <span>♞</span>;
  return <Sparkles className="w-3.5 h-3.5" />;
}

export function Ax1InventoryModal({
  isOpen,
  onClose,
  projection,
  pending,
  message,
  onEquip,
  onUnequip,
  onCollect,
  onToggleAutoLoot,
}: {
  isOpen: boolean;
  onClose: () => void;
  projection?: Ax1InventoryProjection;
  pending: boolean;
  message?: string;
  onEquip: (key: string) => void;
  onUnequip: (key: string) => void;
  onCollect: (key: string) => void;
  onToggleAutoLoot: () => void;
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [bagFilter, setBagFilter] = useState<Filter>("all");
  const [sortBy, setSortBy] = useState<Sort>("rarity");

  const allItems = projection?.items ?? [];
  const equipped = useMemo(() => allItems.filter(item => item.status === "equipped"), [allItems]);
  const inventory = useMemo(() => allItems.filter(item => item.status !== "equipped"), [allItems]);
  const selectedItem = allItems.find(item => item.key === selectedKey) ?? null;
  const overflowEquipment = equipped.filter(item => item.paperdollSlot === null);

  const filtered = useMemo(() => inventory.filter(item => {
    if (bagFilter === "all") return true;
    if (bagFilter === "gear") return item.category === "gear";
    // Aurion currently confirms no material/consumable/furniture discriminator.
    return false;
  }).sort((a, b) => {
    if (sortBy === "name") return compareText(a.name, b.name) || compareText(a.key, b.key);
    return QUALITY_RANK[b.quality] - QUALITY_RANK[a.quality] || compareText(a.name, b.name) || compareText(a.key, b.key);
  }), [inventory, bagFilter, sortBy]);

  const paperdollItem = (slot: Ax1PaperdollSlot) => equipped.find(item => item.paperdollSlot === slot);

  const renderPaperdollSlot = (slot: Ax1PaperdollSlot) => {
    const item = paperdollItem(slot);
    const selected = item?.key === selectedKey;
    return <div key={slot} className={`group relative p-1.5 rounded-xl border flex items-center gap-2 transition-all ${item ? selected ? "border-amber-400 bg-amber-500/20 ring-2 ring-amber-400/60" : `ax1-quality-${item.quality} bg-black/60` : "border-gray-800 bg-black/40"}`} data-slot={slot} data-item-id={item?.id ?? ""}>
      <button type="button" className="flex flex-1 items-center gap-2 min-w-0 text-left" disabled={!item} onClick={() => item && setSelectedKey(item.key)} aria-label={`${SLOT_LABEL[slot]}: ${item?.name ?? "Leer"}`}>
        <span className="w-9 h-9 rounded-lg bg-black/70 border border-gray-800 flex items-center justify-center text-lg shrink-0 text-gray-500 group-hover:text-gray-300">{item ? item.icon : sourceIcon(slot)}</span>
        <span className="min-w-0 flex-1">
          <span className="text-[9px] uppercase font-mono text-gray-400 tracking-wider flex items-center justify-between"><span>{SLOT_LABEL[slot]}</span>{item && <span className="text-[8px] px-1 rounded bg-black/60 text-[#00f0ff]">Lvl {item.levelExact}</span>}</span>
          <span className="block text-[11px] font-serif font-bold text-gray-100 truncate">{item?.name ?? <span className="text-gray-600 italic font-normal">Leer</span>}</span>
        </span>
      </button>
      {item && <button type="button" disabled={pending} onClick={() => onUnequip(item.key)} aria-label={`${SLOT_LABEL[slot]} ablegen`} className="text-[9px] px-1.5 py-1 bg-red-950/80 hover:bg-red-900 border border-red-500/40 text-red-300 rounded font-mono shrink-0">Ablegen</button>}
    </div>;
  };

  const totalBagSlots = 30;
  const emptySlots = Math.max(0, totalBagSlots - filtered.length);

  return <Ax1Modal open={isOpen} onClose={onClose} id="inventory" title="Inventar & Paperdoll-Rüstkammer">
    <section id="inventory-dialog" className="w-full max-w-5xl bg-[#081a2e] border-2 border-amber-500/50 rounded-2xl p-4 sm:p-5 text-gray-200 shadow-[0_0_50px_rgba(0,240,255,0.2)] flex flex-col max-h-[92dvh] overflow-hidden">
      <header className="flex items-center justify-between border-b border-gray-800 pb-3 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/50 flex items-center justify-center text-amber-400 shrink-0"><Package className="w-5 h-5" /></div>
          <div className="min-w-0"><h3 className="text-base sm:text-lg font-serif font-bold text-white tracking-wide truncate">INVENTAR & PAPERDOLL-RÜSTKAMMER</h3><p className="text-[11px] text-gray-400">Waffen, Rüstungen, Rohstoffe, Tränke & Möbel</p></div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="px-3 py-1.5 rounded-xl bg-black/70 border border-amber-500/40 text-amber-300 font-mono text-xs font-bold flex items-center gap-1.5"><span>🪙</span><span>{projection?.goldExact ?? "—"} Gold</span></div>
          <button type="button" onClick={onClose} aria-label="Inventar schließen" className="p-1.5 rounded-xl bg-black/50 border border-gray-800 hover:border-amber-500 text-gray-400 hover:text-white"><X className="w-4 h-4" aria-hidden="true" /></button>
        </div>
      </header>

      {message && <p className="ax1-notice" role="status">{message}</p>}
      {!projection && <p role="status" className="text-xs text-gray-400 py-2">Inventar wird aus dem bestätigten Aurion-Readback geladen.</p>}

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 py-3 min-h-0 overflow-y-auto custom-scrollbar">
        <section className="lg:col-span-5 bg-black/50 rounded-2xl border border-gray-800 p-3.5 flex flex-col justify-between space-y-2" aria-label="Paperdoll-Ausrüstung">
          <div className="flex items-center justify-between border-b border-gray-800 pb-2">
            <h4 className="text-[11px] font-serif font-bold text-amber-300 uppercase tracking-widest flex items-center gap-1.5"><Shield className="w-3.5 h-3.5 text-[#00f0ff]" /> Paperdoll-Ausrüstung</h4>
            <div className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">Gear Score: <strong className="text-[#00f0ff]">{projection?.gearScoreExact ?? "—"}</strong></div>
          </div>

          <div className="grid grid-cols-2 gap-2 flex-1 overflow-y-auto pr-1">
            <div className="space-y-1.5">{(["helmet", "shoulders", "chest", "arms", "weapon"] as const).map(renderPaperdollSlot)}</div>
            <div className="space-y-1.5">{(["relic", "shield", "legs", "boots", "mount"] as const).map(renderPaperdollSlot)}</div>
          </div>

          {overflowEquipment.length > 0 && <div className="rounded-xl border border-cyan-900/60 bg-cyan-950/15 p-2" aria-label="Weitere bestätigte Ausrüstung">
            <div className="text-[9px] uppercase tracking-widest text-cyan-300 mb-1">Weitere bestätigte Ausrüstung</div>
            <div className="space-y-1">{overflowEquipment.map(item => <button key={item.key} type="button" onClick={() => setSelectedKey(item.key)} className="w-full flex items-center justify-between gap-2 text-[10px] border border-gray-800 rounded-lg px-2 py-1 bg-black/50"><span className="truncate">{item.icon} {item.name}</span><span className="text-gray-400 shrink-0">{item.sourceSlot ? SOURCE_SLOT_LABEL[item.sourceSlot] ?? item.sourceSlot : "—"}</span></button>)}</div>
          </div>}

          <div className="p-2 rounded-xl bg-black/60 border border-gray-800 text-[10px] font-mono text-gray-400 flex items-center justify-between gap-2"><span>Silhouetten-Harmonie: <strong className="text-gray-300">{projection?.silhouetteHarmony ?? "—"}</strong></span><span className="text-[#00f0ff]">Aurion-Resonanz {projection?.aurionResonance ?? "—"}</span></div>
        </section>

        <section className="lg:col-span-4 bg-black/60 rounded-2xl border border-gray-800 p-3 flex flex-col" aria-label="Abenteurertasche">
          <div className="space-y-2 pb-2 border-b border-gray-800">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-[11px] font-serif font-bold text-amber-300 uppercase tracking-widest flex items-center gap-1.5"><Package className="w-3.5 h-3.5 text-[#00f0ff]" /> Abenteurertasche ({inventory.length}/{totalBagSlots})</h4>
              <label className="flex items-center gap-1 text-[10px] text-gray-300"><ArrowUpDown className="w-3 h-3" /><select aria-label="Inventar sortieren" className="bg-black/60 border border-gray-700 rounded px-1 py-0.5" value={sortBy} onChange={event => setSortBy(event.target.value as Sort)}><option value="rarity">Seltenheit</option><option value="name">Name</option></select></label>
            </div>
            <div className="flex flex-wrap gap-1 text-[10px] font-serif">{([
              ["all", "Alle"], ["gear", "Rüstung"], ["materials", "Rohstoffe"], ["consumables", "Tränke"], ["furniture", "Möbel"],
            ] as const).map(([id, label]) => <button type="button" key={id} onClick={() => setBagFilter(id)} aria-pressed={bagFilter === id} className={`px-2 py-0.5 rounded-lg border ${bagFilter === id ? "bg-[#00f0ff]/20 border-[#00f0ff] text-[#00f0ff]" : "border-gray-700 text-gray-400 hover:text-white"}`}>{label}</button>)}</div>
          </div>

          <div className="grid grid-cols-5 gap-1.5 content-start pt-3">{filtered.map(item => <button type="button" key={item.key} aria-label={`${item.name} · ${QUALITY_LABEL[item.quality]}${item.status === "pending_pickup" ? " · Einsammeln" : ""}`} aria-pressed={selectedKey === item.key} data-testid={`bag-${item.id}`} className={`relative aspect-square rounded-lg border bg-black/65 flex flex-col items-center justify-center ax1-quality-${item.quality}`} onClick={() => setSelectedKey(item.key)}><span className="text-lg">{item.icon}</span><small className="absolute bottom-0.5 right-1 text-[7px] text-gray-400">{item.levelExact}</small>{item.status === "pending_pickup" && <b className="absolute top-0 right-1 text-amber-300">!</b>}</button>)}{Array.from({ length: emptySlots }, (_, index) => <div key={`empty-${index}`} className="aspect-square rounded-lg border border-gray-900 bg-black/25" aria-hidden="true" />)}</div>
          {filtered.length === 0 && <p className="text-xs text-gray-500 py-4">Keine bestätigten Gegenstände in dieser Ansicht.</p>}

          <div className="mt-auto pt-3 space-y-2">
            <button type="button" className="w-full px-2 py-1.5 rounded-lg border border-emerald-500/40 text-emerald-300 flex items-center justify-center gap-1.5 text-xs" aria-pressed={projection?.autoLoot ?? false} disabled={pending || !projection} onClick={onToggleAutoLoot}><Sparkles className="w-3.5 h-3.5" /> Auto-Loot {projection?.autoLoot ? "AN" : "AUS"}</button>
            <p className="text-[10px] text-gray-400">Sammelt bestätigte gewöhnliche und magische Beute nach dem serverseitigen Aurion-Vertrag.</p>
            <div className="rounded-xl border border-purple-500/30 bg-purple-950/15 p-2" aria-label="Pity Counter"><div className="text-[9px] uppercase tracking-widest text-purple-300 flex items-center gap-1"><Boxes className="w-3 h-3" /> Pity Counter</div>{projection?.pityCounters && Object.keys(projection.pityCounters).length > 0 ? Object.entries(projection.pityCounters).map(([key, value]) => <div key={key} className="flex justify-between text-[10px]"><span>{key}</span><span>{value}</span></div>) : <p className="text-[10px] text-gray-500 mt-1">Keine bestätigten Pity-Zähler.</p>}</div>
          </div>
        </section>

        <section className="lg:col-span-3 bg-black/60 rounded-2xl border border-gray-800 p-3 flex flex-col" aria-label="Gegenstandsdetails">
          {selectedItem ? <>
            <div className={`rounded-xl border p-4 text-center ax1-quality-${selectedItem.quality}`}><span className="text-4xl">{selectedItem.icon}</span><h4 className="font-serif font-bold mt-2">{selectedItem.name}</h4><small>{QUALITY_LABEL[selectedItem.quality]} · Stufe {selectedItem.levelExact}</small></div>
            <p className="text-[10px] text-gray-400 mt-2">{selectedItem.sourceSlot ? SOURCE_SLOT_LABEL[selectedItem.sourceSlot] ?? selectedItem.sourceSlot : "Keine bestätigte Gegenstandskategorie"}</p>
            <p className="text-xs text-gray-500 mt-2">Keine bestätigte Gegenstandsbeschreibung.</p>
            <dl className="py-3 text-xs space-y-2">{Object.entries(selectedItem.stats).sort(([a], [b]) => compareText(a, b)).map(([name, value]) => <div className="flex justify-between" key={name}><dt>{name}</dt><dd className="text-amber-300">{value}</dd></div>)}</dl>
            <div className="flex items-center justify-between text-[10px] border-t border-gray-800 pt-2 mb-3"><span className="flex items-center gap-1 text-gray-400"><Tag className="w-3 h-3" /> Händlerwert</span><span className="text-amber-300">— Gold</span></div>
            {selectedItem.status === "pending_pickup" ? <button type="button" className="ax1-primary" disabled={pending} onClick={() => onCollect(selectedItem.key)}>Beute einsammeln</button> : selectedItem.status === "equipped" ? <button type="button" className="ax1-primary" disabled={pending} onClick={() => onUnequip(selectedItem.key)}>Ablegen</button> : selectedItem.category === "gear" ? <button type="button" className="ax1-primary" disabled={pending} onClick={() => onEquip(selectedItem.key)}>Ausrüsten</button> : null}
            <div className="grid grid-cols-2 gap-2 mt-2"><button type="button" disabled title="Kein bestätigter Aurion-Consume-Vertrag" className="px-2 py-1 rounded border border-gray-800 text-gray-600 text-[10px]">Verbrauchen</button><button type="button" disabled title="Kein bestätigter Aurion-Discard-Vertrag" className="px-2 py-1 rounded border border-gray-800 text-gray-600 text-[10px]">Verwerfen</button></div>
            <p className="text-[9px] text-gray-600 mt-1">Consume/Discard bleiben gesperrt, bis ein serverbestätigter Aurion-Vertrag existiert.</p>
          </> : <div className="flex-1 grid place-content-center text-center py-10 text-gray-500"><Package className="w-10 h-10 mx-auto mb-3" /><p className="text-xs">Wähle ein Rüstungsteil oder einen Gegenstand zur Inspektion.</p></div>}
          <div className="mt-auto pt-3 border-t border-gray-800 text-[9px] text-gray-500 flex items-center gap-1"><Check className="w-3 h-3 text-emerald-500" /> Sichtbare Werte stammen ausschließlich aus bestätigten Readbacks.</div>
        </section>
      </div>
    </section>
  </Ax1Modal>;
}
