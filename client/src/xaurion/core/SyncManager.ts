// Owner ZIP compatibility adapter. Aurion's authenticated server/DB remains authoritative.
import type { CharacterAppearance, GMWorldConfig, PlayerStats, Quest, RPGItem } from '../types';

export interface SyncPayload {
  playerId: string;
  timestamp: number;
  stats: PlayerStats;
  inventory: RPGItem[];
  quests: Quest[];
  appearance?: CharacterAppearance;
  gmConfig?: Partial<GMWorldConfig>;
  activePetId?: string;
  unlockedHouses?: string[];
}

export interface RemoteServerState {
  connected: boolean;
  lastSyncTime: number;
  pingMs: number;
  serverVersion: string;
  activePlayersCount: number;
  worldEvent: string;
}

export class SyncManager {
  private static instance: SyncManager;
  private listeners: Array<(state: RemoteServerState) => void> = [];
  private currentPayload: SyncPayload | null = null;
  public serverState: RemoteServerState = {
    connected: false,
    lastSyncTime: 0,
    pingMs: 0,
    serverVersion: 'aurion-authoritative-bridge',
    activePlayersCount: 0,
    worldEvent: 'Awaiting server-confirmed Aurion projection',
  };

  public static getInstance(): SyncManager {
    if (!SyncManager.instance) SyncManager.instance = new SyncManager();
    return SyncManager.instance;
  }

  public subscribe(callback: (state: RemoteServerState) => void): () => void {
    this.listeners.push(callback);
    callback(this.serverState);
    return () => { this.listeners = this.listeners.filter(listener => listener !== callback); };
  }

  public updateLocalState(payload: Partial<SyncPayload>): void {
    this.currentPayload = {
      playerId: payload.playerId ?? this.currentPayload?.playerId ?? 'aurion-session-player',
      timestamp: Date.now(),
      stats: payload.stats ?? this.currentPayload?.stats!,
      inventory: payload.inventory ?? this.currentPayload?.inventory ?? [],
      quests: payload.quests ?? this.currentPayload?.quests ?? [],
      appearance: payload.appearance ?? this.currentPayload?.appearance,
      gmConfig: payload.gmConfig ?? this.currentPayload?.gmConfig,
      activePetId: payload.activePetId ?? this.currentPayload?.activePetId,
      unlockedHouses: payload.unlockedHouses ?? this.currentPayload?.unlockedHouses,
    };
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('aurion:xaurion-local-state', { detail: this.currentPayload }));
    }
  }

  public async performSync(): Promise<boolean> {
    // Deliberately no standalone persistence. Aurion tRPC/zone/receipt paths own all server mutations.
    return false;
  }

  public loadSavedState(): Partial<SyncPayload> | null { return null; }
  public stop(): void {}
}

export const syncManager = SyncManager.getInstance();
