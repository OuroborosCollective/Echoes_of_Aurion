/** Port of -ax1 InventoryModal@d356881 (d870c06): paperdoll / categorized bag / inspector.
 * Local gold, forged stats and simulated equip callbacks are replaced by confirmed item instances. */
import { useMemo, useState } from "react";
import { Package, Shield, Sword, Sparkles, X, ArrowUpDown, Hammer } from "lucide-react";
import { Ax1Modal } from "./Ax1Modal";
import type { PlayerUiReadback, UiItem } from "@shared/playerUiProtocol";

const qualityLabel = { normal: "Gewöhnlich", magic: "Magisch", rare: "Selten", set: "Set", unique: "Einzigartig", mythic: "Mythisch" };
const qualityRank = { mythic: 5, unique: 4, set: 3, rare: 2, magic: 1, normal: 0 };
const slotLabels = { main_hand: "Haupthand-Waffe", off_hand: "Nebenhand", head: "Kopfschutz", chest: "Brustharnisch", hands: "Handschutz", legs: "Beinschienen", feet: "Stiefel", belt: "Gürtel", ring: "Ring", amulet: "Amulett", focus: "Fokus", relic: "Relikt" };
export const itemKey = (item: Pick<UiItem, "id" | "version">) => `${item.version}:${item.id}`;
export const itemIcon = (item: UiItem) => item.slot === "main_hand" ? "⚔" : item.slot === "off_hand" ? "⛨" : item.slot === "focus" || item.slot === "relic" ? "✦" : item.slot ? "◇" : "▧";
export function InventoryModal({ isOpen, onClose, readback, points, pending, message, onEquip, onUnequip, onCollect, onToggleAutoLoot, onCraft }: {
  isOpen: boolean; onClose: () => void; readback?: PlayerUiReadback; points?: number; pending: boolean; message?: string;
  onEquip: (item: UiItem) => void; onUnequip: (item: UiItem) => void; onCollect: (item: UiItem) => void; onToggleAutoLoot: () => void; onCraft: () => void;
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [bagFilter, setBagFilter] = useState<"all" | "gear" | "materials" | "loot">("all");
  const [sortBy, setSortBy] = useState<"rarity" | "name">("rarity");

  const { inventory, equipment } = useMemo(() => {
    if (!readback) return { inventory: [], equipment: [] };
    const inv: UiItem[] = [];
    const eq: UiItem[] = [];
    for (const item of readback.items) {
      if (item.status === "equipped") eq.push(item);
      else inv.push(item);
    }
    return { inventory: inv, equipment: eq };
  }, [readback]);

  const selectedItem = useMemo(() => readback?.items.find(i => itemKey(i) === selectedKey), [readback, selectedKey]);

  const filtered = useMemo(() => {
    return inventory.filter(i => bagFilter === "all" || (bagFilter === "gear" && i.slot) || (bagFilter === "materials" && !i.slot) || (bagFilter === "loot" && i.status === "pending_pickup"))
      .sort((a, b) => sortBy === "name" ? a.name.localeCompare(b.name) : (qualityRank[b.quality as keyof typeof qualityRank] ?? 0) - (qualityRank[a.quality as keyof typeof qualityRank] ?? 0) || a.name.localeCompare(b.name));
  }, [inventory, bagFilter, sortBy]);

  const renderSlot = (slot: keyof typeof slotLabels) => {
    const item = equipment.find(i => i.slot === slot);
    return <div key={slot} className={`ax1-paperdoll-slot group relative p-1.5 rounded-xl border flex items-center gap-2 ${item ? `ax1-quality-${item.quality}` : "border-gray-800 bg-black/40"}`} data-slot={slot} data-item-id={item?.id ?? ""}>
      <button className="flex flex-1 items-center gap-2 min-w-0 text-left" disabled={!item} onClick={() => item && setSelectedKey(itemKey(item))} aria-label={`${slotLabels[slot]}: ${item?.name ?? "Leer"}`}>
        <span className="w-9 h-9 rounded-lg bg-black/70 border border-gray-800 grid place-items-center text-lg shrink-0">{item ? itemIcon(item) : slot === "main_hand" ? <Sword size={16} /> : <Shield size={16} />}</span>
        <span className="min-w-0"><small className="block text-[9px] uppercase text-gray-400">{slotLabels[slot]}</small><span className="block text-[11px] font-serif truncate">{item?.name ?? "Leer"}</span></span>
      </button>
      {item && <button disabled={pending} onClick={() => onUnequip(item)} aria-label={`${slotLabels[slot]} ablegen`} className="text-[10px] p-1 rounded border border-red-500/40 text-red-300">Ablegen</button>}
    </div>;
  };
  return <Ax1Modal open={isOpen} onClose={onClose} id="inventory" title="Inventar & Paperdoll-Rüstkammer"><section id="inventory-dialog" className="ax1-window w-full max-w-5xl bg-[#081a2e] border-2 border-amber-500/50 rounded-2xl p-4 sm:p-5 text-gray-200 shadow-[0_0_50px_rgba(0,240,255,0.2)] flex flex-col max-h-[92dvh] overflow-hidden">
    <header className="ax1-window-header flex items-center justify-between border-b border-gray-800 pb-3 gap-3"><div className="flex items-center gap-3"><div className="ax1-crest"><Package /></div><div><h3 className="font-serif font-bold text-white">INVENTAR & PAPERDOLL-RÜSTKAMMER</h3><p className="text-[11px] text-gray-400">Waffen, Rüstungen und gesammelte Rohstoffe</p></div></div><div className="flex gap-2 items-center"><span className="ax1-badge">{points?.toLocaleString() ?? "—"} AURION</span><button onClick={onClose} aria-label="Inventar schließen" className="ax1-close"><X size={18} /></button></div></header>
    {message && <p className="ax1-notice" role="status">{message}</p>}{!readback && <p role="status">Inventar wird geladen.</p>}
    <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 py-3 min-h-0 overflow-y-auto custom-scrollbar">
      <section className="lg:col-span-5 bg-black/50 rounded-2xl border border-gray-800 p-3.5 space-y-2" aria-label="Paperdoll-Ausrüstung"><div className="flex justify-between border-b border-gray-800 pb-2"><h4 className="text-[11px] font-serif uppercase text-amber-300 flex items-center gap-1.5"><Shield size={14} /> Paperdoll-Ausrüstung</h4><span className="ax1-badge">{equipment.length} / 12</span></div><div className="grid grid-cols-2 gap-2"><div className="space-y-1.5">{(["head", "chest", "hands", "legs", "feet", "main_hand"] as const).map(renderSlot)}</div><div className="space-y-1.5">{(["amulet", "ring", "belt", "focus", "relic", "off_hand"] as const).map(renderSlot)}</div></div><p className="text-[10px] text-gray-400">Ausrüstung bleibt nach der Rückkehr gespeichert. Leere Plätze zeigen keine Startausrüstung.</p></section>
      <section className="lg:col-span-4 bg-black/60 rounded-2xl border border-gray-800 p-3 flex flex-col" aria-label="Rucksack"><div className="flex justify-between items-center pb-2"><h4 className="text-amber-300 font-serif text-xs">Rucksack ({inventory.length})</h4><label className="flex gap-1 text-xs"><ArrowUpDown size={14} /><select aria-label="Inventar sortieren" value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}><option value="rarity">Seltenheit</option><option value="name">Name</option></select></label></div><div className="flex flex-wrap gap-1 mb-3">{([['all', 'Alle'], ['gear', 'Ausrüstung'], ['materials', 'Rohstoffe'], ['loot', 'Beute']] as const).map(([key, label]) => <button key={key} className="ax1-tab" aria-pressed={bagFilter === key} onClick={() => setBagFilter(key)}>{label}</button>)}</div>
        <div className="grid grid-cols-5 gap-1.5 content-start">{filtered.map(item => <button key={itemKey(item)} aria-label={`${item.name} · ${qualityLabel[item.quality]}${item.status === "pending_pickup" ? " · Einsammeln" : ""}`} aria-pressed={selectedKey === itemKey(item)} data-testid={`bag-${item.id}`} className={`ax1-bag-item ax1-quality-${item.quality}`} onClick={() => setSelectedKey(itemKey(item))}><span>{itemIcon(item)}</span><small>{item.levelExact}</small>{item.status === "pending_pickup" && <b className="ax1-loot-dot">!</b>}</button>)}{Array.from({ length: Math.max(0, 30 - filtered.length) }, (_, i) => <div key={`empty-${i}`} className="ax1-bag-empty" aria-hidden="true" />)}</div>{filtered.length === 0 && <p className="text-xs text-gray-500 py-4">Keine Gegenstände in dieser Ansicht.</p>}
        <button className="ax1-tab mt-4" aria-pressed={readback?.settings.autoLoot ?? false} disabled={pending || !readback} onClick={onToggleAutoLoot}><Sparkles size={14} /> Auto-Loot {readback?.settings.autoLoot ? "AN" : "AUS"}</button><p className="text-[10px] text-gray-400 mt-1">Sammelt gewöhnliche und magische Beute. Seltene Funde nimmst du selbst auf.</p>
      </section>
      <section className="lg:col-span-3 bg-black/60 rounded-2xl border border-gray-800 p-3 flex flex-col" aria-label="Gegenstandsdetails">{selectedItem ? <><div className={`rounded-xl border p-4 text-center ax1-quality-${selectedItem.quality}`}><span className="text-4xl">{itemIcon(selectedItem)}</span><h4 className="font-serif font-bold mt-2">{selectedItem.name}</h4><small>{qualityLabel[selectedItem.quality]} · Stufe {selectedItem.levelExact}</small></div><dl className="py-3 text-xs space-y-2">{Object.entries(selectedItem.stats).map(([name, value]) => <div className="flex justify-between" key={name}><dt>{name}</dt><dd className="text-amber-300">{value}</dd></div>)}</dl><p className="text-xs text-gray-400 mb-3">{selectedItem.slot ? slotLabels[selectedItem.slot] : "Handwerksgut"}</p>{selectedItem.status === "pending_pickup" ? <button className="ax1-primary" disabled={pending} onClick={() => onCollect(selectedItem)}>Beute einsammeln</button> : selectedItem.status === "equipped" ? <button className="ax1-primary" disabled={pending} onClick={() => onUnequip(selectedItem)}>Ablegen</button> : selectedItem.slot ? <button className="ax1-primary" disabled={pending} onClick={() => onEquip(selectedItem)}>Ausrüsten</button> : null}</> : <div className="flex-1 grid place-content-center text-center py-10 text-gray-500"><Package size={40} className="mx-auto mb-3" /><p className="text-xs">Wähle ein Rüstungsteil oder einen Gegenstand zur Inspektion.</p></div>}<button className="ax1-tab mt-4" onClick={onCraft}><Hammer size={14} /> Handwerk öffnen</button></section>
    </div>
  </section></Ax1Modal>;
}
