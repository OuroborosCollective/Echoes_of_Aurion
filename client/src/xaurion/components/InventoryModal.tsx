import { useMemo } from "react";
import type { PlayerUiReadback, UiItem } from "@shared/playerUiProtocol";
import {
  Ax1InventoryModal,
  type Ax1InventoryItem,
  type Ax1InventoryProjection,
  type Ax1PaperdollSlot,
} from "./Ax1InventoryModal";

const PAPERDOLL_BY_AURION_SLOT: Partial<Record<NonNullable<UiItem["slot"]>, Ax1PaperdollSlot>> = {
  main_hand: "weapon",
  off_hand: "shield",
  head: "helmet",
  chest: "chest",
  hands: "arms",
  legs: "legs",
  feet: "boots",
  relic: "relic",
};

export const itemKey = (item: Pick<UiItem, "id" | "version">) => `${item.version}:${item.id}`;

export const itemIcon = (item: Pick<UiItem, "slot">) => {
  if (item.slot === "main_hand") return "⚔";
  if (item.slot === "off_hand") return "⛨";
  if (item.slot === "focus" || item.slot === "relic" || item.slot === "amulet") return "✦";
  if (item.slot === "ring") return "◉";
  if (item.slot === "belt") return "═";
  if (item.slot === "head") return "♜";
  if (item.slot === "feet") return "♢";
  return item.slot ? "◇" : "▧";
};

function projectItem(item: UiItem): Ax1InventoryItem {
  return {
    key: itemKey(item),
    id: String(item.id),
    name: item.name,
    levelExact: item.levelExact,
    quality: item.quality,
    status: item.status,
    sourceSlot: item.slot,
    paperdollSlot: item.slot ? PAPERDOLL_BY_AURION_SLOT[item.slot] ?? null : null,
    category: item.slot ? "gear" : "unclassified",
    stats: { ...item.stats },
    icon: itemIcon(item),
  };
}

/**
 * Pure authority projection from the confirmed Aurion player.ui readback into
 * the visible AX1 cf9 inventory model. Values absent from the wire contract are
 * deliberately left unresolved instead of reviving AX1 client defaults.
 */
export function projectConfirmedAx1Inventory(readback?: PlayerUiReadback): Ax1InventoryProjection | undefined {
  if (!readback) return undefined;
  return {
    items: readback.items.map(projectItem),
    autoLoot: readback.settings.autoLoot,
    goldExact: null,
    gearScoreExact: null,
    pityCounters: null,
    silhouetteHarmony: null,
    aurionResonance: null,
  };
}

/** Thin Aurion -> AX1 adapter. Mutations remain server-confirmed callbacks. */
export function InventoryModal({
  isOpen,
  onClose,
  readback,
  pending,
  message,
  onEquip,
  onUnequip,
  onCollect,
  onToggleAutoLoot,
}: {
  isOpen: boolean;
  onClose: () => void;
  readback?: PlayerUiReadback;
  pending: boolean;
  message?: string;
  onEquip: (item: UiItem) => void;
  onUnequip: (item: UiItem) => void;
  onCollect: (item: UiItem) => void;
  onToggleAutoLoot: () => void;
}) {
  const projection = useMemo(() => projectConfirmedAx1Inventory(readback), [readback]);
  const itemByKey = useMemo(() => new Map((readback?.items ?? []).map(item => [itemKey(item), item])), [readback]);
  const withConfirmedItem = (key: string, action: (item: UiItem) => void) => {
    const item = itemByKey.get(key);
    if (item) action(item);
  };

  return <Ax1InventoryModal
    isOpen={isOpen}
    onClose={onClose}
    projection={projection}
    pending={pending}
    message={message}
    onEquip={key => withConfirmedItem(key, onEquip)}
    onUnequip={key => withConfirmedItem(key, onUnequip)}
    onCollect={key => withConfirmedItem(key, onCollect)}
    onToggleAutoLoot={onToggleAutoLoot}
  />;
}
