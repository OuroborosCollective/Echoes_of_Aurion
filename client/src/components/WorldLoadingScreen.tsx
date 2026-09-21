import React from "react";

export type WorldChunkLoadingEvidence = Readonly<{
  status: string;
  count: number;
  desiredCount: number;
  pendingCount: number;
  failedCount: number;
}>;

export type WorldAssetLoadingEvidence = Readonly<{
  version: string | null;
  planned: number;
  rendered: number;
  loading: number;
  failed: number;
}>;

export type WorldModelLoadingStatus = "procedural" | "loading" | "active" | "failed" | string;

export function deriveWorldLoadingState(input: {
  rendererReady: boolean;
  chunks: WorldChunkLoadingEvidence | null;
  modelStatus: WorldModelLoadingStatus;
  worldAssets: WorldAssetLoadingEvidence | null;
}) {
  const chunksSettled = Boolean(
    input.chunks
      && input.chunks.desiredCount > 0
      && input.chunks.count + input.chunks.failedCount >= input.chunks.desiredCount
  );
  const modelSettled = input.modelStatus === "active" || input.modelStatus === "failed";
  const worldAssetsSettled = Boolean(
    input.worldAssets
      && input.worldAssets.loading === 0
      && (input.worldAssets.version !== null || input.worldAssets.failed > 0)
  );

  const gates = Object.freeze({
    renderer: input.rendererReady,
    chunks: chunksSettled,
    model: modelSettled,
    worldAssets: worldAssetsSettled,
  });
  const passed = Object.values(gates).filter(Boolean).length;
  const degraded = Boolean(
    input.modelStatus === "failed"
      || (input.chunks?.failedCount ?? 0) > 0
      || (input.worldAssets?.failed ?? 0) > 0
  );

  let stage = "Renderer-Evidence wird aufgebaut…";
  if (gates.renderer && !gates.chunks) {
    stage = input.chunks?.status === "UNPROVABLE"
      ? "Chunk-Projektion wird fail-closed geprüft…"
      : "Bestätigte Welt-Chunks werden projiziert…";
  } else if (gates.renderer && gates.chunks && !gates.model) {
    stage = "Bestätigtes Charaktermodell wird gebunden…";
  } else if (gates.renderer && gates.chunks && gates.model && !gates.worldAssets) {
    stage = "Umgebungsprojektion wird verifiziert…";
  } else if (passed === 4 && degraded) {
    stage = "Welt bereit mit transparentem Präsentations-Fallback.";
  } else if (passed === 4) {
    stage = "Welt bereit.";
  }

  return Object.freeze({
    ready: passed === 4,
    degraded,
    passed,
    total: 4,
    gates,
    stage,
  });
}

export function WorldLoadingScreen(props: {
  rendererReady: boolean;
  chunks: WorldChunkLoadingEvidence | null;
  modelStatus: WorldModelLoadingStatus;
  worldAssets: WorldAssetLoadingEvidence | null;
}) {
  const state = deriveWorldLoadingState(props);
  if (state.ready) return null;

  const chunkLabel = props.chunks
    ? `${props.chunks.count} bestätigt / ${props.chunks.desiredCount} erwartet${props.chunks.failedCount ? ` · ${props.chunks.failedCount} fail-closed` : ""}`
    : "Noch keine Chunk-Evidence";
  const modelLabel = props.modelStatus === "active"
    ? "Bestätigtes GLB aktiv"
    : props.modelStatus === "failed"
      ? "GLB fehlgeschlagen · prozeduraler Fallback aktiv"
      : props.modelStatus === "loading"
        ? "GLB wird geladen"
        : "Wartet auf Renderer";
  const assetLabel = props.worldAssets
    ? `${props.worldAssets.rendered} / ${props.worldAssets.planned} gerendert · ${props.worldAssets.loading} lädt${props.worldAssets.failed ? ` · ${props.worldAssets.failed} fehlgeschlagen` : ""}`
    : "Noch keine World-Asset-Evidence";

  return (
    <div
      data-testid="world-loading-screen"
      role="status"
      aria-live="polite"
      className="absolute inset-0 z-40 flex items-center justify-center bg-[#041114]/95 px-5 text-[#E5F6F0] backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-2xl border border-cyan-300/15 bg-[#06181b]/95 p-5 shadow-2xl">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[#8ed4c9]">
          OUROBOROS COLLECTIVE // RUNTIME EVIDENCE
        </p>
        <h2 className="mt-2 text-xl font-semibold text-[#f5dfb2]">Echoes of Aurion</h2>
        <p className="mt-3 text-sm text-[#b9d7d0]">{state.stage}</p>
        <p className="mt-2 font-mono text-xs text-[#2DE2CF]" data-testid="loading-gate-count">
          {state.passed} / {state.total} Evidence-Gates bestätigt
        </p>

        <dl className="mt-4 grid gap-3 text-xs">
          <div className="grid gap-1 rounded-lg border border-cyan-300/10 bg-slate-950/35 p-3">
            <dt className="font-semibold text-[#8ed4c9]">Renderer</dt>
            <dd>{props.rendererReady ? "Erster Frame gerendert" : "Wartet auf ersten bestätigten Render-Frame"}</dd>
          </div>
          <div className="grid gap-1 rounded-lg border border-cyan-300/10 bg-slate-950/35 p-3">
            <dt className="font-semibold text-[#8ed4c9]">Chunk-Projektion</dt>
            <dd>{chunkLabel}</dd>
          </div>
          <div className="grid gap-1 rounded-lg border border-cyan-300/10 bg-slate-950/35 p-3">
            <dt className="font-semibold text-[#8ed4c9]">Charaktermodell</dt>
            <dd>{modelLabel}</dd>
          </div>
          <div className="grid gap-1 rounded-lg border border-cyan-300/10 bg-slate-950/35 p-3">
            <dt className="font-semibold text-[#8ed4c9]">Umgebungsprojektion</dt>
            <dd>{assetLabel}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
