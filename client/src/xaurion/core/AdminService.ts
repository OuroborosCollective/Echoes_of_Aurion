import { create } from "zustand";

export type AdminInspectionTarget = {
  type: "model" | "terrain" | "entity";
  id: string;
  name: string;
  assetId?: string;
  category?: string;
  position: { x: number; y: number; z: number };
  targetKey?: string;
  targetType?: string;
};

interface AdminState {
  isAdmin: boolean;
  inspectionMode: boolean;
  activeModelId: string | null;
  currentTarget: AdminInspectionTarget | null;
  setIsAdmin: (isAdmin: boolean) => void;
  setInspectionMode: (mode: boolean) => void;
  setActiveModelId: (id: string | null) => void;
  setCurrentTarget: (target: AdminInspectionTarget | null) => void;
}

export const useAdminStore = create<AdminState>((set) => ({
  isAdmin: false,
  inspectionMode: false,
  activeModelId: null,
  currentTarget: null,
  setIsAdmin: (isAdmin) => set({ isAdmin }),
  setInspectionMode: (inspectionMode) => set({ inspectionMode, currentTarget: inspectionMode ? null : null }),
  setActiveModelId: (activeModelId) => set({ activeModelId }),
  setCurrentTarget: (currentTarget) => set({ currentTarget }),
}));
