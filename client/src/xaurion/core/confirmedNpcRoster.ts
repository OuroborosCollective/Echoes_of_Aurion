export type ConfirmedNpcReadback = Readonly<{
  id: string;
  displayName: string;
  role: string;
}>;

type NpcVisualCandidate = Readonly<{
  id: string;
  name: string;
  title: string;
  quests: readonly unknown[];
}>;

type ConfirmedNpcVisual<T extends NpcVisualCandidate> =
  Omit<T, "name" | "title" | "quests"> & {
    name: string;
    title: string;
    quests: [];
  };

function confirmedRecordsById(
  readback: readonly ConfirmedNpcReadback[] | null | undefined,
): ReadonlyMap<string, ConfirmedNpcReadback> {
  if (!Array.isArray(readback)) return new Map();

  const records = new Map<string, ConfirmedNpcReadback>();
  const conflicts = new Set<string>();
  for (const row of readback) {
    if (!row || typeof row.id !== "string" || typeof row.displayName !== "string" || typeof row.role !== "string") continue;
    const id = row.id.trim();
    const displayName = row.displayName.trim();
    const role = row.role.trim();
    if (!id || !displayName || !role) continue;

    const existing = records.get(id);
    if (existing && (existing.displayName !== displayName || existing.role !== role)) {
      records.delete(id);
      conflicts.add(id);
    } else if (!conflicts.has(id)) {
      records.set(id, { id, displayName, role });
    }
  }
  return records;
}

export function resolveConfirmedNpcRoster<T extends NpcVisualCandidate>(
  candidates: readonly T[],
  readback: readonly ConfirmedNpcReadback[] | null | undefined,
): Readonly<{
  npcs: ConfirmedNpcVisual<T>[];
  ids: ReadonlySet<string>;
}> {
  const records = confirmedRecordsById(readback);
  const npcs = candidates.flatMap(candidate => {
    const confirmed = records.get(candidate.id);
    if (!confirmed) return [];
    return [{
      ...candidate,
      name: confirmed.displayName,
      title: confirmed.role,
      quests: [] as [],
    } as ConfirmedNpcVisual<T>];
  });
  return { npcs, ids: new Set(npcs.map(npc => npc.id)) };
}
