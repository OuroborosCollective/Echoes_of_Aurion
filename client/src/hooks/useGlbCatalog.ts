import { useEffect, useState } from "react";
import { glbRuntimeCatalogSchema, type GlbRuntimeCatalog } from "@shared/glbImportContract";

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
        const next = glbRuntimeCatalogSchema.parse(await response.json());
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
