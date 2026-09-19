import { create } from "zustand";

export interface AdminStoreState {
  isAdmin: boolean;
  inspectionMode: boolean;
  bvhDebugMode: boolean;
  activeModelId: string | null;
  currentTarget: unknown | null;
  setIsAdmin: (val: boolean) => void;
  setInspectionMode: (val: boolean) => void;
  setBvhDebugMode: (val: boolean) => void;
  setActiveModelId: (val: string | null) => void;
  setCurrentTarget: (val: unknown | null) => void;
}

export const useAdminStore = create<AdminStoreState>((set) => ({
  isAdmin: false,
  inspectionMode: false,
  bvhDebugMode: false,
  activeModelId: null,
  currentTarget: null,
  setIsAdmin: (isAdmin: boolean) => set({ isAdmin }),
  setInspectionMode: (inspectionMode: boolean) => set({ inspectionMode }),
  setBvhDebugMode: (bvhDebugMode: boolean) => set({ bvhDebugMode }),
  setActiveModelId: (activeModelId: string | null) => set({ activeModelId }),
  setCurrentTarget: (currentTarget: unknown | null) => set({ currentTarget }),
}));
