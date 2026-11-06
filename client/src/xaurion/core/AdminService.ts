import { create } from "zustand";
import type { GlbCatalogEntry } from "@shared/glbImportContract";
import type { NpcShellTarget } from "../integration/NpcShellProjection";

export type AdminInspectionTarget = {
  type: "model" | "terrain" | "entity";
  id: string;
  name: string;
  assetId?: string;
  category?: string;
  position: { x: number; y: number; z: number };
  targetKey?: string;
  targetType?: string;
  /** Stable world placement reference of a replaceable world visual (houses, props, ...). */
  placementRef?: string;
  worldTargetKind?: "uploaded_anchor" | "authored_placement" | "shipped_placement" | "surface_texture";
};

interface AdminState {
  isAdmin: boolean;
  inspectionMode: boolean;
  bvhDebugMode: boolean;
  activeModelId: string | null;
  currentTarget: AdminInspectionTarget | null;
  /** Catalog model the admin is currently placing (floating preview), or null. */
  placementAsset: GlbCatalogEntry | null;
  /** NPC shell the admin opened with E, or null. */
  shellTarget: NpcShellTarget | null;
  setIsAdmin: (isAdmin: boolean) => void;
  setInspectionMode: (mode: boolean) => void;
  setBvhDebugMode: (mode: boolean) => void;
  setActiveModelId: (id: string | null) => void;
  setCurrentTarget: (target: AdminInspectionTarget | null) => void;
  setPlacementAsset: (asset: GlbCatalogEntry | null) => void;
  setShellTarget: (shell: NpcShellTarget | null) => void;
}

export const useAdminStore = create<AdminState>((set) => ({
  isAdmin: false,
  inspectionMode: false,
  bvhDebugMode: false,
  activeModelId: null,
  currentTarget: null,
  placementAsset: null,
  shellTarget: null,
  // Losing admin rights ends a running placement immediately.
  setIsAdmin: (isAdmin) => set(isAdmin ? { isAdmin } : { isAdmin, placementAsset: null, inspectionMode: false, currentTarget: null, shellTarget: null }),
  // Inspection and placement both own the world click; only one is active at a time.
  setInspectionMode: (inspectionMode) => set(inspectionMode ? { inspectionMode, currentTarget: null, placementAsset: null } : { inspectionMode, currentTarget: null }),
  setBvhDebugMode: (bvhDebugMode) => set({ bvhDebugMode }),
  setActiveModelId: (activeModelId) => set({ activeModelId }),
  setCurrentTarget: (currentTarget) => set({ currentTarget }),
  setPlacementAsset: (placementAsset) => set(placementAsset ? { placementAsset, inspectionMode: false, currentTarget: null } : { placementAsset: null }),
  setShellTarget: (shellTarget) => set(shellTarget ? { shellTarget, placementAsset: null } : { shellTarget: null }),
}));
