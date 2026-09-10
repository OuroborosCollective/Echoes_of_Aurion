import { AX1_ECOLOGY_SOURCE_REVISION, AX1_INITIAL_RESOURCE_NODES } from "./ax1ResourceEcologyProtocol";

export const ZONE_RESOURCE_CONTRACT_VERSION = 1 as const;
export const ZONE_RESOURCE_MAX_NODES = 64;

export type ConfirmedZoneResourceNode = Readonly<{
  nodeId: string;
  remaining: number;
  depleted: boolean;
  respawnAtTick: number | null;
}>;

export type ConfirmedZoneResourceSnapshot = Readonly<{
  contractVersion: typeof ZONE_RESOURCE_CONTRACT_VERSION;
  contentSourceRevision: typeof AX1_ECOLOGY_SOURCE_REVISION;
  revision: number;
  nodes: readonly ConfirmedZoneResourceNode[];
}>;

const definitionById = new Map(AX1_INITIAL_RESOURCE_NODES.map(node => [node.id, node] as const));

export function validConfirmedZoneResourceSnapshot(
  value: unknown,
  currentTick?: number,
): value is ConfirmedZoneResourceSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<ConfirmedZoneResourceSnapshot>;
  if (snapshot.contractVersion !== ZONE_RESOURCE_CONTRACT_VERSION) return false;
  if (snapshot.contentSourceRevision !== AX1_ECOLOGY_SOURCE_REVISION) return false;
  if (!Number.isSafeInteger(snapshot.revision) || (snapshot.revision ?? 0) < 1) return false;
  if (!Array.isArray(snapshot.nodes) || snapshot.nodes.length > ZONE_RESOURCE_MAX_NODES) return false;
  if (snapshot.nodes.length !== AX1_INITIAL_RESOURCE_NODES.length) return false;
  if (currentTick !== undefined && (!Number.isSafeInteger(currentTick) || currentTick < 0)) return false;

  const seen = new Set<string>();
  let previousId = "";
  for (const raw of snapshot.nodes) {
    if (!raw || typeof raw !== "object") return false;
    const node = raw as ConfirmedZoneResourceNode;
    const definition = definitionById.get(node.nodeId);
    if (!definition || seen.has(node.nodeId)) return false;
    if (previousId && node.nodeId <= previousId) return false;
    seen.add(node.nodeId);
    previousId = node.nodeId;

    if (!Number.isSafeInteger(node.remaining) || node.remaining < 0 || node.remaining > definition.capacity) return false;
    if (node.depleted !== (node.remaining === 0)) return false;
    if (node.depleted) {
      if (!Number.isSafeInteger(node.respawnAtTick) || (node.respawnAtTick ?? -1) < 1) return false;
      if (currentTick !== undefined && (node.respawnAtTick as number) <= currentTick) return false;
    } else if (node.respawnAtTick !== null) {
      return false;
    }
  }
  return seen.size === AX1_INITIAL_RESOURCE_NODES.length;
}
