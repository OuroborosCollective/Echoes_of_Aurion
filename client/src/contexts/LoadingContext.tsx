import React, { createContext, useContext, useState, useEffect } from "react";

interface LoadingContextType {
  isInitialWorldLoad: boolean;
  chunksLoaded: number;
  chunksTotal: number;
  modelLoaded: boolean;
  modelStatus: string;
  envAssetsLoaded: boolean;
  envAssetsLoading: number;
  envAssetsFailed: number;
  envAssetsTotal: number;
  progress: number;
  setChunksStatus: (loaded: number, total: number) => void;
  setModelStatus: (status: string) => void;
  setEnvAssetsStatus: (loading: number, failed: number, total: number) => void;
  startLoading: () => void;
  completeLoading: () => void;
}

const LoadingContext = createContext<LoadingContextType | undefined>(undefined);

export function LoadingProvider({ children }: { children: React.ReactNode }) {
  const [isInitialWorldLoad, setIsInitialWorldLoad] = useState(true);
  const [chunksLoaded, setChunksLoaded] = useState(0);
  const [chunksTotal, setChunksTotal] = useState(9); // Default to 9 initial chunks
  const [modelStatus, setModelStatusState] = useState("procedural");
  const [envAssetsLoading, setEnvAssetsLoading] = useState(0);
  const [envAssetsFailed, setEnvAssetsFailed] = useState(0);
  const [envAssetsTotal, setEnvAssetsTotal] = useState(0);

  const setChunksStatus = (loaded: number, total: number) => {
    setChunksLoaded(loaded);
    if (total > 0) {
      setChunksTotal(total);
    }
  };

  const setModelStatus = (status: string) => {
    setModelStatusState(status);
  };

  const setEnvAssetsStatus = (loading: number, failed: number, total: number) => {
    setEnvAssetsLoading(loading);
    setEnvAssetsFailed(failed);
    setEnvAssetsTotal(total);
  };

  const startLoading = () => {
    setChunksLoaded(0);
    setChunksTotal(9);
    setModelStatusState("procedural");
    setEnvAssetsLoading(0);
    setEnvAssetsFailed(0);
    setEnvAssetsTotal(0);
    setIsInitialWorldLoad(true);
  };

  const completeLoading = () => {
    setIsInitialWorldLoad(false);
  };

  // Calculate overall progress (0 to 100)
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let p = 0;

    // 1. Chunks Progress: up to 40%
    const chunkRatio = chunksTotal > 0 ? Math.min(chunksLoaded / chunksTotal, 1) : 0;
    p += chunkRatio * 40;

    // 2. Character Model Progress: up to 30%
    if (modelStatus === "active" || modelStatus === "failed") {
      p += 30;
    } else if (modelStatus === "loading") {
      p += 15;
    }

    // 3. Environment Assets Progress: up to 30%
    if (envAssetsTotal > 0) {
      const loadedRatio = Math.min((envAssetsTotal - envAssetsLoading) / envAssetsTotal, 1);
      p += loadedRatio * 30;
    } else {
      p += 15; // Give partial credit while waiting for region definition
    }

    setProgress(Math.min(Math.round(p), 100));
  }, [chunksLoaded, chunksTotal, modelStatus, envAssetsLoading, envAssetsTotal]);

  // Auto-complete loading screen once critical assets are loaded
  useEffect(() => {
    if (isInitialWorldLoad) {
      const isChunksReady = chunksLoaded >= Math.min(chunksTotal, 9) && chunksLoaded > 0;
      const isModelReady = modelStatus === "active" || modelStatus === "failed";
      const isEnvReady = envAssetsLoading === 0;

      if (isChunksReady && isModelReady && isEnvReady) {
        const timer = setTimeout(() => {
          setIsInitialWorldLoad(false);
        }, 600);
        return () => clearTimeout(timer);
      }
    }
  }, [chunksLoaded, chunksTotal, modelStatus, envAssetsLoading, isInitialWorldLoad]);

  const modelLoaded = modelStatus === "active";
  const envAssetsLoaded = envAssetsTotal > 0 && envAssetsLoading === 0;

  return (
    <LoadingContext.Provider
      value={{
        isInitialWorldLoad,
        chunksLoaded,
        chunksTotal,
        modelLoaded,
        modelStatus,
        envAssetsLoaded,
        envAssetsLoading,
        envAssetsFailed,
        envAssetsTotal,
        progress,
        setChunksStatus,
        setModelStatus,
        setEnvAssetsStatus,
        startLoading,
        completeLoading,
      }}
    >
      {children}
    </LoadingContext.Provider>
  );
}

export function useLoading() {
  const context = useContext(LoadingContext);
  if (!context) {
    throw new Error("useLoading must be used within LoadingProvider");
  }
  return context;
}
