import React, { useState } from 'react';
import type { NPCCharacter, PlayerStats } from '../types';
import type { WorldChunkManager } from '../world/WorldChunkManager';
import { type Ax1WorldPoi } from './Ax1WorldSurfaces';

export const WorldMapModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  playerStats: PlayerStats;
  npcs: NPCCharacter[];
  chunkManager?: WorldChunkManager | null;
  pois: Ax1WorldPoi[];
  onTeleport: (poiId: string) => Promise<void>;
}> = p => {
  const [filter, setFilter] = useState<'all' | 'dungeon' | 'house' | 'spawn'>('all');
  const [isTeleporting, setIsTeleporting] = useState(false);
  
  const chunks = p.chunkManager ? Array.from(p.chunkManager.chunks.values()) : [];
  const extent = Math.max(200, ...chunks.map(c => Math.max(Math.abs(c.centerX), Math.abs(c.centerZ)) + 50));
  const pos = (v: number) => 50 + (v / extent) * 46;

  if (!p.isOpen) return null;

  const handleTeleport = async (poiId: string) => {
    setIsTeleporting(true);
    await p.onTeleport(poiId);
    setIsTeleporting(false);
  };

  const filteredPois = p.pois.filter(poi => filter === 'all' || poi.kind === filter);

  return (
    <div className="fixed inset-0 z-[130] grid place-items-center bg-black/80 p-4">
      {isTeleporting && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm">
            <div className="text-center text-cyan-400 font-mono">
                <div className="animate-pulse text-2xl">INITIATING TELEPORT...</div>
                <div className="mt-2 text-sm">CALIBRATING AETHER PATHS</div>
            </div>
        </div>
      )}
      <section className="w-full max-w-5xl rounded-2xl border border-amber-400/30 bg-[#0d1519] p-5 text-white">
        <header className="flex justify-between">
          <div>
            <b>REALM ATLAS // DYNAMIC WORLD</b>
            <small className="block text-slate-400">{chunks.length} generated chunks</small>
          </div>
          <div className="flex gap-2">
            <select className="bg-black border border-gray-700 text-xs p-1" onChange={(e) => setFilter(e.target.value as any)}>
              <option value="all">Alle</option>
              <option value="dungeon">Dungeons</option>
              <option value="house">Häuser</option>
              <option value="spawn">Spawn</option>
            </select>
            <button onClick={p.onClose}>✕</button>
          </div>
        </header>

        <div className="relative mt-4 aspect-[16/9] overflow-hidden rounded-xl border border-cyan-900 bg-[radial-gradient(circle_at_center,#15333a,#071014_65%)]">
          {chunks.map(c => (
            <div key={c.chunkKey} title={c.landmarkName} className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-cyan-300/50 bg-cyan-900/60" style={{ left: `${pos(c.centerX)}%`, top: `${pos(c.centerZ)}%` }} />
          ))}
          
          {filteredPois.map(poi => (
            <button
              key={poi.id}
              onClick={() => handleTeleport(poi.id)}
              title={poi.label}
              className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center cursor-pointer"
              style={{ left: `${pos(poi.x)}%`, top: `${pos(poi.z)}%`, width: '48px', height: '48px' }}
            >
              <div className="h-4 w-4 rounded-full border border-amber-300 bg-amber-900/80 hover:bg-amber-500" />
            </button>
          ))}

          <div className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-cyan-400 shadow-[0_0_16px_#22d3ee]" style={{ left: `${pos(p.playerStats.x)}%`, top: `${pos(p.playerStats.z)}%` }} />
        </div>
      </section>
    </div>
  );
};
