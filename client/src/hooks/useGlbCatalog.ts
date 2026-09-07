import { useEffect, useState } from "react";
import { glbRuntimeCatalogSchema, type GlbRuntimeCatalog } from "@shared/glbImportContract";
import { worldServiceNpcs } from "@shared/worldServiceNpcs";
import { selectNpcGlb } from "@/xaurion/core/NpcGlbFallback";

/**
 * Runtime-only projection: exact server assignments remain canonical. When a
 * published service NPC has no exact character assignment, synthesize only the
 * target lookup used by the renderer from the approved deterministic fallback
 * pool. The server catalog itself is never mutated or persisted.
 */
export function projectServiceNpcFallbackTargets(catalog: GlbRuntimeCatalog): GlbRuntimeCatalog {
  const projected = [...catalog.entries];
  for (const definition of worldServiceNpcs) {
    if (catalog.entries.some(entry => entry.assetType === "character" && entry.targetKey === definition.targetKey)) continue;
    const selected = selectNpcGlb(catalog, definition.id, definition.targetKey);
    if (!selected || selected.source !== "fallback") continue;
    projected.push(Object.freeze({ ...selected.entry, targetKey: definition.targetKey }));
  }
  return projected.length === catalog.entries.length ? catalog : Object.freeze({ ...catalog, entries: Object.freeze(projected) as GlbRuntimeCatalog["entries"] });
}

/** Operational refresh only; catalog reads never mutate gameplay state. */
export function useGlbCatalog(enabled = true) {
  const [catalog, setCatalog] = useState<GlbRuntimeCatalog | null>(null);
  useEffect(() => {
    if (!enabled) { setCatalog(null); return; }
    const controller = new AbortController();
    let busy = false;
    const refresh = async () => {
      if (busy || controller.signal.aborted) return;
      busy = true;
      try {
        const response = await fetch("/api/game/glb-catalog", { signal: controller.signal, credentials: "same-origin" });
        if (!response.ok) throw new Error("catalog unavailable");
        const authoritative = glbRuntimeCatalogSchema.parse(await response.json());
        const next = projectServiceNpcFallbackTargets(authoritative);
        if (!controller.signal.aborted) setCatalog(previous => previous?.revision === next.revision ? previous : next);
      } catch { if (!controller.signal.aborted) setCatalog(null); }
      finally { busy = false; }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15_000);
    window.addEventListener("focus", refresh);
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [enabled]);
  return catalog;
}
