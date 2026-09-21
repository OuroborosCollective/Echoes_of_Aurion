import React from "react";
import { useLoading } from "../contexts/LoadingContext";

export function WorldLoadingScreen() {
  const {
    isInitialWorldLoad,
    chunksLoaded,
    chunksTotal,
    modelStatus,
    envAssetsLoading,
    envAssetsTotal,
    progress,
  } = useLoading();

  if (!isInitialWorldLoad) return null;

  // Render localized labels for loading stages
  const getStageLabel = () => {
    if (chunksLoaded < Math.min(chunksTotal, 9)) {
      return "Synchronisiere weltliche Chunks...";
    }
    if (modelStatus === "loading" || modelStatus === "procedural") {
      return "Binde Spielermodell...";
    }
    if (envAssetsLoading > 0 || envAssetsTotal === 0) {
      return "Bilde Umgebungsobjekte...";
    }
    return "Bereite Welt vor...";
  };

  const getModelLabel = () => {
    switch (modelStatus) {
      case "active":
        return "Bereit";
      case "failed":
        return "Fehlgeschlagen";
      case "loading":
        return "Lade...";
      default:
        return "Warte...";
    }
  };

  const envAssetsLoaded = envAssetsTotal > 0 ? Math.max(0, envAssetsTotal - envAssetsLoading) : 0;

  return (
    <div
      id="world-loading-screen"
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#041114] text-[#E5F6F0] select-none font-sans"
    >
      {/* Background vignette & subtle grid structure */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_30%,rgba(0,0,0,0.85)_100%)] opacity-80" />
      <div className="absolute inset-0 pointer-events-none bg-[repeating-linear-gradient(0deg,transparent_0_4px,rgba(45,226,207,0.015)_5px)]" />

      {/* Loading Content Frame */}
      <div className="relative z-10 flex flex-col items-center max-w-md w-full px-6 text-center space-y-8 animate-fade-in">
        
        {/* Animated Aurion Sigil Iconography */}
        <div className="pulse-in-and-rotate-sigil mb-2">
          <span role="img" aria-label="Aurion Siegel" className="brand-sigil !w-20 !height-20 scale-125 !bg-[#062024]/85">
            <i className="!w-10 !h-10" />
            <b className="!w-4 !h-4" />
            <i className="!w-10 !h-10" />
          </span>
        </div>

        {/* Cinematic Header */}
        <div className="space-y-2">
          <p className="text-[10px] font-extrabold tracking-[0.25em] text-[#8ed4c9] uppercase">
            OUROBOROS COLLECTIVE // WELT-INITIALISIERUNG
          </p>
          <h2 className="font-display font-medium text-2xl tracking-wide text-[#f5dfb2]">
            Echoes <span className="text-[#2DE2CF] italic text-[0.85em] font-normal">of</span> Aurion
          </h2>
        </div>

        {/* Current Loading Stage Label */}
        <p className="text-sm font-medium text-[#b9d7d0] tracking-wide h-6">
          {getStageLabel()}
        </p>

        {/* Main Progress Bar Container */}
        <div className="w-full space-y-2">
          <div className="h-[6px] w-full bg-slate-950/80 rounded-full overflow-hidden p-[1px] border border-cyan-500/10">
            <div
              className="h-full bg-gradient-to-r from-[#17857c] via-[#2DE2CF] to-[#f4cb7d] rounded-full transition-all duration-300 ease-out shadow-[0_0_12px_#2DE2CF]"
              style={{ width: `${progress}%` }}
              data-testid="loading-progress-bar"
            />
          </div>
          <div className="flex justify-between items-center text-[10px] text-[#789c94] font-bold tracking-wider px-1">
            <span>VERTRAGSTATUS</span>
            <span className="text-[#2DE2CF]">{progress}%</span>
          </div>
        </div>

        {/* Granular Asset Loading Matrix */}
        <div className="w-full bg-[#06181b]/90 border border-cyan-300/10 rounded-xl p-4 text-xs space-y-3 shadow-xl backdrop-blur-md">
          {/* Chunks Status */}
          <div className="flex justify-between items-center">
            <span className="text-[#8ed4c9] font-medium">Weltliche Chunks</span>
            <span className="font-mono font-semibold text-[#f5dfb2]">
              {chunksLoaded} / {Math.max(chunksTotal, 9)}
            </span>
          </div>

          {/* Character Model Status */}
          <div className="flex justify-between items-center border-t border-cyan-300/5 pt-2.5">
            <span className="text-[#8ed4c9] font-medium">Charaktermodell</span>
            <span className={`font-semibold ${modelStatus === "active" ? "text-[#2DE2CF]" : "text-[#f4cb7d]"}`}>
              {getModelLabel()}
            </span>
          </div>

          {/* Environmental Assets Status */}
          <div className="flex justify-between items-center border-t border-cyan-300/5 pt-2.5">
            <span className="text-[#8ed4c9] font-medium">Umgebungsobjekte</span>
            <span className="font-mono font-semibold text-[#f5dfb2]">
              {envAssetsTotal > 0 ? `${envAssetsLoaded} / ${envAssetsTotal}` : "Lade Placements..."}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
