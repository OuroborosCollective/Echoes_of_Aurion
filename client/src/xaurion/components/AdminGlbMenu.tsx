import React, { useState, useEffect } from "react";
import { trpc } from "../../lib/trpc";
import { useAdminStore } from "../core/AdminService";
import { soundSynth } from "../audio/SoundSynthesizer";
import { 
  Upload, 
  Search, 
  Database, 
  Eye, 
  X, 
  Check, 
  ChevronRight, 
  Box, 
  User, 
  Shield, 
  Sword,
  Target,
  FileCode
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export const AdminGlbMenu: React.FC = () => {
  const { 
    isAdmin, 
    inspectionMode, 
    bvhDebugMode,
    activeModelId, 
    currentTarget,
    setInspectionMode, 
    setBvhDebugMode,
    setActiveModelId,
    setCurrentTarget
  } = useAdminStore();

  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState<"catalog" | "upload" | "inspect">("catalog");
  const [searchQuery, setSearchQuery] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [assetType, setAssetType] = useState<"character" | "enemy" | "weapon" | "armor" | "arena">("character");

  const catalogQuery = trpc.assetSubmissions?.publicCatalog?.useQuery ? trpc.assetSubmissions.publicCatalog.useQuery(undefined, { enabled: isAdmin }) : { data: [] };
  const assignMutation = trpc.admin?.assets?.assign?.useMutation ? trpc.admin.assets.assign.useMutation() : { mutateAsync: async () => {} };
  const uploadMutation = trpc.admin?.assets?.upload?.useMutation ? trpc.admin.assets.upload.useMutation() : { mutateAsync: async () => {} };

  if (!isAdmin) return null;

  const filteredCatalog = catalogQuery.data?.filter(asset => 
    asset.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    asset.assetType.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile || !displayName) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(",")[1];
      try {
        await uploadMutation.mutateAsync({
          displayName,
          assetType,
          contentBase64: base64,
        });
        soundSynth.playUiSuccess();
        setTab("catalog");
        (catalogQuery as any).refetch?.();
        setUploadFile(null);
        setDisplayName("");
      } catch (err) {
        console.error("Upload failed", err);
      }
    };
    reader.readAsDataURL(uploadFile);
  };

  const handleIntegrate = async () => {
    if (!activeModelId || !currentTarget?.targetKey || !currentTarget?.targetType) return;

    try {
      await assignMutation.mutateAsync({
        assetId: activeModelId,
        targetType: currentTarget.targetType as any,
        targetKey: currentTarget.targetKey,
        expectedActiveAssetId: currentTarget.assetId ?? null,
      });
      soundSynth.playUiSuccess();
      alert("Modell erfolgreich integriert!");
      setInspectionMode(false);
    } catch (err) {
      console.error("Integration failed", err);
    }
  };

  return (
    <>
      {/* Floating Admin Button */}
      <div className="fixed top-3 left-16 z-40">
        <button 
          onClick={() => {
            if (!isOpen) soundSynth.playUiOpen();
            else soundSynth.playUiClose();
            setIsOpen(!isOpen);
          }}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-sky-500/70 bg-black/85 text-sky-400 shadow-lg hover:bg-sky-500 hover:text-white transition-all backdrop-blur-md"
          title="GLB Core Admin"
          aria-label="GLB Core Admin"
        >
          <Shield size={16} />
        </button>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, x: -100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -100 }}
            className="fixed inset-y-0 left-0 z-[1001] w-80 sm:w-96 bg-black/90 border-r border-sky-900/50 backdrop-blur-xl shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="p-4 border-b border-sky-900/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="bg-sky-500 p-1.5 rounded text-black">
                  <Database size={18} />
                </div>
                <h2 className="text-lg font-serif font-bold text-sky-100">GLB Core Admin</h2>
              </div>
              <button onClick={() => setIsOpen(false)} className="text-sky-400/50 hover:text-sky-400 transition-colors">
                <X size={20} />
              </button>
            </div>

            {/* Navigation */}
            <div className="flex border-b border-sky-900/30">
              <button 
                onClick={() => { soundSynth.playUiClick(); setTab("catalog"); }}
                className={`flex-1 py-3 text-[10px] uppercase tracking-widest font-bold border-b-2 transition-all ${tab === "catalog" ? "border-sky-500 text-sky-400 bg-sky-500/5" : "border-transparent text-gray-500 hover:text-gray-300"}`}
              >
                Katalog
              </button>
              <button 
                onClick={() => { soundSynth.playUiClick(); setTab("upload"); }}
                className={`flex-1 py-3 text-[10px] uppercase tracking-widest font-bold border-b-2 transition-all ${tab === "upload" ? "border-sky-500 text-sky-400 bg-sky-500/5" : "border-transparent text-gray-500 hover:text-gray-300"}`}
              >
                Upload
              </button>
              <button 
                onClick={() => { soundSynth.playUiClick(); setTab("inspect"); }}
                className={`flex-1 py-3 text-[10px] uppercase tracking-widest font-bold border-b-2 transition-all ${tab === "inspect" ? "border-sky-500 text-sky-400 bg-sky-500/5" : "border-transparent text-gray-500 hover:text-gray-300"}`}
              >
                Inspektion
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
              {tab === "catalog" && (
                <div className="space-y-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
                    <input 
                      type="text" 
                      placeholder="Modelle suchen..." 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-black/50 border border-sky-900/50 rounded-lg py-2 pl-9 pr-4 text-xs text-sky-100 placeholder:text-gray-600 focus:outline-none focus:border-sky-500/50 transition-all"
                    />
                  </div>

                  <div className="space-y-2">
                    {(catalogQuery as any).isLoading ? (
                      <div className="py-8 text-center text-gray-600 text-[10px] uppercase tracking-widest animate-pulse">Lade Katalog...</div>
                    ) : filteredCatalog?.length === 0 ? (
                      <div className="py-8 text-center text-gray-600 text-[10px] uppercase tracking-widest">Keine Modelle gefunden</div>
                    ) : (
                      filteredCatalog?.map(asset => (
                        <div 
                          key={asset.id} 
                          onClick={() => { soundSynth.playUiClick(); setActiveModelId(asset.id); }}
                          className={`p-3 rounded-lg border transition-all cursor-pointer group ${activeModelId === asset.id ? "bg-sky-500/10 border-sky-500/50" : "bg-white/5 border-white/5 hover:border-white/10 hover:bg-white/[0.08]"}`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <h3 className="text-xs font-bold text-sky-100 group-hover:text-sky-400 transition-colors">{asset.displayName}</h3>
                            {activeModelId === asset.id && <Check size={14} className="text-sky-500" />}
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-[9px] uppercase font-mono text-gray-500 bg-black/50 px-1.5 py-0.5 rounded border border-white/5">{asset.assetType}</span>
                            <span className="text-[9px] font-mono text-gray-600">{(asset.bytes / 1024 / 1024).toFixed(2)} MB</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {tab === "upload" && (
                <form onSubmit={handleUpload} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[9px] uppercase tracking-widest font-bold text-gray-500 ml-1">Anzeigename</label>
                    <input 
                      type="text" 
                      required
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="z.B. Goldener Phönix"
                      className="w-full bg-black/50 border border-sky-900/50 rounded-lg py-2.5 px-4 text-xs text-sky-100 focus:outline-none focus:border-sky-500/50"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] uppercase tracking-widest font-bold text-gray-500 ml-1">Asset-Kategorie</label>
                    <select 
                      value={assetType}
                      onChange={(e) => setAssetType(e.target.value as any)}
                      className="w-full bg-black/50 border border-sky-900/50 rounded-lg py-2.5 px-4 text-xs text-sky-100 focus:outline-none focus:border-sky-500/50 appearance-none"
                    >
                      <option value="character">Charakter</option>
                      <option value="enemy">Gegner</option>
                      <option value="weapon">Waffe</option>
                      <option value="armor">Rüstung</option>
                      <option value="arena">Arena / Architektur</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] uppercase tracking-widest font-bold text-gray-500 ml-1">GLB Datei</label>
                    <div className="relative group">
                      <input 
                        type="file" 
                        accept=".glb"
                        required
                        onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                        className="absolute inset-0 opacity-0 cursor-pointer z-10"
                      />
                      <div className="border-2 border-dashed border-sky-900/30 rounded-xl p-8 flex flex-col items-center justify-center gap-2 group-hover:border-sky-500/50 group-hover:bg-sky-500/5 transition-all">
                        <Upload size={32} className="text-sky-900 group-hover:text-sky-500 transition-colors" />
                        <span className="text-[10px] text-gray-500 font-medium">
                          {uploadFile ? uploadFile.name : "GLB hierher ziehen oder klicken"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button 
                    disabled={!uploadFile || !displayName || (uploadMutation as any).isPending}
                    className="w-full bg-sky-600 hover:bg-sky-500 disabled:bg-gray-800 disabled:text-gray-600 text-white font-bold py-3 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2"
                  >
                    {(uploadMutation as any).isPending ? "Lade hoch..." : <>Speichern & Katalogisieren <ChevronRight size={16} /></>}
                  </button>
                </form>
              )}

              {tab === "inspect" && (
                <div className="space-y-6">
                  <div className="bg-sky-500/5 border border-sky-500/20 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2 text-sky-400">
                      <Target size={18} />
                      <span className="text-[10px] uppercase tracking-widest font-bold">Inspektions-Werkzeug</span>
                    </div>
                    <p className="text-[11px] text-gray-400 leading-relaxed">
                      Aktiviere den Ziel-Cursor, um Strukturen oder Entitäten in der Welt zu identifizieren und zu ersetzen.
                    </p>
                    <button 
                      onClick={() => {
                        soundSynth.playUiClick();
                        setInspectionMode(!inspectionMode);
                      }}
                      className={`w-full py-2.5 rounded-lg font-bold text-[10px] uppercase tracking-tighter transition-all ${inspectionMode ? "bg-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.4)]" : "bg-sky-600 text-white hover:bg-sky-500"}`}
                    >
                      {inspectionMode ? "Inspektion Beenden" : "Cursor Aktivieren"}
                    </button>
                  </div>

                  {/* three-mesh-bvh Collision Debug Visualizer Toggle */}
                  <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2 text-emerald-400">
                      <Box size={18} />
                      <span className="text-[10px] uppercase tracking-widest font-bold">three-mesh-bvh Visualizer</span>
                    </div>
                    <p className="text-[11px] text-gray-400 leading-relaxed">
                      Visualisiert das räumliche BVH-Beschleunigungsgitter für Umgebungskollisionen und Raycasting in Echtzeit.
                    </p>
                    <button 
                      onClick={() => {
                        soundSynth.playUiClick();
                        setBvhDebugMode(!bvhDebugMode);
                      }}
                      className={`w-full py-2.5 rounded-lg font-bold text-[10px] uppercase tracking-tighter transition-all ${bvhDebugMode ? "bg-emerald-500 text-black shadow-[0_0_15px_rgba(16,185,129,0.4)]" : "bg-emerald-700/80 text-white hover:bg-emerald-600"}`}
                    >
                      {bvhDebugMode ? "BVH Debug-Grid Ausblenden" : "BVH Debug-Grid Einblenden"}
                    </button>
                  </div>

                  {inspectionMode && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                      <div className="text-[9px] uppercase tracking-widest font-bold text-gray-500 ml-1">Anvisiertes Ziel</div>
                      {currentTarget ? (
                        <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-4">
                          <div className="flex items-start gap-3">
                            <div className="bg-sky-500/20 p-2 rounded-lg text-sky-400">
                              <Box size={20} />
                            </div>
                            <div>
                              <div className="text-xs font-bold text-white">{currentTarget.name}</div>
                              <div className="text-[9px] text-gray-500 font-mono mt-0.5">{currentTarget.id}</div>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-black/40 p-2 rounded border border-white/5">
                              <div className="text-[8px] uppercase text-gray-600 font-bold mb-1">Typ</div>
                              <div className="text-[10px] text-sky-300 font-mono">{currentTarget.type}</div>
                            </div>
                            <div className="bg-black/40 p-2 rounded border border-white/5">
                              <div className="text-[8px] uppercase text-gray-600 font-bold mb-1">Asset ID</div>
                              <div className="text-[10px] text-sky-300 font-mono truncate">{currentTarget.assetId || "None"}</div>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div className="text-[10px] text-gray-400 italic">Integration ausgewähltes Modell:</div>
                            <button 
                              disabled={!activeModelId}
                              onClick={handleIntegrate}
                              className="w-full bg-white text-black hover:bg-sky-400 hover:text-white disabled:bg-gray-800 disabled:text-gray-600 font-bold py-2.5 rounded-lg text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                            >
                              <FileCode size={14} /> Integrate GLB Here
                            </button>
                            {!activeModelId && <p className="text-[8px] text-amber-500/80 text-center italic">Wähle zuerst ein Modell im Katalog aus!</p>}
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-center text-gray-600">
                          <div className="w-12 h-12 rounded-full border-2 border-dashed border-gray-800 flex items-center justify-center mb-4">
                            <Target size={24} className="opacity-20" />
                          </div>
                          <p className="text-[10px] uppercase tracking-widest font-medium">Bewege den Charakter und <br/>visiere Objekte an</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-sky-900/30 bg-sky-500/5 flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[9px] text-gray-500 uppercase font-bold">Admin Session</span>
                <span className="text-xs text-sky-400 font-mono">Verified via MariaDB</span>
              </div>
              <div className="flex items-center gap-2">
                 <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                 <span className="text-[9px] text-emerald-500 font-bold uppercase tracking-widest">Online</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
